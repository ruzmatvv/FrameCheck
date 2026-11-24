const steam="https://store.steampowered.com";
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
export async function handle(request,home,fetchSteam=fetch){
 const {pathname,searchParams}=new URL(request.url);
 if(request.method!=="GET"&&request.method!=="HEAD")return json({code:"method"},405);
 if(pathname==="/"||pathname==="/index.html")return new Response(request.method==="HEAD"?null:home,{headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-cache","X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin"}});
 if(pathname==="/favicon.ico")return new Response(null,{status:204});
 const isSearch=pathname==="/api/search";if(!isSearch&&pathname!=="/api/game")return json({code:"not_found"},404);
 const key=isSearch?(searchParams.get("q")||"").trim():searchParams.get("id")||"";
 if(isSearch?key.length<1||key.length>180:!/^\d{1,10}$/.test(key))return json({code:"invalid"},400);
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
