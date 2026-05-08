$desktop = [Environment]::GetFolderPath("Desktop")
$appDir = "C:\Users\18258\Desktop\Claude Code GUI"
$shortcutPath = Join-Path $desktop "Claude Code GUI.lnk"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)

$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = """$appDir\launcher.vbs"""
$shortcut.WorkingDirectory = $appDir
$shortcut.Description = "Claude Code GUI - Beautiful desktop client for Claude Code"
$shortcut.Save()

Write-Host "Shortcut created at: $shortcutPath"
