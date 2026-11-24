import {language, locale, tr} from "./i18n.mjs";
import {steamPriceBatch} from "./frames.mjs";
import {OFF_STEAM_ID, licenseLabel} from "./core.mjs";

export function attachSteamPrices(seed) {
 const offers=new Map(Object.entries(seed).map(([id,x])=>[Number(id),x]));
 let generation=0;
 const checked=new Map();
 const inFlight=new Set();
 let scheduled=false;
 const ttl=10*60*1000;
 const offline=location.protocol==="file:";
 // Games that are not on Steam show what the publisher asks (set by the page through prices.lookup); Steam games ask Steam.
 // long=true is the sentence in the game window: "Litsenziya kerak ? $9.99" / "Tekin".
 let lookup=()=>null;
 function slot(id,long=false){
  if(Number(id)>=OFF_STEAM_ID){const g=lookup(Number(id));return '<span class="steam-price other-price'+(g?.license==="free"?' is-free':'')+'" title="'+String(g?.store||"").replace(/[<>&"]/g,"")+'"><strong>'+(g?licenseLabel(g,tr).replace(/[<>&"]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;",'"':"&quot;"}[c])):"")+'</strong></span>'}
  return '<span class="steam-price" data-steam-price="'+Number(id)+'"'+(long?' data-long="1"':'')+'></span>';
 }
 function paint(el) {
  const id=Number(el.dataset.steamPrice), v=offers.get(id);
  const expired=v?.until && v.until*1000<=Date.now();
  const stale=v && (offline||Date.now()-v.checkedAt>ttl);
  let label=!v?(inFlight.has(id)?tr("Narx yuklanmoqda…"):tr("Narx tekshirilmoqda…")):"";
  if(v&&el.dataset.long&&!expired&&v.type==="free")label=tr("Litsenziya kerak emas ? tekin");
  else if(v&&el.dataset.long&&!expired&&v.type==="paid")label=tr("Litsenziya kerak ? {0}",v.price);
  else if(v)label=expired?tr("Aksiya tugagan · Steam’da tekshiring"):v.type==="free"?tr("Tekin"):v.type==="temporaryFree"?tr("Vaqtincha tekin"):v.type==="paid"?v.price:v.type==="upcoming"?tr("Tez kunda"):v.type==="unavailable"?tr("Hududda mavjud emas"):tr("Alohida narx yo‘q");
  if (!v&&!inFlight.has(id)&&(offline||checked.has(id))) label=tr("Narxni Steam’da ko‘ring");
  el.replaceChildren();el.classList.toggle("is-free",v?.type==="free");
  const strong=document.createElement("strong");strong.textContent=label;el.append(strong);
  if(v?.type==="paid"&&v.discount&&!expired){
   const old=document.createElement("del");old.textContent=v.original||"";const pct=document.createElement("small");pct.className="price-discount";pct.textContent="−"+v.discount+"%";el.append(old,pct);
  }
  if(v&&stale){const date=document.createElement("small");date.className="price-last";date.textContent=tr("Oxirgi: {0}",new Date(v.checkedAt).toLocaleDateString(locale()));el.append(date)}
  el.title=tr("Steam · O‘zbekiston")+(v?.edition?" · "+v.edition:"")+(v?" · "+new Date(v.checkedAt).toLocaleString(locale()):"");
 }
 const listeners=new Set();
 function repaint(){document.querySelectorAll("[data-steam-price]").forEach(paint);listeners.forEach(f=>f())}
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
   const ids=[...new Set([...document.querySelectorAll("[data-steam-price]")].map(el=>Number(el.dataset.steamPrice)))].filter(id=>Number.isSafeInteger(id)&&id>0&&id<OFF_STEAM_ID&&!inFlight.has(id)&&!(checked.get(id)>Date.now())).sort((a,b)=>a-b);
   for(let i=0;i<ids.length;i+=25)update(ids.slice(i,i+25));
  });
 }
 window.addEventListener("framecheck:language",()=>{generation++;checked.clear();inFlight.clear();sync()});
 document.addEventListener("visibilitychange",()=>{if(!document.hidden)sync()});
 if(!offline)setInterval(sync,60000);
 // Fetch prices for games that have no price slot on screen (for example the saved list).
 function load(ids){
  if(offline||document.hidden)return;
  const wanted=[...new Set(ids.map(Number))].filter(id=>Number.isSafeInteger(id)&&id>0&&id<OFF_STEAM_ID&&!inFlight.has(id)&&!(checked.get(id)>Date.now())).sort((a,b)=>a-b);
  for(let i=0;i<wanted.length;i+=25)update(wanted.slice(i,i+25));
 }
 return {sync,slot,load,setLookup:f=>{lookup=f},offer:id=>offers.get(Number(id)),onChange:f=>listeners.add(f)};
}


