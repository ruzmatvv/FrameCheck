import http from "node:http";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile} from "node:fs/promises";
import app from "./dist/server/index.js";
const port=Number(process.env.PORT||4672), homeURL="http://127.0.0.1:"+port;
// Accounts need a database. Locally they are off unless FRAMECHECK_LOCAL_DB=1 (then a SQLite file in .data/ is used).
const env={RESEND_API_KEY:process.env.RESEND_API_KEY,MAIL_FROM:process.env.MAIL_FROM}; // email for password recovery (optional)
if(process.env.FRAMECHECK_LOCAL_DB==="1"){
 const {openDatabase}=await import("./src/d1-sqlite.mjs");
 env.DB=openDatabase(new URL("./.data/framecheck.sqlite",import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,"$1"),new URL("./migrations/",import.meta.url));
}
async function probe(){
 if(process.platform!=="win32")return null;
 try{const script=await readFile(new URL("./windows-profile.ps1",import.meta.url),"utf8");
  const {stdout}=await promisify(execFile)("powershell.exe",["-NoProfile","-NonInteractive","-Command",script],{windowsHide:true,timeout:7000,encoding:"utf8"});
  const fields=JSON.parse(stdout.trim().replace(/^﻿/,""));return fields.os?fields:null
 }catch{return null}
}
const localHardware=probe();
const forwarded=["cookie","origin","content-type","sec-fetch-site","accept"];
async function body(req){
 const chunks=[];let size=0;
 for await(const chunk of req){size+=chunk.length;if(size>400000)return null;chunks.push(chunk)}
 return Buffer.concat(chunks);
}
const server=http.createServer(async(req,res)=>{
 try{
  const allowed=new Set(["127.0.0.1:"+port,"localhost:"+port]);
  if(!allowed.has(req.headers.host)){res.writeHead(403);res.end();return}
  if(req.url==="/api/device"&&req.method==="GET"){
   if(req.headers["sec-fetch-site"]==="cross-site"||(req.headers.origin&&!["http://"+req.headers.host].includes(req.headers.origin))){res.writeHead(403);res.end();return}
   res.writeHead(200,{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"});res.end(JSON.stringify(await localHardware));return;
  }
  const headers=Object.fromEntries(forwarded.filter(k=>req.headers[k]).map(k=>[k,req.headers[k]]));
  const hasBody=!["GET","HEAD"].includes(req.method);
  const payload=hasBody?await body(req):undefined;
  if(hasBody&&payload===null){res.writeHead(413);res.end();return}
  const response=await app.fetch(new Request("http://"+req.headers.host+req.url,{method:req.method,headers,body:hasBody?payload:undefined}),env);
  const out=[];for(const [k,v] of response.headers)if(k!=="set-cookie")out.push([k,v]);
  for(const cookie of response.headers.getSetCookie())out.push(["set-cookie",cookie]);
  res.writeHead(response.status,out);res.end(Buffer.from(await response.arrayBuffer()))
 }catch{res.writeHead(500);res.end("Server error")}
});
server.on("error",err=>{console.error("Framecheck server: "+err.message);process.exitCode=1});
server.listen(port,"127.0.0.1",()=>{console.log("Framecheck: "+homeURL);if(process.argv.includes("--open")&&process.platform==="win32")execFile("rundll32.exe",["url.dll,FileProtocolHandler",homeURL])});
