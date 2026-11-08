' Star Typing Web: separate app window, always on top, no console windows.
' Double-click. Details: scripts\StarTyping-OnTop.pyw
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
here = fso.GetParentFolderName(WScript.ScriptFullName)
root = fso.GetParentFolderName(here)
pyw = root & "\backend\.venv\Scripts\pythonw.exe"
If Not fso.FileExists(pyw) Then pyw = "pythonw.exe"
sh.Run """" & pyw & """ """ & here & "\StarTyping-OnTop.pyw""", 0, False
