// Screen size and graphics quality chosen by the user. The FPS numbers on the site belong to a certain setting
// (for example 720p low); this file converts them to the chosen setting. It is a rule of thumb, not a measurement,
// and every converted result says so.
import {tr} from "./i18n.mjs";
import {baseNotes} from "./compat.mjs";

export const RESOLUTION_CHOICES = [
  {id: "720p", height: 720, label: "1280 × 720", name: "HD"},
  {id: "1080p", height: 1080, label: "1920 × 1080", name: "Full HD"},
  {id: "1440p", height: 1440, label: "2560 × 1440", name: "Quad HD"},
  {id: "2160p", height: 2160, label: "3840 × 2160", name: "Ultra HD"},
];
// factor: how much of the "low" frame rate is left at this quality
export const PRESET_CHOICES = [
  {id: "low", label: "Past", factor: 1},
  {id: "medium", label: "O‘rtacha", factor: 0.78},
  {id: "high", label: "Yuqori", factor: 0.6},
  {id: "ultra", label: "Ultra", factor: 0.47},
];
export const SETTINGS_KEY = "framecheck.settings.v1";
export const defaultSettings = () => ({resolution: "auto", preset: "auto"});

export function cleanSettings(value) {
  const out = defaultSettings();
  if (value && typeof value === "object") {
    if (RESOLUTION_CHOICES.some(r => r.id === value.resolution)) out.resolution = value.resolution;
    if (PRESET_CHOICES.some(p => p.id === value.preset)) out.preset = value.preset;
  }
  return out;
}

// "1920 × 1080" -> 1080
export function parseHeight(text) {
  const m = String(text || "").match(/(\d{3,4})\s*[×x]\s*(\d{3,4})/i);
  return m ? Math.min(Number(m[1]), Number(m[2])) : null;
}
// "Yuqori (130 W TGP)" -> "high". Texts that only advise ("Pastdan boshla") are fine: they carry no numbers to convert.
export function parsePreset(text) {
  const t = String(text || "").toLowerCase();
  if (/ultra|ekstremal|maks|max/.test(t)) return "ultra";
  if (/yuqori|high/.test(t)) return "high";
  if (/o.rtacha|standart|normal|medium|good/.test(t)) return "medium";
  if (/past|low|minimal/.test(t)) return "low";
  return null;
}

// Frame rate scales roughly with pixel count^-0.8. Going to lighter settings gains less than the maths says,
// because the processor starts to limit, so gains are damped.
export function scaleFactor(from, to) {
  const byHeight = h => Math.pow(h / 720, -1.6);
  const byPreset = id => PRESET_CHOICES.find(p => p.id === id).factor;
  const f = (byHeight(to.height) / byHeight(from.height)) * (byPreset(to.preset) / byPreset(from.preset));
  return f > 1 ? 1 + (f - 1) * 0.6 : f;
}

const labelOf = (height, preset) => (RESOLUTION_CHOICES.find(r => r.height === height)?.label || height + "p") + ", " + tr(PRESET_CHOICES.find(p => p.id === preset).label);

export function applySettings(game, settings = defaultSettings()) {
  if (!game || (settings.resolution === "auto" && settings.preset === "auto")) return game;
  const key = game.referenceFps ? "referenceFps" : game.observedFps ? "observedFps" : Array.isArray(game.fps) ? "fps" : null;
  if (!key) return game;
  const text = key === "fps" ? game.fps.join("–") : String(game[key]);
  if (!/\d/.test(text)) return game;
  const from = {height: parseHeight(game.resolution), preset: parsePreset(game.preset)};
  if (from.height == null || from.preset == null) {
    return {...game, basis: [game.basis, tr("Sinov sozlamasi noma’lum, shuning uchun FPS tanlangan sozlamaga moslanmadi.")].filter(Boolean).join(" ")};
  }
  const wantRes = RESOLUTION_CHOICES.find(r => r.id === settings.resolution), wantPreset = PRESET_CHOICES.find(p => p.id === settings.preset);
  const to = {height: wantRes ? wantRes.height : from.height, preset: wantPreset ? wantPreset.id : from.preset};
  const factor = scaleFactor(from, to);
  if (Math.abs(factor - 1) < 0.005) return game;
  const scaled = text.replace(/\d+(?:\.\d+)?/g, n => String(Math.max(1, Math.round(Number(n) * factor))));
  const out = {...game, fpsLabel: "Taxminiy", preset: wantPreset ? wantPreset.label : game.preset, resolution: wantRes ? wantRes.label : game.resolution};
  if (key === "fps") out.fps = scaled.split("–").map(Number); else out[key] = scaled;
  out.basis = [game.basis, tr("FPS qiymati {0} sozlamasidan {1} sozlamasiga qo‘pol hisoblab o‘zgartirildi. Bu o‘lchov emas, taxmin.", labelOf(from.height, from.preset), labelOf(to.height, to.preset))].filter(Boolean).join(" ");
  // A game that looked fine at its test setting may no longer reach a playable rate at the chosen one.
  const best = Math.max(...(scaled.match(/\d+/g) || [0]).map(Number));
  if (best < 30 && game.verdict === "play") { out.verdict = "adjust"; out.note = baseNotes.adjust; }
  return out;
}
