// "Qurilma bali": one number from 0 to 100 for a device, built only from what the site already knows:
// the video card class, the processor class and the amount of RAM. It is a rough ranking, not a benchmark,
// and it makes no comparison with other people's computers (the site has no data for that).
import {gpuClass, cpuClass} from "./compat.mjs";

export const SCORE_WEIGHTS = {gpu: 0.5, cpu: 0.3, ram: 0.2};
const GPU_MAX = 10, CPU_MAX = 8;

// gpuClass runs from 1 to 10 and cpuClass from 1 to 8, so both are scaled to 0..1.
const scale = (value, max) => Math.max(0, Math.min(1, (value - 1) / (max - 1)));
// RAM: 4 GB = 0.2, 8 GB = 0.4, 16 GB = 0.6, 32 GB = 0.8, 64 GB = 1
const ramScale = gb => Math.max(0, Math.min(1, Math.log2(gb / 2) / 5));

export const SCORE_TIERS = [
  {min: 85, id: "very-strong", label: "Juda kuchli"},
  {min: 65, id: "strong", label: "Kuchli"},
  {min: 45, id: "medium", label: "O‘rta daraja"},
  {min: 25, id: "light", label: "Yengil o‘yinlar uchun"},
  {min: 0, id: "basic", label: "Boshlang‘ich daraja"},
];
export const tierOf = score => SCORE_TIERS.find(t => score >= t.min);

// Returns {score, tier, parts, weakest} or {score: null, missing: [...]} when something needed is unknown.
export function deviceScore(profile) {
  const gpu = profile?.gpu ? gpuClass(profile.gpu, profile) : null;
  const cpu = profile?.cpu ? cpuClass(profile.cpu) : null;
  const ram = Number(profile?.ram) > 0 ? Number(profile.ram) : null;
  const missing = [gpu == null ? "gpu" : null, cpu == null ? "cpu" : null, ram == null ? "ram" : null].filter(Boolean);
  if (missing.length) return {score: null, tier: null, missing, parts: null, weakest: null};
  const parts = {gpu: {value: gpu, norm: scale(gpu, GPU_MAX)}, cpu: {value: cpu, norm: scale(cpu, CPU_MAX)}, ram: {value: ram, norm: ramScale(ram)}};
  const raw = parts.gpu.norm * SCORE_WEIGHTS.gpu + parts.cpu.norm * SCORE_WEIGHTS.cpu + parts.ram.norm * SCORE_WEIGHTS.ram;
  const score = Math.max(0, Math.min(100, Math.round(raw * 100)));
  // The weakest link is named only when one part is clearly behind the other two; otherwise they are in balance.
  // For this comparison 16 GB counts as "enough" (full), since more RAM does not make games faster.
  const level = {gpu: parts.gpu.norm, cpu: parts.cpu.norm, ram: Math.min(1, parts.ram.norm / 0.6)};
  let weakest = null, widest = 0.2 - 1e-9;
  for (const key of Object.keys(level)) {
    const others = Object.keys(level).filter(k => k !== key).map(k => level[k]);
    const gap = others.reduce((a, b) => a + b, 0) / others.length - level[key];
    if (gap > widest) { widest = gap; weakest = key; }
  }
  return {score, tier: tierOf(score), missing: [], parts, weakest};
}

// Counts the verdicts of a list of evaluated games.
export function coverage(results) {
  const out = {play: 0, adjust: 0, avoid: 0, unknown: 0, total: 0};
  for (const r of results) if (r) { out[r.verdict] = (out[r.verdict] || 0) + 1; out.total++; }
  const known = out.total - out.unknown;
  out.ok = out.play + out.adjust;
  out.percent = known > 0 ? Math.round((out.ok / known) * 100) : null;
  return out;
}
