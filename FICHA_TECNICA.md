# Ficha Técnica del Proyecto — `sistema-control-licencias-365`

**Fecha de actualización:** Noviembre 2026  
**Versión:** `1.0.0`  
**Ruta Local:** `C:\Users\rhormazabal\.gemini\antigravity\scratch\sistema-control-licencias-365`  
**Responsable:** Unidad de Tecnologías de la Información (TI) — Corporación Municipal de Desarrollo Social de Antofagasta (CMDS)

---

## 1. Propósito del Sistema

Sistema web corporativo para la administración, control de stock y auditoría del licenciamiento **Microsoft 365** del Tenant único de CMDS Antofagasta, abarcando sus **3 dominios oficiales** (`cmds.cl`, `cmds-salud.cl` y `cmds-educacion.cl`) y un total de **207.500 licencias** distribuidas en **6 pools**:

| Pool | Tipo de Licencia Microsoft 365 | SKU | Dominio | Sector | Cupo Contratado |
| :-: | :--- | :--- | :--- | :--- | ---: |
| 1 | **Office 365 E3** | `O365_E3` (`ENTERPRISEPACK`) | `cmds.cl` | `ADMINISTRACION` | **200** |
| 2 | **Office 365 E3** | `O365_E3` (`ENTERPRISEPACK`) | `cmds-salud.cl` | `SALUD` | **1.600** |
| 3 | **Office 365 E1** | `O365_E1` (`STANDARDPACK`) | `cmds-salud.cl` | `SALUD` | **400** |
| 4 | **Microsoft 365 Business Basic (no Teams)** | `M365_BUS_BASIC` | `cmds-salud.cl` | `SALUD` | **300** |
| 5 | **Office 365 A3 (Education Faculty Pricing)** | `O365_A3_FACULTY` | `cmds-educacion.cl` | `EDUCACION` | **5.000** |
| 6 | **Office 365 A3 Student use benefit** | `O365_A3_STUDENT` | `cmds-educacion.cl` | `EDUCACION` | **200.000** |
| — | **TOTAL TENANT CMDS** | — | **3 Dominios** | **Global** | **207.500** |

---

## 2. Tecnología de Desarrollo (Stack Técnico)

- **Backend (`backend/`):**
  - **Runtime y Framework:** Node.js (`v22+`) + Express `^5.2.1` (CommonJS).
  - **Base de Datos:** Driver `pg` `^8.23.1` conectado al servidor PostgreSQL 18.6 centralizado de CMDS (`192.168.30.47:5432`, base de datos `bd_licencias_365`) con auto-aprovisionamiento de tablas y respaldo local sincronizado (`backend/data/store.json`).
  - **Seguridad y Utilidades:** `bcryptjs` `^3.0.2` (12 salt rounds), `jsonwebtoken` `^9.0.3`, `multer` `^2.2.0`, `xlsx` `^0.18.5`, `cors` `^2.8.6`, `dotenv` `^17.3.1`.
- **Frontend (`frontend/`):**
  - **Framework y Lenguaje:** React `^19.2.8` + TypeScript `~6.0.2` + Vite `^8.2.0`.
  - **Estilos y Gráficos:** Tailwind CSS `^4.3.3` (`@tailwindcss/vite`), Recharts `^3.10.1`, Lucide React, React Router DOM `^7.18.2`, Axios `^1.19.0`.
  - **Empaquetado:** Compilado estático en `backend/public/` servido por el mismo proceso Express en el puerto `3008`.

---

## 3. Seguridad para Exposición a Internet y Matriz de Perfiles

### 3.1. Perfiles Sectoriales (`ambito`)
- **`GLOBAL`**: Acceso a los 3 dominios (`cmds.cl`, `cmds-salud.cl`, `cmds-educacion.cl`).
- **`ADMINISTRACION`**: Alcance sobre el dominio `cmds.cl` y direcciones de Casa Central.
- **`EDUCACION`**: Alcance sobre el dominio `cmds-educacion.cl` (A3 Faculty y A3 Student) y unidades educativas.
- **`SALUD`**: Alcance sobre el dominio `cmds-salud.cl` (E3, E1 y Business Basic) y CESFAMs / unidades APS.

### 3.2. Niveles de Permiso (`rol_acceso`)
- **`ADMIN_SISTEMA`**: Control total del sistema, ajuste de cupos contratados y administración del Mantenedor de Usuarios del Sistema (creación, edición, desbloqueo y reseteo de contraseñas).
- **`GESTOR`**: Puede visualizar la distribución y realizar **altas de usuarios, asignaciones de licencias, cambios de licencia, bajas e importación Excel** dentro de su perfil sectorial.
- **`VISUALIZADOR` (Solo Lectura)**: Puede consultar el Dashboard, ver distribución y descargar reportes Excel/PDF, pero **tiene bloqueada toda acción de asignación, alta, baja o modificación** tanto en la interfaz como en la API.

### 3.3. Política de Contraseñas y Protección Anti-Fuerza Bruta
- Mínimo **10 caracteres**, incluyendo al menos **1 mayúscula**, **1 minúscula**, **1 número** y **1 carácter especial**.
- Bloqueo temporal automático por **15 minutos** tras **5 intentos fallidos** consecutivos.
- Reseteo administrativo de contraseña con generador criptográfico aleatorio y cambio obligatorio en el próximo inicio de sesión (`debe_cambiar_clave = true`).

### 3.4. Cuentas Iniciales Preconfiguradas
- **Contraseña inicial común (cumple política segura):** `Cmds365#2026!`
- **Superadministrador Global:** `rhormazabal@cmds.cl` (o `admin`) — `ADMIN_SISTEMA` / `GLOBAL`
- **Gestor Administración:** `admin.central@cmds.cl` — `GESTOR` / `ADMINISTRACION`
- **Gestor Educación:** `educacion@cmds-educacion.cl` — `GESTOR` / `EDUCACION`
- **Gestor Salud:** `salud@cmds-salud.cl` — `GESTOR` / `SALUD`
- **Auditor Solo Visualización:** `auditor@cmds.cl` — `VISUALIZADOR` / `GLOBAL`
