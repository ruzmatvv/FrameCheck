// Keep device details local. Browser RAM and thread counts are hints, not model identifiers.
const trimSpec = value => typeof value === "string" ? value.trim().slice(0,180) : "";
export function osFamily(s=""){
 if(/android/i.test(s))return "android";
 if(/iphone|ipad|ipados|\bios\b/i.test(s))return "ios";
 if(/chrome\s?os|cros/i.test(s))return "chrome";
 if(/win(dows|32|64)/i.test(s))return "windows";
 if(/mac\s?os|macintosh|macintel|os x/i.test(s))return "mac";
 if(/linux|ubuntu|steamos/i.test(s))return "linux";
 return "";
}
export function browserProfile(nav,doc){
 const ua=nav.userAgent||"",ipad=nav.platform==="MacIntel"&&nav.maxTouchPoints>1;
 const os=ipad?"iPadOS":/iPhone|iPod/i.test(ua)?"iOS":/iPad/i.test(ua)?"iPadOS":({windows:"Windows",android:"Android",mac:"macOS",linux:"Linux",chrome:"ChromeOS"}[osFamily(ua)||osFamily(nav.userAgentData?.platform||nav.platform)]||"");
 let gpu="";
 try{
  const canvas=doc.createElement("canvas"),gl=canvas.getContext("webgl2")||canvas.getContext("webgl");
  const info=gl?.getExtension("WEBGL_debug_renderer_info");
  if(info){const raw=trimSpec(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
   if(!/swiftshader|llvmpipe|software rasterizer|basic render|^webkit webgl$|^angle$|^adreno \(tm\)$|^apple gpu$/i.test(raw)){
    gpu=raw.replace(/^ANGLE\s*\([^,]+,\s*/i,"").replace(/\s*(?:Direct3D|D3D11|vs_5_0|OpenGL Engine|,\s*(?:D3D|Vulkan|OpenGL|Metal)).*$/i,"").replace(/\s*\(0x[0-9a-f]+\)/gi,"").replace(/^(?:ANGLE Metal Renderer:\s*)/i,"").trim();
   }}
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
 }catch{}
 return {name:"",cpu:"",gpu,ram:null,os,ramHint:Number(nav.deviceMemory)||null,threads:Number(nav.hardwareConcurrency)||null,modules:null,gpus:[],sources:{os:"Brauzer",gpu:"Brauzer"}};
}
export function applyNative(p,report){
 if(!report||typeof report!=="object"||osFamily(report.os)!=="windows"||osFamily(p.os)!=="windows")return p;
 const gpus=Array.isArray(report.gpus)?[...new Set(report.gpus.map(trimSpec).filter(x=>x&&!/basic display|remote display|virtual display/i.test(x)))]:[];
 const simplified=s=>s.toLowerCase().replace(/\(r\)|\(tm\)|[^a-z0-9]/g,"");
 const gpu=gpus.find(x=>p.gpu&&(simplified(x).includes(simplified(p.gpu))||simplified(p.gpu).includes(simplified(x))))||(gpus.length===1?gpus[0]:"");
 const result={...p,gpus,kind:["laptop","desktop"].includes(report.kind)?report.kind:"",modules:Number(report.modules)||null,sources:{...p.sources}};
 for(const [k,v] of Object.entries({cpu:trimSpec(report.cpu),gpu,ram:Number(report.ram)>0?Number(report.ram):null,os:trimSpec(report.os),name:trimSpec(report.name)})){
  if(v){result[k]=v;result.sources[k]="Windows"}
 }
 if(gpus.length>1&&!gpu){result.gpu="";delete result.sources.gpu}
 return result;
}
export function profileLabel(p){return p.name||({windows:"Windows kompyuteri",mac:"Mac",ios:"iPhone / iPad",android:"Android qurilmasi",linux:"Linux kompyuteri",chrome:"ChromeOS qurilmasi"}[osFamily(p.os)])||"Shu qurilma"}
export function displaySpecs(p){
 return {cpu:p.cpu||(p.threads?p.threads+" ta mantiqiy oqim · model noma’lum":"Model noma’lum"),gpu:p.gpu||(p.gpus?.length>1?"Videokartani tanla":"Model noma’lum"),ram:p.ram?p.ram+" GB":p.ramHint?"≈ "+p.ramHint+" GB · brauzer bahosi":"Hajm noma’lum",os:p.os||"Tizim noma’lum"};
}
export function readOverrides(raw,automatic){
 if(!raw||typeof raw!=="object")return {};
 // A portable copy or a hardware change can invalidate earlier manual confirmations.
 if(raw.family&&osFamily(automatic.os)&&raw.family!==osFamily(automatic.os))return {};
 for(const key of ["cpu","gpu","ram","name"]){const old=raw.detected?.[key],now=automatic[key];if(old&&now&&old!==now)return {}}
 const result={};
 for(const key of ["name","cpu","gpu","os"]){const v=trimSpec(raw.values?.[key]);if(v)result[key]=v}
 if(["laptop","desktop"].includes(raw.values?.kind))result.kind=raw.values.kind;
 const n=Number(raw.values?.ram);if(n>=.25&&n<=4096)result.ram=n;
 if(raw.values?.reference===true&&osFamily(automatic.os)==="windows")result.reference=true;
 return result;
}
export function activeProfile(p,values){
 const profile={...p,...values,sources:{...p.sources}};
 for(const k of Object.keys(values)){if(k!=="reference")profile.sources[k]="Qo‘lda"}
 return profile;
}
