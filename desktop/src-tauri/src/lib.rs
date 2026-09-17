use std::{fs::{self,File,OpenOptions},io::Write,path::{Path,PathBuf}};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(){
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![read_schedule_document,write_schedule_document])
    .run(tauri::generate_context!())
    .expect("error while running Squitle");
}
