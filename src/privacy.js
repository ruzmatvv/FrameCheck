// Privacy notice shown in a dialog (#maxfiylik). Keep it in step with what the site really stores.
function privacyHtml(tr, E) {
  const section = (title, ...lines) => '<h3>' + E(tr(title)) + '</h3>' + lines.map(line => '<p>' + E(tr(line)) + '</p>').join("");
  return '<p class="hint">' + E(tr("Framecheck reklama ko‘rsatmaydi va seni kuzatmaydi. Quyida nima saqlanishi yozilgan.")) + '</p>'
    + section("Hisobsiz foydalanish",
      "Hisob ochmasang, saqlanganlar, tekshiruv tarixi va qurilma xususiyatlari faqat shu brauzerda saqlanadi. Ular serverga yuborilmaydi.")
    + section("Hisob ochsang",
      "Serverda (Cloudflare) saqlanadi: login, parolning shifrlangan izi (parolning o‘zi emas), saqlangan o‘yinlar, tekshiruv tarixi, Steam’dan olingan o‘yin yozuvlari va qurilma xususiyatlari. Bu ma’lumot faqat boshqa qurilmalaringda ko‘rsatish uchun kerak.",
      "Email ixtiyoriy. U faqat parolni tiklash havolasini yuborish uchun ishlatiladi, boshqa maqsadda emas.",
      "Kirish uchun bitta cookie (fc_session) qo‘yiladi. Kuzatuv cookie’lari yo‘q.")
    + section("FPS o‘lchovlari",
      "O‘lchov yuborsang, FPS, grafik sozlamasi, ekran o‘lchami hamda protsessor, videokarta va RAM nomi saqlanadi. Sayt egasi tekshirib tasdiqlagandan keyin u login ko‘rsatilmasdan hamma uchun ko‘rinadi.")
    + section("Steam",
      "O‘yin talablari va narxlar Steam’dan server orqali olinadi. Muqova rasmlari Steam CDN’dan yuklanadi (u ishlamasa, server orqali). Steam bu so‘rovlarni ko‘radi.")
    + section("Cloudflare",
      "Sayt Cloudflare’da ishlaydi. Cloudflare xizmat ko‘rsatish uchun odatiy texnik so‘rov jurnallarini yuritadi.")
    + section("Ma’lumotni o‘chirish",
      "Hisob oynasidagi “Hisobni o‘chirish” hisobni, sinxronlangan ma’lumotni va FPS o‘lchovlaringni butunlay o‘chiradi. Shu brauzerdagi ma’lumotni brauzer sozlamalaridan o‘chirish mumkin.")
    + section("Eslatma",
      "FPS va moslik natijalari taxminiy. Xarid qarorini o‘zing qabul qilasan.");
}
