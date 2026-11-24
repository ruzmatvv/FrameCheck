import {fillFrameRate} from "./frames.mjs";
import {baselineMatch, osFamily} from "./profile.mjs";
import {memorySize, tr} from "./i18n.mjs";

const graphicsClasses=[
 [10,/\b(?:rtx\s*(?:4090|5090|5080)|rx\s*(?:7900\s*xtx|9070\s*xt))\b/i],
 [9,/\b(?:rtx\s*(?:3090|3080|4070|4080|5070)|rx\s*(?:6800|6900|6950|7800|7900|9070))\b/i],
 [8,/\b(?:rtx\s*(?:2070|2080|3060|3070|4060|5060)|rx\s*(?:5700|6600|6650|6700|6750|7600|7700|9060)|arc\s*(?:a7[57]0|b5[78]0))\b/i],
 [7,/\b(?:rtx\s*(?:2060|3050|4050|5050)|gtx\s*(?:1070|1080|1660)|rx\s*(?:5600|6500)|(?:radeon\s*)?vega\s*(?:56|64))\b/i],
 [6,/\b(?:gtx\s*(?:970|980|1060|1650)|rx\s*(?:470|480|570|580|590|5500m?|6400)|arc\s*a380|radeon\s*890m)\b/i],
 [5,/\b(?:gtx\s*(?:760|770|780|950|960|1050)|rx\s*(?:460|560)|r9\s*(?:280x?|285|380x?)|radeon\s*(?:680m|780m)|hd\s*79[57]0)\b/i],
 [4,/\b(?:gtx\s*(?:5[678]0|6[56]0|750)|gt\s*1030|rx\s*550|r[79]\s*(?:260x?|270x?)|hd\s*(?:7750|7770|7850|7870)|radeon\s*760m|iris\s*xe)\b/i],
 [3,/\b(?:gt\s*(?:730|740)|(?:hd|uhd)(?:\s+graphics)?\s*(?:520|530|550|610|620|630|710|730|750|770|5000|5200)|radeon\s*vega\s*(?:[678]|11))\b/i],
 [2,/\b(?:hd(?:\s+graphics)?\s*(?:[234]\d{3})|gt\s*(?:430|440|530|630)|radeon\s*hd\s*(?:4870|6450|6570)|9800\s*gt)\b/i],
 [1,/\b(?:geforce\s*(?:6800|7600|8800)|radeon\s*x\d{3,4})\b/i]
];
export function gpuClass(model,profile){
 if(/intel.*graphics/i.test(model)&&/\b150u\b/i.test(profile?.cpu||"")&&!/\barc\b/i.test(model))return 4;
 return graphicsClasses.find(([,rx])=>rx.test(model))?.[0]??null;
}
export function cpuClass(s){
 const t=String(s||"").replace(/\(r\)|\(tm\)/gi,"");
 if(/ryzen\s*(?:ai|[3579])\b.*\b(?:[789]\d{3}|[34]\d\d)\b/i.test(t))return 7;
 if(/core\s+(?:ultra\s+)?[3579](?:\s+processor)?\s+\d{3}[a-z]*/i.test(t))return /\b150u\b/i.test(t)?5:6;
 const intel=t.match(/\bi([3579])[\s-]+(\d{3,5})([a-z]{0,3})/i);
 if(intel){const tier=+intel[1],model=intel[2],gen=model.length===3?1:model.length===5?+model.slice(0,2):+model[0];
  let v=gen>=12?7:gen>=10?6:gen>=8?5:gen>=6?4:gen>=3?3:2;
  if(tier===3)v-=1;if(tier>=7&&gen>=4)v+=1;if(/u|y/i.test(intel[3])&&gen<=10)v-=1;return Math.max(1,v)}
 const amd=t.match(/ryzen\s*([3579])\s+(?:pro\s+)?(\d{4})/i);
 if(amd){const first=+amd[2][0];return Math.max(2,(first>=5?6:first>=3?5:3)+(+amd[1]>=7?1:0))}
 if(/ryzen z1 extreme/i.test(t))return 6;
 if(/fx[-\s]*[68]\d{3}|phenom ii x[46]|core 2 quad/i.test(t))return 2;
 if(/core\s*2|athlon\s*(?:64|x2)|pentium\s*[4d]\b|phenom\s*\d{4}/i.test(t))return 1;
 return null;
}
export const splitModels=s=>String(s||"").split(/\s*(?:\/|\||;|,|\bor\b|\byoki\b)\s*/i).filter(Boolean);
function modelKey(s){return String(s||"").toLowerCase().replace(/\(r\)|\(tm\)|nvidia|intel|amd|geforce|radeon|processor|cpu|graphics|@.*/g,"").replace(/[^a-z0-9]/g,"")}
function compareModel(actual,required,type,p){
 if(!actual||!required)return "na";
 const apple=s=>String(s).match(/(?:apple\s+)?\bM([1-9])\b(?:\s+(Pro|Max|Ultra))?/i);
 const ap=apple(actual),rp=apple(required);
 if(ap&&rp){const grade=m=>({pro:1,max:2,ultra:3}[String(m[2]).toLowerCase()]||0);
  if(+ap[1]===+rp[1])return grade(ap)===grade(rp)?"edge":grade(ap)>grade(rp)?"ok":"low";
  if(grade(ap)>=grade(rp)&&+ap[1]>+rp[1])return "ok";
  if(grade(ap)<=grade(rp)&&+ap[1]<+rp[1])return "low";
  return "na";
 }
 const getClass=type==="gpu"?gpuClass:cpuClass,have=getClass(actual,p);
 const key=modelKey(actual),alternatives=splitModels(required);
 if(key.length>=4&&alternatives.some(s=>{const k=modelKey(s);return k.length>=4&&key===k}))return "edge";
 if(have==null)return "na";
 const ranks=alternatives.map(s=>getClass(s)||(/integrated|integratsiyalashgan/i.test(s)&&type==="gpu"?(/vulkan|directx\s*12/i.test(s)?3:1):null));
 if(!ranks.some(Boolean)){
  if(type==="cpu"&&/sse2|x86|dual[- ]core|\b[12](?:\.\d)?\s*ghz|core\s+i3\b/i.test(required)&&have>=3)return "ok";
  return "na";
 }
 const req=Math.min(...ranks.filter(Boolean));
 if(have<req)return "low";
 return have===req?"near":"ok";
}
function winNumber(s){if(!s)return null;const nums=[...s.matchAll(/(?:\bwindows\s*|\bwin\s*|\/\s*)(11|10|8(?:\.1)?|7|vista|xp)\b/gi)].map(m=>({xp:5,vista:6}[m[1].toLowerCase()]||Number(m[1])));return nums.length?Math.min(...nums):null}
function versionParts(s){return String(s||"").match(/\b(\d{1,2})(?:\.(\d{1,2}))?(?:\.(\d{1,2}))?\b/)?.slice(1).map(v=>Number(v||0))||null}
function versionStatus(have,minimum){if(!have||!minimum)return "na";for(let i=0;i<3;i++){if(have[i]!==minimum[i])return have[i]>minimum[i]?"ok":"low"}return "ok"}
function osStatus(p,g,family){
 if(!family)return "na";
 if(["ios","android","chrome"].includes(family))return "low";
 if(g.platforms?.[family]===false||family==="windows"&&g.windows===false)return "low";
 if(family!=="windows"){
  if(g.platforms?.[family]!==true||!g.min.os)return "na";
  if(family==="mac")return versionStatus(versionParts(p.os),versionParts(g.min.os));
  if(/^linux(?:\s+64[- ]?bit)?$/i.test(g.min.os.trim()))return "ok";
  const distro=/\b(ubuntu|debian|steamos|fedora)\b/i,required=g.min.os.match(distro)?.[1];
  return required&&p.os.toLowerCase().includes(required.toLowerCase())?versionStatus(versionParts(p.os),versionParts(g.min.os)):"na";
 }
 if(!g.min.os)return "na";
 const needed=winNumber(g.min.os),have=winNumber(p.os);if(needed==null||have==null)return "na";
 const build=g.min.os.match(/(?:build\s*|\()(\d{5})/i);if(build&&have===needed){const actual=p.os.match(/(?:build\s*|\()(\d{5})/i);if(!actual)return "na";if(+actual[1]<+build[1])return "low";}
 return have>=needed?"ok":"low";
}
function benchGpu(s,kind){
 const m=String(s||"").toLowerCase().match(/\b((?:gtx|rtx|rx|arc\s+a)\s*\d{3,4}\s*(?:ti\s+super|ti|super|xtx|xt|m\b)?|radeon\s+(?:680|780|890)m)\b/i);
 if(!m)return "";
 const mobile=/laptop|mobile|max[- ]q|notebook/i.test(s)||kind==="laptop";
 const fixed=/desktop/i.test(s)||kind==="desktop";
 const integrated=/radeon\s+(?:680|780|890)m|rx\s+\d+m/i.test(s);
 return m[1].replace(/\s+/g,"")+(integrated?"":mobile?":laptop":fixed?":desktop":":unspecified");
}
export const baseNotes={play:"Talablar qurilmaga mos. Standart sozlamada boshlab, o‘yinning ichki sinovida tekshir.",adjust:"Past grafik sozlamasidan boshla. Sotib olishdan oldin demo bo‘lsa, uni sinab ko‘r.",avoid:"Bir yoki bir nechta minimal talab bajarilmadi. Shu qurilma uchun xaridni tavsiya etmaymiz.",unknown:"Xarid qilishdan oldin jadvaldagi noma’lum bandlarni tekshir."};
export function evaluateGame(raw,p,benches=[]){
 const result=evaluateCompatibility(raw,p,benches);
 return fillFrameRate(result,raw,p,{gpuClass,cpuClass,splitModels});
}
function evaluateCompatibility(raw,p,benches){
 if(!raw)return null;
 const fam=osFamily(p.os),other=["mac","linux"].includes(fam);
 const g={...raw,min:other?(raw.nativeMin?.[fam]||{}):raw.min||{}};
 const r={cpu:compareModel(p.cpu,g.min.cpu,"cpu",p),gpu:compareModel(p.gpu,g.min.gpu,"gpu",p),ram:!p.ram||g.min.ram==null?"na":p.ram<g.min.ram?"low":p.ram===g.min.ram?"edge":"ok",os:osStatus(p,g,fam)};
 const personal=baselineMatch(p)&&g.curated!==false;
 if(personal){const gr={1815780:"ok",1222680:"low",2824660:"ok",1551360:"low",227300:"ok",2707900:"low",690790:"near",2737300:"ok",271590:"ok",635260:"low",3241660:"low",2379780:"ok",813230:"ok",1643320:"low",244210:"ok"}[g.id];if(gr)r.gpu=gr;r.cpu="ok"}
 let verdict=Object.values(r).includes("low")?"avoid":Object.values(r).includes("na")?"unknown":Object.values(r).some(x=>["edge","near"].includes(x))?"adjust":"play";
 if(personal&&r.os==="ok"&&r.ram!=="low")verdict=g.verdict||verdict;
 const custom={...g,ratings:r,verdict,observedFps:null,fps:null,referenceFps:null,perfSource:null,note:baseNotes[verdict],preset:verdict==="play"?"Standartdan boshla":verdict==="adjust"?"Pastdan boshla":"Aniqlanmagan",resolution:["play","adjust"].includes(verdict)?"1280 × 720":"—",basis:"Baho minimal talablar va qurilma profiliga asoslangan. CPU va GPU modellari taxminiy unumdorlik sinflari bo‘yicha solishtiriladi."};
 if(verdict==="avoid"){
  if(r.ram==="low")custom.note=tr("O‘yin kamida {0} GB RAM talab qiladi. Qurilmada {1} GB bor. Bu qurilma uchun xaridni tavsiya etmaymiz.",g.min.ram,p.ram);
  else if(r.gpu==="low")custom.note=tr("Videokartang {0} uchun ko‘rsatilgan minimal grafik talabdan past. Sotib olishdan oldin shu GPU bilan o‘tkazilgan o‘yin sinovini tekshir.",g.name);
  else if(r.cpu==="low")custom.note=tr("Protsessor minimal talabdan past. {0} uchun barqaror kadr tezligini kutishga asos yetarli emas.",g.name);
 }else if(verdict==="adjust"&&r.ram==="edge"){
  custom.note=tr("Qurilmadagi {0} GB RAM o‘yinning minimal hajmiga teng. Ortiqcha ilovalarni yopib, past sozlamada sinab ko‘r.",p.ram);
 }else if(verdict==="unknown"){
  const names={cpu:"protsessor",gpu:"videokarta",ram:"RAM hajmi",os:"tizim"};
  const unresolved=Object.keys(r).filter(k=>r[k]==="na").map(k=>names[k]);
  if(unresolved.length)custom.note=tr("Xarid qilishdan oldin aniqlashtirilishi kerak bo‘lgan bandlar — {0}. Qurilma ma’lumotini to‘ldir yoki Steam talablarini qayta tekshir.",unresolved.map(k=>tr(k)).join(", "));
 }
 if(["ios","android","chrome"].includes(fam)){
  return {...custom,ratings:{cpu:"na",gpu:"na",ram:"na",os:"low"},note:tr("Bu Steam’dagi kompyuter versiyasi. Uni {0} qurilmasiga bevosita o‘rnatib bo‘lmaydi.",p.os),basis:"Baho Steam versiyasini qurilmada bevosita ishga tushirishga tegishli."};
 }
 if(other){custom.basis="Qurilma uchun o‘z platformasining Steam talablari ishlatiladi. Talablar yetishmasa qayta tekshiring.";if(g.platforms?.[fam]===false)custom.note="Steam bu o‘yinning tizimingizga mos mahalliy versiyasini ko‘rsatmagan."}
 if(personal&&r.os==="ok"){
  custom.fps=g.fps;custom.preset=g.preset;custom.resolution=g.resolution;custom.perfSource=g.perfSource;
  if(g.observedFps){custom.referenceFps=g.observedFps;custom.basis=tr("Shu xususiyatli ASUS Vivobook’da foydalanuvchi {0} FPS kuzatgan. Ekran o‘lchami va grafik sifati qayd etilmagan.",g.observedFps)}
  else custom.basis=g.basis||custom.basis;
  if(p.reference)custom.note=g.note;
 }else if(!other&&fam==="windows"&&r.os!=="low"&&r.ram!=="low"&&r.cpu!=="low"){
  const key=benchGpu(p.gpu,p.kind);const ref=key&&benches.find(b=>b.id===g.id&&benchGpu(b.gpu)===key);
  if(ref){custom.referenceFps=String(ref.fps);custom.perfSource=ref.url;custom.referencePreset=ref.preset;custom.referenceResolution=ref.resolution;
   custom.basis=tr("{0} bilan sinovda {1} FPS o‘lchangan ({2}, {3}). Sinov protsessori: {4}{5}. Qurilmangizdagi natija quvvat limiti, CPU va RAM’ga bog‘liq.",ref.gpu,ref.fps,ref.resolution,tr(ref.preset),ref.cpu||tr("ko‘rsatilmagan"),ref.ram?", RAM: "+memorySize(ref.ram):"");
   if(verdict==="play"&&p.ram>=Math.max(16,g.min.ram||0)){custom.preset=ref.preset;custom.resolution=ref.resolution}
  }
 }
 return custom;
}

