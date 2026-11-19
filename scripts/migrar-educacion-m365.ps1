<#
.SYNOPSIS
  Actualización Masiva de Licencias y Perfiles — Educación CMDS (@cmds-educacion.cl)
  Intercambio atómico de licencias (A1 -> A3 Faculty / A3 Student) sin cambio de dominio
  y normalización de campos de perfil en Microsoft 365 vía Microsoft Graph.

.EXAMPLE
  # 1. Prueba Piloto con 1 sola cuenta:
  powershell -ExecutionPolicy Bypass -File .\migrar-educacion-m365.ps1 -SoloUsuario "usuario@cmds-educacion.cl"

.EXAMPLE
  # 2. Modo Simulación (NO modifica nada en Microsoft 365, solo valida):
  powershell -ExecutionPolicy Bypass -File .\migrar-educacion-m365.ps1 -Simulacion -Limite 10

.EXAMPLE
  # 3. Ejecutar por lotes (ej. primeros 100, luego el resto):
  powershell -ExecutionPolicy Bypass -File .\migrar-educacion-m365.ps1 -Limite 100
  powershell -ExecutionPolicy Bypass -File .\migrar-educacion-m365.ps1 -Saltar 100

.EXAMPLE
  # 4. Ejecutar actualización completa (3.525 cuentas activas):
  powershell -ExecutionPolicy Bypass -File .\migrar-educacion-m365.ps1
#>

param(
  [string]$CsvPath = "$PSScriptRoot\migracion_educacion_preparada.csv",
  [switch]$Simulacion,
  [string]$SoloUsuario = "",
  [int]$Saltar = 0,
  [int]$Limite = 0,
  [string]$SalidaLog = "$env:USERPROFILE\Desktop\Resultado_Migracion_Educacion_M365.csv"
)

$ErrorActionPreference = "Stop"

# ==============================================================================
# SKUs OFICIALES DEL TENANT CMDS ANTOFAGASTA (95f4d8b5-b14f-45b1-9463-f6dff68ff1c6)
# ==============================================================================
$SKU_A3_FACULTY = "e578b273-6db4-4691-bba0-8d691f4da603" # ENTERPRISEPACKPLUS_FACULTY (Office 365 A3 para profesores)
$SKU_A3_STUDENT = "476aad1e-7a7f-473c-9d20-35665a5cbd4f" # ENTERPRISEPACKPLUS_STUUSEBNFT (Ventajas de uso de Office 365 A3 para estudiantes)

$SKUS_ANTIGUOS_A_RETIRAR = @(
  "94763226-9b3c-4e75-a931-5c89701abe66", # STANDARDWOFFPACK_FACULTY (Office 365 A1 para profesores)
  "314c4481-f395-4525-be8b-2ec4bb1e9d91", # STANDARDWOFFPACK_STUDENT (Office 365 A1 para estudiantes)
  "ad2fe44a-915d-4e2b-ade1-6766d50a9d9c"  # EXCHANGESTANDARD_STUDENT (Exchange Online plan 1 para estudiantes)
)

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  CMDS Antofagasta — Actualización Licencias Educación (@cmds-educacion.cl)" -ForegroundColor Cyan
Write-Host "  Modo: $(if ($Simulacion) { 'SIMULACIÓN (Solo lectura)' } else { 'EJECUCIÓN REAL EN MICROSOFT 365' })" -ForegroundColor $(if ($Simulacion) { 'Yellow' } else { 'Green' })
Write-Host "=====================================================================" -ForegroundColor Cyan

# ==============================================================================
# CARGAR REGISTROS DEL CSV
# ==============================================================================
if (-not (Test-Path $CsvPath)) {
  Write-Error "No se encontró el archivo CSV en: $CsvPath"
  exit 1
}

$registros = Import-Csv -Path $CsvPath -Encoding UTF8
if ($SoloUsuario -ne "") {
  $filtro = $SoloUsuario.Trim().ToLower()
  $registros = @($registros | Where-Object { $_.CorreoActual.ToLower() -eq $filtro })
}
if ($Saltar -gt 0) {
  $registros = @($registros | Select-Object -Skip $Saltar)
}
if ($Limite -gt 0 -and $registros.Count -gt $Limite) {
  $registros = @($registros | Select-Object -First $Limite)
}
if ($registros.Count -eq 0) {
  Write-Warning "No se encontraron cuentas que coincidan con el filtro especificado."
  exit 0
}

Write-Host "[INFO] Cuentas a procesar en esta corrida: $($registros.Count)" -ForegroundColor Cyan

# ==============================================================================
# CONEXIÓN A MICROSOFT GRAPH (SIN EXCHANGE ONLINE — CERO CONFLICTO MSAL)
# ==============================================================================
foreach ($mod in @("Microsoft.Graph.Users", "Microsoft.Graph.Users.Actions")) {
  if (-not (Get-Module -ListAvailable -Name $mod)) {
    Write-Host "[INFO] Instalando módulo oficial '$mod' (solo primera vez)..." -ForegroundColor Yellow
    Install-Module -Name $mod -Scope CurrentUser -Force -AllowClobber
  }
}

Import-Module Microsoft.Graph.Users -ErrorAction Stop
Import-Module Microsoft.Graph.Users.Actions -ErrorAction Stop

Write-Host "[INFO] Iniciando sesión en Microsoft Graph (se abrirá ventana de login Microsoft 365)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes "User.ReadWrite.All", "Organization.Read.All" -NoWelcome

$resultados = New-Object System.Collections.Generic.List[object]
$okCount = 0
$errCount = 0
$idx = 0
$total = $registros.Count

foreach ($row in $registros) {
  $idx++
  $pct = [math]::Round(($idx / $total) * 100, 1)
  Write-Progress -Activity "Actualizando Licencias y Perfiles Educación" -Status "[$idx/$total - $pct%] $($row.CorreoActual) -> $($row.LicenciaDestino)" -PercentComplete $pct

  $estado = "OK"
  $detalle = ""

  try {
    # Buscar usuario por ObjectId (prioritario) o UPN
    $mgUser = $null
    if ($row.ObjectId -and $row.ObjectId.Trim() -ne "") {
      try {
        $mgUser = Get-MgUser -UserId $row.ObjectId.Trim() -Property "Id,UserPrincipalName,DisplayName,UsageLocation,AssignedLicenses" -ErrorAction SilentlyContinue
      } catch {}
    }
    if (-not $mgUser) {
      $mgUser = Get-MgUser -UserId $row.CorreoActual -Property "Id,UserPrincipalName,DisplayName,UsageLocation,AssignedLicenses" -ErrorAction SilentlyContinue
    }
    if (-not $mgUser) {
      throw "Usuario no encontrado en Microsoft 365 ($($row.CorreoActual))."
    }

    $licDest = $row.LicenciaDestino.Trim().ToUpper()
    $targetSku = $null
    if ($licDest -eq "A3_FACULTY") {
      $targetSku = $SKU_A3_FACULTY
    } elseif ($licDest -eq "A3_STUDENT") {
      $targetSku = $SKU_A3_STUDENT
    } elseif ($licDest -ne "MANTENER") {
      throw "LicenciaDestino no reconocida: '$licDest'"
    }

    if ($Simulacion) {
      $estado = "SIMULACION_OK"
      $detalle = "Validado en M365 (UPN actual: $($mgUser.UserPrincipalName)) -> Licencia: $licDest | Depto: $($row.Departamento)"
    } else {
      # 1. Actualizar perfil normalizado en una sola llamada Graph
      $updateBody = @{}
      if (-not $mgUser.UsageLocation -or $mgUser.UsageLocation -ne "CL") {
        $updateBody["UsageLocation"] = "CL"
      }
      $displayLimpio = if ($row.DisplayName) { $row.DisplayName.Trim() } else { "" }
      if ($displayLimpio -ne "") { $updateBody["DisplayName"] = $displayLimpio }

      $firstLimpio = if ($row.FirstName) { $row.FirstName.Trim() } else { "" }
      if ($firstLimpio -ne "") { $updateBody["GivenName"] = $firstLimpio }

      $lastLimpio = if ($row.LastName) { $row.LastName.Trim() } else { "" }
      if ($lastLimpio -ne "") { $updateBody["Surname"] = $lastLimpio }

      $cargoLimpio = if ($row.Cargo) { $row.Cargo.Trim() } else { "" }
      if ($cargoLimpio -ne "") { $updateBody["JobTitle"] = $cargoLimpio }

      $deptoLimpio = if ($row.Departamento) { $row.Departamento.Trim() } else { "" }
      if ($deptoLimpio -ne "") { $updateBody["Department"] = $deptoLimpio }

      $officeLimpio = if ($row.Office) { $row.Office.Trim() } else { "" }
      if ($officeLimpio -ne "") { $updateBody["OfficeLocation"] = $officeLimpio }

      $cityLimpio = if ($row.City) { $row.City.Trim() } else { "" }
      if ($cityLimpio -ne "") { $updateBody["City"] = $cityLimpio }

      $stateLimpio = if ($row.StateOrProvince) { $row.StateOrProvince.Trim() } else { "" }
      if ($stateLimpio -ne "") { $updateBody["State"] = $stateLimpio }

      $postalLimpio = if ($row.PostalCode) { $row.PostalCode.Trim() } else { "" }
      if ($postalLimpio -ne "") { $updateBody["PostalCode"] = $postalLimpio }

      $countryLimpio = if ($row.CountryOrRegion) { $row.CountryOrRegion.Trim() } else { "" }
      if ($countryLimpio -ne "") { $updateBody["Country"] = $countryLimpio }

      if ($updateBody.Count -gt 0) {
        Update-MgUser -UserId $mgUser.Id -BodyParameter $updateBody
      }

      # 2. Intercambio atómico de licencias (A1 -> A3 Faculty / A3 Student)
      if ($licDest -eq "MANTENER") {
        $detalle = "Perfil actualizado; licencia actual conservada sin cambios."
      } else {
        $currentSkus = @($mgUser.AssignedLicenses | ForEach-Object { $_.SkuId.ToString().ToLower() })
        $addLicenses = @()
        if ($currentSkus -notcontains $targetSku.ToLower()) {
          $addLicenses = @(@{ SkuId = $targetSku })
        }
        $removeLicenses = @($currentSkus | Where-Object { $SKUS_ANTIGUOS_A_RETIRAR -contains $_ })

        if ($addLicenses.Count -gt 0 -or $removeLicenses.Count -gt 0) {
          Set-MgUserLicense -UserId $mgUser.Id -AddLicenses $addLicenses -RemoveLicenses $removeLicenses | Out-Null
          $detalle = "Licencia actualizada a $licDest (A1 retiradas: $($removeLicenses.Count)) + perfil normalizado."
        } else {
          $detalle = "Ya tenía $licDest sin A1 antiguas; perfil normalizado."
        }
      }
    }

    $okCount++
    Write-Host "  [OK $idx/$total] $($row.CorreoActual) -> $licDest | $detalle" -ForegroundColor Green
  } catch {
    $errCount++
    $estado = "ERROR"
    $detalle = $_.Exception.Message
    Write-Host "  [ERROR $idx/$total] $($row.CorreoActual): $detalle" -ForegroundColor Red
  }

  $resultados.Add([PSCustomObject]@{
    FechaHora       = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    CorreoActual    = $row.CorreoActual
    LicenciaDestino = $row.LicenciaDestino
    Departamento    = $row.Departamento
    Estado          = $estado
    Detalle         = $detalle
  })
}

Write-Progress -Activity "Actualizando Licencias y Perfiles Educación" -Completed
Disconnect-MgGraph -ErrorAction SilentlyContinue | Out-Null

$resultados | Export-Csv -Path $SalidaLog -NoTypeInformation -Encoding UTF8
Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  PROCESO FINALIZADO | Exitosas: $okCount | Errores: $errCount" -ForegroundColor $(if ($errCount -eq 0) { 'Green' } else { 'Yellow' })
Write-Host "  Reporte detallado guardado en: $SalidaLog" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
