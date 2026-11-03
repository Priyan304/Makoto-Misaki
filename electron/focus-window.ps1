param([Parameter(Mandatory=$true)][string]$Handle, [Parameter(Mandatory=$true)][string]$ExpectedTitle)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MisakiWindow {
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr handle);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr handle, int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr handle);
}
'@
if ($Handle -notmatch '^\d{1,20}$') { throw 'Invalid window.' }
$targetHandle = [IntPtr]::new([long]::Parse($Handle))
if (-not [MisakiWindow]::IsWindow($targetHandle)) { throw 'Window unavailable.' }
$windowTitle = [Text.StringBuilder]::new(1024)
[void][MisakiWindow]::GetWindowText($targetHandle, $windowTitle, $windowTitle.Capacity)
if ($windowTitle.ToString() -cne $ExpectedTitle) { throw 'Window changed.' }
[void][MisakiWindow]::ShowWindowAsync($targetHandle, 9)
if (-not [MisakiWindow]::SetForegroundWindow($targetHandle)) { throw 'Windows declined focus.' }
