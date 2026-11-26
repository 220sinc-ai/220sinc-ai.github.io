# Autostart for the PDA-2M server (serve.ps1). Run once.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverScript = Join-Path $root 'serve.ps1'
$taskName = 'PDA-2M Server'
$user = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ("-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"" + $serverScript + "`" -NoBrowser -Lan") -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Scheduled task '$taskName' created for $user (starts at logon)."

try {
    New-NetFirewallRule -DisplayName 'PDA-2M port 8080' -Direction Inbound -Protocol TCP -LocalPort 8080 -Action Allow -Profile Private -ErrorAction Stop | Out-Null
    Write-Output 'Firewall rule added: TCP 8080 allowed on private networks.'
} catch {
    Write-Output 'Firewall rule not added (administrator rights needed). Allow port 8080 manually if phones cannot connect.'
}

try {
    Start-ScheduledTask -TaskName $taskName
    Write-Output 'Task started.'
} catch {
    Write-Output 'Task not started (server may already be running).'
}
