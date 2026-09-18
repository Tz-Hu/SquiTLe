const [version,tag,signature]=process.argv.slice(2);
if(!version||!tag||!signature)throw new Error("usage: version tag signature");
const url=`https://github.com/Tz-Hu/Schedule-in-TimeLine/releases/download/${tag}/Squitle.app.tar.gz`;
const platform={signature,url};
process.stdout.write(JSON.stringify({
  version,
  notes:`Squitle ${version}`,
  pub_date:new Date().toISOString(),
  platforms:{"darwin-aarch64":platform,"darwin-x86_64":platform},
},null,2));
