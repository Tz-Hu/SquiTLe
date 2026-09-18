use std::{fs::{self,File,OpenOptions},io::Write,path::{Path,PathBuf}};
use tauri::Manager;

#[cfg(desktop)]
mod app_updates {
  use std::sync::Mutex;
  use serde::Serialize;
  use tauri::{AppHandle,State};
  use tauri_plugin_updater::{Update,UpdaterExt};

  pub struct PendingUpdate(pub Mutex<Option<Update>>);

  #[derive(Serialize)]
  #[serde(rename_all="camelCase")]
  pub struct UpdateMetadata { version:String,current_version:String,body:Option<String> }

  #[tauri::command]
  pub async fn fetch_update(app:AppHandle,pending:State<'_,PendingUpdate>)->Result<Option<UpdateMetadata>,String>{
    if option_env!("SQUITLE_UPDATER_PUBLIC_KEY").is_none(){return Ok(None);}
    let endpoint="https://github.com/Tz-Hu/Schedule-in-TimeLine/releases/latest/download/latest.json".parse::<url::Url>().map_err(|error|error.to_string())?;
    let update=app.updater_builder().endpoints(vec![endpoint]).map_err(|error|error.to_string())?.build().map_err(|error|error.to_string())?.check().await.map_err(|error|error.to_string())?;
    let metadata=update.as_ref().map(|value|UpdateMetadata{version:value.version.clone(),current_version:value.current_version.clone(),body:value.body.clone()});
    *pending.0.lock().map_err(|_|"update_state_poisoned".to_string())?=update;
    Ok(metadata)
  }

  #[tauri::command]
  pub async fn install_update(app:AppHandle,pending:State<'_,PendingUpdate>)->Result<(),String>{
    let update=pending.0.lock().map_err(|_|"update_state_poisoned".to_string())?.take().ok_or("no_pending_update")?;
    update.download_and_install(|_,_|{},||{}).await.map_err(|error|error.to_string())?;
    app.restart();
  }
}

fn sibling_path(path:&Path,suffix:&str)->Result<PathBuf,String>{
  let name=path.file_name().and_then(|value|value.to_str()).ok_or("文件名无效")?;
  Ok(path.with_file_name(format!("{name}{suffix}")))
}

#[tauri::command]
fn read_schedule_document(path:String)->Result<String,String>{
  fs::read_to_string(path).map_err(|error|error.to_string())
}

#[tauri::command]
fn write_schedule_document(path:String,contents:String)->Result<(),String>{
  let value:serde_json::Value=serde_json::from_str(&contents).map_err(|error|format!("JSON 无效：{error}"))?;
  if !value.is_object(){return Err("排期文档必须是 JSON 对象".into());}
  let target=PathBuf::from(path);
  let parent=target.parent().ok_or("无法确定保存目录")?;
  fs::create_dir_all(parent).map_err(|error|error.to_string())?;
  let temporary=sibling_path(&target,".tmp")?;
  let backup=sibling_path(&target,".bak")?;
  let mut file:File=OpenOptions::new().create(true).truncate(true).write(true).open(&temporary).map_err(|error|error.to_string())?;
  file.write_all(contents.as_bytes()).map_err(|error|error.to_string())?;
  file.sync_all().map_err(|error|error.to_string())?;
  if target.exists(){fs::copy(&target,&backup).map_err(|error|error.to_string())?;}
  fs::rename(&temporary,&target).map_err(|error|error.to_string())?;
  Ok(())
}

fn app_document_path(app:&tauri::AppHandle)->Result<PathBuf,String>{
  app.path().app_data_dir().map(|directory|directory.join("Squitle.json")).map_err(|error|error.to_string())
}

#[tauri::command]
fn read_app_schedule_document(app:tauri::AppHandle)->Result<Option<String>,String>{
  let path=app_document_path(&app)?;
  if !path.exists(){return Ok(None);}
  fs::read_to_string(path).map(Some).map_err(|error|error.to_string())
}

#[tauri::command]
fn write_app_schedule_document(app:tauri::AppHandle,contents:String)->Result<(),String>{
  let path=app_document_path(&app)?;
  write_schedule_document(path.to_string_lossy().into_owned(),contents)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .setup(|app|{
      #[cfg(desktop)]
      {
        if let Some(public_key)=option_env!("SQUITLE_UPDATER_PUBLIC_KEY"){
          app.handle().plugin(tauri_plugin_updater::Builder::new().pubkey(public_key).build())?;
        }
        app.manage(app_updates::PendingUpdate(std::sync::Mutex::new(None)));
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![read_schedule_document,write_schedule_document,read_app_schedule_document,write_app_schedule_document,app_updates::fetch_update,app_updates::install_update])
    .run(tauri::generate_context!())
    .expect("error while running Squitle");
}
