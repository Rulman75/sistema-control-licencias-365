<#
.SYNOPSIS
  Auditoría y Liberación de Licencias en Cuentas Bloqueadas (accountEnabled = false)
  en Microsoft 365 CMDS Antofagasta (@cmds.cl, @cmds-salud.cl, @cmds-educacion.cl).

.DESCRIPTION
  Por defecto se ejecuta en MODO AUDITORÍA (SOLO LECTURA) y exporta al Escritorio
  el listado completo de cuentas bloqueadas que aún tienen licencias asignadas.
  Solo retira licencias cuando se indica explícitamente el parámetro -Ejecutar.

.EXAMPLE
  # 1. Auditoría segura (NO modifica nada, genera reporte CSV en el Escritorio):
  powershell -ExecutionPolicy Bypass -File .\liberar-licencias-bloqueadas-m365.ps1

.EXAMPLE
  # 2. Auditoría filtrada a un solo dominio:
  powershell -ExecutionPolicy Bypass -File .\liberar-licencias-bloqueadas-m365.ps1 -Dominio "cmds-educacion.cl"

.EXAMPLE
  # 3. Prueba real con 1 sola cuenta bloqueada:
  powershell -ExecutionPolicy Bypass -File .\liberar-licencias-bloqueadas-m365.ps1 -SoloUsuario "cuenta@cmds.cl" -Ejecutar

.EXAMPLE
  # 4. Liberación real de licencias en todas las cuentas bloqueadas (o de un dominio):
  powershell -ExecutionPolicy Bypass -File .\liberar-licencias-bloqueadas-m365.ps1 -Ejecutar
  powershell -ExecutionPolicy Bypass -File .\liberar-licencias-bloqueadas-m365.ps1 -Dominio "cmds-educacion.cl" -Ejecutar
#>

param(
  [switch]$Ejecutar,
  [ValidateSet("", "cmds.cl", "cmds-salud.cl", "cmds-educacion.cl")]
  [string]$Dominio = "",
  [string]$SoloUsuario = "",
  [int]$Limite = 0,
  [string]$SalidaAuditoria = "$env:USERPROFILE\Desktop\Cuentas_Bloqueadas_Con_Licencia_M365.csv",
  [string]$SalidaLog = "$env:USERPROFILE\Desktop\Resultado_Liberacion_Bloqueadas_M365.csv"
)

$ErrorActionPreference = "Stop"

$DOMINIOS_OFICIALES = @("cmds.cl", "cmds-salud.cl", "cmds-educacion.cl")

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  CMDS Antofagasta — Cuentas Bloqueadas con Licencia (Microsoft 365)" -ForegroundColor Cyan
if ($Ejecutar) {
  Write-Host "  Modo: EJECUCIÓN REAL (RETIRO DE LICENCIAS EN MICROSOFT 365)" -ForegroundColor Red
} else {
  Write-Host "  Modo: AUDITORÍA SOLO LECTURA (No modifica ninguna cuenta)" -ForegroundColor Yellow
}
Write-Host "=====================================================================" -ForegroundColor Cyan

# Verificar módulos Microsoft Graph (sin Exchange Online -> cero conflicto MSAL)
foreach ($mod in @("Microsoft.Graph.Users", "Microsoft.Graph.Users.Actions", "Microsoft.Graph.Identity.DirectoryManagement")) {
  if (-not (Get-Module -ListAvailable -Name $mod)) {
    Write-Host "[INFO] Instalando módulo oficial '$mod' (solo primera vez)..." -ForegroundColor Yellow
    Install-Module -Name $mod -Scope CurrentUser -Force -AllowClobber
  }
}

Import-Module Microsoft.Graph.Users -ErrorAction Stop
Import-Module Microsoft.Graph.Users.Actions -ErrorAction Stop
Import-Module Microsoft.Graph.Identity.DirectoryManagement -ErrorAction Stop

$scopes = if ($Ejecutar) { @("User.ReadWrite.All", "Organization.Read.All") } else { @("User.Read.All", "Organization.Read.All") }
Write-Host "[INFO] Iniciando sesión en Microsoft Graph..." -ForegroundColor Cyan
Connect-MgGraph -Scopes $scopes -NoWelcome

# Mapear nombres legibles de SKUs contratados en el tenant
$skuMap = @{}
try {
  $skus = Get-MgSubscribedSku -All
  foreach ($s in $skus) {
    $skuMap[$s.SkuId.ToString().ToLower()] = $s.SkuPartNumber
  }
} catch {
  Write-Warning "No se pudo consultar tabla de nombres de SKU; se mostrarán GUIDs."
}

Write-Host "[INFO] Consultando cuentas con inicio de sesión bloqueado (accountEnabled = false)..." -ForegroundColor Cyan
$blockedUsers = Get-MgUser -Filter "accountEnabled eq false" -All -Property "Id,DisplayName,UserPrincipalName,Department,JobTitle,AccountEnabled,AssignedLicenses,CreatedDateTime"

# Filtrar por dominios oficiales CMDS y por cuentas que tengan al menos 1 licencia asignada
$candidatas = New-Object System.Collections.Generic.List[object]

foreach ($u in $blockedUsers) {
  $upn = if ($u.UserPrincipalName) { $u.UserPrincipalName.Trim().ToLower() } else { "" }
  if (-not $upn.Contains("@")) { continue }
  $dom = $upn.Split("@")[1]
  if ($DOMINIOS_OFICIALES -notcontains $dom) { continue }
  if ($Dominio -ne "" -and $dom -ne $Dominio.ToLower()) { continue }
  if ($SoloUsuario -ne "" -and $upn -ne $SoloUsuario.Trim().ToLower()) { continue }

  $assigned = @($u.AssignedLicenses)
  if ($assigned.Count -eq 0) { continue }

  $skuIds = @($assigned | ForEach-Object { $_.SkuId.ToString().ToLower() })
  $skuNames = @($skuIds | ForEach-Object { if ($skuMap.ContainsKey($_)) { $skuMap[$_] } else { $_ } })

  $candidatas.Add([PSCustomObject]@{
    ObjectId         = $u.Id
    DisplayName      = $u.DisplayName
    Correo           = $upn
    Dominio          = $dom
    Departamento     = $u.Department
    Cargo            = $u.JobTitle
    CantidadLicencias = $skuIds.Count
    Licencias        = ($skuNames -join " + ")
    SkuIds           = $skuIds
  })
}

if ($Limite -gt 0 -and $candidatas.Count -gt $Limite) {
  $candidatas = [System.Collections.Generic.List[object]]($candidatas | Select-Object -First $Limite)
}

Write-Host ""
Write-Host "[RESUMEN] Total cuentas bloqueadas (accountEnabled=false) en tenant: $($blockedUsers.Count)" -ForegroundColor Cyan
Write-Host "[RESUMEN] Bloqueadas en dominios CMDS que AÚN consumen licencia: $($candidatas.Count)" -ForegroundColor $(if ($candidatas.Count -gt 0) { 'Yellow' } else { 'Green' })

if ($candidatas.Count -gt 0) {
  Write-Host ""
  Write-Host "--- Desglose por Dominio ---" -ForegroundColor Cyan
  $candidatas | Group-Object Dominio | ForEach-Object {
    Write-Host ("  @{0}: {1} cuentas" -f $_.Name, $_.Count) -ForegroundColor White
  }
}

# Exportar siempre el reporte de auditoría (sin columna interna SkuIds)
$candidatas |
  Select-Object ObjectId, DisplayName, Correo, Dominio, Departamento, Cargo, CantidadLicencias, Licencias |
  Export-Csv -Path $SalidaAuditoria -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "[OK] Reporte de auditoría guardado en: $SalidaAuditoria" -ForegroundColor Green

if (-not $Ejecutar) {
  Write-Host ""
  Write-Host "[INFO] Modo AUDITORÍA finalizado. Ninguna cuenta fue modificada." -ForegroundColor Yellow
  Write-Host "       Revisa el CSV en tu Escritorio y cuando quieras retirar estas licencias ejecuta:" -ForegroundColor Yellow
  Write-Host "       .\liberar-licencias-bloqueadas-m365.ps1 -Ejecutar" -ForegroundColor White
  Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
  exit 0
}

if ($candidatas.Count -eq 0) {
  Write-Host "[OK] No hay cuentas bloqueadas con licencias para liberar." -ForegroundColor Green
  Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null
  exit 0
}

# ==============================================================================
# EJECUCIÓN REAL: RETIRO DE LICENCIAS EN CUENTAS BLOQUEADAS
# ==============================================================================
$resultados = New-Object System.Collections.Generic.List[object]
$okCount = 0
$errCount = 0
$idx = 0
$total = $candidatas.Count

foreach ($c in $candidatas) {
  $idx++
  $pct = [math]::Round(($idx / $total) * 100, 1)
  Write-Progress -Activity "Liberando licencias de cuentas bloqueadas" -Status "[$idx/$total - $pct%] $($c.Correo)" -PercentComplete $pct

  $estado = "OK"
  $detalle = ""

  try {
    Set-MgUserLicense -UserId $c.ObjectId -AddLicenses @() -RemoveLicenses $c.SkuIds | Out-Null
    $okCount++
    $detalle = "Retiradas $($c.CantidadLicencias) licencia(s): $($c.Licencias)"
    Write-Host "  [OK $idx/$total] $($c.Correo) -> $detalle" -ForegroundColor Green
  } catch {
    $errCount++
    $estado = "ERROR"
    $detalle = $_.Exception.Message
    Write-Host "  [ERROR $idx/$total] $($c.Correo): $detalle" -ForegroundColor Red
  }

  $resultados.Add([PSCustomObject]@{
    FechaHora    = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    Correo       = $c.Correo
    Dominio      = $c.Dominio
    Departamento = $c.Departamento
    LicenciasRetiradas = $c.Licencias
    Estado       = $estado
    Detalle      = $detalle
  })
}

Write-Progress -Activity "Liberando licencias de cuentas bloqueadas" -Completed
Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null

$resultados | Export-Csv -Path $SalidaLog -NoTypeInformation -Encoding UTF8
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  LIBERACIÓN FINALIZADA | Exitosas: $okCount | Errores: $errCount" -ForegroundColor $(if ($errCount -eq 0) { 'Green' } else { 'Yellow' })
Write-Host "  Log completo guardado en: $SalidaLog" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
