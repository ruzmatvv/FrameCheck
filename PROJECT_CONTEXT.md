# Framecheck: loyiha konteksti

Yangi sessiyada loyihani davom ettirish uchun shu faylni birinchi o'qing, keyin `README.md` ni. Oxirgi yangilanish: 2026-11-24.
Bu faylda parol, token yoki shaxsiy email yo'q. Ular hech qachon repoga yozilmasin.

## 1. Loyiha nima
Framecheck: Steam o'yinlarining tizim talablarini foydalanuvchining qurilmasi bilan taqqoslab, "o'ynaladimi" va taxminiy FPS ni
ko'rsatadigan sayt. Dastlab ASUS Vivobook (Core 7 150U, Intel Graphics, 8 GB) uchun ChatGPT yordamida qilingan, keyin umumiy
saytga aylantirilgan. Hozir jonli: **https://framecheck.uk** (o'zbek va rus tilida, hisoblar bilan).

- Foydalanuvchi (sayt egasi) o'zbekcha yozadi: **javoblarni o'zbek (lotin) tilida bering**, kod va fayl nomlari inglizcha.
- Sayt faqat framecheck.uk da ishlaydi. Eski `*.workers.dev` manzil o'chirilgan, `www` ulanmagan.

## 2. Egasining doimiy qoidalari (hamma ishda amal qiling)
1. Maxfiy kalit, parol, token, `.env` Git'ga tushmasin (`.gitignore` bor; har commitdan oldin skan qiling).
2. Mavjud dizayn va funksiyalarni buzmang. Har bir muhim o'zgarishdan keyin **test va commit** qiling.
3. Katta ishdan oldin avval tushuntiring, ruxsat olgach boshlang. "Qilib qo'y" deyilganda to'liq va professional bajaring.
4. Haqiqiy, manbasi bor ma'lumot kerak. Raqam o'ylab topmang (ayniqsa `benchmarks.json` ga).
5. Qaytarish nuqtasi: git tag `before-quota-protection` (limit himoyasidan oldingi holat). Yangi katta o'zgarishdan oldin tag qo'ying.
6. Commit xabari oxiriga: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
7. Joylash (`npm run deploy`) saytni hamma uchun yangilaydi: foydalanuvchi buyrug'i bilan qiling. Joylagach jonli saytni tekshiring.

## 3. Texnologiyalar va tuzilma
Node 26, ES modullar, **tashqi paketlar yo'q** (faqat `wrangler` npx orqali). Testlar `node --test`.

`build.mjs` quyidagilarni yasaydi:
- `dist/public/` statik fayllar (Cloudflare Static Assets): `index.html` (butun ilova bitta fayl, ~1.5 MB), `manifest.webmanifest`, `sw.js`,
  `icons/*`, `apple-touch-icon.png`, `favicon.ico`, `_headers` (manba: `src/headers.txt`).
- `dist/server/index.js` Worker (~45 KB): `sync.mjs + auth.mjs + recovery.mjs + fps.mjs + admin.mjs + server.mjs`, `import/export` qatorlari kesib tashlanadi.
- `--portable` bilan `Framecheck.html` (oflayn, API'siz). Fayllar o'zgarmasa qayta yozilmaydi, yozish atomik (parallel testlar to'qnashmasin).

Mijoz skripti (`src/` dagi modullar tartib bilan bitta skriptga yig'iladi, `build.mjs` dagi `modules` ro'yxati): `i18n.mjs, core.mjs, profile.mjs,
frames.mjs, compat.mjs, settings.mjs, search.mjs, dxdiag.mjs, devices.mjs, sync.mjs, suggest-ui.mjs, fps-demo.js, pc-duel.js, prices-ui.mjs,
device-picker.js, settings-ui.js, account.js, privacy.js, compare.js, upgrade.js, deals.js, reports.js, admin-ui.js`, oxirida `client.js`
(IIFE ichida: holat, render, hodisalar). Yangi modul qo'shsangiz: `modules` ro'yxatiga qo'shing va **top-level nomlar takrorlanmasin**
(hammasi bitta global scope; tekshirish skripti kerak bo'lsa yozing).

Asosiy fayllar:
| Fayl | Vazifa |
| --- | --- |
| `src/compat.mjs` | `evaluateGame`: protsessor/videokarta sinflari (regex jadvallar), RAM, OS, hukm (play/adjust/avoid/unknown) |
| `src/frames.mjs` | FPS taxmini (`fillFrameRate`), Steam narxini o'qish |
| `src/settings.mjs` | ekran o'lchami/sifatiga FPS ni qayta hisoblash (`applySettings`) |
| `src/devices.mjs` | GPU/CPU ro'yxatlari (har biri `gpuClass/cpuClass` da taniladi, test tekshiradi) |
| `src/server.mjs` | Worker: `/api/game`, `/api/search`, `/api/prices`, `/img/*`, kesh (`cached`), http->https, HSTS |
| `src/auth.mjs`, `recovery.mjs`, `fps.mjs`, `admin.mjs` | hisoblar, tiklash, FPS o'lchovlari, admin API (`ROUTES` jadvaliga qo'shiladi) |
| `src/sync.mjs` | sinxron hujjat qoidalari (mijoz va server bir xil) |
| `src/d1-sqlite.mjs` | D1 o'rniga Node SQLite (testlar va `npm run start:accounts`) |
| `migrations/*.sql` | D1 sxemasi (raqamlangan, `npm run deploy` qo'llaydi) |
| `src/data/ru.json` | rus tarjimasi (~496 kalit), `steam-uz.json` narx boshlang'ich ma'lumoti |
| `serve.mjs`, `portable.py`, `Framecheck.cmd` | mahalliy ishga tushirish (Node, Python zaxira, Windows ishga tushirgich) |
| `reference/live-2026-11-24.html` | eski jonli saytning surati (taqqoslash uchun) |

## 4. Infratuzilma (Cloudflare)
- Worker nomi `framecheck-samir`, sozlama `wrangler.toml`. **D1** bazasi `framecheck-db` (id `wrangler.toml` da, sir emas).
- Domen **framecheck.uk** (Cloudflare Registrar, nameserver'lar Cloudflare'da). `CANONICAL_HOST=framecheck.uk`.
- `workers_dev = false`, `preview_urls = false`. `flamecheck.bid` xato yozib sotib olingan edi: Worker'dan ajratilgan, hisobda hali turadi (avtomatik yangilashni o'chirish tavsiya).
- Statik fayllar Worker'siz beriladi (limitdan yemaydi). Worker faqat `/api/*` va `/img/*` ni biladi. Steam javoblari kesh (`X-Cache` sarlavhasi: HIT/MISS).
- Joylash: `npm run deploy` (testlar, build, migratsiya, `wrangler deploy`). Cloudflare'ga kirish tokeni vaqti-vaqti bilan tugaydi: `npx wrangler login`.
- Oxirgi joylangan versiya: `86abc677-21d2-41f8-8dec-4c1c6de237b4` (kod: commit `7ce7f4b`, 143 test).
- Bepul limitlar: Worker ~100 000 so'rov/kun; D1 ~100 000 yozuv/kun. Asosiy xavf: ommaviy API cheklovsiz.
- Resend (parolni email orqali tiklash) **sozlanmagan**: `RESEND_API_KEY` (secret) va `MAIL_FROM` yo'q, shuning uchun email maydoni va "parolni unutdingmi" yashirin.

## 5. Bajarilgan ishlar (qisqacha tarix)
1. Loyiha o'rganildi; Git o'rnatildi (`C:\Program Files\Git\cmd\git.exe`, PATH'da bo'lmasligi mumkin), birinchi commitlar, testlar yozildi.
2. ChatGPT bilan qilingan jonli sayt kodi (narx, til, takliflar, PC duel) `src/` ga qaytarildi: build natijasi jonli mantiqqa **bayt-bayt bir xil** ekani tekshirildi.
3. Rasm xatolari: 4 ta yangi o'yinning muqovasi, CDN zaxira zanjiri (boshqa CDN, keyin `/img/` proksi), katalog "yana" tugmasi.
4. **Hisoblar**: login+parol (PBKDF2-SHA256, 100k), HttpOnly sessiya, tezlik cheklovi, CSRF (Origin), D1 sinxron (saqlanganlar, tarix, o'yinlar, qurilma profili).
5. Qo'shimcha: maxfiylik izohi, o'yinlarni solishtirish, "qurilmani yangilasam?", chegirma kuzatuvi, FPS o'lchovlari (admin tasdig'i bilan),
   admin panel (`is_admin` faqat `wrangler d1 execute` bilan), email orqali tiklash (kodda tayyor, o'chiq), PWA (o'rnatish, oflayn).
6. Qurilma oynasi: kartochkalar + qidiruvli ro'yxat; o'yin sozlamalari (ekran o'lchami, grafik sifati) FPS ni qayta hisoblaydi.
7. Domen: framecheck.uk ulandi, http->https, HSTS, workers.dev o'chirildi.
8. Limit himoyasi: Static Assets, server keshi, sarlavhalar. `wrangler tail` bilan isbotlandi (statik so'rov Worker'ni ishga tushirmaydi).

## 6. Muhim qarorlar va sabablari
- **Parol tiklash emailsiz**: egasi bepul variantni tanladi; admin panel bir martalik vaqtincha parol bera oladi.
- **Admin huquqi saytdan berilmaydi** (faqat DB buyrug'i), poyga va egallab olishning oldini oladi.
- **Foydalanuvchi ma'lumoti yig'ish**: yashirincha yig'ishdan bosh tortildi. Yig'ish faqat hisob ochgan (rozilik) foydalanuvchi bilan, maxfiylik izohida yozilgan.
- **Chiqishda mahalliy nusxa tozalanadi** (muvaffaqiyatli sinxrondan keyin); boshqa hisob ma'lumoti aralashmaydi (`meta.owner`).
- **FPS sozlamalari taxmin**: qoida `pixels^-0.8` va sifat koeffitsientlari; natija "Taxminiy" deb belgilanadi, sinov sozlamasi noma'lum bo'lsa o'zgartirilmaydi.
- **Upscaling (DLSS/FSR) va ray tracing qo'shilmagan**: har o'yin uchun qo'llab-quvvatlash ma'lumoti yo'q, o'ylab topilmadi.
- **`www` ulanmagan**: statik sahifa Worker'siz berilgani uchun host bo'yicha yo'naltirib bo'lmaydi (kerak bo'lsa Cloudflare Redirect Rule).
- **Haqiqiy FPS o'lchovi faqat 3 o'yinda** (`benchmarks.json`: 15 qator). Qolgani hisoblangan taxmin.

## 7. Test va sinash
- `npm test` hozir **197 test**, hammasi o'tadi. Fayllar: auth, build, cache, compat, data, devices, extras (tiklash/FPS/admin), cs2 (CS2 sahifalari), pages (o'yin manzillari/sitemap), pwa, score, server, settings, sw, sync.

### Zamonaviy to'plam (commit qilingan, hali joylanmagan)
- **Qurilma bali** (`src/score.mjs`, `score-ui.js`): 0-100 ball + ulashiladigan rasm.
- **O'yin manzillari** `/o/<id>-<nom>` (`src/routes.mjs`, serverda `gamePage`): OG/Twitter/JSON-LD meta, `/sitemap.xml`; `wrangler.toml`da `[assets] binding = "ASSETS"`; Worker bundle'ga `GAME_NAMES`ni build.mjs qo'shadi.
- **O'yin oynasi**: skrinshotlar, treyler, qisqa tavsif (`game-media.js`; `/api/game` media maydonlari faqat steamstatic/akamaihd https manzillari).
- **Ctrl+K palitra** (`palette.js`), mobil pastki menyu, yumshoq animatsiyalar (`prefers-reduced-motion` hurmat qilinadi).
- **Uch til** (uz asosiy, ru, en): matnlar `src/data/ru.json` va `src/data/en.json` (kalit = o'zbekcha matn; ikkala fayl kalitlari bir xil bo'lishi testda tekshiriladi). Manzillar: `/`, `/ru/`, `/en/`, `/o/<id>-<nom>`, `/ru/o/...`, `/en/o/...` (`src/routes.mjs`). Server (`pageMeta`/`servePage`) har til uchun sarlavha, tavsif, `<html lang>`, canonical va hreflang beradi; sitemap har sahifani 3 tilda beradi. Til tanlash: manzil > saqlangan tanlov > uz. Eslatma: Steam tavsifi va talablari doim inglizcha (talablarni tahlil qilish inglizchaga tayanadi).
- **CS2 markazi** (yon menyuda «O‘YIN MARKAZLARI» → Counter-Strike 2): `#cs2-skinlar` (skinlar katalogi) va `#cs2-xaritalar` (xaritalar). Serverlar ro‘yxati **kechiktirilgan** (UDP/A2S Workers'da ishlamaydi, alohida xizmat kerak). Kod: `src/cs2.js` (sahifalar), `src/cs2-logic.mjs` (filtr/saralash/sahifalash), `src/cs2-names.mjs` (market nomlari, tekshiruv), `src/cs2.mjs` (Worker: `/api/cs2/prices`), migratsiya `0003_cs2_prices.sql`.
  - Ma'lumot manbalari (hammasi MIT, `THIRD_PARTY_NOTICES.md` va `/licenses/cs2-third-party.txt`): skinlar — ByMykel/CSGO-API; callout va sxematik xaritalar — sink3x/cs2-server-admin-callouts (rasmlari MIT, Valve radari emas, shuning uchun repoda saqlanadi). Yangilash: `node scripts/build-cs2-data.mjs` (natija commit qilinadi).
  - Skin rasmlari Steam'ning o‘z CDN'idan, yon menyudagi CS2 ikonkasi Steam community serveridan yuklanadi (hotlink, repoga ko‘chirilmagan). Valve radar rasmlari ataylab ishlatilmagan (huquqi noaniq).
  - Narx: **Skinport ochiq API** (`/v1/items`, kalitsiz, 1 so‘rov) dan olingan **statik snapshot** `src/data/cs2-prices.json` (eng arzon e‘lon, USD, sentda; sahifada manba va sana ko‘rsatiladi, 14 kundan eski bo‘lsa «eskirgan bo‘lishi mumkin»). Yangilash: `node scripts/build-cs2-prices.mjs` → `npm run deploy` (Skinport limiti: 5 daqiqada 8 so‘rov). Narx bo‘yicha saralash va filtr bor. **Steam Market `priceoverview` ishlatilmaydi**: Cloudflare Workers'dan Steam 429 qaytaradi (jonli sinovda tasdiqlangan) va ommaviy ro‘yxat bermaydi. Eslatma: Skinport narxi Steam Market narxidan farq qiladi (sahifada yozilgan). Kelajak: GitHub Actions + Cloudflare token bilan snapshotni avtomatik yangilash.
  - Float faqat skinning umumiy diapazoni sifatida ko‘rsatiladi (aniq listing floati yo‘q).
  - **Skin oynasi** (karta bosilganda): `<dialog>` + o‘z manzili `#cs2-skinlar/<nom>-<12 belgili id>` (orqaga tugmasi yopadi, havola ochadi). Ichida: katta rasm, tavsif/flavor/kolleksiya/keys (`src/data/cs2-skin-details.json`, ByMykel, faqat inglizcha, oyna ochilganda yuklanadi), barcha wear×variant narxlar jadvali, float zonalari chizig‘i, Steam Market/Skinport/havola nusxalash, ←/→ bilan qo‘shni skin. Skinport havolasi nomdan yoziladi (`cs2SkinportUrl`); qoida mos kelmaydigan skinlar (Doppler fazalari va h.k.) narx faylidagi `noLink` ro‘yxatida, ularga havola berilmaydi.
- Qaytarish nuqtasi: git tegi `before-modern-ui`. Deploydan keyin `/o/<id>` va `/sitemap.xml`ni jonli tekshirish, Search Console'ga sitemap yuborish kerak.
- Mahalliy: `npm run build` keyin `npm start` (http://127.0.0.1:4672). Hisoblar bilan: `npm run start:accounts` (SQLite `.data/`, git'da yo'q).
- Brauzer paneli (Claude ichidagi) eslatmalari: service worker'ni ro'yxatdan o'tkazmaydi (mahalliyda xato chiqadi, jonli HTTPS'da ishlaydi);
  `127.0.0.1` va `localhost` alohida "qurilma" sifatida ishlatiladi (ikki qurilma sinxronini sinash uchun); manzilning faqat `#` qismi o'zgarsa sahifa qayta yuklanmaydi.
- Jonli tekshirish: `curl.exe` bilan sarlavhalar, `X-Cache`; Worker chaqiruvlari `npx wrangler tail framecheck-samir --format json`.

## 8. Ma'lum tuzoqlar (takrorlamang)
- **PowerShell'da burama tirnoq** (`вЂ вЂ™ вЂњ вЂќ`) qator ichidagi matnni buzadi (bir marta `index.html` buzilgan). O'zbekcha matnli o'zgartirishni `Edit` vositasi yoki `.mjs` fayl orqali qiling.
- **Cloudflare Workers'da javob tanasi**: `clone()` ni tana boshqa `Response`ga berilishidan OLDIN oling (Node'da ishlaydi, Cloudflare'da 500). Kesh yozuvi shunday qilingan.
- `wrangler.toml` ga `routes` qo'shilsa `workers_dev` o'chadi (404): kerak bo'lsa aniq yozing.
- Konsolda o'zbekcha belgilar buzuq ko'rinishi mumkin (faqat ko'rsatish); fayllar UTF-8 va to'g'ri.
- Kompyuterdagi Python buzuq o'rnatilgan: `portable.py` sinalmagan.
- Bir vaqtda ko'p test fayli build qiladi: `build.mjs` o'zgarmagan faylni qayta yozmaydi (poyga tuzatilgan).
- `data-tmp/`, `.data/`, `*.tmp` git'da yo'q bo'lishi kerak.
- **PowerShell 5.1 `Set-Content -Encoding utf8` fayl boshiga BOM qo'yadi**: `build.mjs` `^import` qatorlarini topolmay, Worker buziladi. Fayllarni `Edit` bilan o'zgartiring. PowerShell `-replace` katta-kichik harfni farqlamaydi (`-creplace` ishlating).

## Telegram bot (@FrameCheckBot)
- Kod: `src/bot-*.mjs` (matnlar `bot-text`, Telegram API `bot-tg`, statistika `bot-stats`, mantiq `bot-engine`, yangilanishlarni qayta ishlash `bot-core`, xabarnomalar/cron `bot-notify`). Jadvallar: `migrations/0005_bot.sql`. Webhook: `POST /api/bot/webhook` (`server.mjs`). Admin raqamlari: `GET /api/admin/bot` + admin oynasidagi "Telegram bot" bo'limi.
- Worker to'plamiga katalog, CS2 skinlari va narx snapshot'i `build.mjs` orqali konstantalar sifatida kiradi (Node'da `bot-data.mjs`). Narx o'zgarish xabarlari faqat snapshot yangilanib qayta joylanganda ishlaydi.
- Maxfiy kalitlar faqat Worker secret'larida: `BOT_TOKEN`, `BOT_WEBHOOK_SECRET`, `BOT_ADMIN_IDS` (vergul bilan Telegram id'lar). Hech qachon Git'ga yoki faylga yozilmaydi. `BOT_USERNAME` ixtiyoriy (standart FrameCheckBot).
- Ulash: `scripts/bot-setup.mjs` (token muhit o'zgaruvchisidan; webhook, buyruqlar, tavsif, menyu tugmasi, inline/guest sozlamalari). Bot rasmi BotFather orqali qo'lda qo'yiladi.
- Cron: har 3 soatda (`wrangler.toml`), bitta Steam so'rovi va ko'pi bilan 30 xabar. Cheklovlar: xabar tezligi (5 soniyada 6, minutda 40), `update_id` takrori e'tiborga olinmaydi.
- Mini App: bot `?src=tg&go=<sahifa>` bilan saytni ochadi; `client.js` Telegram skriptini faqat shunda yuklaydi. Telegram Web uchun `frame-ancestors https://web.telegram.org` ruxsat etilgan.

## 9. Keyingi vazifalar (ustuvorlik bo'yicha)
**A. BAJARILDI (2026-11-24): "Ma'lumot yetarli emas" kamaytirildi.** Qaytish nuqtasi: tag `before-unknown-fix`.
   - Natija (215 o'yin, noma'lumlar soni oldin -> keyin): to'liq stol kompyuteri 47 -> 1; Ryzen noutbuk ("AMD Radeon Graphics") 168 -> 1; Intel umumiy grafika 168 -> 1;
     MX250 noutbuk 211 -> 0; versiyasiz "Windows" 215 -> 4; Vivobook 34 -> 0; eski kompyuter 22 -> 15. Hech narsa kiritilmagan qurilmada 215 (to'g'ri).
   - Nima qilindi (`src/compat.mjs`): Windows matnidan `В®/в„ў/(64-bit)` tozalanadi; Windows 10 build raqami bo'lmasa 22H2 (19045) deb olinadi; versiyasiz "Windows" 10/11 deb
     olinadi (izoh bilan); modelsiz GPU talablari (DirectX/VRAM/Shader Model) va CPU talablari ("Intel Core i5", "i5-9th Gen", "R3", "4 yadroli", "64-bit") darajaga solishtiriladi,
     lekin kuchsiz qurilma bunda "low" emas, "na" bo'ladi; umumiy ichki grafika nomi protsessordan taxmin qilinadi (`inferGpuClass`, izoh chiqadi); MX seriyasi va eski kartalar
     (GTX 680, GT 640, 8800GT, HD 5870...) jadvalga qo'shildi; natijada `unknownParts` bor va "Ma'lumot yetarli emas" belgisi ustida qaysi qism noma'lumligi chiqadi.
   - **Topilgan va tuzatilgan eski xato:** `cpuClass` 4 xonali "1xxx" Intel modellarini (i5-1135G7, i5-1235U, i7-1165G7) 1-avlod deb o'qirdi (sinf 1-2, noto'g'ri "tavsiya etilmaydi").
     Endi `intelGen()` birinchi ikki raqamni oladi (11/12/13-avlod).
   - Himoya: `test/fixtures/ratings-before.json` (8 qurilma x 215 o'yin surati) va `test/unknown.test.mjs`: oldin aniq bo'lgan hech bir baho o'zgarmasligi tekshiriladi, noma'lumlar soni chegaradan oshmaydi.
   - Qolgan noma'lumlar: ma'lumot tomonidan (Lethal Company'da RAM yo'q; Windows 11 talab qilgan o'yinlar va versiyasiz Windows; "4 GB VRAM + OpenGL" kabi talablar).
**B. Cloudflare panelida egasi qiladigan sozlamalar** (kodda qilib bo'lmaydi; yo'riq README da):
   *Always Use HTTPS*; *Browser Cache TTL = Respect Existing Headers*; WAF Rate limiting (`/api/*` va `/img/*`, IP bo'yicha ~50 so'rov/10 s, Block); `flamecheck.bid` avtomatik yangilashini o'chirish.
**C. Git zaxirasi**: repoda **uzoq nusxa (remote) yo'q**. Egasi GitHub'da yopiq repo ochishi, keyin `git remote add origin ...` va `git push -u origin master --tags`.
**D. Android ilova (APK)**: Bubblewrap bilan TWA. Domen endi tayyor (framecheck.uk). Kerak: ilova nomi, paket nomi (masalan `uk.framecheck.app`), imzo kaliti (keystore, egasi saqlaydi, repoga tushmaydi),
   JDK/Android SDK yuklashga ruxsat; saytga `/.well-known/assetlinks.json` va statik `/maxfiylik` sahifasi qo'shiladi. Telefonda ochilishini egasi tekshiradi (bu kompyuterda emulyator yo'q).
**E. G'oyalar zaxirasi** (egasi tanlaydi): Telegram orqali chegirma xabari (bot tokeni egasi `wrangler secret` bilan); narxni so'mda ko'rsatish (CBU kursi);
   Steam kutubxonasini tekshirish (Steam API kalit); ulashish kartochkasi + har o'yinga alohida manzil + OG teglar + `sitemap.xml`; Pit Stop mini-o'yini;
   katalog filtrlari (chegirma, tekin, narx/FPS bo'yicha tartib); Cloudflare Turnstile (ro'yxatdan o'tishda bot himoyasi); o'zbek kirill va ingliz tillari;
   xato monitoringi; CSP (hozir ichki skriptlar ko'p); sahifa hajmini kamaytirish (1.17 MB base64 rasm); CI; Resend (domen tasdig'i kerak) bilan email tiklash;
   haqiqiy FPS ma'lumotini ko'paytirish (foydalanuvchi o'lchovlari + admin tasdig'i bor).

## 10. Ma'lum kamchiliklar (halol baho)
FPS asosan taxmin (faqat 3 o'yinda o'lchov); API cheklovi yo'q (B bandi bilan yopiladi); qidiruvda har o'yinning o'z manzili yo'q; CSP yo'q;
sahifa og'ir; ro'yxatdan o'tishda CAPTCHA yo'q; qurilma nomlari jadvali qo'lda yozilgan (yangi/noyob modellar tanilmasligi mumkin);
chalg'ituvchi "Vivobook uchun taxmin" yorlig'i qurilma noma'lum bo'lganda boshqa foydalanuvchiga chiqadi; UI avtomatik testlari yo'q (qo'lda sinaladi).

## 11. Yangi sessiyani boshlash
1. `git status`, `git log --oneline -5`, `npm test` (189 o'tishi kerak).
2. Egasidan so'rang: A bandi (tuzatishni boshlash) yoki boshqa vazifa; B/C bandlari bajarilganmi.
3. Joylashdan oldin: `git tag` qo'ying, testlar o'tsin, keyin `npm run deploy` va jonli tekshiruv.
