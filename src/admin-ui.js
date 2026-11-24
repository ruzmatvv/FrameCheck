// Owner panel: totals, popular games and devices, FPS report review, users. Only works for an admin account;
// the server checks that on every request, so showing the button to anyone else would not help them.
function createAdminPanel(ctx) {
  const {tr, E, $} = ctx;
  const when = ms => ms ? new Date(ms).toLocaleDateString(ctx.locale()) : "—";
  const PRESETS = {low: "Past", medium: "O‘rtacha", high: "Yuqori", ultra: "Ultra"};
  const list = (title, items, label) => '<div class="admin-list"><h4>' + E(tr(title)) + '</h4>' + (items.length
    ? '<ol>' + items.map(x => '<li><span>' + E(label(x.name)) + '</span><b>' + x.n + '</b></li>').join("") + '</ol>' : '<p class="hint">—</p>') + '</div>';

  async function open() {
    ctx.show(tr("Admin panel"), '<p>' + E(tr("Yuklanmoqda…")) + '</p>');
    const body = $("#modal-body .modal-inner");
    try {
      const [overview, pending, bot] = await Promise.all([ctx.account.call("GET", "admin/overview"), ctx.account.call("GET", "admin/fps?status=pending"), ctx.account.call("GET", "admin/bot").catch(() => null)]);
      if (overview.status !== 200) { body.innerHTML = '<p>' + E(tr("Bu bo‘lim faqat sayt egasi uchun.")) + '</p>'; return; }
      render(body, overview.json, pending.json.reports || [], bot && bot.status === 200 ? bot.json : null);
    } catch { body.innerHTML = '<p>' + E(tr("Serverga ulanib bo‘lmadi. Internetni tekshiring.")) + '</p>'; }
  }

  // The Telegram bot: counts only (people, activity, what they search); who searched is never stored.
  function botSection(b) {
    if (!b) return '<h3>' + E(tr("Telegram bot")) + '</h3><p class="hint">' + E(tr("Botda hozircha ma’lumot yo‘q.")) + '</p>';
    const t = b.totals, stat = (label, value) => '<div><small>' + E(tr(label)) + '</small><strong>' + value + '</strong></div>';
    const max = Math.max(1, ...b.days.map(d => d.n));
    return '<h3>' + E(tr("Telegram bot")) + '</h3><div class="metrics admin-stats">' + stat("Bot foydalanuvchilari", t.users) + stat("24 soatda faol", t.active24h) + stat("7 kunda faol", t.active7d)
      + stat("Botni bloklaganlar", t.blocked) + stat("Kuzatuvlar", t.watchGames + t.watchSkins) + stat("Bugungi so‘rovlar", t.requestsToday) + '</div>'
      + '<p class="hint">' + b.days.map(d => E(d.day.slice(5)) + ': <b>' + d.n + '</b>').join(" · ") + '</p>'
      + '<div class="admin-lists">' + list("Bot: o‘yin qidiruvlari", b.topGames, String) + list("Bot: skin qidiruvlari", b.topSkins, String) + list("Bot: inline qidiruvlar", b.topInline, String) + list("Bot tillari", b.langs, String) + '</div>'
      + (b.errors.length ? '<h4>' + E(tr("Bot xatolari (oxirgilari)")) + '</h4><ul class="report-list">' + b.errors.slice(0, 8).map(x => '<li><div><small>' + when(x.at) + ' · ' + E(x.place) + '</small><br>' + E(x.note) + '</div></li>').join("") + '</ul>' : '');
  }

  function render(body, o, pending, bot) {
    const t = o.totals, stat = (label, value) => '<div><small>' + E(tr(label)) + '</small><strong>' + value + '</strong></div>';
    const gameName = id => ctx.nameOf(Number(id)) || "#" + id;
    body.innerHTML = '<div class="metrics admin-stats">' + stat("Foydalanuvchilar", t.users) + stat("Shu hafta yangi", t.newThisWeek) + stat("Hozir kirgan", t.signedIn)
      + stat("Ma’lumoti bor", t.withData) + stat("Tekshiruvdagi o‘lchovlar", t.reportsPending) + stat("Tasdiqlangan o‘lchovlar", t.reportsApproved) + '</div>'
      + botSection(bot)
      + '<h3>' + E(tr("FPS o‘lchovlari (tekshiruv kutmoqda)")) + '</h3>'
      + (pending.length ? '<ul class="report-list admin-reports">' + pending.map(r => '<li><div><strong>' + E(gameName(r.game_id)) + '</strong> · ' + E(r.fps + " FPS") + ' · ' + E(tr(PRESETS[r.preset]) + ", " + r.resolution)
        + '<br><small>' + E(r.gpu) + ' · ' + E(r.cpu) + (r.ram ? ' · ' + E(r.ram + " GB") : '') + ' · ' + E(r.username) + '</small></div><div class="row-actions">'
        + '<button class="subtle-btn" data-admin-review="' + r.id + '" data-action="approve">' + E(tr("Tasdiqlash")) + '</button>'
        + '<button class="subtle-btn" data-admin-review="' + r.id + '" data-action="reject">' + E(tr("Rad etish")) + '</button></div></li>').join("") + '</ul>'
        : '<p class="hint">' + E(tr("Tekshiriladigan o‘lchov yo‘q.")) + '</p>')
      + '<div class="admin-lists">' + list("Ko‘p tekshirilgan o‘yinlar", o.topChecked, gameName) + list("Ko‘p saqlangan o‘yinlar", o.topSaved, gameName)
      + list("Videokartalar", o.topGpus, String) + list("Protsessorlar", o.topCpus, String) + '</div>'
      + '<p class="hint">' + E(tr("Ro‘yxatlar oxirgi {0} ta hisobning ma’lumotiga asoslangan.", o.sampled)) + '</p>'
      + '<h3>' + E(tr("Foydalanuvchilar")) + '</h3><div class="table-box"><table class="admin-users"><thead><tr><th>' + E(tr("Login")) + '</th><th>' + E(tr("Ochilgan")) + '</th><th>' + E(tr("Sinxron")) + '</th><th>' + E(tr("Saqlangan")) + '</th><th>' + E(tr("Tarix")) + '</th><th></th></tr></thead><tbody>'
      + o.users.map(u => '<tr><td>' + E(u.username) + (u.admin ? ' <small class="badge play">admin</small>' : '') + (u.hasEmail ? ' <small title="email">✉</small>' : '') + '</td><td>' + when(u.createdAt) + '</td><td>' + when(u.syncedAt) + '</td><td>' + (u.saved ?? "—") + '</td><td>' + (u.history ?? "—") + '</td><td>'
        + (u.admin ? '' : '<button class="text-btn small" data-admin-temp="' + E(u.username) + '">' + E(tr("Vaqtincha parol")) + '</button> <button class="text-btn small danger-btn" data-admin-delete="' + E(u.username) + '">' + E(tr("O‘chirish")) + '</button>') + '</td></tr>').join("")
      + '</tbody></table></div><output id="admin-note" class="hint" role="status"></output>';
    body.onclick = async e => {
      const b = e.target.closest("button");
      if (!b) return;
      const note = $("#admin-note");
      if (b.dataset.adminReview) {
        const r = await ctx.account.call("POST", "admin/fps", {id: Number(b.dataset.adminReview), action: b.dataset.action});
        if (r.status === 200) open(); else note.textContent = tr("Amal bajarilmadi. Keyinroq qayta urinib ko‘ring.");
      } else if (b.dataset.adminTemp) {
        if (!window.confirm(tr("{0} uchun yangi vaqtincha parol berilsin? Eski parol va sessiyalar bekor bo‘ladi.", b.dataset.adminTemp))) return;
        const r = await ctx.account.call("POST", "admin/user/password", {username: b.dataset.adminTemp});
        note.textContent = r.status === 200 ? tr("{0} uchun vaqtincha parol (faqat hozir ko‘rinadi): {1}", r.json.username, r.json.password) : tr("Amal bajarilmadi. Keyinroq qayta urinib ko‘ring.");
      } else if (b.dataset.adminDelete) {
        if (!window.confirm(tr("{0} hisobi va uning hamma ma’lumoti o‘chirilsinmi? Buni qaytarib bo‘lmaydi.", b.dataset.adminDelete))) return;
        const r = await ctx.account.call("POST", "admin/user/delete", {username: b.dataset.adminDelete});
        if (r.status === 200) open(); else note.textContent = tr("Amal bajarilmadi. Keyinroq qayta urinib ko‘ring.");
      }
    };
  }
  return {open};
}
