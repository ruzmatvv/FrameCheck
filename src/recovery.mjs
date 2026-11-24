// Password recovery by email, and adding or removing the optional email.
// Email is sent through Resend's HTTP API. It stays off until RESEND_API_KEY (secret) and MAIL_FROM are set.
import {ROUTES, accountJson, fail, readJson, currentUser, limited, strike, clientKey, sha256, toB64u, hashPassword, verifyPassword, checkPassword, cleanEmail, recoveryEnabled} from "./auth.mjs";

const RESET_MS = 30 * 60 * 1000;
const HOUR = 3600000;

export async function sendMail(env, to, subject, text) {
  const send = env._fetch || fetch; // _fetch lets tests replace the network
  const res = await send("https://api.resend.com/emails", {
    method: "POST",
    headers: {Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json"},
    body: JSON.stringify({from: env.MAIL_FROM, to: [to], subject, text}),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw Error("mail");
}

// Always answers the same way, so the reply does not reveal whether a login exists or has an email.
async function forgot(request, db, now, env) {
  const {body, error} = await readJson(request);
  if (error) return error;
  if (!recoveryEnabled(env)) return fail("recovery_unavailable", 503);
  const username = typeof body.username === "string" ? body.username.trim().slice(0, 40) : "";
  const ipKey = "forgot:ip:" + clientKey(request), userKey = "forgot:u:" + username.toLowerCase();
  const wait = Math.max(await limited(db, ipKey, 10, HOUR, now), await limited(db, userKey, 3, HOUR, now));
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  await strike(db, ipKey, HOUR, now);
  await strike(db, userKey, HOUR, now);
  const user = username ? await db.prepare("SELECT id, email FROM users WHERE username = ? COLLATE NOCASE").bind(username).first() : null;
  if (user?.email) {
    const token = toB64u(crypto.getRandomValues(new Uint8Array(32)));
    await db.prepare("DELETE FROM reset_tokens WHERE user_id = ? OR expires_at <= ?").bind(user.id, now).run();
    await db.prepare("INSERT INTO reset_tokens (token_hash, user_id, expires_at) VALUES (?, ?, ?)").bind(await sha256(token), user.id, now + RESET_MS).run();
    const link = new URL(request.url).origin + "/#tiklash=" + token;
    try {
      await sendMail(env, user.email, "Framecheck: parolni tiklash / Восстановление пароля",
        `Parolni tiklash uchun havola (30 daqiqa amal qiladi):\n${link}\n\nAgar bu so'rovni siz yubormagan bo'lsangiz, xatni e'tiborsiz qoldiring.\n\n---\n\nСсылка для восстановления пароля (действует 30 минут):\n${link}\n\nЕсли вы не отправляли этот запрос, просто проигнорируйте письмо.\n`);
    } catch { /* the reply stays the same; the user can ask again */ }
  }
  return accountJson({ok: true});
}

async function reset(request, db, now) {
  const {body, error} = await readJson(request);
  if (error) return error;
  const ipKey = "reset:ip:" + clientKey(request);
  const wait = await limited(db, ipKey, 20, HOUR, now);
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  if (typeof body.token !== "string" || !/^[A-Za-z0-9_-]{40,50}$/.test(body.token)) { await strike(db, ipKey, HOUR, now); return fail("token_invalid", 400); }
  const row = await db.prepare("SELECT user_id FROM reset_tokens WHERE token_hash = ? AND expires_at > ?").bind(await sha256(body.token), now).first();
  if (!row) { await strike(db, ipKey, HOUR, now); return fail("token_invalid", 400); }
  const user = await db.prepare("SELECT username FROM users WHERE id = ?").bind(row.user_id).first();
  const weak = checkPassword(body.password, user.username);
  if (weak) return fail(weak, 400);
  const record = await hashPassword(body.password);
  await db.batch([
    db.prepare("UPDATE users SET pass_hash = ?, pass_salt = ?, iterations = ? WHERE id = ?").bind(record.hash, record.salt, record.iterations, row.user_id),
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id),
    db.prepare("DELETE FROM reset_tokens WHERE user_id = ?").bind(row.user_id),
  ]);
  return accountJson({ok: true});
}

// Add, change or remove the email. Needs the password, so a stolen session cannot redirect recovery mail.
async function setEmail(request, db, now) {
  const user = await currentUser(db, request, now);
  if (!user) return fail("unauthorized", 401);
  const {body, error} = await readJson(request);
  if (error) return error;
  const mail = cleanEmail(body.email);
  if (mail.error) return fail(mail.error, 400);
  const wait = await limited(db, "pw:" + user.id, 8, 900000, now);
  if (wait) return fail("rate_limited", 429, {retryAfter: wait}, {"Retry-After": String(wait)});
  const row = await db.prepare("SELECT pass_hash, pass_salt, iterations FROM users WHERE id = ?").bind(user.id).first();
  if (typeof body.password !== "string" || body.password.length > 128 || !(await verifyPassword(body.password, {hash: row.pass_hash, salt: row.pass_salt, iterations: row.iterations}))) {
    await strike(db, "pw:" + user.id, 900000, now);
    return fail("bad_credentials", 401);
  }
  await db.prepare("UPDATE users SET email = ? WHERE id = ?").bind(mail.email, user.id).run();
  return accountJson({ok: true, hasEmail: mail.email !== null});
}

Object.assign(ROUTES, {
  "POST /api/auth/forgot": forgot,
  "POST /api/auth/reset": reset,
  "POST /api/auth/email": setEmail,
});
