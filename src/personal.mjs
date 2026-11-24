// Shaxsiy qurilma sozlamalari. Bu fayl faqat ASUS Vivobook (Intel Core 7 150U, 8 GB)
// uchun qo'lda yozilgan ma'lumotlarni saqlaydi. Boshqa qurilma egalari uchun
// `personalEnabled` ni false qiling: u holda shaxsiy baholash va tugma o'chadi.
import {osFamily} from "./profile.mjs";

export const personalEnabled = true;

export const vivobookProfile = {name:"ASUS Vivobook",cpu:"Intel Core 7 150U",gpu:"Intel Graphics",ram:8,os:"Windows 11 Pro",modules:1};

// O'yin ID -> GPU bahosi ("ok" | "near" | "low"), faqat shu qurilma uchun.
const personalGpuGrades = {1815780:"ok",1222680:"low",2824660:"ok",1551360:"low",227300:"ok",2707900:"low",690790:"near",2737300:"ok",271590:"ok",635260:"low",3241660:"low",2379780:"ok",813230:"ok",1643320:"low",244210:"ok"};

export function personalGpuGrade(id){return personalEnabled?personalGpuGrades[id]??null:null}

// Qurilma shu Vivobook konfiguratsiyasiga mosmi.
export function baselineMatch(p){
 return personalEnabled&&osFamily(p.os)==="windows"&&/core.*\b150u\b/i.test(p.cpu)&&/intel/i.test(p.gpu)&&/graphics/i.test(p.gpu)&&!/arc|uhd\s*\d/i.test(p.gpu)&&p.ram===8&&(p.modules===1||p.reference===true);
}
