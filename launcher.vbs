' Launcher for Claude Code GUI - hides console window
Dim shell, appDir
appDir = "C:\Users\18258\Desktop\Claude Code GUI"
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = appDir
shell.Run "npx electron . --no-sandbox", 0, False
Set shell = Nothing
