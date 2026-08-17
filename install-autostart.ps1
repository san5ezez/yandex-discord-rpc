$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $MyInvocation.MyCommand.Path
$startup = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startup 'Yandex Music Discord RPC.lnk'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $project 'start-bridge.cmd'
$shortcut.WorkingDirectory = $project
$shortcut.WindowStyle = 7
$shortcut.Description = 'Yandex Music Discord RPC bridge'
$shortcut.Save()
Write-Host "Autostart installed: $shortcutPath"
