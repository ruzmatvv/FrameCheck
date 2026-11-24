import {ru} from "./data.mjs";
import {cpuClass, gpuClass, splitModels} from "./compat.mjs";
import {osFamily, vivobookProfile} from "./profile.mjs";
import {language, memorySize, tr} from "./i18n.mjs";

const fpsBands = [[3,12],[6,18],[10,25],[15,35],[22,45],[30,60],[40,80],[55,105],[70,135]];
const notebookTests = {
 570:[110.1,"1280 × 720","Minimal"], 1086940:[16,"1920 × 1080","Past"],
 1091500:[18.7,"1920 × 1080","Past, FSR o‘chiq"], 552520:[45,"1280 × 720","Past"]
};
const notebookSource="https://www.notebookcheck.com/Intel-Core-7-150U-Leistungsdebuet-Lenovo-IdeaPad-Slim-5-16IRU9-Laptop-Test.870389.0.html";
function minimumGpu(spec,ram,gpuClass,splitModels) {
 const ranks=splitModels(spec).map(model=>gpuClass(model)).filter(Number.isFinite);
 if(ranks.length)return Math.min(...ranks);
 if(/ray tracing|mesh shader|hardware RT/i.test(spec))return 8;
 if(/directx\s*9|shader model\s*[23]|256\s*mb|512\s*mb/i.test(spec))return 1;
 if(/integrated|intel\s*(?:hd|4xxx)|integratsiya/i.test(spec))return 2;
 // A RAM-only requirement is weaker evidence. The output notes this fallback.
 return ram>=16?7:ram>=8?5:ram>=4?3:2;
}
export function fillFrameRate(result,raw,device,{gpuClass,cpuClass,splitModels}) {
 if(!result)return result;
 if(result.referenceFps){
  result.fpsLabel=result.referencePreset?"GPU sinovi":"Vivobook sinovi";
  if(result.referencePreset){result.preset=result.referencePreset;result.resolution=result.referenceResolution}
  return result;
 }
 if(Array.isArray(result.fps)){result.fpsLabel="Taxminiy";return result}
 const family=osFamily(device.os);
 const gpuRank=gpuClass(device.gpu||"",device);
 const fallback=family!=="windows"||!device.cpu||!gpuRank||!device.ram||raw.platforms?.windows===false;
 const p=fallback?vivobookProfile:device;
 const reference=fallback?("ASUS Vivobook · Core 7 150U, Intel Graphics, "+memorySize(8)):(p.name||tr("Qurilmang"));
 const baseline=/\b150u\b/i.test(p.cpu)&&/intel.*graphics/i.test(p.gpu)&&!/\barc\b/i.test(p.gpu);
 const caption=fallback?"Vivobook uchun taxmin":"Taxminiy";
 function finish(values,basis){
  return {...result,...values,fpsLabel:values.fpsLabel||caption,fpsBasis:reference+". "+tr(basis)};
 }
 if(baseline&&p.ram===8&&(raw.observedFps||Array.isArray(raw.fps))){
  return finish({fps:raw.fps,referenceFps:raw.observedFps||null,fpsLabel:raw.observedFps?"Vivobook sinovi":caption,preset:raw.preset,resolution:raw.resolution,perfSource:raw.perfSource},raw.basis||"Vivobook katalogidagi baho.");
 }
 const test=baseline && notebookTests[raw.id];
 if(test){
  const [measured,resolution,preset]=test;
  const constrained=p.ram<16||p.modules===1;
  const lo=Math.max(1,Math.floor(measured*(constrained ? .45 : .75)));
  const hi=Math.ceil(measured*(constrained ? .9 : 1.2));
  return finish({fps:[lo,hi],resolution,preset,perfSource:notebookSource},
   tr("Lenovo IdeaPad Slim 5 (Core 7 150U, 16 GB ikki kanalli RAM) shu sozlamada {0} FPS ko‘rsatgan. Oraliq xotira va noutbuk quvvati farqini hisobga olgan taxmin.",measured));
 }
 const min=raw.min||{};
 if(!min.gpu&&!min.cpu&&!min.ram)return finish({fpsLabel:"Sinov kutilmoqda"},"Steam ushbu o‘yin uchun talablarni bermagan.");
 const required=minimumGpu(min.gpu||"",min.ram,gpuClass,splitModels);
 const have=fallback?4:gpuRank;
 const index=Math.max(0,Math.min(fpsBands.length-1,have-required+4));
 const [low,high]=fpsBands[index];
 const needCpu=splitModels(min.cpu).map(cpuClass).filter(Number.isFinite),actualCpu=cpuClass(p.cpu);
 const deficit=needCpu.length&&actualCpu?Math.max(0,Math.min(...needCpu)-actualCpu):0;
 const cpuFactor=Math.max(.45,1-.14*deficit);
 const ramFactor=min.ram&&p.ram<min.ram?Math.max(.35,p.ram/min.ram):1;
 const fps=[Math.max(1,Math.round(low*cpuFactor*ramFactor)),Math.max(3,Math.round(high*cpuFactor*Math.sqrt(ramFactor)))];
 const launchWarning=ramFactor<1||required-have>=3?" "+tr("Minimal talabdan past qurilmada o‘yin ochilmasligi mumkin. Oraliq faqat ishga tushgan holat uchun."):"";
 return finish({fps,preset:"Past",resolution:"1280 × 720"},
  tr("720p past sozlamada CPU, GPU va RAM talablari bo‘yicha qo‘pol hisob. Bu o‘yinda o‘lchangan natija emas.")+launchWarning);
}


function steamPriceURL(ids,lang="uz") {
 const input = {ids:ids.map(appid=>({appid})),context:{language:lang==="ru"?"russian":"english",country_code:"UZ"},data_request:{include_all_purchase_options:true,include_release:true}};
 const url = new URL("https://api.steampowered.com/IStoreBrowseService/GetItems/v1/");
 url.searchParams.set("input_json",JSON.stringify(input));
 return url;
}
function steamOffer(item) {
 if (item.success !== 1 || item.visible === false) return {type:"unavailable"};
 if (item.is_free_temporarily) return {type:"temporaryFree"};
 if (item.is_free) return {type:"free"};
 const options = item.purchase_options || [];
 const offer = item.best_purchase_option || options.find(p => p.package_group === "default" && p.formatted_final_price && !p.is_recurring_subscription);
 if (offer?.formatted_final_price && offer.final_price_in_cents != null) {
  const savings = !offer.hide_discount_pct_for_compliance && !offer.price_cannot_be_displayed_as_discount && offer.discount_pct > 0;
  const endDates=(offer.active_discounts||[]).map(x=>Number(x.discount_end_date)).filter(n=>n>0);
  return {type:Number(offer.final_price_in_cents)===0?"temporaryFree":"paid",price:offer.formatted_final_price,original:savings?offer.formatted_original_price:"",discount:savings?offer.discount_pct:0,
   until:savings && endDates.length?Math.min(...endDates):null,
   edition:offer.purchase_option_name||item.name, packageId:offer.packageid||null};
 }
 if(item.release?.is_coming_soon)return {type:"upcoming"};
 return {type:"nooffer"};
}
export function steamPriceBatch(payload, checkedAt) {
 const items=payload?.response?.store_items;
 if(!Array.isArray(items))throw Error("Steam javobi olinmadi");
 return Object.fromEntries(items.filter(item=>Number.isInteger(item.appid||item.id)).map(item=>[item.appid||item.id,{...steamOffer(item),checkedAt}]));
}


// Broad hardware classes are used for minimum-requirement comparisons only.
