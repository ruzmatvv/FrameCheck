import {language, locale, tr} from "./i18n.mjs";
import {steamPriceBatch} from "./frames.mjs";

export function attachSteamPrices(seed) {
 const offers=new Map(Object.entries(seed).map(([id,x])=>[Number(id),x]));
 let generation=0;
 const checked=new Map();
 const inFlight=new Set();
 let scheduled=false;
 const ttl=10*60*1000;
 const offline=location.protocol==="file:";
 function slot(id){return '<span class="steam-price" data-steam-price="'+Number(id)+'"></span>'}
 function paint(el) {
  const id=Number(el.dataset.steamPrice), v=offers.get(id);
  const expired=v?.until && v.until*1000<=Date.now();
  const stale=v && (offline||Date.now()-v.checkedAt>ttl);
  let label=!v?(inFlight.has(id)?tr("Narx yuklanmoqda…"):tr("Narx tekshirilmoqda…")):"";
  if(v)label=expired?tr("Aksiya tugagan · Steam’da tekshiring"):v.type==="free"?tr("Tekin"):v.type==="temporaryFree"?tr("Vaqtincha tekin"):v.type==="paid"?v.price:v.type==="upcoming"?tr("Tez kunda"):v.type==="unavailable"?tr("Hududda mavjud emas"):tr("Alohida narx yo‘q");
  if (!v&&!inFlight.has(id)&&(offline||checked.has(id))) label=tr("Narxni Steam’da ko‘ring");
  el.replaceChildren();el.classList.toggle("is-free",v?.type==="free");
  const strong=document.createElement("strong");strong.textContent=label;el.append(strong);
  if(v?.type==="paid"&&v.discount&&!expired){
   const old=document.createElement("del");old.textContent=v.original||"";const pct=document.createElement("small");pct.className="price-discount";pct.textContent="−"+v.discount+"%";el.append(old,pct);
  }
  if(v&&stale){const date=document.createElement("small");date.className="price-last";date.textContent=tr("Oxirgi: {0}",new Date(v.checkedAt).toLocaleDateString(locale()));el.append(date)}
  el.title=tr("Steam · O‘zbekiston")+(v?.edition?" · "+v.edition:"")+(v?" · "+new Date(v.checkedAt).toLocaleString(locale()):"");
 }
 function repaint(){document.querySelectorAll("[data-steam-price]").forEach(paint)}
 async function update(part){
  const requestGeneration=generation;
  part.forEach(id=>inFlight.add(id));
  try {
   const url=new URL("/api/prices",location.origin);url.searchParams.set("ids",part.join(","));url.searchParams.set("lang",document.documentElement.lang);
   const res=await fetch(url,{signal:AbortSignal.timeout(18000)});
   if(!res.ok)throw Error();
   const data=await res.json();
   if(requestGeneration!==generation)return;
   const batch=steamPriceBatch(data,Number(data.checkedAt)||Date.now());
   for(const id of part)if(batch[id])offers.set(id,batch[id]);
   part.forEach(id=>checked.set(id,Date.now()+(batch[id]?ttl:60000)));
  } catch {if(requestGeneration===generation)part.forEach(id=>checked.set(id,Date.now()+60000))}
  finally{if(requestGeneration===generation){part.forEach(id=>inFlight.delete(id));repaint()}}
 }
 function sync(){
  if(scheduled)return;scheduled=true;
  queueMicrotask(()=>{
   scheduled=false;repaint();if(offline||document.hidden)return;
   const ids=[...new Set([...document.querySelectorAll("[data-steam-price]")].map(el=>Number(el.dataset.steamPrice)))].filter(id=>Number.isSafeInteger(id)&&id>0&&!inFlight.has(id)&&!(checked.get(id)>Date.now())).sort((a,b)=>a-b);
   for(let i=0;i<ids.length;i+=25)update(ids.slice(i,i+25));
  });
 }
 window.addEventListener("framecheck:language",()=>{generation++;checked.clear();inFlight.clear();sync()});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
 if(!offline)setInterval(sync,60000);
 return {sync,slot};
}


