import {handleAccount} from "./auth.mjs";
import "./recovery.mjs";
import "./fps.mjs";
import "./admin.mjs";
import {GAME_NAMES} from "./game-names.mjs";
import {LANGUAGES, routeLanguage, homePath, gamePath, parseGamePath, parseHomePath} from "./routes.mjs";
const steam="https://store.steampowered.com";
const COVER_HOSTS=["https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/","https://cdn.cloudflare.steamstatic.com/steam/apps/","https://cdn.akamai.steamstatic.com/steam/apps/"];
const security={"X-Content-Type-Options":"nosniff"};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...security,...extra}});
const validId=value=>/^\d{1,10}$/.test(value);

// Edge cache for answers that are the same for everybody (Steam data). It exists on the own domain; without it
// (tests, local run) every request is simply answered fresh. Errors that Steam would repeat are kept for a minute so
// random ids cannot make us ask Steam again and again. Nothing about accounts is ever cached.
async function cached(request,key,seconds,produce,ctx){
 const store=typeof caches!=="undefined"?caches.default:null;
 if(!store||!key||request.method!=="GET"){const r=await produce();return tag(r,store?"SKIP":"NO-CACHE")}
 const cacheKey=new Request(new URL(request.url).origin+"/__cache/"+key);
 try{const hit=await store.match(cacheKey);if(hit)return tag(hit,"HIT")}catch(e){lastCacheError="match: "+e}
 const res=await produce();
 const ttl=res.status===200?seconds:(res.status===404||res.status===422)?60:0;
 if(!ttl)return tag(res,"BYPASS");
 const headers=new Headers(res.headers),own=headers.get("Cache-Control")||"";
 if(!/max-age/.test(own)||/no-store/.test(own))headers.set("Cache-Control","public, max-age="+Math.min(ttl,300)+", s-maxage="+ttl);
 const final=new Response(res.body,{status:res.status,headers});
 // The copy for the cache must be taken before the body is handed on: Cloudflare refuses to clone a body that was already passed to another Response.
 const stored=final.clone();
 const write=Promise.resolve(store.put(cacheKey,stored)).catch(e=>{lastCacheError="put: "+e});
 if(ctx?.waitUntil)ctx.waitUntil(write);else await write;
 return tag(final,"MISS");
}
// X-Cache tells whether an answer came from the edge cache (HIT), was stored now (MISS), skipped it or could not use it.
let lastCacheError="";
function tag(res,state){
 const headers=new Headers(res.headers);headers.set("X-Cache",state);
 return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
}
function priceKey(searchParams){
 const ids=[...new Set((searchParams.get("ids")||"").split(",").filter(Boolean))].sort();
 return !ids.length||ids.length>25||!ids.every(validId)?null:"prices/"+ids.join(",")+"/"+(searchParams.get("lang")==="ru"?"ru":"en");
}

function priceURL(ids,lang){
 const input={ids:ids.map(appid=>({appid})),context:{language:lang==="ru"?"russian":"english",country_code:"UZ"},data_request:{include_all_purchase_options:true,include_release:true}};
 const url=new URL("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
 url.searchParams.set("input_json",JSON.stringify(input));
 return url;
}

async function prices(searchParams,fetchSteam){
 const ids=[...new Set((searchParams.get("ids")||"").split(",").filter(Boolean))];
 if(!ids.length||ids.length>25||!ids.every(validId))return json({code:"invalid"},400);
 try{
  const res=await fetchSteam(priceURL(ids.map(Number),searchParams.get("lang")).toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
  if(!res.ok)return json({code:"steam_unavailable"},503);
  const payload=await res.json();
  if(!Array.isArray(payload?.response?.store_items))return json({code:"steam_unavailable"},503);
  return json({response:{store_items:payload.response.store_items},checkedAt:Date.now()},200,{"Cache-Control":"public, max-age=120, s-maxage=600"});
 }catch{return json({code:"steam_unavailable"},503)}
}

// Game covers are proxied so they still show on networks where the Steam CDN is blocked or slow.
async function cover(id,fetchSteam){
 if(!validId(id))return json({code:"invalid"},400);
 for(const host of COVER_HOSTS){
  try{
   const res=await fetchSteam(host+id+"/header.jpg",{signal:AbortSignal.timeout(8000)});
   const type=res.headers?.get("content-type")||"";
   if(res.ok&&/^image\//.test(type))return new Response(res.body,{headers:{"Content-Type":type,"Cache-Control":"public, max-age=604800, immutable",...security}});
  }catch{}
 }
 // Newer games keep their cover under a hashed path; Steam's own record has the exact address.
 try{
  const info=await fetchSteam(steam+"/api/appdetails/?appids="+id+"&filters=basic&cc=uz&l=english",{headers:{Accept:"application/json"},signal:AbortSignal.timeout(8000)});
  const image=info.ok?(await info.json())?.[id]?.data?.header_image:null;
  if(typeof image==="string"&&/^https:\/\/[\w.-]+\.steamstatic\.com\//.test(image)){
   const res=await fetchSteam(image,{signal:AbortSignal.timeout(8000)});
   const type=res.headers?.get("content-type")||"";
   if(res.ok&&/^image\//.test(type))return new Response(res.body,{headers:{"Content-Type":type,"Cache-Control":"public, max-age=86400",...security}});
  }
 }catch{}
 return json({code:"not_found"},404);
}

const decodeBase64=text=>Uint8Array.from(atob(text),c=>c.charCodeAt(0));
// Manifest, service worker and icons (built by build.mjs) so the site can be installed and opened offline.
function installAsset(pathname,assets){
 if(pathname==="/manifest.webmanifest"&&assets.manifest)return new Response(assets.manifest,{headers:{"Content-Type":"application/manifest+json; charset=utf-8","Cache-Control":"public, max-age=3600",...security}});
 if(pathname==="/sw.js"&&assets.sw)return new Response(assets.sw,{headers:{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-cache","Service-Worker-Allowed":"/",...security}});
 const icon=pathname.match(/^\/icons\/([\w-]+\.png)$/);
 if(icon&&assets.icons?.[icon[1]])return new Response(decodeBase64(assets.icons[icon[1]]),{headers:{"Content-Type":"image/png","Cache-Control":"public, max-age=604800",...security}});
 return null;
}

// ---- Pages with their own address, in three languages: /o/<id>-<name>, /ru/o/..., /en/o/..., and the home pages / /ru/ /en/.
// Every address serves the same app; only the head differs (title, description, language, links to the other languages),
// so a link shared in a chat or found by a search engine shows the right game, cover and language.
const PAGE_SECURITY={"X-Frame-Options":"DENY","Content-Security-Policy":"frame-ancestors 'none'","Permissions-Policy":"camera=(), microphone=(), geolocation=(), payment=()"};
const escapeHtml=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const PAGE_TEXT={
 uz:{locale:"uz_UZ",homeTitle:"Framecheck — O‘yin tekshiruvi",homeDesc:"Qurilmangiz uchun o‘yin talablarini taqqosla, taxminiy FPS va mos grafik sozlamalarini ko‘r.",
  gameTitle:n=>n+" — Framecheck",gameDesc:n=>n+": tizim talablari va sizning qurilmangizda taxminiy FPS. Framecheck o‘yin kompyuteringizda ishlashini tekshiradi."},
 ru:{locale:"ru_RU",homeTitle:"Framecheck — проверка игр для вашего ПК",homeDesc:"Сравните системные требования игр с вашим устройством, узнайте примерный FPS и подходящие настройки графики.",
  gameTitle:n=>n+" — Framecheck",gameDesc:n=>n+": системные требования и примерный FPS на вашем устройстве. Framecheck проверяет, пойдёт ли игра на вашем компьютере."},
 en:{locale:"en_US",homeTitle:"Framecheck — Can your PC run it? Game requirements and FPS",homeDesc:"Compare game requirements with your device, see the estimated FPS and matching graphics settings.",
  gameTitle:n=>n+" — Framecheck",gameDesc:n=>"Can your PC run "+n+"? System requirements and estimated FPS on your device. Framecheck compares your hardware with the game's requirements."}
};
const siteBase=(origin,canonicalHost)=>canonicalHost?"https://"+canonicalHost:origin;
// kind "home" or "game"; the page's own address, the same page in every language, and the head tags built from them
function pageMeta(kind,lang,id,origin,canonicalHost){
 const base=siteBase(origin,canonicalHost),text=PAGE_TEXT[lang],name=kind==="game"?GAME_NAMES[id]:null;
 const pathIn=l=>kind==="game"?gamePath(id,name,l):homePath(l),path=pathIn(lang),url=base+path;
 const title=name?text.gameTitle(name):text.homeTitle,description=name?text.gameDesc(name):text.homeDesc;
 const image=kind==="game"?base+"/img/"+id+".jpg":base+"/icons/icon-512.png";
 const ld=name?{"@context":"https://schema.org","@type":"VideoGame",name,url,image,inLanguage:lang,applicationCategory:"Game",operatingSystem:"Windows"}:null;
 const tag=(attr,key,value)=>'<meta '+attr+'="'+key+'" content="'+escapeHtml(value)+'">';
 const alternates=LANGUAGES.map(l=>'<link rel="alternate" hreflang="'+l+'" href="'+escapeHtml(base+pathIn(l))+'">').join("")+'<link rel="alternate" hreflang="x-default" href="'+escapeHtml(base+pathIn("uz"))+'">';
 const tags=['<link rel="canonical" href="'+escapeHtml(url)+'">',alternates,tag("property","og:type","website"),tag("property","og:site_name","Framecheck"),tag("property","og:locale",text.locale),tag("property","og:title",title),tag("property","og:description",description),
  tag("property","og:url",url),tag("property","og:image",image),tag("name","twitter:card",kind==="game"?"summary_large_image":"summary"),tag("name","twitter:title",title),tag("name","twitter:description",description),tag("name","twitter:image",image),
  ld?'<script type="application/ld+json">'+JSON.stringify(ld).replace(/</g,"\\u003c")+'</script>':""].join("");
 return {name,path,url,title,description,tags,lang};
}
const redirectTo=(location,search="")=>new Response(null,{status:308,headers:{Location:location+search,"Cache-Control":"public, max-age=3600",...security}});
async function servePage(request,home,env,meta){
 const url=new URL(request.url);
 const source=home!=null?new Response(home):await env?.ASSETS?.fetch(new Request(url.origin+"/"));
 if(!source||!source.ok)return json({code:"not_found"},404);
 const headers=new Headers({"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache","Referrer-Policy":"strict-origin-when-cross-origin",...security,...PAGE_SECURITY});
 if(typeof HTMLRewriter!=="undefined"){ // on Cloudflare: changes the head while the page streams through
  // the page's own static copy already holds a canonical and alternate links; drop them so there is one set
  return new HTMLRewriter().on("html",{element(e){e.setAttribute("lang",meta.lang)}}).on("title",{element(e){e.setInnerContent(meta.title)}}).on('meta[name="description"]',{element(e){e.setAttribute("content",meta.description)}})
   .on('link[rel="canonical"], link[rel="alternate"]',{element(e){e.remove()}}).on("head",{element(e){e.append(meta.tags,{html:true})}}).transform(new Response(request.method==="HEAD"?null:source.body,{headers}));
 }
 const text=(await source.text()).replace(/<html lang="[^"]*"/,()=>'<html lang="'+meta.lang+'"').replace(/<title>[^<]*<\/title>/,()=>"<title>"+escapeHtml(meta.title)+"</title>")
  .replace(/(<meta name="description" content=")[^"]*(")/,(_,a,b)=>a+escapeHtml(meta.description)+b).replace(/<link rel="(?:canonical|alternate)"[^>]*>/g,"").replace("</head>",()=>meta.tags+"</head>");
 return new Response(request.method==="HEAD"?null:text,{headers});
}
async function gamePage(request,home,env,id,lang){
 const url=new URL(request.url),meta=pageMeta("game",lang,id,url.origin,env?.CANONICAL_HOST);
 // a known game asked for with another spelling of the address goes to its one proper address
 if(meta.name&&url.pathname!==meta.path)return redirectTo(meta.path,url.search);
 return servePage(request,home,env,meta);
}
async function homePage(request,home,env,lang){
 const url=new URL(request.url);
 if(lang!=="uz"&&!url.pathname.endsWith("/"))return redirectTo(homePath(lang),url.search);
 return servePage(request,home,env,pageMeta("home",lang,null,url.origin,env?.CANONICAL_HOST));
}
function sitemap(url,env){
 const base=siteBase(url.origin,env?.CANONICAL_HOST);
 const entry=pathIn=>LANGUAGES.map(l=>{
  const links=LANGUAGES.map(k=>'<xhtml:link rel="alternate" hreflang="'+k+'" href="'+escapeHtml(base+pathIn(k))+'"/>').join("")+'<xhtml:link rel="alternate" hreflang="x-default" href="'+escapeHtml(base+pathIn("uz"))+'"/>';
  return "<url><loc>"+escapeHtml(base+pathIn(l))+"</loc>"+links+"</url>";
 }).join("\n");
 const body='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
  +entry(homePath)+"\n"+Object.entries(GAME_NAMES).map(([id,name])=>entry(l=>gamePath(id,name,l))).join("\n")+"\n</urlset>\n";
 return new Response(body,{headers:{"Content-Type":"application/xml; charset=utf-8","Cache-Control":"public, max-age=3600",...security}});
}

// Screenshots and trailers of a game (for its page): only https addresses on Steam's own hosts, and only a few of them.
const steamMedia=u=>typeof u==="string"&&/^https:\/\/[\w.-]+\.(?:steamstatic\.com|akamaihd\.net)\//.test(u)?u:null;
function pickMedia(game){
 const list=value=>Array.isArray(value)?value:[];
 const people=value=>list(value).filter(x=>typeof x==="string"&&x.length<=80).slice(0,3);
 return {
  short_description:typeof game.short_description==="string"?game.short_description.slice(0,600):"",
  screenshots:list(game.screenshots).slice(0,12).map(s=>({thumb:steamMedia(s?.path_thumbnail),full:steamMedia(s?.path_full)})).filter(s=>s.thumb&&s.full),
  movies:list(game.movies).slice(0,3).map(m=>({name:String(m?.name||"").slice(0,120),thumb:steamMedia(m?.thumbnail),mp4:steamMedia(m?.mp4?.["480"]||m?.mp4?.max),webm:steamMedia(m?.webm?.["480"]||m?.webm?.max)})).filter(m=>m.thumb&&(m.mp4||m.webm)),
  metacritic:Number.isFinite(Number(game.metacritic?.score))&&Number(game.metacritic.score)>0?Number(game.metacritic.score):null,
  developers:people(game.developers),publishers:people(game.publishers),
 };
}

// Other host names of the site (a mistyped domain, www) send visitors to the main address, keeping path and query.
function canonicalRedirect(url,env){
 const canonical=env?.CANONICAL_HOST;if(!canonical)return null;
 const from=String(env.REDIRECT_HOSTS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
 if(!from.includes(url.hostname.toLowerCase()))return null;
 return new Response(null,{status:308,headers:{Location:"https://"+canonical+url.pathname+url.search,"Cache-Control":"public, max-age=3600",...security}});
}

// On the real site (CANONICAL_HOST is set) plain http is sent to https at once, so a password or a session cookie
// never travels unencrypted. Local runs and tests have no CANONICAL_HOST and are left alone.
function httpsRedirect(url,env){
 if(!env?.CANONICAL_HOST||url.protocol!=="http:")return null;
 return new Response(null,{status:308,headers:{Location:"https://"+url.host+url.pathname+url.search,"Cache-Control":"no-store",...security}});
}
const HSTS="max-age=15552000"; // browsers keep using https for this site for 180 days

export async function handle(request,home,fetchSteam=fetch,env={},assets={},ctx=undefined){
 const url=new URL(request.url);
 const early=httpsRedirect(url,env)||canonicalRedirect(url,env);if(early)return early;
 const res=await respond(request,home,fetchSteam,env,assets,ctx);
 if(!env?.CANONICAL_HOST||url.protocol!=="https:")return res;
 const headers=new Headers(res.headers);headers.set("Strict-Transport-Security",HSTS);
 return new Response(res.body,{status:res.status,statusText:res.statusText,headers});
}

async function respond(request,home,fetchSteam,env,assets,ctx){
 const {pathname,searchParams}=new URL(request.url);
 const account=await handleAccount(request,env);if(account)return account;
 if(request.method!=="GET"&&request.method!=="HEAD")return json({code:"method"},405);
 if((pathname==="/"||pathname==="/index.html")&&home)return new Response(request.method==="HEAD"?null:home,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache","Referrer-Policy":"strict-origin-when-cross-origin",...security}});
 if(pathname==="/favicon.ico")return new Response(null,{status:204});
 if(pathname==="/sitemap.xml")return sitemap(new URL(request.url),env);
 if(/^(?:\/(?:ru|en))?\/o\//.test(pathname)){const id=parseGamePath(pathname);return id?gamePage(request,home,env,id,routeLanguage(pathname)||"uz"):json({code:"not_found"},404)}
 {const lang=parseHomePath(pathname);if(lang&&lang!=="uz")return homePage(request,home,env,lang)}
 const asset=installAsset(pathname,assets);if(asset)return request.method==="HEAD"?new Response(null,{status:asset.status,headers:asset.headers}):asset;
 if(pathname.startsWith("/img/")){const id=pathname.slice(5).replace(/\.jpg$/,"");return cached(request,validId(id)?"img/"+id:null,86400,()=>cover(id,fetchSteam),ctx)}
 if(pathname==="/api/prices")return cached(request,priceKey(searchParams),600,()=>prices(searchParams,fetchSteam),ctx);
 const isSearch=pathname==="/api/search";if(!isSearch&&pathname!=="/api/game")return json({code:"not_found"},404);
 const key=isSearch?(searchParams.get("q")||"").trim():searchParams.get("id")||"";
 if(isSearch?key.length<1||key.length>180:!validId(key))return json({code:"invalid"},400);
 return cached(request,(isSearch?"search/"+key.toLowerCase():"game/"+key),isSearch?600:900,()=>steamLookup(isSearch,key,fetchSteam),ctx);
}

async function steamLookup(isSearch,key,fetchSteam){
 const url=new URL(isSearch?"/api/storesearch/":"/api/appdetails/",steam);url.searchParams.set(isSearch?"term":"appids",key);url.searchParams.set("l","english");url.searchParams.set("cc","uz");
 try{
  const res=await fetchSteam(url.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
  if(!res.ok)return json({code:"steam_unavailable"},503);
  const payload=await res.json();
  if(isSearch){if(!Array.isArray(payload.items))return json({code:"steam_unavailable"},503);const items=payload.items.filter(x=>Number.isInteger(+x.id)&&x.name).slice(0,14).map(x=>({id:+x.id,name:x.name}));return json({items})}
  const record=payload[key];if(!record?.success||!record.data)return json({code:"not_found"},404);
  const game=record.data;if(!["game","demo"].includes(game.type))return json({code:"not_game"},422);
  return json({...Object.fromEntries(["steam_appid","name","pc_requirements","mac_requirements","linux_requirements","genres","platforms","header_image","release_date"].map(field=>[field,game[field]])),...pickMedia(game)});
 }catch{return json({code:"steam_unavailable"},503)}
}
