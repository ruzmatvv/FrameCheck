import {ru, en} from "./data.mjs";
import {titles} from "./core.mjs";
import {routeLanguage} from "./routes.mjs";

const languageKey = "framecheck.language";
export let language = "uz";
const languages = ["uz", "ru", "en"];
const pathLanguage = routeLanguage;
try {
 // the address wins (a shared link keeps its language), then the saved choice
 const fromPath = typeof location !== "undefined" ? pathLanguage(location.pathname) : null;
 const saved = typeof window !== "undefined" ? window.localStorage?.getItem(languageKey) : null;
 // nothing chosen yet: follow the browser's own language (Uzbek, Russian; everybody else gets English). Search engines have no choice and
 // no browser language, so they see the Uzbek page at "/" and the other languages at /ru/ and /en/.
 const browser = typeof window !== "undefined" ? String(navigator.languages?.[0] || navigator.language || "").toLowerCase() : "";
 const detected = !browser ? null : browser.startsWith("uz") ? "uz" : browser.startsWith("ru") ? "ru" : "en";
 const pick = fromPath || saved || detected;
 if (languages.includes(pick)) language = pick;
} catch {}
const dictionary = () => language === "ru" ? ru : language === "en" ? en : null;

export function locale() { return language === "ru" ? "ru-RU" : language === "en" ? "en-US" : "uz-UZ"; }
export function tr(message, ...values) {
 const dict = dictionary(), text = dict && Object.hasOwn(dict, message) ? dict[message] : message;
 return values.length ? text.replace(/\{(\d+)\}/g, (_, index) => String(values[index])) : text;
}
export function gameCount(n) {
 if (language === "uz") return n + " ta o‘yin";
 if (language === "en") return n + (n === 1 ? " game" : " games");
 const word = {one:"игра", few:"игры", many:"игр", other:"игры"};
 return n + " " + word[new Intl.PluralRules("ru").select(n)];
}
export function genreLabel(value) { return tr(value === "Survival" ? "Omon qolish" : value); }
export function memorySize(value) { return value + (language === "ru" ? " ГБ" : " GB"); }

// Bind only the original fixed markup. Device names, game titles and user input are rendered separately.
export function bindStaticLanguage(root) {
 const updates = [];
 const bind = (value, write) => {
  const key = value.trim();
  if (Object.hasOwn(ru,key)) updates.push(() => write(value.replace(key, () => tr(key))));
 };
 const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
  acceptNode(node) { return ["SCRIPT","STYLE","NOSCRIPT"].includes(node.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT; }
 });
 while (walker.nextNode()) {
  const node = walker.currentNode;
  if (node.nodeType === Node.TEXT_NODE) bind(node.data, value => { node.data = value; });
  else for (const name of ["aria-label","placeholder","title","content"]) {
   if (node.hasAttribute(name)) bind(node.getAttribute(name), value => node.setAttribute(name,value));
  }
 }
 const apply = () => updates.forEach(write => write());
 apply();
 window.addEventListener("framecheck:language", apply);
}
export function initLanguage() {
 const menu = document.getElementById("site-language");
 function sync() { document.documentElement.lang = language; menu.value = language; }
 sync();
 bindStaticLanguage(document.documentElement);
 menu.addEventListener("change", () => {
  language = languages.includes(menu.value) ? menu.value : "uz";
  try { localStorage.setItem(languageKey, language); } catch {}
  sync();
  window.dispatchEvent(new Event("framecheck:language"));
 });
}

// Steam supplies many minimum specifications as English prose. Format the display
// copy only; compatibility comparisons continue to use the publisher's raw text.
const requirementPhrases = [
 ["Video card must be 1 GB or more and should be a DirectX 11-compatible with support for Shader Model 5.0","Kamida 1 GB videoxotira, DirectX 11 va Shader Model 5.0 qo‘llovi","Видеокарта с памятью от 1 ГБ и поддержкой DirectX 11 и Shader Model 5.0"],
 ["Intel HD 4600 or equivalent - This includes most GPUs scoring greater than 950 points in the 3DMark Fire Strike benchmark","Intel HD 4600 yoki tengi (3DMark Fire Strike sinovida 950 balldan yuqori olgan aksariyat videokartalar)","Intel HD 4600 или аналог (большинство видеокарт с результатом выше 950 баллов в 3DMark Fire Strike)"],
 ["AMD Zen 2 or Intel 10th Generation CPU @3.2Ghz with 8 cores / 16 threads or better (examples: AMD Ryzen 7 3700X or better, or Intel Core i7 10700K or better)","AMD Zen 2 yoki 10-avlod Intel, 3,2 GHz, 8 yadro / 16 oqim yoki kuchliroq (masalan, Ryzen 7 3700X yoki Core i7-10700K)","AMD Zen 2 или Intel 10-го поколения, от 3,2 ГГц, 8 ядер / 16 потоков (например, Ryzen 7 3700X или Core i7-10700K)"],
 ["NVIDIA or AMD hardware Raytracing-capable GPU with 8GB dedicated VRAM or better (examples: NVIDIA RTX 2060 SUPER or better, AMD RX 6600 or better)","Apparatli nur kuzatuvi va kamida 8 GB videoxotirali NVIDIA yoki AMD (masalan, RTX 2060 SUPER yoki RX 6600)","Видеокарта NVIDIA или AMD с аппаратной трассировкой лучей и выделенной памятью от 8 ГБ (например, RTX 2060 SUPER или RX 6600)"],
 ["Dual core from Intel or AMD at 2.8 GHz","2,8 GHz ikki yadroli Intel yoki AMD","Двухъядерный Intel или AMD с частотой 2,8 ГГц"],
 ["Quad-core Intel or AMD 2.5 GHz or superior","To‘rt yadroli Intel yoki AMD, 2,5 GHz yoki kuchliroq","Четырёхъядерный Intel или AMD, от 2,5 ГГц"],
 ["4 hardware CPU threads","4 ta apparat oqimi","4 аппаратных потока"],
 ["4 or more hardware threads","kamida 4 ta apparat oqimi","не менее 4 аппаратных потоков"],
 ["(32-bit not supported)","(32 bitli tizim mos emas)","(32-битная система не поддерживается)"],
 ["DirectX 11+ capable graphics card","DirectX 11 yoki yangirog‘ini qo‘llaydigan videokarta","Видеокарта с поддержкой DirectX 11 или новее"],
 ["Any DirectX 11 or 12 compatible card","DirectX 11 yoki 12 bilan mos videokarta","Любая видеокарта с поддержкой DirectX 11 или 12"],
 ["Discrete Non Mobile GPU with 1 GB Ram","1 GB videoxotirali diskret stol videokartasi","Дискретная видеокарта для настольного ПК с 1 ГБ памяти"],
 ["Dedicated 4 GB VRAM GPU","4 GB videoxotirali diskret videokarta","Дискретная видеокарта с 4 ГБ видеопамяти"],
 ["Dedicated graphics card","Diskret videokarta","Дискретная видеокарта"],
 ["SSE 4.2 support required","SSE 4.2 qo‘llovi kerak","требуется поддержка SSE 4.2"],
 ...["Vulkan 1.0","OpenGL 2.1","DirectX 12"].map(api=>[api+" qo‘llaydigan integratsiyalashgan grafika",api+" qo‘llaydigan ichki grafika","Встроенная графика с поддержкой "+api]),
 ["1st gen","1-avlod","1-го поколения"],["7th gen","7-avlod","7-го поколения"],["Eight-Core","sakkiz yadro","восемь ядер"],["req.","talab:","требуется"],["Legacy GPU","Avvalgi avlod GPU","Видеокарта предыдущего поколения"],
 ["qo‘llaydigan integratsiyalashgan grafika","qo‘llaydigan integratsiyalashgan grafika","совместимая встроенная графика"],
 ["Integratsiyalashgan GPU rasmiy qo‘llab-quvvatlanmaydi.","Ichki grafik protsessor rasman qo‘llanmaydi.","Встроенная графика официально не поддерживается."],
 ["ayrim Windows 7 versiyalari ham mos","ayrim Windows 7 versiyalari ham mos","подходят и некоторые версии Windows 7"],
 ["yoki DirectX 10.1 qo‘llaydigan tengi","yoki DirectX 10.1 qo‘llaydigan tengi","или аналог с поддержкой DirectX 10.1"],
 ["yoki DX11 mos tengi","yoki DX11 mos tengi","или аналог с поддержкой DX11"],
 ["yoki teng 6 yadroli CPU","yoki teng 6 yadroli protsessor","или аналогичный шестиядерный процессор"],
 ["AMD equivalent","AMD muqobili","аналог AMD"],["AMD ekvivalenti","AMD muqobili","аналог AMD"],["AMD tengi","AMD muqobili","аналог AMD"],["AMD muqobili","AMD muqobili","аналог AMD"],
 ["standart ekran uchun","standart ekran uchun","для обычного экрана"],["standart rejim","standart rejim","обычный режим"],
 ["alohida videoxotira","alohida videoxotira","выделенной видеопамяти"],["videoxotira","videoxotira","видеопамяти"],
 ["yoki tengi","yoki tengi","или аналог"],["yadroli protsessor","yadroli protsessor","ядра процессора"],["yadroli CPU","yadroli protsessor","ядра процессора"],
 ["latest Service Packs","so‘nggi yangilanishlar paketi","последние пакеты обновлений"],["latest Service Pack","so‘nggi yangilanishlar paketi","последний пакет обновлений"],["latest update","oxirgi yangilanish","последнее обновление"],
 ["with updates","yangilanishlar bilan","с обновлениями"],["with Service Pack 1","1-yangilanish paketi bilan","с пакетом обновления 1"],
 ["of video RAM","videoxotira","видеопамяти"],["video memory","videoxotira","видеопамяти"],["Dedicated Memory","alohida videoxotira","выделенной памяти"],["of VRAM","videoxotira","видеопамяти"],
 ["Dual Core Processor","ikki yadroli protsessor","двухъядерный процессор"],["Dual Core","ikki yadro","два ядра"],["Six-Core","olti yadro","шесть ядер"],["Operating System","tizim","ОС"],
 ["4th generation","4-avlod","4-го поколения"],["9th Gen CPU","9-avlod protsessori","процессор 9-го поколения"],
 ["or equivalent","yoki tengi","или аналог"],["or similar","yoki tengi","или аналог"],["or better","yoki kuchliroq","или мощнее"],["or higher","yoki yuqoriroq","или выше"],["or greater","yoki yuqoriroq","или выше"],["or later","yoki yangiroq","или новее"],["or newer","yoki yangiroq","или новее"],
 ["systems only","tizimlar","системы"],["versions only","versiyalar","версии"],["versions","versiyalar","версии"],["version","versiya","версия"],["only","faqat","только"],["required","talab qilinadi","обязательно"],
 ["graphics card","videokarta","видеокарта"],["newer","yangiroq","новее"],["later","yangiroq","новее"],["higher","yuqoriroq","выше"],["better","kuchliroq","мощнее"],["equivalent","tengi","аналог"],
 ["with","bilan","с"],["w/","bilan","с"],["and","va","и"],["or","yoki","или"],["yoki","yoki","или"],
 ["cores","yadro","ядра"],["threads","oqim","потоков"],["oqim","oqim","потока"],["yadroli","yadroli","ядра"],["yadro","yadro","ядра"],
 ["masalan","masalan","например"],["kamida","kamida","минимум"],["minimum","kamida","минимум"],["support","qo‘llovi","поддержка"],
 ["processor","protsessor","процессор"],["protsessor","protsessor","процессор"],["build","tuzilma","сборка"],["Series","seriyasi","серия"],
 ["GHz","GHz","ГГц"],["GB","GB","ГБ"],["MB","MB","МБ"]
];
const escaped = text => text.replace(/[.*+?^$}|()[\]\\]/g,"\\$&");
const phrases = new Map(requirementPhrases.map(row => [row[0].toLowerCase(),row]));
const phrasePattern = new RegExp("(?<![a-zа-яё])("+[...phrases.keys()].sort((a,b)=>b.length-a.length).map(escaped).join("|")+")(?![a-zа-яё])","gi");
// English is what Steam already writes, so only the phrases that our own Uzbek notes put into requirement text need an English copy.
const englishPhrases = {
 "qo‘llaydigan integratsiyalashgan grafika":"integrated graphics supporting it","Integratsiyalashgan GPU rasmiy qo‘llab-quvvatlanmaydi.":"Integrated GPUs are not officially supported.",
 "ayrim Windows 7 versiyalari ham mos":"some Windows 7 versions also work","yoki DirectX 10.1 qo‘llaydigan tengi":"or an equivalent with DirectX 10.1 support","yoki DX11 mos tengi":"or a DX11-compatible equivalent",
 "yoki teng 6 yadroli CPU":"or an equivalent 6-core CPU","AMD ekvivalenti":"AMD equivalent","AMD tengi":"AMD equivalent","AMD muqobili":"AMD equivalent","standart ekran uchun":"for a standard display","standart rejim":"standard mode",
 "alohida videoxotira":"dedicated video memory","videoxotira":"video memory","yoki tengi":"or equivalent","yadroli protsessor":"-core processor","yadroli CPU":"-core processor","yoki":"or","oqim":"threads","yadroli":"-core","yadro":"cores",
 "masalan":"for example","kamida":"at least","protsessor":"processor"
};
export function hardwareText(value) {
 const lang = locale(), column = lang==="ru-RU"?2:1;
 return String(value).replace(phrasePattern, key=>{
  const row = phrases.get(key.toLowerCase());
  if (lang !== "en-US") return row[column];
  if (Object.hasOwn(englishPhrases,row[0])) return englishPhrases[row[0]];
  return /^(Vulkan|OpenGL|DirectX) [\d.]+ qo‘llaydigan/.test(row[0]) ? "Integrated graphics with "+row[0].split(" qo‘llaydigan")[0]+" support" : key;
 })
  .replace(/(\d)\s+-core/g,"$1-core")
  .replace(/(\d)(ГБ|МБ|ГГц|GB|MB|GHz)/gi,"$1 $2")
  .replace(/(32|64)[- ]?bits?\b/gi,(_,bits)=>bits+(column===2?"-бит":" bit"));
}

