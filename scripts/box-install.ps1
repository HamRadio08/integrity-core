# Register the Alienware as the live desk: pull main, bind 0.0.0.0:43173, stay up.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

npm run box -- --install --track-main
if ($LASTEXITCODE -ne 0) { throw "box-up failed" }

$sync = "-NoProfile -ExecutionPolicy Bypass -Command `"Set-Location '$Root'; npm run box -- --track-main`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $sync
$logon = New-ScheduledTaskTrigger -AtLogOn
$repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
try {
  Unregister-ScheduledTask -TaskName "IntegrityDeskBox" -Confirm:$false -ErrorAction SilentlyContinue
} catch {}
Register-ScheduledTask -TaskName "IntegrityDeskBox" -Action $action -Trigger @($logon, $repeat) -Description "Stack attestation desk on the Alienware. Tracks origin/main." | Out-Null
Write-Host "[box] scheduled IntegrityDeskBox (logon + every 5 min). Desk: http://<this-host>:43173/"
