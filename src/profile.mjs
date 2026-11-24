import {trimSpec} from "./core.mjs";
import {memorySize, tr} from "./i18n.mjs";

export const vivobookProfile = {name:"ASUS Vivobook",cpu:"Intel Core 7 150U",gpu:"Intel Graphics",ram:8,os:"Windows 11 Pro",modules:1};
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
   if(!/microsoft basic|virgl|lavapipe|swiftshader|llvmpipe|software rasterizer|basic render|^webkit webgl$|^angle$|^adreno \(tm\)$|^apple gpu$/i.test(raw)){
    gpu=raw.replace(/^ANGLE\s*\([^,]+,\s*/i,"").replace(/\s*(?:Direct3D|D3D11|vs_5_0|OpenGL Engine|,\s*(?:D3D|Vulkan|OpenGL|Metal)).*$/i,"").replace(/\s*\(0x[0-9a-f]+\)/gi,"").replace(/^(?:ANGLE Metal Renderer:\s*)/i,"").trim();
   }}
  gl?.getExtension("WEBGL_lose_context")?.loseContext();
 }catch{}
 if(/^(?:gpu|unknown|angle|webkit(?: webgl)?|microsoft|apple gpu|generic renderer|intel|nvidia|amd)$/i.test(gpu)||/swiftshader|llvmpipe|virtualbox|vmware/i.test(gpu))gpu="";
 return {name:"",cpu:"",gpu,ram:null,os,ramHint:Number(nav.deviceMemory)||null,threads:Number(nav.hardwareConcurrency)||null,modules:null,gpus:[],sources:{os:"Brauzer",gpu:"Brauzer"}};
}
export function applyNative(p,report){
 if(!report||typeof report!=="object"||osFamily(report.os)!=="windows"||(osFamily(p.os)&&osFamily(p.os)!=="windows"))return p;
 const gpus=Array.isArray(report.gpus)?[...new Set(report.gpus.map(trimSpec).filter(x=>x&&!/basic display|remote display|virtual display/i.test(x)))]:[];
 const simplified=s=>s.toLowerCase().replace(/\(r\)|\(tm\)|[^a-z0-9]/g,"");
 const direct=gpus.find(x=>p.gpu&&simplified(x)===simplified(p.gpu));
 const gpu=direct||gpus.find(x=>p.gpu&&(simplified(x).includes(simplified(p.gpu))||simplified(p.gpu).includes(simplified(x))))||(gpus.length===1?gpus[0]:"");
 const result={...p,gpus,kind:["laptop","desktop"].includes(report.kind)?report.kind:"",modules:Number(report.modules)||null,sources:{...p.sources}};
 for(const [k,v] of Object.entries({cpu:trimSpec(report.cpu),gpu,ram:Number(report.ram)>0?Number(report.ram):null,os:trimSpec(report.os),name:trimSpec(report.name)})){
  if(v){result[k]=v;result.sources[k]="Windows"}
 }
 if(gpus.length>1){result.gpu="";delete result.sources.gpu}
 return result;
}
export function profileLabel(p){return p.name||tr(({windows:"Windows kompyuteri",mac:"Mac",ios:"iPhone / iPad",android:"Android qurilmasi",linux:"Linux kompyuteri",chrome:"ChromeOS qurilmasi"}[osFamily(p.os)])||"Shu qurilma")}
export function displaySpecs(p){
 return {cpu:p.cpu || tr("Modelni kiriting"),gpu:p.gpu || (p.gpus?.length>1?p.gpus.join(" / "):tr("Modelni kiriting")),ram:p.ram?memorySize(p.ram):tr("Hajmni kiriting"),os:p.os||tr("Tizimni kiriting")};
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
 if(Array.isArray(raw.values?.reportFields))result.reportFields=raw.values.reportFields.filter(k=>["name","cpu","gpu","ram","os"].includes(k)&&result[k]!=null);
 if(raw.values?.reference===true&&osFamily(automatic.os)==="windows")result.reference=true;
 return result;
}
export function activeProfile(p,values){
 const profile={...p,...values,sources:{...p.sources}};
 for(const k of Object.keys(values)){if(!["reference","reportFields"].includes(k))profile.sources[k]=values.reportFields?.includes(k)?"DxDiag":"Qo‘lda"}
 return profile;
}
export function baselineMatch(p){
 return osFamily(p.os)==="windows"&&/core.*\b150u\b/i.test(p.cpu)&&/intel/i.test(p.gpu)&&/graphics/i.test(p.gpu)&&!/arc|uhd\s*\d/i.test(p.gpu)&&p.ram===8&&(p.modules===1||p.reference===true);
}

// Typical low-preset ranges. These deliberately overlap: minimum requirements do
// not specify a frame rate. The gap is between GPU classes, not a speed ratio.
