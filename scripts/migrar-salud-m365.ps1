<#
.SYNOPSIS
  Migración Masiva de Cuentas de Salud CMDS (@cmds.cl -> @cmds-salud.cl)
  con conservación automática de Alias @cmds.cl e intercambio atómico de licencias (A1 -> E3 / E1).
  Usa procesos aislados para Exchange Online y Microsoft Graph (cero conflictos MSAL en PowerShell 5.1).

.EXAMPLE
  # 1. Prueba Piloto con 1 sola cuenta:
  powershell -ExecutionPolicy Bypass -File .\migrar-salud-m365.ps1 -SoloUsuario "felipe.aguilar@cmds.cl" -LicenciaPiloto "E3"

.EXAMPLE
  # 2. Modo Simulación (NO modifica nada en Microsoft 365, solo valida):
  powershell -ExecutionPolicy Bypass -File .\migrar-salud-m365.ps1 -Simulacion

.EXAMPLE
  # 3. Ejecutar migración completa (1.123 cuentas: 1.069 E3 + 54 E1):
  powershell -ExecutionPolicy Bypass -File .\migrar-salud-m365.ps1
#>

param(
  [string]$CsvPath = "$PSScriptRoot\migracion_salud_preparada.csv",
  [switch]$Simulacion,
  [string]$SoloUsuario = "",
  [string]$LicenciaPiloto = "E3",
  [int]$Limite = 0,
  [string]$SalidaLog = "$env:USERPROFILE\Desktop\Resultado_Migracion_Salud_M365.csv",
  [ValidateSet("ALL", "EXCHANGE", "GRAPH")]
  [string]$Fase = "ALL"
)

$ErrorActionPreference = "Stop"

# ==============================================================================
# SKUs OFICIALES DEL TENANT CMDS ANTOFAGASTA (95f4d8b5-b14f-45b1-9463-f6dff68ff1c6)
# ==============================================================================
$SKU_E3               = "6fd2c87f-b296-42f0-b197-1e91e994b900" # ENTERPRISEPACK (Office 365 E3)
$SKU_E1               = "18181a46-0d4e-45cd-891e-60aabd171b4e" # STANDARDPACK (Office 365 E1)
$SKU_BUSINESS_BASIC   = "21502a13-c8dc-4744-be9c-177fd9d2eafc" # Microsoft 365 Business Basic (no Teams)

$SKUS_ANTIGUOS_A_RETIRAR = @(
  "94763226-9b3c-4e75-a931-5c89701abe66", # STANDARDWOFFPACK_FACULTY (Office 365 A1 para profesores)
  "314c4481-f395-4525-be8b-2ec4bb1e9d91", # STANDARDWOFFPACK_STUDENT (Office 365 A1 para estudiantes)
  "ad2fe44a-915d-4e2b-ade1-6766d50a9d9c"  # EXCHANGESTANDARD_STUDENT (Exchange Online plan 1 para estudiantes)
)

# ==============================================================================
# ORQUESTADOR PRINCIPAL: EJECUTA FASE 1 (EXCHANGE) Y FASE 2 (GRAPH) EN PROCESOS AISLADOS
# ==============================================================================
if ($Fase -eq "ALL") {
  Write-Host "=====================================================================" -ForegroundColor Cyan
  Write-Host "  CMDS Antofagasta — Migración Masiva Salud (@cmds.cl -> @cmds-salud.cl)" -ForegroundColor Cyan
  Write-Host "  Modo: $(if ($Simulacion) { 'SIMULACIÓN (Solo lectura)' } else { 'EJECUCIÓN REAL EN MICROSOFT 365' })" -ForegroundColor $(if ($Simulacion) { 'Yellow' } else { 'Green' })
  Write-Host "=====================================================================" -ForegroundColor Cyan

  $baseArgs = @(
    "-NoProfile",
    "-ExecutionPolicy", "Bypass",
    "-File", $PSCommandPath,
    "-CsvPath", $CsvPath,
    "-LicenciaPiloto", $LicenciaPiloto,
    "-Limite", "$Limite",
    "-SalidaLog", $SalidaLog
  )
  if ($Simulacion) { $baseArgs += "-Simulacion" }
  if ($SoloUsuario -ne "") { $baseArgs += @("-SoloUsuario", $SoloUsuario) }

  if (-not $Simulacion) {
    Write-Host ""
    Write-Host "[FASE 1/2] Exchange Online: Promover @cmds-salud.cl y conservar Alias @cmds.cl..." -ForegroundColor Cyan
    & powershell.exe @($baseArgs + @("-Fase", "EXCHANGE"))
    if ($LASTEXITCODE -ne 0) {
      Write-Error "La Fase 1 (Exchange Online) terminó con error (código $LASTEXITCODE)."
      exit $LASTEXITCODE
    }
  }

  Write-Host ""
  Write-Host "[FASE 2/2] Microsoft Graph: Actualizar inicio de sesión (UPN) e intercambio atómico de licencias (A1 -> E3/E1)..." -ForegroundColor Cyan
  & powershell.exe @($baseArgs + @("-Fase", "GRAPH"))
  exit $LASTEXITCODE
}

# ==============================================================================
# CARGAR REGISTROS DEL CSV (COMÚN A AMBAS FASES)
# ==============================================================================
if (-not (Test-Path $CsvPath)) {
  Write-Error "No se encontró el archivo CSV en: $CsvPath"
  exit 1
}

$registros = Import-Csv -Path $CsvPath -Encoding UTF8
if ($SoloUsuario -ne "") {
  $filtro = $SoloUsuario.Trim().ToLower()
  $registros = @($registros | Where-Object { $_.CorreoActual.ToLower() -eq $filtro -or $_.CorreoNuevo.ToLower() -eq $filtro })
  if ($registros.Count -eq 0 -and $filtro.Contains("@")) {
    $localPart = $filtro.Split("@")[0]
    $registros = @(
      [PSCustomObject]@{
        ObjectId        = ""
        DisplayName     = $filtro
        CorreoActual    = $filtro
        CorreoNuevo     = "$localPart@cmds-salud.cl"
        LicenciaDestino = $LicenciaPiloto.Trim().ToUpper()
        Departamento    = "Piloto"
        Cargo           = ""
      }
    )
    Write-Host "[INFO] Usuario piloto '$filtro' -> '$localPart@cmds-salud.cl' con licencia $($LicenciaPiloto.ToUpper())." -ForegroundColor Yellow
  }
}
if ($Limite -gt 0 -and $registros.Count -gt $Limite) {
  $registros = @($registros | Select-Object -First $Limite)
}
if ($registros.Count -eq 0) {
  Write-Warning "No se encontraron cuentas que coincidan con el filtro especificado."
  exit 0
}

# ==============================================================================
# FASE 1: EXCHANGE ONLINE (SOLO ExchangeOnlineManagement — SIN CONFLICTO MSAL)
# ==============================================================================
if ($Fase -eq "EXCHANGE") {
  if (-not (Get-Module -ListAvailable -Name "ExchangeOnlineManagement")) {
    Install-Module -Name "ExchangeOnlineManagement" -Scope CurrentUser -Force -AllowClobber
  }
  Import-Module ExchangeOnlineManagement
  Write-Host "  Iniciando sesión en Exchange Online (se abrirá ventana de login Microsoft 365)..." -ForegroundColor Cyan
  Connect-ExchangeOnline -ShowBanner:$false

  $idx = 0
  foreach ($row in $registros) {
    $idx++
    Write-Progress -Activity "Fase 1/2 — Exchange Online (Correo Principal + Alias)" -Status "[$idx/$($registros.Count)] $($row.CorreoActual) -> $($row.CorreoNuevo)" -PercentComplete ([math]::Round(($idx / $registros.Count) * 100, 1))
    try {
      $idLookup = if ($row.ObjectId -and $row.ObjectId.Trim() -ne "") { $row.ObjectId.Trim() } else { $row.CorreoActual.Trim() }
      Set-Mailbox -Identity $idLookup -WindowsEmailAddress $row.CorreoNuevo -ErrorAction Stop
      Write-Host "  [EXCHANGE OK] $($row.CorreoActual) -> $($row.CorreoNuevo) (Alias @cmds.cl conservado)" -ForegroundColor Green
    } catch {
      Write-Warning "  [EXCHANGE AVISO] $($row.CorreoActual): $($_.Exception.Message)"
    }
  }
  Write-Progress -Activity "Fase 1/2 — Exchange Online (Correo Principal + Alias)" -Completed
  Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
  exit 0
}

# ==============================================================================
# FASE 2: MICROSOFT GRAPH (SOLO Microsoft.Graph — SIN CONFLICTO MSAL)
# ==============================================================================
if ($Fase -eq "GRAPH") {
  foreach ($mod in @("Microsoft.Graph.Users", "Microsoft.Graph.Users.Actions")) {
    if (-not (Get-Module -ListAvailable -Name $mod)) {
      Install-Module -Name $mod -Scope CurrentUser -Force -AllowClobber
    }
  }
  Import-Module Microsoft.Graph.Users
  Import-Module Microsoft.Graph.Users.Actions

  Write-Host "  Iniciando sesión en Microsoft Graph (se abrirá ventana de login Microsoft 365)..." -ForegroundColor Cyan
  Connect-MgGraph -Scopes "User.ReadWrite.All", "Organization.Read.All" -NoWelcome

  $resultados = @()
  $idx = 0
  $okCount = 0
  $errCount = 0

  foreach ($row in $registros) {
    $idx++
    Write-Progress -Activity "Fase 2/2 — Microsoft Graph (UPN + Licencias)" -Status "[$idx/$($registros.Count)] $($row.CorreoNuevo) ($($row.LicenciaDestino))" -PercentComplete ([math]::Round(($idx / $registros.Count) * 100, 1))

    $targetSkuId = switch ($row.LicenciaDestino.Trim().ToUpper()) {
      "E3"    { $SKU_E3 }
      "E1"    { $SKU_E1 }
      "BASIC" { $SKU_BUSINESS_BASIC }
      default { "" }
    }

    if (-not $targetSkuId) {
      $resultados += [PSCustomObject]@{
        Fecha            = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        CorreoActual     = $row.CorreoActual
        CorreoNuevo      = $row.CorreoNuevo
        AliasConservado  = $row.CorreoActual
        LicenciaDestino  = $row.LicenciaDestino
        Estado           = "OMITIDO"
        Detalle          = "Licencia destino no reconocida ($($row.LicenciaDestino))"
      }
      continue
    }

    try {
      # Buscar usuario por ObjectId o UPN (nuevo o antiguo)
      $mgUser = $null
      if ($row.ObjectId -and $row.ObjectId.Trim() -ne "") {
        $mgUser = Get-MgUser -UserId $row.ObjectId.Trim() -Property Id, DisplayName, UserPrincipalName, Mail, UsageLocation, AssignedLicenses
      } else {
        try {
          $mgUser = Get-MgUser -UserId $row.CorreoActual.Trim() -Property Id, DisplayName, UserPrincipalName, Mail, UsageLocation, AssignedLicenses -ErrorAction Stop
        } catch {
          $mgUser = Get-MgUser -UserId $row.CorreoNuevo.Trim() -Property Id, DisplayName, UserPrincipalName, Mail, UsageLocation, AssignedLicenses
        }
      }

      $currentSkuIds = @($mgUser.AssignedLicenses | ForEach-Object { $_.SkuId.ToString().ToLower() })
      $skusARemover = @($SKUS_ANTIGUOS_A_RETIRAR | Where-Object { $currentSkuIds -contains $_.ToLower() })
      $yaTieneTarget = $currentSkuIds -contains $targetSkuId.ToLower()

      if ($Simulacion) {
        Write-Host "  [SIMULACIÓN] $($mgUser.UserPrincipalName) -> $($row.CorreoNuevo) | Alias: $($row.CorreoActual) | +$($row.LicenciaDestino) | -Antiguas: $($skusARemover.Count)" -ForegroundColor Gray
        $resultados += [PSCustomObject]@{
          Fecha            = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
          CorreoActual     = $mgUser.UserPrincipalName
          CorreoNuevo      = $row.CorreoNuevo
          AliasConservado  = $row.CorreoActual
          LicenciaDestino  = $row.LicenciaDestino
          Estado           = "SIMULACION_OK"
          Detalle          = "Listo para migrar. SKUs antiguos a retirar: $($skusARemover.Count). Ya tiene destino: $yaTieneTarget"
        }
        $okCount++
        continue
      }

      # Actualizar UPN, UsageLocation = CL, DisplayName, GivenName, Surname, JobTitle, Department, OfficeLocation, City, State, PostalCode y Country
      $updateBody = @{}
      if ($mgUser.UserPrincipalName.ToLower() -ne $row.CorreoNuevo.ToLower()) {
        $updateBody["UserPrincipalName"] = $row.CorreoNuevo
      }
      if (-not $mgUser.UsageLocation) {
        $updateBody["UsageLocation"] = "CL"
      }
      $displayLimpio = if ($row.DisplayName) { $row.DisplayName.Trim() } else { "" }
      if ($displayLimpio -ne "" -and -not $displayLimpio.Contains("@")) {
        $updateBody["DisplayName"] = $displayLimpio
      }
      $firstLimpio = if ($row.FirstName) { $row.FirstName.Trim() } else { "" }
      if ($firstLimpio -ne "") {
        $updateBody["GivenName"] = $firstLimpio
      }
      $lastLimpio = if ($row.LastName) { $row.LastName.Trim() } else { "" }
      if ($lastLimpio -ne "") {
        $updateBody["Surname"] = $lastLimpio
      }
      $cargoLimpio = if ($row.Cargo) { $row.Cargo.Trim() } else { "" }
      if ($cargoLimpio -ne "") {
        $updateBody["JobTitle"] = $cargoLimpio
      }
      $deptoLimpio = if ($row.Departamento) { $row.Departamento.Trim() } else { "" }
      if ($deptoLimpio -ne "" -and $deptoLimpio -ne "Piloto") {
        $updateBody["Department"] = $deptoLimpio
      }
      $officeLimpio = if ($row.Office) { $row.Office.Trim() } else { "" }
      if ($officeLimpio -ne "") {
        $updateBody["OfficeLocation"] = $officeLimpio
      }
      $cityLimpio = if ($row.City) { $row.City.Trim() } else { "" }
      if ($cityLimpio -ne "") {
        $updateBody["City"] = $cityLimpio
      }
      $stateLimpio = if ($row.StateOrProvince) { $row.StateOrProvince.Trim() } else { "" }
      if ($stateLimpio -ne "") {
        $updateBody["State"] = $stateLimpio
      }
      $postalLimpio = if ($row.PostalCode) { $row.PostalCode.Trim() } else { "" }
      if ($postalLimpio -ne "") {
        $updateBody["PostalCode"] = $postalLimpio
      }
      $countryLimpio = if ($row.CountryOrRegion) { $row.CountryOrRegion.Trim() } else { "" }
      if ($countryLimpio -ne "") {
        $updateBody["Country"] = $countryLimpio
      }

      if ($updateBody.Count -gt 0) {
        Update-MgUser -UserId $mgUser.Id -BodyParameter $updateBody
      }

      # Intercambio atómico de licencia (+E3/E1 y -A1/ExchangeStudent en UNA sola llamada)
      $addLicenses = @()
      if (-not $yaTieneTarget) {
        $addLicenses += @{ SkuId = $targetSkuId }
      }

      if ($addLicenses.Count -gt 0 -or $skusARemover.Count -gt 0) {
        Set-MgUserLicense -UserId $mgUser.Id -AddLicenses $addLicenses -RemoveLicenses $skusARemover | Out-Null
      }

      Write-Host "  [GRAPH OK] $($row.CorreoActual) -> $($row.CorreoNuevo) (Alias: $($row.CorreoActual)) | Licencia: $($row.LicenciaDestino) (-$($skusARemover.Count) antiguas)" -ForegroundColor Green
      $resultados += [PSCustomObject]@{
        Fecha            = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        CorreoActual     = $row.CorreoActual
        CorreoNuevo      = $row.CorreoNuevo
        AliasConservado  = $row.CorreoActual
        LicenciaDestino  = $row.LicenciaDestino
        Estado           = "OK"
        Detalle          = "Migrado exitosamente (+$($row.LicenciaDestino), retiradas $($skusARemover.Count) licencias antiguas)"
      }
      $okCount++
    } catch {
      $msgErr = $_.Exception.Message
      Write-Host "  [ERROR] $($row.CorreoActual): $msgErr" -ForegroundColor Red
      $resultados += [PSCustomObject]@{
        Fecha            = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        CorreoActual     = $row.CorreoActual
        CorreoNuevo      = $row.CorreoNuevo
        AliasConservado  = $row.CorreoActual
        LicenciaDestino  = $row.LicenciaDestino
        Estado           = "ERROR"
        Detalle          = $msgErr
      }
      $errCount++
    }
  }

  Write-Progress -Activity "Fase 2/2 — Microsoft Graph (UPN + Licencias)" -Completed
  $resultados | Export-Csv -Path $SalidaLog -NoTypeInformation -Encoding UTF8

  Write-Host ""
  Write-Host "=====================================================================" -ForegroundColor Cyan
  Write-Host "  PROCESO FINALIZADO | Exitosos: $okCount | Errores: $errCount" -ForegroundColor Cyan
  Write-Host "  Reporte guardado en: $SalidaLog" -ForegroundColor Green
  Write-Host "=====================================================================" -ForegroundColor Cyan

  Disconnect-MgGraph | Out-Null
  exit 0
}
