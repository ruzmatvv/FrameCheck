// FPS measurements sent by users. One report per user and game. A report is public only after an admin approves it.
import {ROUTES, accountJson, fail, readJson, currentUser, limited, strike} from "./auth.mjs";

export const FPS_PRESETS = ["low", "medium", "high", "ultra"];
export const FPS_RESOLUTIONS = ["720p", "1080p", "1440p", "2160p"];
const DAY = 24 * 3600 * 1000;

// Short, single-line text without markup characters.
export function shortText(value, min, max) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text.length >= min && text.length <= max && !/[\u0000-\u001f<>]/.test(text) ? text : null;
}
const gameIdOf = value => Number.isInteger(value) && value > 0 && value <= 2147483647 ? value : null;

export function median(numbers) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

async function submit(request, db, now) {
  const user = await currentUser(db, request, now);
  if (!user) return fail("unauthorized", 401);
  const {body, error} = await readJson(request);
  if (error) return error;
  const game = gameIdOf(body.gameId), cpu = shortText(body.cpu, 2, 120), gpu = shortText(body.gpu, 2, 120);
  const ram = body.ram === null || body.ram === undefined ? null : body.ram;
  if (!game || !Number.isInteger(body.fps) || body.fps < 1 || body.fps > 1000 || !FPS_PRESETS.includes(body.preset) || !FPS_RESOLUTIONS.includes(body.resolution)
    || !cpu || !gpu || (ram !== null && !(typeof ram === "number" && ram >= 1 && ram <= 4096))) return fail("invalid_report", 400);
  const key = "fps:" + user.id, wait = await limited(db, key, 20, DAY, now);
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  await strike(db, key, DAY, now);
  await db.prepare(`INSERT INTO fps_reports (user_id, game_id, fps, preset, resolution, cpu, gpu, ram, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    ON CONFLICT(user_id, game_id) DO UPDATE SET fps = excluded.fps, preset = excluded.preset, resolution = excluded.resolution,
      cpu = excluded.cpu, gpu = excluded.gpu, ram = excluded.ram, status = 'pending', updated_at = excluded.updated_at`)
    .bind(user.id, game, body.fps, body.preset, body.resolution, cpu, gpu, ram, now, now).run();
  return accountJson({status: "pending"});
}

async function list(request, db, now) {
  const game = gameIdOf(Number(new URL(request.url).searchParams.get("id")));
  if (!game) return fail("invalid", 400);
  const rows = (await db.prepare("SELECT fps, preset, resolution, cpu, gpu, ram FROM fps_reports WHERE game_id = ? AND status = 'approved' ORDER BY updated_at DESC LIMIT 200").bind(game).all()).results;
  const values = rows.map(r => r.fps);
  const user = await currentUser(db, request, now);
  const mine = user ? await db.prepare("SELECT fps, preset, resolution, cpu, gpu, ram, status FROM fps_reports WHERE user_id = ? AND game_id = ?").bind(user.id, game).first() : null;
  return accountJson({count: rows.length, median: median(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, reports: rows.slice(0, 20), mine});
}

Object.assign(ROUTES, {"POST /api/fps": submit, "GET /api/fps": list});
