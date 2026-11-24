import http from "node:http";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile} from "node:fs/promises";
import app from "./dist/server/index.js";
const port=Number(process.env.PORT||4672), homeURL="http://127.0.0.1:"+port;
async function probe(){
 if(process.platform!=="win32")return null;
 try{const script=await readFile(new URL("./windows-profile.ps1",import.meta.url),"utf8");
  const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true,timeout:7000,encoding:"utf8"});
  const fields=JSON.parse(stdout.trim().replace(/^\uFEFF/,""));return fields.os?fields:null
 }catch{return null}
}
const localHardware=probe();
const server=http.createServer(async(req,res)=>{
 try{
  const allowed=new Set(["127.0.0.1:"+port,"localhost:"+port]);
  if(!allowed.has(req.headers.host)){res.writeHead(403);res.end();return}
  if(req.url==="/api/device"&&req.method==="GET"){
   if(req.headers["sec-fetch-site"]==="cross-site"||(req.headers.origin&&!["http://"+req.headers.host].includes(req.headers.origin))){res.writeHead(403);res.end();return}
   res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(await localHardware));return;
  }
  const response=await app.fetch(new Request(homeURL+req.url,{method:req.method}));
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
 }catch{res.writeHead(500);res.end("Server error")}
});
server.on("error",err=>{console.error("Framecheck server: "+err.message);process.exitCode=1});
server.listen(port,"127.0.0.1",()=>{console.log("Framecheck: "+homeURL);if(process.argv.includes("--open")&&process.platform==="win32")execFile("rundll32.exe",["url.dll,FileProtocolHandler",homeURL])});
