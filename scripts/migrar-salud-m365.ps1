<#
.SYNOPSIS
  Migración Masiva de Cuentas de Salud CMDS (@cmds.cl -> @cmds-salud.cl)
  con conservación automática de Alias @cmds.cl e intercambio atómico de licencias (A1 -> E3 / E1).

.EXAMPLE
  # 1. Modo Simulación (NO modifica nada en Microsoft 365, solo valida):
  .\migrar-salud-m365.ps1 -Simulacion

.EXAMPLE
  # 2. Prueba Piloto con 1 sola cuenta (ej. alicia.soto@cmds.cl):
  .\migrar-salud-m365.ps1 -SoloUsuario "alicia.soto@cmds.cl"

.EXAMPLE
  # 3. Ejecutar un lote de prueba de 20 cuentas:
  .\migrar-salud-m365.ps1 -Limite 20

.EXAMPLE
  # 4. Ejecutar migración completa (1.123 cuentas: 1.069 E3 + 54 E1):
  .\migrar-salud-m365.ps1
#>

param(
  [string]$CsvPath = "$PSScriptRoot\migracion_salud_preparada.csv",
  [switch]$Simulacion,
  [string]$SoloUsuario = "",
  [int]$Limite = 0,
  [string]$SalidaLog = "$env:USERPROFILE\Desktop\Resultado_Migracion_Salud_M365.csv"
)

$ErrorActionPreference = "Stop"

# ==============================================================================
# SKUs OFICIALES DEL TENANT CMDS ANTOFAGASTA (95f4d8b5-b14f-45b1-9463-f6dff68ff1c6)
# ==============================================================================
$SKU_E3               = "6fd2c87f-b296-42f0-b197-1e91e994b900" # ENTERPRISEPACK (Office 365 E3)
$SKU_E1               = "18181a46-0d4e-45cd-891e-60aabd171b4e" # STANDARDPACK (Office 365 E1)
$SKU_BUSINESS_BASIC   = "21502a13-c8dc-4744-be9c-177fd9d2eafc" # Microsoft 365 Business Basic (no Teams)

# SKUs antiguos A1 / Exchange Student que generan conflicto y deben retirarse atómicamente al asignar E3/E1
$SKUS_ANTIGUOS_A_RETIRAR = @(
  "94763226-9b3c-4e75-a931-5c89701abe66", # STANDARDWOFFPACK_FACULTY (Office 365 A1 para profesores)
  "314c4481-f395-4525-be8b-2ec4bb1e9d91", # STANDARDWOFFPACK_STUDENT (Office 365 A1 para estudiantes)
  "ad2fe44a-915d-4e2b-ade1-6766d50a9d9c"  # EXCHANGESTANDARD_STUDENT (Exchange Online plan 1 para estudiantes)
)

Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  CMDS Antofagasta — Migración Masiva Salud (@cmds.cl -> @cmds-salud.cl)" -ForegroundColor Cyan
Write-Host "  Modo: $(if ($Simulacion) { 'SIMULACIÓN (Solo lectura)' } else { 'EJECUCIÓN REAL EN MICROSOFT 365' })" -ForegroundColor $(if ($Simulacion) { 'Yellow' } else { 'Green' })
Write-Host "=====================================================================" -ForegroundColor Cyan

if (-not (Test-Path $CsvPath)) {
  Write-Error "No se encontró el archivo CSV en: $CsvPath"
  exit 1
}

# Verificar e instalar módulos oficiales de Microsoft si faltan (sin requerir permisos de administrador de Windows)
$modulosRequeridos = @("ExchangeOnlineManagement", "Microsoft.Graph.Users", "Microsoft.Graph.Users.Actions")
foreach ($mod in $modulosRequeridos) {
  if (-not (Get-Module -ListAvailable -Name $mod)) {
    Write-Host "[INFO] Instalando módulo oficial de Microsoft '$mod' (solo primera vez)..." -ForegroundColor Yellow
    Install-Module -Name $mod -Scope CurrentUser -Force -AllowClobber
  }
}

Import-Module ExchangeOnlineManagement
Import-Module Microsoft.Graph.Users
Import-Module Microsoft.Graph.Users.Actions

# Cargar registros del CSV
$registros = Import-Csv -Path $CsvPath -Encoding UTF8
if ($SoloUsuario -ne "") {
  $filtro = $SoloUsuario.Trim().ToLower()
  $registros = @($registros | Where-Object { $_.CorreoActual.ToLower() -eq $filtro -or $_.CorreoNuevo.ToLower() -eq $filtro })
}
if ($Limite -gt 0 -and $registros.Count -gt $Limite) {
  $registros = @($registros | Select-Object -First $Limite)
}

if ($registros.Count -eq 0) {
  Write-Warning "No se encontraron cuentas que coincidan con el filtro especificado."
  exit 0
}

Write-Host "[INFO] Cuentas a procesar en esta corrida: $($registros.Count)" -ForegroundColor Cyan

# Conectar a Microsoft Graph y Exchange Online con tu cuenta de Administrador Global (MFA)
Write-Host "[1/2] Iniciando sesión en Microsoft Graph (se abrirá ventana de login Microsoft 365)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes "User.ReadWrite.All", "Organization.Read.All" -NoWelcome

if (-not $Simulacion) {
  Write-Host "[2/2] Iniciando sesión en Exchange Online (para cambio de correo + Alias automático @cmds.cl)..." -ForegroundColor Cyan
  Connect-ExchangeOnline -ShowBanner:$false
}

$resultados = @()
$idx = 0
$okCount = 0
$errCount = 0

foreach ($row in $registros) {
  $idx++
  $pct = [math]::Round(($idx / $registros.Count) * 100, 1)
  Write-Progress -Activity "Migrando cuentas Salud CMDS" -Status "[$idx/$($registros.Count)] $($row.CorreoActual) -> $($row.CorreoNuevo) ($($row.LicenciaDestino))" -PercentComplete $pct

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
    # Buscar usuario por ObjectId inmutable (o por UPN si no viene ObjectId)
    $lookupKey = if ($row.ObjectId -and $row.ObjectId.Trim() -ne "") { $row.ObjectId.Trim() } else { $row.CorreoActual.Trim() }
    $mgUser = Get-MgUser -UserId $lookupKey -Property Id, DisplayName, UserPrincipalName, Mail, UsageLocation, AssignedLicenses

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

    # PASO A: Cambiar correo principal en Exchange Online (promueve @cmds-salud.cl y conserva @cmds.cl como Alias smtp:)
    if ($mgUser.UserPrincipalName.ToLower() -ne $row.CorreoNuevo.ToLower()) {
      try {
        Set-Mailbox -Identity $mgUser.Id -WindowsEmailAddress $row.CorreoNuevo -ErrorAction Stop
      } catch {
        # Si la cuenta aún no tiene buzón Exchange (ej. recién creada sin licencia), continuar al cambio de UPN
        Write-Warning "  [AVISO Exchange] $($mgUser.UserPrincipalName): $($_.Exception.Message)"
      }

      # PASO B: Actualizar inicio de sesión (UserPrincipalName) y UsageLocation en Entra ID
      $updateBody = @{
        UserPrincipalName = $row.CorreoNuevo
        UsageLocation     = "CL"
      }
      Update-MgUser -UserId $mgUser.Id -BodyParameter $updateBody
    } elseif (-not $mgUser.UsageLocation) {
      Update-MgUser -UserId $mgUser.Id -UsageLocation "CL"
    }

    # PASO C: Intercambio atómico de licencia (+E3/E1 y -A1/ExchangeStudent en UNA sola llamada)
    $addLicenses = @()
    if (-not $yaTieneTarget) {
      $addLicenses += @{ SkuId = $targetSkuId }
    }

    if ($addLicenses.Count -gt 0 -or $skusARemover.Count -gt 0) {
      Set-MgUserLicense -UserId $mgUser.Id -AddLicenses $addLicenses -RemoveLicenses $skusARemover | Out-Null
    }

    Write-Host "  [OK] $($row.CorreoActual) -> $($row.CorreoNuevo) (Alias: $($row.CorreoActual)) | Licencia: $($row.LicenciaDestino)" -ForegroundColor Green
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

Write-Progress -Activity "Migrando cuentas Salud CMDS" -Completed
$resultados | Export-Csv -Path $SalidaLog -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  PROCESO FINALIZADO | Exitosos: $okCount | Errores: $errCount" -ForegroundColor Cyan
Write-Host "  Reporte guardado en: $SalidaLog" -ForegroundColor Green
Write-Host "=====================================================================" -ForegroundColor Cyan

if (-not $Simulacion) {
  Disconnect-ExchangeOnline -Confirm:$false -ErrorAction SilentlyContinue
}
Disconnect-MgGraph | Out-Null
