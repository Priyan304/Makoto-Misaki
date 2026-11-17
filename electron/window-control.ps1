param([Parameter(Mandatory=$true)][string]$Payload)
$ErrorActionPreference = 'Stop'
$request = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class MisakiInput {
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L,T,R,B; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSE { public int x,y; public uint data,flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct KEY { public ushort vk,scan; public uint flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Explicit)] public struct UNION { [FieldOffset(0)] public MOUSE mouse; [FieldOffset(0)] public KEY key; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public UNION u; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int cmd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr h);
  [StructLayout(LayoutKind.Sequential)] public struct MSG { public IntPtr h; public uint message; public UIntPtr w; public IntPtr l; public uint time; public POINT pt; public uint extra; }
  [DllImport("user32.dll")] public static extern bool PeekMessage(out MSG msg,IntPtr h,uint min,uint max,uint flags);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint msg,IntPtr w,IntPtr l);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr h,ref POINT p);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint flags);
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern uint SendInput(uint n,INPUT[] inputs,int size);
  public static void Send(INPUT[] items) { if(SendInput((uint)items.Length,items,Marshal.SizeOf(typeof(INPUT))) != items.Length) throw new Exception("Windows blocked input."); }
  public static void Key(ushort value,bool unicode) {
    var a=new INPUT{type=1}; if(unicode) {a.u.key.scan=value; a.u.key.flags=4;} else a.u.key.vk=value;
    var b=a; b.u.key.flags |= 2; Send(new[]{a,b});
  }
  public static void Mouse(uint flags,int data=0) { var a=new INPUT(); a.u.mouse.flags=flags; a.u.mouse.data=unchecked((uint)data); Send(new[]{a}); }
}
'@
function WindowInfo([IntPtr]$targetHandle) {
  if (-not [MisakiInput]::IsWindow($targetHandle)) { throw 'Window unavailable.' }
  $title = [Text.StringBuilder]::new(1024)
  [void][MisakiInput]::GetWindowText($targetHandle,$title,1024)
  [uint32]$targetProcessId = 0
  [void][MisakiInput]::GetWindowThreadProcessId($targetHandle,[ref]$targetProcessId)
  $process = Get-Process -Id $targetProcessId
  return @{ title=$title.ToString(); application=$process.ProcessName }
}
if ($request.operation -eq 'active') {
  WindowInfo ([MisakiInput]::GetForegroundWindow()) | ConvertTo-Json -Compress
  exit
}
if ($request.handle -notmatch '^\d{1,20}$') { throw 'Invalid window handle.' }
$targetHandle = [IntPtr]::new([long]::Parse($request.handle))
$info = WindowInfo $targetHandle
if ($info.title -cne $request.title) { throw 'Window changed. Share it again.' }
if ($request.operation -eq 'close_application') {
  if (-not [MisakiInput]::PostMessage($targetHandle,0x10,[IntPtr]::Zero,[IntPtr]::Zero)) { throw 'Windows declined close.' }
  @{status='completed';message='Close requested. Save or cancel any application prompt yourself.'} | ConvertTo-Json -Compress
  exit
}
if ($info.application -notin @('notepad','CalculatorApp','Calculator','mspaint')) { throw 'Input is supported only in Notepad, Calculator and Paint.' }
if ($request.operation -eq 'type_text' -and $info.application -ne 'notepad') { throw 'Literal typing is supported only in Notepad.' }
[void][MisakiInput]::ShowWindowAsync($targetHandle,9)
if ([MisakiInput]::GetForegroundWindow() -ne $targetHandle) {
  [uint32]$foregroundProcess = 0
  $foregroundThread = [MisakiInput]::GetWindowThreadProcessId([MisakiInput]::GetForegroundWindow(),[ref]$foregroundProcess)
  $currentThread = [MisakiInput]::GetCurrentThreadId()
  $queue = [MisakiInput+MSG]::new(); [void][MisakiInput]::PeekMessage([ref]$queue,[IntPtr]::Zero,0,0,0)
  [uint32]$targetProcess = 0
  $targetThread = [MisakiInput]::GetWindowThreadProcessId($targetHandle,[ref]$targetProcess)
  $attached = $false; $attachedTarget = $false
  try {
    if ($foregroundThread -ne $currentThread) { $attached = [MisakiInput]::AttachThreadInput($currentThread,$foregroundThread,$true) }
    if ($targetThread -ne $currentThread -and $targetThread -ne $foregroundThread) { $attachedTarget = [MisakiInput]::AttachThreadInput($currentThread,$targetThread,$true) }
    [void][MisakiInput]::BringWindowToTop($targetHandle)
    [void][MisakiInput]::SetForegroundWindow($targetHandle)
  } finally {
    if ($attachedTarget) { [void][MisakiInput]::AttachThreadInput($currentThread,$targetThread,$false) }
    if ($attached) { [void][MisakiInput]::AttachThreadInput($currentThread,$foregroundThread,$false) }
  }
}
Start-Sleep -Milliseconds 100
function AssertTarget {
  if ([MisakiInput]::GetForegroundWindow() -ne $targetHandle) { throw 'Focus changed; action stopped.' }
  foreach ($key in @(16,17,18,91,92)) { if ([MisakiInput]::GetAsyncKeyState($key) -lt 0) { throw 'Release modifier keys before retrying.' } }
}
AssertTarget
switch ($request.operation) {
  'click_mouse' {
    $rect = [MisakiInput+RECT]::new(); [void][MisakiInput]::GetClientRect($targetHandle,[ref]$rect)
    if ($request.x -lt 0 -or $request.y -lt 0 -or $request.x -ge $rect.R -or $request.y -ge $rect.B) { throw 'Click is outside the window.' }
    $point=[MisakiInput+POINT]::new(); $point.X=$request.x; $point.Y=$request.y
    [void][MisakiInput]::ClientToScreen($targetHandle,[ref]$point)
    if ([MisakiInput]::GetAncestor([MisakiInput]::WindowFromPoint($point),2) -ne $targetHandle) { throw 'Another window covers the click.' }
    [void][MisakiInput]::SetCursorPos($point.X,$point.Y); AssertTarget
    [MisakiInput]::Mouse(2); [MisakiInput]::Mouse(4)
  }
  'type_text' { foreach ($character in $request.text.ToCharArray()) { AssertTarget; [MisakiInput]::Key([uint16]$character,$true) } }
  'press_key' {
    $keys=@{Enter=13;Tab=9;Escape=27;Backspace=8;Left=37;Right=39;Up=38;Down=40;Home=36;End=35;PageUp=33;PageDown=34}
    if (-not $keys.ContainsKey($request.key)) { throw 'Unsupported key.' }
    [MisakiInput]::Key($keys[$request.key],$false)
  }
  'scroll_window' { [MisakiInput]::Mouse(0x800,([int]$request.steps * 120)) }
  default { throw 'Unsupported operation.' }
}
@{status='completed';message='Approved input delivered to the selected window.'} | ConvertTo-Json -Compress
