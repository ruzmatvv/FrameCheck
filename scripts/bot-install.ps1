# Run in your own PowerShell terminal (from the project folder):  .\scripts\bot-install.ps1
# Asks for the bot token (typing is hidden), stores it and a random webhook secret as Worker secrets, then connects the webhook.
# Nothing is written to a file; the token is passed to wrangler through a pipe and to Node through an environment variable of this window only.
$secure = Read-Host "Bot tokenini kiriting (yozganingiz ko'rinmaydi)" -AsSecureString
$token = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($token -notmatch '^\d{6,}:[\w-]{30,}$') { Write-Host "Token shakli noto'g'ri."; exit 1 }
$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
$token | npx wrangler secret put BOT_TOKEN
$secret | npx wrangler secret put BOT_WEBHOOK_SECRET
$env:BOT_TOKEN = $token; $env:BOT_WEBHOOK_SECRET = $secret
node scripts/bot-setup.mjs
Remove-Item Env:BOT_TOKEN, Env:BOT_WEBHOOK_SECRET
Write-Host "Tayyor. Endi botga /id yozing va raqamni Claude'ga yuboring."
