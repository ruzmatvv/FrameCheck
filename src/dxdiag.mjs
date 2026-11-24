import {tr} from "./i18n.mjs";

function parseDxDiag(text) {
 const fields = {}, adapters = [];
 const accept = (key,value) => {
  const v = (value || "").trim();
  if (!v || /\b(?:system product name|default string|to be filled by o\.e\.m\.|not available|unknown|n\/a)\b/i.test(v)) return;
  if (key==="gpu") {
   if (!/basic display|basic render|remote display|виртуальн|базовый видеоадаптер/i.test(v) && !adapters.includes(v)) adapters.push(v.slice(0,160));
  } else if(key==="ram") {
   const m = v.match(/^([\d., ]+)\s*(MB|GB|МБ|ГБ)/i);
   if(m){const n=Number(m[1].replace(/\s/g,"").replace(",",".")) / (/^(mb|мб)$/i.test(m[2])?1024:1);if(n>=0.25&&n<=4096)fields.ram=Math.round(n*100)/100}
  } else fields[key] = v.slice(0,160);
 };
 if (text.trimStart().startsWith("<")) {
  const xml = new DOMParser().parseFromString(text,"application/xml");
  const sys=xml.querySelector("DxDiag > SystemInformation");
  if (sys) {
   for(const [tag,key] of [["Processor","cpu"],["OperatingSystem","os"],["SystemModel","name"],["Memory","ram"]]) accept(key,sys.querySelector(tag)?.textContent);
   xml.querySelectorAll("DisplayDevices > DisplayDevice > CardName, RenderDevices > RenderDevice > CardName").forEach(x=>accept("gpu",x.textContent));
  }
 } else {
  const keys={"processor":"cpu","процессор":"cpu","operating system":"os","операционная система":"os","system model":"name","модель компьютера":"name","модель системы":"name","модель":"name","memory":"ram","память":"ram","оперативная память":"ram","card name":"gpu","имя платы":"gpu","название карты":"gpu","имя карты":"gpu","название видеокарты":"gpu","название платы":"gpu","видеокарта":"gpu"};
  if(/dxdiag|directx/i.test(text)) for(const line of text.split(/\r?\n/)){
   const colon=line.indexOf(":");if(colon<1)continue;
   const key=keys[line.slice(0,colon).trim().toLowerCase()];
   if(key && (key==="gpu" || !fields[key])) accept(key,line.slice(colon+1));
  }
 }
 if(!fields.cpu && !fields.ram && !adapters.length)throw Error(tr("Bu fayldan qurilma qismlari topilmadi. DxDiag hisoboti (.txt yoki .xml) kerak."));
 if(adapters.length===1)fields.gpu=adapters[0];
 return {fields,adapters};
}
export async function readDxDiag(file) {
 if(!file || file.size>8*1024*1024) throw Error(tr("8 MB gacha bo‘lgan DxDiag hisobotini tanla."));
 const bytes=new Uint8Array(await file.arrayBuffer());
 const enc=bytes[0]===255&&bytes[1]===254 || bytes[1]===0?"utf-16le":bytes[0]===254&&bytes[1]===255?"utf-16be":"utf-8";
 let text=new TextDecoder(enc).decode(bytes);
 if(enc==="utf-8" && text.includes("\uFFFD"))text=new TextDecoder("windows-1251").decode(bytes);
 return parseDxDiag(text);
}


;
