
export const titles = {play:"Bemalol o‘ynaladi",adjust:"Sozlamani pasaytirish kerak",avoid:"Tavsiya etilmaydi",unknown:"Ma’lumot yetarli emas"};
export const clean = s => String(s ?? "").replace(/[™®©]/g,"").replace(/&amp;/gi,"&").replace(/&nbsp;|&#160;/gi," ").replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s+/g," ").trim();
export const norm = s => clean(s).toLowerCase().replace(/[’‘']/g,"").replace(/[^\p{L}\p{N}]+/gu," ").trim();
export function steamId(input) {
 const s=input.trim(); if (/^\d{1,10}$/.test(s)) return +s;
 let url; try {url=new URL(/^https?:\/\//i.test(s)?s:"https://"+s)}catch{return null}
 if(!["store.steampowered.com","www.store.steampowered.com"].includes(url.hostname))return null;
 const m=url.pathname.match(/^\/(?:[a-z]{2}\/)?app\/(\d{1,10})(?:\/|$)/);return m?+m[1]:null;
}
export const aliases={"гта":271590,"гта 5":271590,"гта в":271590,"дота":570,"дота 2":570,"кс 2":730,"кс2":730,"форза 5":1551360,"нфс хит":1222680,"cs2":730,"cs 2":730,"rdr2":1174180,"rdr 2":1174180,"bg3":1086940,"nfs unbound":1846380,"ats":270880,"ets 2":227300,"fh 5":1551360,"fs25":2300320,"fs 25":2300320,"nfs heat":1222680,"forza 5":1551360,"fh5":1551360,"ets2":227300,"euro truck":227300,"gta 5":271590,"gta v":271590,"gta 5 legacy":271590,"repo":3241660,"asphalt 9":1815780,"asphalt legends unite":1815780};
export const isDirectMatch=(q,g)=>norm(q)===norm(g.name)||aliases[norm(q)]===g.id;
export function lookup(q,games) {
 const normQ=norm(q);
 const id=steamId(q) || aliases[normQ];
 return games.filter(g=>id?g.id===id:normQ.length>0&&(norm(g.name).includes(normQ)||norm(g.name).replace(/ /g,"").includes(normQ.replace(/ /g,""))));
}
export function parseMin(markup) {
 const s=String(markup||"").replace(/<\s*(?:br\s*\/?|\/li|\/p)\s*>/gi,"\n").replace(/<[^>]*>/g,"");
 const rows=s.split(/\n/).map(clean);
 const field=re=>{const l=rows.find(v=>re.test(v));return l?clean(l.slice(l.indexOf(":")+1)):null};
 const memory=field(/^memory\s*:/i),m=memory?.match(/(\d+(?:[.,]\d+)?)\s*(GB|MB)/i);
 return {cpu:field(/^processor\s*:/i),gpu:field(/^graphics(?: card)?\s*:/i),ram:m?Number(m[1].replace(",","."))*(m[2].toUpperCase()==="MB"?1/1024:1):null,os:field(/^OS(?:\s*\*)?\s*:/i)};
}
export function buildGame(raw) {
 const min=parseMin(raw.pc_requirements?.minimum), year=String(raw.release_date?.date||"").match(/\b(19|20)\d{2}\b/);
 const genresMap={Racing:"Poyga",Simulation:"Simulyator",Action:"Ekshen",Sports:"Sport",Adventure:"Sarguzasht",Strategy:"Strategiya"};
 const g={id:Number(raw.steam_appid),name:clean(raw.name),min,year:year?+year[0]:null,genres:[...new Set((raw.genres||[]).map(x=>genresMap[x.description]).filter(Boolean))],curated:false,windows:raw.platforms?.windows,source:"https://store.steampowered.com/app/"+Number(raw.steam_appid)+"/",image:/^https:\/\/[\w.-]*steamstatic\.com\//.test(raw.header_image||"")?raw.header_image:null};
 g.platforms=raw.platforms||{};g.nativeMin={mac:parseMin(raw.mac_requirements?.minimum),linux:parseMin(raw.linux_requirements?.minimum)};
 return g;
}
export function combineGame(base,fresh) {
 if(!base)return fresh;
 if(base.curated===false)return {...base,...fresh,popular:base.popular,genres:[...new Set([...base.genres,...fresh.genres])]};
 const newMin=Object.fromEntries(Object.entries(fresh.min).map(([k,v])=>[k,v??base.min[k]]));
 // Steam often lists the same hardware with different punctuation or extra alternatives.
 const models=t=>(String(t||"").toLowerCase().match(/\b(?:[ab]?\d{3,5}[a-z]{0,2})\b/g)||[]);
 const intersects=(a,b)=>{const x=models(a),y=models(b);return x.length&&y.length?x.some(v=>y.includes(v)):norm(a)===norm(b)};
 const changedSpecs=(newMin.ram!==base.min.ram||fresh.windows===false||
 (fresh.min.gpu&&!intersects(base.min.gpu,fresh.min.gpu)&&!(/integrated/i.test(fresh.min.gpu)&&/integratsiya/i.test(base.min.gpu)))||
 (fresh.min.cpu&&!intersects(base.min.cpu,fresh.min.cpu)&&!norm(fresh.min.cpu).includes(norm(base.min.cpu))&&!norm(base.min.cpu).includes(norm(fresh.min.cpu))));
 if(changedSpecs)return {...fresh,min:newMin,genres:[...new Set([...base.genres,...fresh.genres])],basis:"Steam’dagi talablar katalogdagi yozuvdan farq qiladi. Baho yangilangan talablar asosida berildi. Avvalgi FPS taxmini qo‘llanilmadi."};
 return {...base,min:newMin,image:fresh.image,windows:fresh.windows,platforms:fresh.platforms,nativeMin:fresh.nativeMin};
}

// Keep device details local. Browser RAM and thread counts are hints, not model identifiers.
export const trimSpec = value => typeof value === "string" ? value.trim().slice(0,180) : "";
