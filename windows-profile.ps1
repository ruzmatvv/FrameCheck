$ErrorActionPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$processor = Get-CimInstance -ClassName Win32_Processor | Select-Object -First 1
$system = Get-CimInstance -ClassName Win32_ComputerSystem
$systemOS = Get-CimInstance -ClassName Win32_OperatingSystem
$videoModels = @(Get-CimInstance -ClassName Win32_VideoController | ForEach-Object { $_.Name } | Where-Object { $_ })
$modules = @(Get-CimInstance -ClassName Win32_PhysicalMemory | Where-Object { $_.Capacity -gt 0 })
$capacity = ($modules | Measure-Object -Property Capacity -Sum).Sum
if (-not $capacity) { $capacity = $system.TotalPhysicalMemory }
$ramGB = if ($capacity) { [math]::Round($capacity / 1GB) } else { $null }
$kind = if ($system.PCSystemType -eq 2) { 'laptop' } elseif ($system.PCSystemType -in @(1,3)) { 'desktop' } else { '' }
$cpuName = $processor.Name
if (-not $cpuName) { $cpuName = (Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0').ProcessorNameString }
$model = $system.Model
if (-not $model) { $model = (Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\BIOS').SystemProductName }
$osName = $systemOS.Caption
if (-not $osName) {
    $info = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $build = [int]$info.CurrentBuildNumber
    $osName = if ($build -ge 22000) { "Windows 11" } elseif ($build -ge 10240) { "Windows 10" } else { $info.ProductName }
}
if (-not $kind -and $model -match 'Laptop|Notebook|VivoBook|ThinkPad|MacBook') { $kind = 'laptop' }
if (-not $ramGB) {
    Add-Type -AssemblyName Microsoft.VisualBasic
    $machineInfo = New-Object Microsoft.VisualBasic.Devices.ComputerInfo
    if ($machineInfo.TotalPhysicalMemory) { $ramGB = [math]::Round($machineInfo.TotalPhysicalMemory / 1GB) }
}
if (-not $videoModels.Count) {
    $videoModels = @(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Video\*\0000' |
        ForEach-Object { $_.DriverDesc } | Where-Object { $_ } | Select-Object -Unique)
}
[ordered]@{name=$model;cpu=$cpuName;gpus=$videoModels;ram=$ramGB;modules=$modules.Count;kind=$kind;os=$osName} | ConvertTo-Json -Depth 3 -Compress
