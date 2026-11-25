# Loyihalarni Claude, Codex va Google Antigravity orqali boshqarish

Repozitoriylar: `ruzmatvv/FrameCheck` (framecheck.uk) va `ruzmatvv/FlameCheck` (flamecheck.bid).
Uchala vosita bir xil qoidaga amal qiladi: `AGENTS.md`.

## Ulash
| Vosita | Kompyuterda | Telefonda / bulutda |
| --- | --- | --- |
| Claude Code | loyiha papkasini oching | Remote Control, yoki claude.ai/code da GitHub'ni ulab repozitoriyni tanlang |
| Codex | loyiha papkasida `codex` | chatgpt.com/codex da GitHub'ni ulab repozitoriyni tanlang |
| Antigravity | loyiha papkasini oching | GitHub orqali repozitoriy bilan ishlaydigan Antigravity vositasi |

GitHub'ga ruxsat berayotganda faqat shu ikki repozitoriyni tanlang ("Only select repositories").

## Ish tartibi
1. AI `ai/<vosita>/<mavzu>` tarmog'ida o'zgartiradi va pull request ochadi.
2. GitHub testlarni o'zi ishga tushiradi (yashil belgi = o'tdi).
3. Siz tekshirib, "Merge" bosasiz. Cloudflare avtomatik deploy ulangan bo'lsa, `main` ga tushgan kod jonli saytga chiqadi.

Bir vaqtning o'zida ikki vosita bitta fayllarni o'zgartirmasin. Ishni boshlashdan oldin `git pull` qiling.

## Namuna so'rov
> AGENTS.md ni o'qi. `ai/codex/qidiruv` tarmog'ida ... ni tuzat, testlarni ishga tushir va pull request och. main ga qo'shma.

## Xatoni qaytarish
GitHub'da qo'shilgan pull request ichidagi **Revert** tugmasi, yoki Cloudflare panelida Worker → Deployments → oldingi versiyaga **Rollback**.
Rollback bazani (D1) orqaga qaytarmaydi.
