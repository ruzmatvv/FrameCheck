import {handleAccount} from "./auth.mjs";
import "./recovery.mjs";
import "./fps.mjs";
import "./admin.mjs";
const steam="https://store.steampowered.com";
const COVER_HOSTS=["https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/","https://cdn.cloudflare.steamstatic.com/steam/apps/","https://cdn.akamai.steamstatic.com/steam/apps/"];
const security={"X-Content-Type-Options":"nosniff"};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",...security,...extra}});
const validId=value=>/^\d{1,10}$/.test(value);

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
  return json({response:{store_items:payload.response.store_items},checkedAt:Date.now()},200,{"Cache-Control":"public, max-age=120"});
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

export async function handle(request,home,fetchSteam=fetch,env={},assets={}){
 const {pathname,searchParams}=new URL(request.url);
 const account=await handleAccount(request,env);if(account)return account;
 if(request.method!=="GET"&&request.method!=="HEAD")return json({code:"method"},405);
 if(pathname==="/"||pathname==="/index.html")return new Response(request.method==="HEAD"?null:home,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache","Referrer-Policy":"strict-origin-when-cross-origin",...security}});
 if(pathname==="/favicon.ico")return new Response(null,{status:204});
 const asset=installAsset(pathname,assets);if(asset)return request.method==="HEAD"?new Response(null,{status:asset.status,headers:asset.headers}):asset;
 if(pathname.startsWith("/img/"))return cover(pathname.slice(5).replace(/\.jpg$/,""),fetchSteam);
 if(pathname==="/api/prices")return prices(searchParams,fetchSteam);
 const isSearch=pathname==="/api/search";if(!isSearch&&pathname!=="/api/game")return json({code:"not_found"},404);
 const key=isSearch?(searchParams.get("q")||"").trim():searchParams.get("id")||"";
 if(isSearch?key.length<1||key.length>180:!validId(key))return json({code:"invalid"},400);
 const url=new URL(isSearch?"/api/storesearch/":"/api/appdetails/",steam);url.searchParams.set(isSearch?"term":"appids",key);url.searchParams.set("l","english");url.searchParams.set("cc","uz");
 try{
  const res=await fetchSteam(url.toString(),{headers:{Accept:"application/json"},signal:AbortSignal.timeout(9000)});
  if(!res.ok)return json({code:"steam_unavailable"},503);
  const payload=await res.json();
  if(isSearch){if(!Array.isArray(payload.items))return json({code:"steam_unavailable"},503);const items=payload.items.filter(x=>Number.isInteger(+x.id)&&x.name).slice(0,14).map(x=>({id:+x.id,name:x.name}));return json({items})}
  const record=payload[key];if(!record?.success||!record.data)return json({code:"not_found"},404);
  const game=record.data;if(!["game","demo"].includes(game.type))return json({code:"not_game"},422);
  return json(Object.fromEntries(["steam_appid","name","pc_requirements","mac_requirements","linux_requirements","genres","platforms","header_image","release_date"].map(field=>[field,game[field]])));
 }catch{return json({code:"steam_unavailable"},503)}
}
