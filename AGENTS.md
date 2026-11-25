# FrameCheck: AI yordamchilar uchun qoidalar

Bu faylni Codex va Google Antigravity o'zi o'qiydi, Claude Code esa `CLAUDE.md` orqali. Qoida o'zgarsa faqat shu faylni tahrirlang.

## Loyiha
- Jonli sayt: https://framecheck.uk (Cloudflare Worker `framecheck-samir`, D1 baza `framecheck-db`, Telegram bot @FrameCheckBot).
- Batafsil tuzilma va tarix: `PROJECT_CONTEXT.md`. Umumiy ma'lumot: `README.md`.
- Hamroh sayt https://flamecheck.bid alohida repozitoriyda: `ruzmatvv/FlameCheck`. Bu yerdagi `flamecheck/` papkasi eski nusxa: uni tahrirlamang.
- Node versiyasi `.node-version` da. Tashqi paketlar yo'q; `wrangler` faqat `npx` orqali.

## Buyruqlar
| Buyruq | Vazifa |
| --- | --- |
| `npm test` | barcha testlar |
| `npm run build` | `dist/` ni yasash |
| `npm start` | mahalliy sayt (http://127.0.0.1:4672) |
| `npm run db:migrate` | jonli bazaga migratsiya (faqat egasining ruxsati bilan) |
| `npm run deploy` | qo'lda joylash (faqat egasining ruxsati bilan) |

## Majburiy qoidalar
1. Egasiga **o'zbek (lotin)** tilida javob bering. Kod va fayl nomlari inglizcha.
2. Parol, token, API kalit, `.env`, `.dev.vars` **hech qachon** Git'ga yoki chatga yozilmaydi. Bot kalitlari faqat Worker secret'larida.
3. `main` tarmog'i jonli saytga tegishli: unga to'g'ridan-to'g'ri push qilmang. `ai/<vosita>/<mavzu>` tarmog'ida ishlang va pull request oching.
   `main` ga qo'shish faqat egasi aniq "joyla" deganda.
4. Dizayn va mavjud funksiyalarni so'ralmasa o'zgartirmang. Katta ishdan oldin tushuntirib, ruxsat oling.
5. Faqat haqiqiy, manbasi bor ma'lumot. FPS, narx yoki raqam o'ylab topmang. Taxminiy FPS "taxminiy" deb belgilanadi.
6. Cloudflare sozlamalari, domenlar, D1 bazasi va secret'larni ruxsatsiz o'zgartirmang. Pullik xizmat yoqmang.
7. Ma'lumot yoki faylni o'chirishdan oldin ruxsat so'rang. `git push --force` qilmang.
8. Har bir muhim o'zgarishdan keyin `npm test` o'tsin, keyin commit.

## Tuzoqlar
- `build.mjs` modullarni bitta global scope'ga yig'adi: yuqori darajadagi nomlar takrorlanmasin.
- Fayllar baytma-bayt saqlanadi (`.gitattributes`). Fayl boshiga BOM qo'ymang (Windows PowerShell `-Encoding utf8` qo'yadi).
- Yangi migratsiya: `migrations/applied.txt` dagi izohni o'qing.
- `Framecheck.html` build natijasi, lekin repoda saqlanadi.

## CS2 ma'lumotlari (ikki saytga umumiy)
Asosiy nusxa shu yerda: `src/cs2-logic.mjs`, `src/cs2-names.mjs`, `src/data/cs2-*`, `src/cs2/maps` (Telegram bot ham ishlatadi).
Narx yangilangach (`node scripts/build-cs2-prices.mjs`) FlameCheck repozitoriyida `npm run sync` ishlating.
