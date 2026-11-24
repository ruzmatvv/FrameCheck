;
(() => {
// On a real domain the page must never be used over plain http (a password typed here would travel unencrypted).
if(location.protocol==="http:"&&!["localhost","127.0.0.1","[::1]"].includes(location.hostname)){location.replace("https://"+location.host+location.pathname+location.search+location.hash);return}
initLanguage();
const paths={scan:'<path d="M8 3H4v4m12-4h4v4M4 17v4h4m12-4v4h-4"/><path d="M6 12h3l2-4 3 8 2-4h2"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',bookmark:'<path d="M6 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17l-6-4-6 4z"/>',history:'<path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v6l4 2"/>',laptop:'<rect x="4.5" y="4" width="15" height="12" rx="1.5"/><path d="M4 17l-2 3h20l-2-3z"/>',menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',panel:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',activity:'<path d="M2 13h5l3-8 4 14 3-8 2 2h3"/>',search:'<circle cx="10" cy="10" r="6.7"/><path d="m15.2 15.2 5 5"/>',flag:'<path d="M4 21V4m0 1c5-5 9 4 16-1v10c-7 5-11-4-16 1"/>',wrench:'<path d="m14 7 3 3 4-4a6 6 0 0 1-8 8l-7 7a2 2 0 0 1-3-3l7-7a6 6 0 0 1 8-8z"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v5m10-5v5M3 10h18"/>',sliders:'<path d="M3 7h9m4 0h5M3 17h3m4 0h11"/><circle cx="14" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',down:'<path d="m6 9 6 6 6-6"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',refresh:'<path d="M20 10a8 8 0 0 0-14-4L3 9m0-6v6h6m-5 5a8 8 0 0 0 14 4l3-3m0 6v-6h-6"/>',game:'<path d="M7 8h10c3 0 4 3 5 8 .5 4-2 5-4 3l-3-3H9l-3 3c-2 2-5 1-4-3 1-5 2-8 5-8zM6 11v4m-2-2h4m7-1h.01m3 2h.01"/>',check:'<path d="m4 12 5 5L20 6"/>',columns:'<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>'};
const I=k=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">'+(paths[k]||"")+'</svg>';
document.querySelectorAll("[data-i]").forEach(e=>e.innerHTML=I(e.dataset.i));
const $=s=>document.querySelector(s),E=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const texts={home:"O‘yin tekshiruvi",catalog:"O‘yinlar katalogi",saved:"Saqlanganlar",history:"Tekshiruv tarixi"};
const routes={home:"tekshiruv",catalog:"katalog",saved:"saqlangan",history:"tarix"};
const K="framecheck.v1",base=JSON.parse($("#catalog-data").textContent),images=window.FRAME_ART||{};
const prices=attachSteamPrices(STEAM_UZ);
const order=[1815780,1222680,1551360,227300,690790,271590,2824660,2707900,2737300,3241660,635260,244210,2379780,813230,1643320];
const known=new Map(base.map(g=>[g.id,g]));let data={saved:[],history:[],games:{}};let storeOK=true;let account=null,compare=null,deals=null,reports=null,upgrade=null,adminPanel=null,settingsPanel=null,scorePanel=null;
try {const v=JSON.parse(localStorage.getItem(K)||"null");if(v){data.saved=Array.isArray(v.saved)?v.saved.filter(Number.isInteger):[];data.history=Array.isArray(v.history)?v.history.filter(h=>Number.isInteger(h.id)&&h.at):[];data.games=v.games&&typeof v.games==="object"?v.games:{}}}catch{}
function persist(){try{localStorage.setItem(K,JSON.stringify(data));storeOK=true;account?.touch()}catch{storeOK=false;notify(tr("Brauzer saqlashga ruxsat bermadi. Natija shu sahifada ko‘rinadi."))}}
const autoInitial=browserProfile(navigator,document),overrideKey="framecheck.device.v2";
let automatic=autoInitial,storedSettings=null,profileBusy=false,returnToId=null,profileOpened=false;
try {storedSettings=JSON.parse(localStorage.getItem(overrideKey)||"null")}catch{}
let profile=activeProfile(automatic,readOverrides(storedSettings,automatic));
const rawGame=id=>data.games[id]||known.get(id);
const game=id=>applySettings(evaluateGame(rawGame(id),profile,BENCHMARKS),settingsPanel?settingsPanel.get():undefined);
let gameMedia=null;
let localQuery="",view="home",filter=new Set(),verdict="",limit=6,detailId=null,generation=0,toastId,searchSerial=0;
function notify(s){$("#toast").textContent=s;clearTimeout(toastId);toastId=setTimeout(()=>$("#toast").textContent="",3300)}
function setMenu(open){$(".side").classList.toggle("open",open);$("#scrim").hidden=!open;$("#nav-toggle").setAttribute("aria-expanded",String(open))}
function time(t){return new Intl.DateTimeFormat(locale(),{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(t))}
function picture(g){return images[g.id]||g.image||"https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/"+g.id+"/header.jpg"}
// If a cover fails to load, try other Steam CDN hosts, then our own /img proxy. Returns false when nothing is left to try.
function coverFallback(img){
 const id=img.dataset.cover,tried=Number(img.dataset.attempt||0);
 if(!/^\d+$/.test(id||""))return false;
 const list=["https://cdn.cloudflare.steamstatic.com/steam/apps/"+id+"/header.jpg","https://cdn.akamai.steamstatic.com/steam/apps/"+id+"/header.jpg"];
 if(location.protocol!=="file:")list.push("/img/"+id+".jpg");
 if(tried>=list.length)return false;
 img.dataset.attempt=tried+1;img.src=list[tried];return true;
}
window.coverFallback=coverFallback;
function figure(g){return '<div class="art"><div class="art-name">'+E(g.name)+'</div><img loading="lazy" src="'+E(picture(g))+'" data-cover="'+Number(g.id)+'" alt="" onerror="coverFallback(this)||(this.hidden=true)"></div>'}
function badge(g){const why=g.verdict==="unknown"&&g.unknownParts?.length?' title="'+E(tr("Aniq emas: {0}",g.unknownParts.map(k=>tr(parts[k])).join(", ")))+'"':'';return '<span class="badge '+E(g.verdict)+'"'+why+'>'+E(tr(titles[g.verdict]||titles.unknown))+'</span>'}
function fps(g){return g.referenceFps||g.observedFps|| (Array.isArray(g.fps)?g.fps.join("–"):null)}
function savedButton(id){const on=data.saved.includes(id);return '<button class="save '+(on?'saved':'')+'" data-save="'+id+'" aria-pressed="'+on+'" aria-label="'+E(tr(on?"{0}ni saqlanganlardan olib tashlash":"{0}ni saqlash",game(id).name))+'">'+I("bookmark")+'</button>'}
function card(g){const h=data.history.find(x=>x.id===g.id);return '<article class="card"><button class="card-body-link" data-open="'+g.id+'" aria-label="'+E(tr("{0} mosligini ko‘rish",g.name))+'">'+figure(g)+'<div class="card-text"><div class="game-meta">'+E([g.genres?.[0]&&genreLabel(g.genres[0]),g.year].filter(Boolean).join("  ·  ")||"Steam")+'</div><h3>'+E(g.name)+'</h3>'+prices.slot(g.id)+'<div class="card-bottom">'+badge(g)+'<span class="fps" title="'+E(tr(g.fpsBasis||g.basis))+'">'+(fps(g)?'<small>'+E(tr(g.fpsLabel))+'</small> '+E(fps(g))+' FPS':tr("Talablar e’lon qilinmagan"))+'</span></div>'+(view==="history"&&h?'<div class="last-check">'+E(time(h.at))+'</div>':'')+'</div></button>'+savedButton(g.id)+(compare?compare.button(g.id):'')+'</article>'}
function render(){
 const ids=view==="saved"?data.saved:view==="history"?data.history.map(x=>x.id):[...new Set([...order,...known.keys(),...Object.keys(data.games).map(Number)])];
 const recent=new Date().getFullYear()-4;
 const queryIds=localQuery.trim()?new Set([...lookup(localQuery,ids.map(rawGame).filter(Boolean)),...suggestions(localQuery,ids.map(rawGame).filter(Boolean),ids.length)].map(g=>g.id)):null;
 const filtered=ids.filter(id=>!queryIds||queryIds.has(id)).map(game).filter(Boolean).filter(g=>(!filter.has("racing")||g.genres.includes("Poyga"))&&(!filter.has("tuning")||g.genres.includes("Tyuning"))&&(!filter.has("recent")||g.year>=recent)&&(!filter.has("sim")||g.genres.includes("Simulyator"))&&(!filter.has("survival")||g.genres.includes("Survival"))&&(!filter.has("popular")||g.popular)&&(!verdict||g.verdict===verdict));
 const shown=displaySpecs(profile),label=profileLabel(profile);
 $("#device-label").textContent=$("#rig-name").textContent=label;
 $(".device-pill").setAttribute("aria-label",tr("Qurilmani sozlash")+" · "+label);
 for(const k of Object.keys(shown))$("#rig-"+k).textContent=shown[k];
 const mobile=["ios","android","chrome"].includes(osFamily(profile.os));
 const need=[!profile.cpu?"CPU":null,!profile.gpu?"GPU":null,!profile.ram?"RAM":null,!profile.os||profile.os==="Windows"?tr("tizim versiyasi"):null].filter(Boolean);
 const odd=[profile.cpu&&cpuClass(profile.cpu)==null?tr("Protsessor"):null,profile.gpu&&gpuClass(profile.gpu,profile)==null?tr("Videokarta"):null].filter(Boolean);
 $("#profile-note").textContent=profileBusy?tr("Qurilma xususiyatlari o‘qilmoqda…"):mobile?tr("Bu qurilmada Steam’ning PC versiyalari uchun platforma mosligi tekshiriladi."):need.length?tr("Aniqroq baho uchun {0} ma’lumotini to‘ldir.",need.join(", ")):odd.length?tr("{0} modeli tanilmadi. Nomni tekshir, aks holda baho aniq chiqmaydi.",odd.join(", ")):tr("Baholar shu qurilma xususiyatlariga hisoblandi.");
 $("#library-search").hidden=view==="home"||!ids.length;$("#catalog-query").value=localQuery;
 $("#catalog-count").textContent=gameCount(filtered.length)+(view==="home"||view==="catalog"?" · "+tr("Katalogda jami {0} ta",known.size):"");
 $("#frame-lab").hidden=$("#hero").hidden=$("#rig").hidden=view!=="home";$("#settings-panel").hidden=!(view==="home"||view==="catalog");$("#collection").classList.toggle("solo",view!=="home");
 $("#section-title").textContent=view==="home"?tr("O‘yinlarni tanla"):tr(texts[view]);$("#section-kicker").textContent=view==="home"||view==="catalog"?tr("KATALOG"):tr("SHAXSIY TO‘PLAM");
 $("#all-games").hidden=view!=="home";$("#crumb").textContent=tr(texts[view]);document.title=tr(texts[view])+" · Framecheck";
 document.querySelectorAll("[data-nav]").forEach(n=>{const yes=n.dataset.nav===view;n.classList.toggle("active",yes);if(yes)n.setAttribute("aria-current","page");else n.removeAttribute("aria-current")});
 $("#savedCount").textContent=data.saved.length||"";$("#verdict-filter").value=verdict;document.querySelector('[data-f="recent"]').title=tr("{0}–{1} yillarda Steam’da chiqqan o‘yinlar",recent,new Date().getFullYear());
 document.querySelectorAll("[data-f]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.f==="all"?!filter.size:filter.has(b.dataset.f))));
 $("#results-summary").textContent=gameCount(filtered.length);$("#catalog-tools").hidden=(view==="saved"||view==="history")&&!ids.length;
 $("#cards").innerHTML=filtered.length?filtered.slice(0,limit).map(card).join(""):'<div class="empty">'+I(view==="history"?"history":view==="saved"?"bookmark":"search")+'<p>'+(!ids.length&&view==="saved"?tr("Saqlangan o‘yinlar shu yerda ko‘rinadi. Kartadagi xatcho‘pni bos."):!ids.length&&view==="history"?tr("Birinchi o‘yinni tekshirganingda natija shu yerga yoziladi."):tr("Bu filtrlarga mos o‘yin topilmadi."))+'</p><button class="subtle-btn" data-reset>'+(!ids.length?tr("O‘yinlarni ko‘rish"):tr("Filtrlarni tozalash"))+'</button></div>';
 prices.sync();
 compare?.syncButtons();deals?.update();scorePanel?.update();
 $("#more-row").innerHTML=filtered.length>limit?'<button id="more" class="subtle-btn more">'+tr("Yana {0} ta o‘yin",Math.min(view==="home"?6:30,filtered.length-limit))+'</button>':'';
}
function route(){localQuery="";view=Object.keys(routes).find(k=>routes[k]===location.hash.slice(1))||"home";filter.clear();verdict="";limit=view==="home"?6:30;setMenu(false);render();window.scrollTo(0,0)}
// A game's window has its own address (/o/<id>-<name>): the back button closes it and the link can be shared.
function syncGameUrl(g){if(location.protocol==="file:")return;const path=gamePath(g.id,g.name);if(location.pathname===path)return;try{if(parseGamePath(location.pathname)!==null)history.replaceState({game:g.id},"",path+location.search+location.hash);else history.pushState({game:g.id},"",path+location.search+location.hash)}catch{}}
function leaveGameUrl(){if(location.protocol==="file:"||parseGamePath(location.pathname)===null)return;try{if(history.state?.game)history.back();else history.replaceState(null,"","/"+location.search+location.hash)}catch{}}
window.addEventListener("popstate",()=>{const id=parseGamePath(location.pathname);if(id){if(detailId!==id)readGame(id)}else if($("#modal").open)$("#modal").close()});
function show(title,html){const d=$("#modal");$("#modal-body").innerHTML='<div class="modal-head"><h2 id="modal-title">'+E(title)+(`</h2><button class="icon" data-close aria-label="${tr("Yopish")}">`)+I("close")+'</button></div><div class="modal-inner">'+html+'</div>';if(!d.open)d.showModal();d.scrollTop=0}
function remember(g){data.history=[{id:g.id,at:new Date().toISOString()},...data.history.filter(x=>x.id!==g.id)].slice(0,100);persist()}
function toggleSave(id){account?.markSaved(id,!data.saved.includes(id));data.saved=data.saved.includes(id)?data.saved.filter(x=>x!==id):[id,...data.saved];persist();render();if($("#modal").open&&detailId===id)detail(game(id),false);if(storeOK)notify(data.saved.includes(id)?tr("Saqlanganlarga qo‘shildi"):tr("Saqlanganlardan olib tashlandi"))}
const labels={ok:"Mos",low:"Talabdan past",near:"Chegarada",edge:"Minimal hajm",na:"Aniq emas"},parts={cpu:"Protsessor",gpu:"Videokarta",ram:"RAM",os:"Tizim"};
function detail(g,record=true,msg=""){if(!g)return;detailId=g.id;if(record)remember(g);const r=g.ratings;const f=fps(g),rows=Object.keys(parts).map(k=>'<tr><td>'+tr(parts[k])+'</td><td>'+E(g.min[k]==null?tr("Ko‘rsatilmagan"):k==="ram"?memorySize(g.min[k]):hardwareText(g.min[k]))+'</td><td>'+E(displaySpecs(profile)[k])+'<br><small class="badge '+({ok:"play",low:"avoid",near:"adjust",edge:"adjust",na:"unknown"}[r[k]])+'">'+tr(labels[r[k]])+'</small></td></tr>').join("");
 const stamp=g.checkedAt?tr("Steam talablari {0} da tekshirildi.",time(g.checkedAt)):tr("Talablar katalogdagi yozuvdan olindi.");
 const content='<div class="game-meta">'+E([...(g.genres||[]).map(genreLabel),g.year].filter(Boolean).join(" · "))+'</div>'+badge(g)+'<div class="metrics"><div><small>'+E(tr(g.fpsLabel||'Taxminiy FPS'))+'</small><strong>'+(f?E(f)+' FPS':tr("Sinov yetarli emas"))+(`</strong></div><div><small>${tr("Grafik sozlamasi")}</small><strong>`)+E(tr(g.preset))+(`</strong></div><div><small>${tr("Ekran o‘lchami")}</small><strong>`)+E(tr(g.resolution))+(`</strong></div></div><h3>${tr("Xarid va o‘rnatish")}</h3><p>`)+E(tr(g.note))+(`</p><h3>${tr("Minimal talablar")}</h3><div class="table-box"><table><thead><tr><th>${tr("Qism")}</th><th>${tr("O‘yin talabi")}</th><th>`)+E(profileLabel(profile))+'</th></tr></thead><tbody>'+rows+(`</tbody></table></div><button class="subtle-btn edit-in-result" data-device>${tr("Qurilma ma’lumotini tahrirlash")}</button><h3>${tr("Baho qanday olindi?")}</h3><p class="hint">`)+E([g.basis,g.fpsBasis].filter(Boolean).map(s=>tr(s)).join(" "))+'</p><a class="source" href="https://store.steampowered.com/app/'+g.id+(`/" target="_blank" rel="noopener noreferrer">${tr("Steam talablari")}</a>`)+(g.perfSource&&/^https:\/\//.test(g.perfSource)?'<a class="source" href="'+E(g.perfSource)+(`" target="_blank" rel="noopener noreferrer">${tr("FPS manbasi")}</a>`):'')+'<div class="row-actions"><button class="primary" data-refresh="'+g.id+'">'+I("refresh")+(`${tr("Qayta tekshirish")}</button><button class="subtle-btn" data-save="`)+g.id+'">'+I("bookmark")+(data.saved.includes(g.id)?tr("Saqlanganlardan olib tashlash"):tr("Saqlash"))+'</button>'+(compare?'<button type="button" class="subtle-btn" data-compare="'+g.id+'" aria-pressed="'+compare.has(g.id)+'">'+I("columns")+tr("Solishtirish")+'</button>':'')+'</div><p class="hint" id="check-state" aria-live="polite">'+E(msg||stamp)+'</p>';
 show(g.name,(gameMedia&&location.protocol!=="file:"?gameMedia.slot(g.id):"")+prices.slot(g.id)+content);prices.sync();reports?.attach(g);gameMedia?.fill(g.id);syncGameUrl(g);
 const range=(String(f||"").match(/\d+(?:\.\d+)?/g)||[]).map(Number);
 if(range.length){
  const mean=range.slice(0,2).reduce((sum,n)=>sum+n,0)/Math.min(2,range.length);
  const rate=[25,30,60].reduce((best,n)=>Math.abs(n-mean)<Math.abs(best-mean)?n:best);
  const button=document.createElement("button");button.type="button";button.className="subtle-btn fps-inline";button.dataset.fpsDemo=rate;button.textContent=tr("{0} FPS’ni ko‘r",rate);$(".metrics").after(button);
 }
 render();document.title=g.name+" · Framecheck"}
async function api(path,params){if(location.protocol==="file:")throw Error("local");const url=new URL("/api/"+path,location.origin);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);if(path==="search")url.searchParams.set("lang",document.documentElement.lang);const res=await fetch(url,{cache:"no-store",signal:AbortSignal.timeout(14000)});const json=await res.json();if(!res.ok)throw Error(json.code||"offline");return json}
async function readGame(id,refresh=false){
 const ticket=++generation;const baseGame=game(id);
 if(!refresh&&baseGame){detail(baseGame);return}
 detailId=id; if(refresh&&$("#check-state")){const button=$("[data-refresh]");if(button)button.disabled=true;$("#check-state").textContent=tr("Steam’dagi hozirgi talablar tekshirilmoqda…")}else show(tr("O‘yin tekshirilmoqda"),(`<p>${tr("Steam’dan tizim talablari olinmoqda…")}</p>`));
 try {const raw=await api("game",{id});if(ticket!==generation||!$("#modal").open)return;
 const g=combineGame(known.get(id),buildGame(raw));g.checkedAt=new Date().toISOString();data.games[id]=g;persist();detail(game(id),true)
 } catch(e){if(ticket!==generation||!$("#modal").open)return;const msg=e.message==="local"?tr("Jonli tekshiruv uchun Framecheck serverli nusxasini och."):e.message==="not_game"?tr("Bu Steam sahifasi asosiy o‘yinga tegishli emas."):e.message==="not_found"?tr("O‘yin shu Steam manzilida topilmadi."):tr("Steam’dan yangi ma’lumot olinmadi. Keyinroq qayta urin.");if(baseGame){detail(game(id),false,msg+" "+tr("Saqlangan natija ko‘rsatildi."))}else show(tr("Tekshiruv yakunlanmadi"),'<p>'+E(msg)+'</p><a class="source" target="_blank" rel="noreferrer" href="https://store.steampowered.com/app/'+id+(`/">${tr("Steam sahifasini ochish")}</a>`))}
}
function choices(q,items,local=false){prices.sync();detailId=null;const options=items.map(g=>'<button class="selection" data-choose="'+g.id+'"><span>'+E(g.name)+'</span>'+prices.slot(g.id)+I("scan")+'</button>').join("");show(tr("Qidiruv natijalari"),'<p class="hint">“'+E(q)+'”</p>'+(options||(`<p>${tr("Bu nom bilan o‘yin topilmadi.")}</p>`))+(local?(`<button class="subtle-btn" style="margin-top:12px" data-external>${tr("Steam’dan ham qidirish")}</button>`):''))}
async function search(q,external=false){
 q=q.trim();if(!q)return;const request=++searchSerial;$("#search-msg").textContent="";
 const id=steamId(q);if(id){await readGame(id);return}
 if(/^(?:https?:\/\/|(?:www\.)?store\.steampowered\.com\/)/i.test(q)){show(tr("Steam havolasini tekshir"),(`<p>${tr("O‘yinning Steam do‘konidagi /app/ raqami bor havolasini kirit.")}</p>`));return}
 const matches=lookup(q,[...new Set([...known.keys(),...Object.keys(data.games).map(Number)])].map(game));
 if(matches.length&&!external){const direct=matches.find(g=>isDirectMatch(q,g));if(direct){detail(direct);return}choices(q,matches,true);return}
 detailId=null;show(tr("Steam’dan qidirilmoqda"),(`<p>${tr("O‘yinlar ro‘yxati olinmoqda…")}</p>`));try{const result=await api("search",{q});if(request!==searchSerial||!$("#modal").open)return;choices(q,result.items||[])}
 catch(e){if(request!==searchSerial||!$("#modal").open)return;show(tr("Qidiruv tugallanmadi"),'<p>'+(e.message==="local"?tr("Bu nom mahalliy katalogda yo‘q. Steam’dan izlash uchun serverli nusxani och."):tr("Steam qidiruviga hozir ulanib bo‘lmadi. Katalogdagi o‘yinlarni tekshirishingiz mumkin."))+'</p><a class="source" href="https://store.steampowered.com/search/?term='+encodeURIComponent(q)+(`" rel="noreferrer" target="_blank">${tr("Steam’da qidirish")}</a>`))}}
function profileData(values){
 const fields=["cpu","gpu","ram","name"],detected=Object.fromEntries(fields.filter(k=>automatic[k]).map(k=>[k,automatic[k]]));
 return {family:osFamily(automatic.os),detected,values};
}
function updateProfile(values,back=true){
 storedSettings=profileData(values);profile=activeProfile(automatic,readOverrides(storedSettings,automatic));
 try{localStorage.setItem(overrideKey,JSON.stringify(storedSettings))}catch{notify(tr("Profil faqat shu ochiq sahifada ishlaydi."))}
 account?.markProfile();
 render();
 if(back&&returnToId){const id=returnToId;returnToId=null;profileOpened=false;detail(game(id),false)}
 else if(back){$("#modal").close()}
 else device(true);
}
function useVivobook(){
 if(osFamily(automatic.os)!=="windows")return;
 const {modules,...values}=vivobookProfile;updateProfile({...values,reference:true,kind:"laptop"});
}
function device(again=false){
 if(!again){returnToId=detailId;generation++;searchSerial++}detailId=null;profileOpened=true;
 const src=k=>profile[k]?tr(profile.sources[k]||"Qo‘lda"):tr("Kiritilmagan");
 const input=(k,title,ph,list="")=>'<label class="spec-field"><span>'+title+' <small>'+E(src(k))+'</small></span><input name="'+k+'" '+(list?'list="'+list+'" ':'')+'maxlength="160" placeholder="'+E(ph)+'" value="'+E(profile[k]||"")+'"></label>';
 const ram=(`<label class="spec-field"><span>${tr("RAM, GB")} <small>`)+E(src("ram"))+'</small></span><input type="number" name="ram" min="1" max="4096" step="0.25" value="'+E(profile.ram||"")+'" placeholder="'+E(automatic.ramHint?tr("Brauzer bahosi ≈ {0} GB",automatic.ramHint):tr("Masalan, 16"))+'"></label>';
 const kind=(`<label class="spec-field"><span>${tr("Kompyuter turi")}</span><select name="kind">`)+[["",tr("Noma’lum")],["laptop",tr("Noutbuk")],["desktop",tr("Stol kompyuteri")]].map(([k,v])=>'<option value="'+k+'" '+(profile.kind===k?'selected':'')+'>'+v+'</option>').join("")+'</select></label>';
 const osList=["Windows 11","Windows 11 Pro","Windows 10","macOS","Linux","Android","iOS","iPadOS","ChromeOS"];
 const list=(id,items)=>'<datalist id="'+id+'">'+items.map(x=>'<option value="'+E(x)+'"></option>').join("")+'</datalist>';
 const message=automatic.sources.os==="Windows"?tr("Windows ushbu kompyuterning qismlarini o‘qidi. Zarur bo‘lsa, o‘yin ishlatadigan videokartani tanla."):tr("Brauzer ko‘rsata olgan qismlar to‘ldirildi. Yetishmagan model yoki RAM hajmini kiritsang, o‘yin bahosi yangilanadi.");
 show(tr("Qurilma xususiyatlari"),'<p>'+message+(`</p><div class="device-import"><p><strong>${tr("Windows hisobotidan to‘ldirish")}</strong></p><label class="subtle-btn file-trigger">${tr("DxDiag faylini tanlash")}<input type="file" id="dx-file" accept=".xml,.txt" aria-label="${tr("DxDiag faylini tanlash")}"></label><small>${tr("Win + R tugmalarini bos, dxdiag deb yoz va Enter bos. Barcha ma’lumotlarni faylga saqla va shu yerda tanla. Hisobot faqat brauzeringda o‘qiladi.")}</small><output id="dx-status" aria-live="polite"></output></div><form id="device-form"><div class="spec-fields">`)+input("name",tr("Qurilma nomi"),tr("Ixtiyoriy"))+input("os",tr("Operatsion tizim"),tr("Masalan, Windows 11"),"os-choices")+input("cpu",tr("Protsessor"),tr("Masalan, Intel Core i5-12400F"))+input("gpu",tr("Videokarta"),tr("Masalan, GeForce RTX 3060 Laptop GPU"),"gpu-choices")+ram+kind+'</div><output id="spec-hint" class="hint" aria-live="polite"></output>'+list("os-choices",osList)+list("gpu-choices",automatic.gpus||[])+(`<div class="row-actions"><button type="submit" class="primary">${tr("Saqlash va baholash")}</button><button type="button" class="subtle-btn" data-clear-profile>${tr("Avtomatik ma’lumotga qaytish")}</button></div></form><p class="hint">${tr("Profil shu brauzerda saqlanadi. CPU modeli yoki aniq RAM brauzerda ko‘rinmasa, Windows’da Framecheck.cmd orqali ochishingiz mumkin.")}</p>`)+(osFamily(automatic.os)==="windows"?(`<button class="subtle-btn" data-vivobook>${tr("ASUS Vivobook (Core 7 150U) profilini tanlash")}</button>`):''));
 const form=$("#device-form"),fileInput=$("#dx-file");
 // Friendly, translated feedback for wrong entries (the browser's own messages follow the OS language).
 const ramField=form.elements.ram;
 const checkRam=()=>{ramField.setCustomValidity("");if(ramField.value!==""&&!ramField.validity.valid)ramField.setCustomValidity(tr("RAM hajmi 1 dan 4096 GB gacha bo‘lishi kerak (masalan, 8 yoki 16)."))};
 ramField.addEventListener("input",checkRam);ramField.addEventListener("invalid",checkRam);
 const checkSpecs=()=>{const cpu=form.elements.cpu.value.trim(),gpu=form.elements.gpu.value.trim();
  const odd=[cpu&&cpuClass(cpu)==null?tr("Protsessor"):null,gpu&&gpuClass(gpu,{cpu})==null?tr("Videokarta"):null].filter(Boolean);
  $("#spec-hint").textContent=odd.length?tr("{0} modeli tanilmadi. Nomni tekshir, aks holda baho aniq chiqmaydi.",odd.join(", ")):""};
 form.elements.cpu.addEventListener("input",checkSpecs);form.elements.gpu.addEventListener("input",checkSpecs);checkSpecs();
 enhanceDeviceForm(form,{tr,E});
 const imported=new Map((profile.reportFields||[]).map(k=>[k,String(profile[k])]));
 fileInput.addEventListener("change",async()=>{
  const file=fileInput.files[0];if(!file)return;
  form.dataset.touched="1";const status=$("#dx-status");
  try{
   const {fields,adapters}=await readDxDiag(file);
   if(!form.isConnected)return;
   imported.clear();
   for(const [k,v] of Object.entries(fields)){form.elements[k].value=v;form.elements[k].dispatchEvent(new Event("input",{bubbles:true}));imported.set(k,String(v));form.elements[k].closest("label").querySelector("small").textContent="DxDiag"}
   if(adapters.length>1){
    $("#gpu-choices").replaceChildren(...adapters.map(name=>new Option(name,name)));
    const gpu=form.elements.gpu;
    if(!adapters.includes(gpu.value)){gpu.value="";gpu.placeholder=tr("Ro‘yxatdan GPU tanla")}
    gpu.required=true;
   }
   status.textContent=[tr("O‘qilgan maydonlar: {0}.",Object.keys(fields).length),adapters.length>1?tr("Bir nechta GPU topildi. O‘yin ishlatadigan modelni tanla."):"",tr("Tekshir va saqla.")].filter(Boolean).join(" ");
  }catch(err){status.textContent=err.message}finally{fileInput.value=""}
 });
 $("#device-form").addEventListener("submit",event=>{
  event.preventDefault();const fields=new FormData(event.currentTarget),v={};
  for(const k of ["name","cpu","gpu","os","kind"]){const value=String(fields.get(k)||"").trim();if(value&&value!==automatic[k])v[k]=value}
  const ram=Number(fields.get("ram"));if(ram>0&&ram!==automatic.ram)v.ram=ram;
  v.reportFields=[...imported].filter(([k,val])=>String(v[k])===val).map(([k])=>k);
  if(profile.reference&&["cpu","gpu","ram","os"].every(k=>String(fields.get(k))===String(profile[k])))v.reference=true;
  updateProfile(v);
 });
}
async function detectMore(){
 let p={...automatic,sources:{...automatic.sources}};profileBusy=true;render();
 try{
  const hints=await navigator.userAgentData?.getHighEntropyValues?.(["model","platformVersion"]);
  if(hints){
   if(hints.model){p.name=trimSpec(hints.model);p.sources.name=tr("Brauzer")}
   const version=parseInt(hints.platformVersion,10);
   if(p.os==="Windows"&&Number.isFinite(version)&&version>=10)p.os=version>=13?"Windows 11":"Windows 10";
   else if(p.os==="macOS"&&version>0)p.os="macOS "+trimSpec(hints.platformVersion);
  }
 }catch{}
 if(["localhost","127.0.0.1"].includes(location.hostname)&&location.protocol==="http:"){
  try{const res=await fetch("/api/device",{cache:"no-store",signal:AbortSignal.timeout(25000)});if(res.ok)p=applyNative(p,await res.json())}catch{}
 }
 automatic=p;profileBusy=false;profile=activeProfile(automatic,readOverrides(storedSettings,automatic));render();
 if(detailId&&$("#modal").open&&!profileOpened){const g=game(detailId);if(g)detail(g,false)}
 if(profileOpened&&$("#modal").open){const f=$("#device-form");if(f&&!f.dataset.touched)device(true)}
}
document.addEventListener("input",e=>{const f=e.target.closest?.("#device-form");if(f)f.dataset.touched="1"});

$("#search").addEventListener("submit",e=>{e.preventDefault();search($("#game-q").value)});
$("#catalog-query").addEventListener("input",e=>{localQuery=e.target.value;limit=30;render()});
$("#verdict-filter").addEventListener("change",e=>{verdict=e.target.value;render()});
$("#modal").addEventListener("close",()=>{leaveGameUrl();document.title=tr(texts[view])+" · Framecheck";detailId=null;returnToId=null;profileOpened=false;generation++;searchSerial++});$("#modal").addEventListener("click",e=>{if(e.target!==$("#modal"))return;const b=e.target.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)e.target.close()});
document.addEventListener("click",e=>{const b=e.target.closest("button,[data-nav],#scrim");if(!b)return;const a=b.dataset;
 if("fpsDemo" in a){window.FramecheckFPS.open(Number(a.fpsDemo));return}if("duel" in a){window.FramecheckDuel.open();return}if(b.id==="nav-toggle")setMenu(!$(".side").classList.contains("open"));else if(b.id==="scrim"||a.nav)setMenu(false);else if("clearProfile" in a){updateProfile({},false)}else if("vivobook" in a){useVivobook()}else if("device" in a){setMenu(false);device()}else if("close" in a)$("#modal").close();else if(a.save)toggleSave(+a.save);else if(a.open)readGame(+a.open);else if(a.choose)readGame(+a.choose);else if("external" in a)search($("#game-q").value,true);else if(a.refresh)readGame(+a.refresh,true);else if(a.f){if(a.f==="all")filter.clear();else if(filter.has(a.f))filter.delete(a.f);else filter.add(a.f);limit=view==="home"?6:30;render()}else if(b.id==="all-games")location.hash=routes.catalog;else if(b.id==="more"){limit+=view==="home"?6:30;render()}else if("reset" in a){if(!filter.size&&!verdict&&!localQuery)location.hash=routes.catalog;else{filter.clear();verdict="";localQuery="";render()}}});
document.addEventListener("keydown",e=>{if(e.key==="Escape")setMenu(false)});window.addEventListener("hashchange",route);const allTitles=()=>[...new Map([...known.entries(),...Object.values(data.games).filter(g=>g&&g.id&&g.name).map(g=>[g.id,g])]).values()];
 for(const [input,box] of [["#game-q","#search"],["#catalog-query","#library-search"]]){
  attachSuggestions($(input),$(box),allTitles,id=>readGame(id),picture,api,prices);
 }
 window.addEventListener("framecheck:language",()=>{render();$("#toast").textContent="";});
 const searchField=$("#game-q");
 searchField.addEventListener("invalid",()=>{if(searchField.validity.valueMissing)searchField.setCustomValidity(tr("O‘yin nomi yoki Steam havolasini kirit."))});
 searchField.addEventListener("input",()=>searchField.setCustomValidity(""));
 window.addEventListener("framecheck:language",()=>searchField.setCustomValidity(""));
 const refreshProfile=()=>{profile=activeProfile(automatic,readOverrides(storedSettings,automatic))};
 account=createAccount({
  tr,E,$,I,show,notify,time,
  closeMenu:()=>setMenu(false),
  openDevice:()=>{setMenu(false);device()},
  openAdmin:()=>adminPanel.open(),
  read:()=>({saved:data.saved,history:data.history,games:data.games,profile:storedSettings}),
  // Replace local data with the merged copy from the server.
  write:({saved,history,games,profile:settings})=>{
   data.saved=saved;data.history=history;data.games=games;storedSettings=settings;
   try{if(settings)localStorage.setItem(overrideKey,JSON.stringify(settings));else localStorage.removeItem(overrideKey)}catch{}
   refreshProfile();persist();render();
  },
  // Forget this account's data on this device (signing out, or deleting the account).
  wipe:()=>{
   data={saved:[],history:[],games:{}};storedSettings=null;
   try{localStorage.removeItem(overrideKey)}catch{}
   refreshProfile();persist();render();
  },
 });
 const nameOf=id=>known.get(id)?.name||data.games[id]?.name||"";
 const shared={tr,E,$,I,show,notify,time,prices,fps,badge,locale,memorySize,hardwareText,genreLabel,labels,parts,
  game:id=>rawGame(id)?game(id):null,profile:()=>profile,profileName:()=>profileLabel(profile),settings:()=>settingsPanel.get()};
 settingsPanel=createSettingsPanel({tr,E,$,onChange:()=>{render();if($("#modal").open&&detailId)detail(game(detailId),false)}});
 scorePanel=createScorePanel({...shared,ids:()=>[...known.keys()],lang:()=>language,view:()=>view});
 gameMedia=createGameMedia({tr,E,$,api});
 compare=createCompare(shared);
 upgrade=createUpgrade({...shared,ids:()=>[...new Set([...order,...known.keys(),...Object.keys(data.games).map(Number)])],raw:id=>rawGame(id)});
 deals=createDeals({...shared,view:()=>view,saved:()=>data.saved,fresh:ids=>ids.every(id=>prices.offer(id)&&Date.now()-prices.offer(id).checkedAt<10*60*1000)});
 reports=createReports({...shared,account});
 adminPanel=createAdminPanel({...shared,account,nameOf});
 // account.openAdmin is read at click time, so the panel can be created after the account.
 shared.openAdmin=()=>adminPanel.open();
 const openPrivacy=()=>show(tr("Maxfiylik izohi"),privacyHtml(tr,E));
 document.addEventListener("click",e=>{
  if(e.target.closest("[data-privacy]")){setMenu(false);openPrivacy()}
  else if(e.target.closest("[data-upgrade]"))upgrade.open();
 });
 const privacyFromHash=()=>{if(location.hash==="#maxfiylik"){history.replaceState(null,"",location.pathname+location.search+"#"+routes[view]);openPrivacy()}};
 window.addEventListener("hashchange",privacyFromHash);
 route();{const first=parseGamePath(location.pathname);if(first)readGame(first)}detectMore();window.FramecheckDuel.openIncoming();account.init();privacyFromHash();deals.load();
 // Install as an app and open offline (service worker needs https or localhost).
 if("serviceWorker" in navigator&&(location.protocol==="https:"||["localhost","127.0.0.1"].includes(location.hostname)))navigator.serviceWorker.register("/sw.js").catch(()=>{});
 let installEvent=null;const installButton=$("#install-app");
 window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();installEvent=e;installButton.hidden=false});
 installButton.addEventListener("click",async()=>{if(!installEvent)return;installEvent.prompt();await installEvent.userChoice.catch(()=>{});installEvent=null;installButton.hidden=true});
 window.addEventListener("appinstalled",()=>{installButton.hidden=true});
})();
