// Sign in, sign up and cross-device sync. Classic script: client.js passes it everything it needs.
// Works without an account exactly as before; an account only adds sync.
function createAccount(ctx) {
  const {tr, E, $, I} = ctx;
  const META = "framecheck.sync.v1";
  let meta = {saved: {}, profileAt: 0, rev: 0, owner: null, user: null};
  try {
    const stored = JSON.parse(localStorage.getItem(META) || "null");
    if (stored && typeof stored === "object") meta = {...meta, ...stored, saved: stored.saved && typeof stored.saved === "object" ? stored.saved : {}};
  } catch {}
  const saveMeta = () => { try { localStorage.setItem(META, JSON.stringify(meta)); } catch {} };

  let user = meta.user || null;                       // name of the signed-in user ("" when signed out)
  let available = location.protocol === "file:" ? false : null; // null = not known yet
  let status = "idle", lastSync = 0, busy = false, again = false, applying = false;
  let pushTimer = 0, pollTimer = 0, mode = "login";
  let recovery = false, admin = false, hasEmail = false; // what the server tells us in /auth/me

  async function call(method, path, body) {
    const res = await fetch("/api/" + path, {
      method, cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(15000),
      headers: body === undefined ? {} : {"Content-Type": "application/json"},
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    if (res.status !== 204) { try { json = await res.json(); } catch {} }
    return {status: res.status, json: json || {}};
  }

  // ---- local data <-> sync document
  function localDoc() {
    const local = ctx.read(), saved = {};
    for (const id of local.saved) { const m = meta.saved[id]; saved[id] = {t: m && m.on ? m.t : 1, on: true}; }
    for (const [id, m] of Object.entries(meta.saved)) if (!m.on && !(id in saved)) saved[id] = {t: m.t, on: false};
    const parts = {v: 1, saved, history: local.history.map(h => ({id: h.id, at: String(h.at)})), games: local.games,
      profile: {t: meta.profileAt || (local.profile ? 1 : 0), values: local.profile || null}};
    return sanitizeDoc(parts) || sanitizeDoc({...parts, games: {}}) || sanitizeDoc({...parts, games: {}, profile: {t: 0, values: null}}) || emptyDoc();
  }
  function apply(doc) {
    applying = true;
    try {
      meta.saved = doc.saved; meta.profileAt = doc.profile.t;
      ctx.write({saved: savedIds(doc), history: doc.history, games: doc.games, profile: doc.profile.values});
    } finally { applying = false; }
  }
  const resetMeta = () => { meta = {saved: {}, profileAt: 0, rev: 0, owner: null, user: null}; saveMeta(); };

  // ---- sync
  function expire() {
    user = null; meta.user = null; saveMeta(); stopTimers(); status = "idle"; renderChrome();
    ctx.notify(tr("Sessiya tugadi. Qayta kiring."));
  }
  async function sync() {
    if (!user) return false;
    if (busy) { again = true; return false; }
    busy = true; setStatus("syncing");
    let ok = false;
    try {
      for (let attempt = 0; attempt < 4 && !ok; attempt++) {
        const remote = await call("GET", "sync");
        if (remote.status === 401) { expire(); return false; }
        if (remote.status !== 200) throw Error("sync");
        const local = localDoc(), merged = mergeDocs(local, remote.json.doc);
        if (!sameDoc(merged, local)) apply(merged);
        if (sameDoc(merged, remote.json.doc)) { meta.rev = remote.json.rev; ok = true; break; }
        const put = await call("PUT", "sync", {rev: remote.json.rev, doc: merged});
        if (put.status === 200) { meta.rev = put.json.rev; ok = true; }
        else if (put.status === 401) { expire(); return false; }
        else if (put.status !== 409) throw Error("sync");
      }
      if (ok) { meta.owner = user; lastSync = Date.now(); saveMeta(); }
      setStatus(ok ? "idle" : "error");
    } catch { setStatus("error"); }
    finally { busy = false; if (again) { again = false; schedule(400); } }
    return ok;
  }
  function schedule(ms = 1800) {
    if (!user || applying) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(sync, ms);
  }
  function startTimers() {
    stopTimers();
    pollTimer = setInterval(() => { if (user && !document.hidden) sync(); }, 90000);
  }
  function stopTimers() { clearInterval(pollTimer); clearTimeout(pushTimer); }
  document.addEventListener("visibilitychange", () => { if (!document.hidden && user && Date.now() - lastSync > 15000) sync(); });

  // Hooks used by client.js whenever local data changes.
  const touch = () => schedule();
  function markSaved(id, on) { meta.saved[id] = {t: Date.now(), on}; saveMeta(); schedule(); }
  function markProfile() { meta.profileAt = Date.now(); saveMeta(); schedule(); }

  // ---- header / sidebar
  const statusText = () => status === "syncing" ? tr("Sinxronlanmoqda…") : status === "error" ? tr("Sinxronlanmadi. Keyinroq qayta uriniladi.") : lastSync ? tr("Sinxronlandi") : tr("Hisobga kirgansiz");
  function setStatus(next) { status = next; renderChrome(); const line = $("#account-status"); if (line) line.textContent = statusLine(); }
  function renderChrome() {
    const name = $("#account-name"), sub = $("#account-sub"), avatar = $("#account-avatar"), pill = $("#account-pill"), label = $("#account-pill-label");
    if (!name) return;
    if (available === false || (available === null && !user)) {
      pill.hidden = true; avatar.innerHTML = I("laptop");
      name.textContent = tr("Qurilma profili"); sub.textContent = tr("Shu brauzerda saqlanadi");
      return;
    }
    pill.hidden = false;
    if (user) {
      avatar.textContent = user[0].toUpperCase(); name.textContent = user; sub.textContent = statusText();
      label.textContent = user; pill.setAttribute("aria-label", tr("Hisob") + ": " + user);
    } else {
      avatar.innerHTML = I("user"); name.textContent = tr("Kirish"); sub.textContent = tr("Ma’lumotlarni boshqa qurilmada ham ko‘r");
      label.textContent = tr("Kirish"); pill.setAttribute("aria-label", tr("Kirish"));
    }
  }
  const statusLine = () => status === "syncing" ? tr("Sinxronlanmoqda…") : status === "error" ? tr("Sinxronlanmadi. Internetni tekshir va qayta urin.")
    : lastSync ? tr("Oxirgi sinxronlash: {0}", ctx.time(lastSync)) : tr("Hali sinxronlanmagan.");

  // ---- messages
  function errorText(r) {
    const code = r.json?.code;
    return code === "bad_credentials" ? tr("Login yoki parol noto‘g‘ri.")
      : code === "username_taken" ? tr("Bu login band. Boshqasini tanla.")
      : code === "username_invalid" ? tr("Login 3–24 belgidan iborat bo‘lsin: harf, raqam, nuqta, pastki chiziq yoki chiziqcha.")
      : code === "password_short" ? tr("Parol kamida 8 belgidan iborat bo‘lsin.")
      : code === "password_long" ? tr("Parol 128 belgidan oshmasin.")
      : code === "password_weak" ? tr("Parol juda oddiy. Boshqa parol tanla.")
      : code === "rate_limited" ? tr("Urinishlar ko‘p. {0} daqiqadan keyin qayta urin.", Math.max(1, Math.ceil((r.json.retryAfter || 60) / 60)))
      : code === "accounts_unavailable" ? tr("Hisoblar hozir ishlamayapti. Keyinroq qayta urin.")
      : code === "email_invalid" ? tr("Email manzili noto‘g‘ri yozilgan.")
      : code === "token_invalid" ? tr("Havola eskirgan yoki ishlatilgan. Yangisini so‘ra.")
      : code === "recovery_unavailable" ? tr("Parolni tiklash hozir ishlamayapti.")
      : tr("Amal bajarilmadi. Keyinroq qayta urin.");
  }
  const passwordError = r => r.json?.code === "bad_credentials" ? tr("Parol noto‘g‘ri.") : errorText(r);
  const offlineText = () => tr("Serverga ulanib bo‘lmadi. Internetni tekshir.");
  const validName = v => /^[A-Za-z0-9][A-Za-z0-9_.-]{2,23}$/.test(v);

  // ---- dialogs
  const field = (name, title, attrs) => '<label class="spec-field"><span>' + E(title) + '</span><input name="' + name + '" ' + attrs + '></label>';
  function openDialog() {
    ctx.closeMenu();
    if (available === false) { ctx.openDevice(); return; }
    if (user) showAccount(); else showForm();
  }
  function showForm(keepName = "") {
    const register = mode === "register";
    ctx.show(register ? tr("Ro‘yxatdan o‘tish") : tr("Kirish"),
      '<div class="row-actions account-switch" role="group" aria-label="' + E(tr("Kirish usuli")) + '">'
      + '<button type="button" class="subtle-btn" data-account-mode="login" aria-pressed="' + !register + '">' + E(tr("Kirish")) + '</button>'
      + '<button type="button" class="subtle-btn" data-account-mode="register" aria-pressed="' + register + '">' + E(tr("Ro‘yxatdan o‘tish")) + '</button></div>'
      + '<p class="hint">' + E(register ? tr("Hisob ochsang, saqlangan o‘yinlar, tekshiruv tarixi va qurilma xususiyatlari boshqa telefon yoki kompyuterda ham ko‘rinadi.") : tr("Login va parol bilan kirsang, saqlangan o‘yinlar, tarix va qurilma xususiyatlari shu qurilmaga ham tushadi.")) + '</p>'
      + '<form id="account-form" novalidate><div class="account-fields">'
      + field("username", tr("Login"), 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" required value="' + E(keepName) + '"')
      + field("password", tr("Parol"), 'type="password" autocomplete="' + (register ? "new-password" : "current-password") + '" maxlength="128" required')
      + (register ? field("again", tr("Parolni takrorla"), 'type="password" autocomplete="new-password" maxlength="128" required') : '')
      + (register && recovery ? field("email", tr("Email (ixtiyoriy, faqat parolni tiklash uchun)"), 'type="email" autocomplete="email" maxlength="254"') : '')
      + '</div><label class="check-line"><input type="checkbox" id="show-password"> ' + E(tr("Parolni ko‘rsat")) + '</label>'
      + '<output id="account-error" class="form-error" role="alert"></output>'
      + '<div class="row-actions"><button type="submit" class="primary">' + E(register ? tr("Hisob ochish") : tr("Kirish")) + '</button></div></form>'
      + '<p class="hint">' + E(register
          ? (recovery ? tr("Parol shifrlangan holda saqlanadi, uni hech kim ko‘ra olmaydi. Email qo‘shsang, parolni unutganda tiklay olasan.") : tr("Parol shifrlangan holda saqlanadi, uni hech kim ko‘ra olmaydi. Parolni tiklab bo‘lmaydi: uni eslab qol."))
          : (recovery ? tr("Hisobing yo‘qmi? “Ro‘yxatdan o‘tish” ni tanla.") : tr("Hisobing yo‘qmi? “Ro‘yxatdan o‘tish” ni tanla. Parolni tiklab bo‘lmaydi."))) + '</p>'
      + (!register && recovery ? '<p><button type="button" class="link-btn" id="forgot-link">' + E(tr("Parolni unutdingmi?")) + '</button></p>' : '')
      + '<p class="hint">' + E(tr("Davom etib, maxfiylik izohiga rozilik bildirasan.")) + ' <button type="button" class="link-btn" data-privacy>' + E(tr("Maxfiylik izohi")) + '</button></p>');
    const form = $("#account-form"), err = $("#account-error");
    $("#forgot-link")?.addEventListener("click", () => showForgot(form.elements.username.value));
    form.elements.username.focus();
    $("#show-password").addEventListener("change", e => { for (const n of ["password", "again"]) if (form.elements[n]) form.elements[n].type = e.target.checked ? "text" : "password"; });
    for (const b of document.querySelectorAll("[data-account-mode]")) b.addEventListener("click", () => { mode = b.dataset.accountMode; showForm(form.elements.username.value); });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const username = form.elements.username.value.trim(), password = form.elements.password.value, button = form.querySelector("button[type=submit]");
      const bad = !validName(username) ? tr("Login 3–24 belgidan iborat bo‘lsin: harf, raqam, nuqta, pastki chiziq yoki chiziqcha.")
        : password.length < 8 ? tr("Parol kamida 8 belgidan iborat bo‘lsin.")
        : register && password !== form.elements.again.value ? tr("Parollar bir xil emas.") : "";
      if (bad) { err.textContent = bad; return; }
      err.textContent = ""; button.disabled = true;
      try {
        const email = register && form.elements.email ? form.elements.email.value.trim() : "";
        const r = await call("POST", "auth/" + mode, email ? {username, password, email} : {username, password});
        if (r.status === 200 || r.status === 201) await signedIn(r.json.user.username, register);
        else { err.textContent = errorText(r); if (r.status === 503 || r.status === 404) { available = false; renderChrome(); } }
      } catch { err.textContent = offlineText(); }
      finally { button.disabled = false; }
    });
  }
  function showAccount() {
    ctx.show(tr("Hisob"),
      '<div class="account-head"><span class="avatar" aria-hidden="true">' + E(user[0].toUpperCase()) + '</span><div><strong>' + E(user) + '</strong><small id="account-status" role="status">' + E(statusLine()) + '</small></div></div>'
      + '<p class="hint">' + E(tr("Saqlanganlar, tekshiruv tarixi va qurilma xususiyatlari hisobingizda saqlanadi va boshqa qurilmalarda ham ko‘rinadi.")) + '</p>'
      + '<div class="row-actions"><button type="button" class="subtle-btn" id="sync-now">' + I("refresh") + E(tr("Hozir sinxronlash")) + '</button>'
      + '<button type="button" class="subtle-btn" id="sign-out">' + E(tr("Chiqish")) + '</button></div>'
      + '<p class="hint">' + E(tr("Chiqsang, bu qurilmadagi saqlanganlar va tarix tozalanadi. Ular hisobingizda qoladi.")) + '</p>'
      + (admin ? '<div class="row-actions"><button type="button" class="primary" id="open-admin">' + E(tr("Admin panel")) + '</button></div>' : '')
      + (recovery ? '<details class="account-section"><summary>' + E(tr("Parolni tiklash uchun email")) + ' · ' + E(hasEmail ? tr("ulangan") : tr("yo‘q")) + '</summary><form id="email-form" novalidate><div class="account-fields">'
        + field("email", tr("Email"), 'type="email" autocomplete="email" maxlength="254" placeholder="' + E(tr("Bo‘sh qoldirsang, email o‘chiriladi")) + '"')
        + field("password", tr("Parolni tasdiqla"), 'type="password" autocomplete="current-password" maxlength="128" required')
        + '</div><output class="form-error" role="alert"></output><div class="row-actions"><button type="submit" class="subtle-btn">' + E(tr("Saqlash")) + '</button></div></form></details>' : '')
      + '<details class="account-section"><summary>' + E(tr("Parolni o‘zgartirish")) + '</summary><form id="password-form" novalidate><div class="account-fields">'
      + field("current", tr("Hozirgi parol"), 'type="password" autocomplete="current-password" maxlength="128" required')
      + field("next", tr("Yangi parol"), 'type="password" autocomplete="new-password" maxlength="128" required')
      + '</div><output class="form-error" role="alert"></output><div class="row-actions"><button type="submit" class="subtle-btn">' + E(tr("Parolni almashtirish")) + '</button></div></form></details>'
      + '<details class="account-section danger"><summary>' + E(tr("Hisobni o‘chirish")) + '</summary><p class="hint">' + E(tr("Hisob va undagi hamma ma’lumot butunlay o‘chadi. Buni qaytarib bo‘lmaydi.")) + '</p><form id="delete-form" novalidate><div class="account-fields">'
      + field("password", tr("Parolni tasdiqla"), 'type="password" autocomplete="current-password" maxlength="128" required')
      + '</div><output class="form-error" role="alert"></output><div class="row-actions"><button type="submit" class="subtle-btn danger-btn">' + E(tr("Hisobni butunlay o‘chirish")) + '</button></div></form></details>'
      + '<p class="hint"><button type="button" class="link-btn" data-privacy>' + E(tr("Maxfiylik izohi")) + '</button></p>');
    $("#open-admin")?.addEventListener("click", () => ctx.openAdmin());
    $("#sync-now").addEventListener("click", () => sync());
    $("#sign-out").addEventListener("click", signOut);
    const run = (form, work) => form.addEventListener("submit", async e => {
      e.preventDefault();
      const err = form.querySelector(".form-error"), button = form.querySelector("button[type=submit]");
      err.textContent = ""; button.disabled = true;
      try { await work(err, new FormData(form)); } catch { err.textContent = offlineText(); } finally { button.disabled = false; }
    });
    if ($("#email-form")) run($("#email-form"), async (err, f) => {
      const r = await call("POST", "auth/email", {email: String(f.get("email")).trim(), password: String(f.get("password"))});
      if (r.status === 200) { hasEmail = r.json.hasEmail; ctx.notify(hasEmail ? tr("Email saqlandi.") : tr("Email o‘chirildi.")); $("#modal").close(); }
      else err.textContent = passwordError(r);
    });
    run($("#password-form"), async (err, f) => {
      const next = String(f.get("next"));
      if (next.length < 8) { err.textContent = tr("Parol kamida 8 belgidan iborat bo‘lsin."); return; }
      const r = await call("POST", "auth/password", {current: String(f.get("current")), next});
      if (r.status === 200) { $("#password-form").reset(); err.textContent = ""; ctx.notify(tr("Parol almashtirildi. Boshqa qurilmalardan chiqarildingiz.")); $("#modal").close(); }
      else err.textContent = passwordError(r);
    });
    run($("#delete-form"), async (err, f) => {
      if (!window.confirm(tr("Hisob va hamma ma’lumot butunlay o‘chadi. Davom etasanmi?"))) return;
      const r = await call("POST", "auth/delete", {password: String(f.get("password"))});
      if (r.status === 204) { ctx.wipe(); user = null; resetMeta(); stopTimers(); $("#modal").close(); renderChrome(); ctx.notify(tr("Hisob o‘chirildi.")); }
      else err.textContent = passwordError(r);
    });
  }

  // ---- forgotten password
  function showForgot(name = "") {
    ctx.show(tr("Parolni tiklash"),
      '<p class="hint">' + E(tr("Loginingni yoz. Hisobingga email ulangan bo‘lsa, parolni yangilash havolasi yuboriladi (30 daqiqa amal qiladi).")) + '</p>'
      + '<form id="forgot-form" novalidate><div class="account-fields">' + field("username", tr("Login"), 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="24" required value="' + E(name) + '"')
      + '</div><output id="forgot-note" class="form-error" role="status"></output><div class="row-actions"><button type="submit" class="primary">' + E(tr("Havola yuborish")) + '</button>'
      + '<button type="button" class="subtle-btn" id="forgot-back">' + E(tr("Orqaga")) + '</button></div></form>'
      + '<p class="hint">' + E(tr("Email ulanmagan bo‘lsa, parolni tiklab bo‘lmaydi. Sayt egasiga murojaat qil.")) + '</p>');
    const form = $("#forgot-form"), note = $("#forgot-note");
    form.elements.username.focus();
    $("#forgot-back").addEventListener("click", () => showForm(form.elements.username.value));
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const username = form.elements.username.value.trim(), button = form.querySelector("button[type=submit]");
      if (!username) { note.textContent = tr("Loginni yoz."); return; }
      button.disabled = true; note.textContent = "";
      try {
        const r = await call("POST", "auth/forgot", {username});
        note.textContent = r.status === 200 ? tr("Agar bu hisobga email ulangan bo‘lsa, havola yuborildi. Pochtangni tekshir.") : errorText(r);
      } catch { note.textContent = offlineText(); }
      finally { button.disabled = false; }
    });
  }
  function showReset(token) {
    ctx.show(tr("Yangi parol qo‘yish"),
      '<form id="reset-form" novalidate><div class="account-fields">'
      + field("password", tr("Yangi parol"), 'type="password" autocomplete="new-password" maxlength="128" required')
      + field("again", tr("Parolni takrorla"), 'type="password" autocomplete="new-password" maxlength="128" required')
      + '</div><output class="form-error" role="alert"></output><div class="row-actions"><button type="submit" class="primary">' + E(tr("Parolni saqlash")) + '</button></div></form>');
    const form = $("#reset-form"), err = form.querySelector(".form-error");
    form.elements.password.focus();
    form.addEventListener("submit", async e => {
      e.preventDefault();
      const password = form.elements.password.value, button = form.querySelector("button[type=submit]");
      if (password.length < 8) { err.textContent = tr("Parol kamida 8 belgidan iborat bo‘lsin."); return; }
      if (password !== form.elements.again.value) { err.textContent = tr("Parollar bir xil emas."); return; }
      button.disabled = true; err.textContent = "";
      try {
        const r = await call("POST", "auth/reset", {token, password});
        if (r.status === 200) { mode = "login"; showForm(); ctx.notify(tr("Parol yangilandi. Yangi parol bilan kir.")); }
        else err.textContent = errorText(r);
      } catch { err.textContent = offlineText(); }
      finally { button.disabled = false; }
    });
  }
  // The reset link carries its token after "#", which browsers never send to servers; remove it from the address at once.
  function openResetLink() {
    const m = location.hash.match(/^#tiklash=([A-Za-z0-9_-]{40,50})$/);
    if (!m) return;
    history.replaceState(null, "", location.pathname + location.search);
    showReset(m[1]);
  }

  // ---- lifecycle
  async function signedIn(name, created) {
    // Local data left behind by another account must never be merged into this one.
    if (meta.owner && meta.owner !== name) { ctx.wipe(); resetMeta(); }
    user = name; meta.user = name; saveMeta(); startTimers();
    try { const r = await call("GET", "auth/me"); admin = Boolean(r.json.user?.admin); hasEmail = Boolean(r.json.user?.hasEmail); recovery = Boolean(r.json.recovery); } catch {}
    $("#modal").close(); renderChrome();
    ctx.notify(created ? tr("Hisob yaratildi. Ma’lumotlaring saqlanadi.") : tr("{0}, xush kelibsiz!", name));
    await sync();
  }
  async function signOut() {
    const button = $("#sign-out"); if (button) button.disabled = true;
    let synced = false;
    try { clearTimeout(pushTimer); synced = await sync(); } catch {}
    try { await call("POST", "auth/logout"); } catch {}
    stopTimers(); user = null; status = "idle"; admin = false; hasEmail = false;
    if (synced) { ctx.wipe(); resetMeta(); }
    else { meta.user = null; saveMeta(); }
    $("#modal").close(); renderChrome();
    ctx.notify(synced ? tr("Chiqdingiz.") : tr("Chiqdingiz. Sinxronlanmagan ma’lumot shu qurilmada qoldi."));
  }
  async function init() {
    renderChrome();
    if (available === false) return;
    try {
      const r = await call("GET", "auth/me");
      available = r.status === 200 && r.json.available !== false;
      recovery = Boolean(r.json.recovery);
      admin = Boolean(r.json.user?.admin); hasEmail = Boolean(r.json.user?.hasEmail);
      if (available && r.json.user) { user = r.json.user.username; meta.user = user; saveMeta(); startTimers(); sync(); }
      else if (available) { user = null; if (meta.user) { meta.user = null; saveMeta(); } }
    } catch { available = user ? true : false; if (user) setStatus("error"); }
    renderChrome();
    if (available) openResetLink();
  }

  document.addEventListener("click", e => { if (e.target.closest("[data-account]")) { e.preventDefault(); openDialog(); } });
  window.addEventListener("framecheck:language", renderChrome);
  return {init, touch, markSaved, markProfile, call, open: openDialog, signedIn: () => Boolean(user)};
}
