const fs = require('fs');
const path = require('path');
const { Pool, Client, types } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Convertir BIGINT (20) y NUMERIC (1700) a Number en JS
types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));
types.setTypeParser(1700, val => (val === null ? null : Number(val)));

const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================================
// CATÁLOGO OFICIAL DE DOMINIOS DEL TENANT MICROSOFT 365 CMDS
// ============================================================================
const INITIAL_DOMINIOS = [
  {
    id: 1,
    dominio: 'cmds.cl',
    nombre: 'Casa Central y Administración Corporativa',
    sector: 'ADMINISTRACION',
    descripcion: 'Direcciones corporativas, DAF, RRHH, Jurídica, Informática, Control Interno y Administración Central.',
    activo: true
  },
  {
    id: 2,
    dominio: 'cmds-salud.cl',
    nombre: 'Dirección de Salud y Atención Primaria (APS)',
    sector: 'SALUD',
    descripcion: 'Dirección de Salud, 8 CESFAM comunales, Farmacia Comunal, Droguería y Central de Servicios.',
    activo: true
  },
  {
    id: 3,
    dominio: 'cmds-educacion.cl',
    nombre: 'Dirección de Educación, Establecimientos y Estudiantes',
    sector: 'EDUCACION',
    descripcion: 'Liceos, Escuelas, Jardines Infantiles VTF, PIE, Docentes, Asistentes de la Educación y Alumnado.',
    activo: true
  }
];

// ============================================================================
// CATÁLOGO DE TIPOS DE LICENCIA MICROSOFT 365
// ============================================================================
const INITIAL_TIPOS_LICENCIA = [
  {
    id: 1,
    codigo_sku: 'O365_E3',
    sku_microsoft: 'ENTERPRISEPACK',
    nombre: 'Office 365 E3',
    categoria: 'FUNCIONARIO',
    incluye_apps: 'Word, Excel, PowerPoint, Outlook (Desktop + Web), Microsoft Teams, OneDrive (1 TB), SharePoint, Exchange Plan 2 (100 GB)',
    incluye_teams: true,
    color_hex: '#016098'
  },
  {
    id: 2,
    codigo_sku: 'O365_E1',
    sku_microsoft: 'STANDARDPACK',
    nombre: 'Office 365 E1',
    categoria: 'FUNCIONARIO',
    incluye_apps: 'Word, Excel, PowerPoint, Outlook (Solo Web/Móvil), Microsoft Teams, OneDrive (1 TB), SharePoint, Exchange Plan 1 (50 GB)',
    incluye_teams: true,
    color_hex: '#39BABD'
  },
  {
    id: 3,
    codigo_sku: 'M365_BUS_BASIC',
    sku_microsoft: 'O365_BUSINESS_ESSENTIALS_NOTEAMS',
    nombre: 'Microsoft 365 Business Basic (no Teams)',
    categoria: 'FUNCIONARIO',
    incluye_apps: 'Word, Excel, PowerPoint, Outlook (Web y Móvil), Exchange (50 GB), OneDrive (1 TB), SharePoint — SIN MICROSOFT TEAMS',
    incluye_teams: false,
    color_hex: '#f59e0b'
  },
  {
    id: 4,
    codigo_sku: 'O365_A3_FACULTY',
    sku_microsoft: 'M365EDU_A3_FACULTY',
    nombre: 'Office 365 A3 (Education Faculty Pricing)',
    categoria: 'FUNCIONARIO',
    incluye_apps: 'Office Desktop Completo, Microsoft Teams Educación, OneDrive (1 TB), Exchange Plan 2, SharePoint, Forms, Bookings',
    incluye_teams: true,
    color_hex: '#6366f1'
  },
  {
    id: 5,
    codigo_sku: 'O365_A3_STUDENT',
    sku_microsoft: 'M365EDU_A3_STUUSEBNFT',
    nombre: 'Office 365 A3 Student use benefit (Education Student Pricing)',
    categoria: 'ESTUDIANTE',
    incluye_apps: 'Office Desktop y Web para Estudiantes, Microsoft Teams Educación, OneDrive Estudiantil, Correo Institucional Alumno',
    incluye_teams: true,
    color_hex: '#10b981'
  }
];

// ============================================================================
// DISTRIBUCIÓN INICIAL DE CUPOS DE LICENCIAS POR DOMINIO (207.500 TOTAL)
// ============================================================================
const INITIAL_CUPOS_LICENCIA = [
  {
    id: 1,
    dominio_id: 1, // cmds.cl
    tipo_licencia_id: 1, // Office 365 E3
    total_licencias: 200,
    licencias_asignadas: 0,
    umbral_alerta_pct: 85,
    observacion: 'Dotación Casa Central y Direcciones Administrativas (cmds.cl)'
  },
  {
    id: 2,
    dominio_id: 2, // cmds-salud.cl
    tipo_licencia_id: 1, // Office 365 E3
    total_licencias: 1600,
    licencias_asignadas: 0,
    umbral_alerta_pct: 85,
    observacion: 'Dotación Profesional y Clínica Salud APS (cmds-salud.cl)'
  },
  {
    id: 3,
    dominio_id: 2, // cmds-salud.cl
    tipo_licencia_id: 2, // Office 365 E1
    total_licencias: 400,
    licencias_asignadas: 0,
    umbral_alerta_pct: 85,
    observacion: 'Dotación Operativa Web + Teams Salud APS (cmds-salud.cl)'
  },
  {
    id: 4,
    dominio_id: 2, // cmds-salud.cl
    tipo_licencia_id: 3, // Microsoft 365 Business Basic (no Teams)
    total_licencias: 300,
    licencias_asignadas: 0,
    umbral_alerta_pct: 85,
    observacion: 'Cuentas Correo y Web sin Teams Salud APS (cmds-salud.cl)'
  },
  {
    id: 5,
    dominio_id: 3, // cmds-educacion.cl
    tipo_licencia_id: 4, // Office 365 A3 (Education Faculty Pricing)
    total_licencias: 5000,
    licencias_asignadas: 0,
    umbral_alerta_pct: 90,
    observacion: 'Docentes, Directivos y Funcionarios de Educación (cmds-educacion.cl)'
  },
  {
    id: 6,
    dominio_id: 3, // cmds-educacion.cl
    tipo_licencia_id: 5, // Office 365 A3 Student use benefit
    total_licencias: 200000,
    licencias_asignadas: 0,
    umbral_alerta_pct: 90,
    observacion: 'Beneficio Estudiantil para Alumnos de la Red Educativa CMDS (cmds-educacion.cl)'
  }
];

// ============================================================================
// LOS 89 ESTABLECIMIENTOS / UNIDADES OFICIALES DE CMDS
// ============================================================================
const RAW_UNIDADES_CMDS = [
  // CASA CENTRAL / ADMINISTRACIÓN (cmds.cl)
  { codigo_unidad: 301, cenco: 501131, nombre: 'SECRETARIA GENERAL EJECUTIVA', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 350, cenco: 501137, nombre: 'DIRECCION DE ADMINISTRACION Y FINANZAS (DAF)', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 355, cenco: 501144, nombre: 'DIRECCION DE RECURSOS HUMANOS', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 373, cenco: 501133, nombre: 'COMUNICACION Y ASUNTOS PUBLICOS', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 374, cenco: 501155, nombre: 'CONTROL INTERNO', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 375, cenco: 501132, nombre: 'DEPARTAMENTO JURIDICO', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 376, cenco: null, nombre: 'CALIDAD VIDA SANA', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 377, cenco: 501141, nombre: 'DEPARTAMENTO DE INFORMATICA (TI)', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 378, cenco: 501135, nombre: 'DEPARTAMENTO EXTRAESCOLAR', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 381, cenco: 501147, nombre: 'DEPARTAMENTO DE OBRAS', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 384, cenco: 503136, nombre: 'SUBVENCION ESCOLAR PREFERENCIAL (S.E.P.)', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 386, cenco: 501148, nombre: 'DEPARTAMENTO DE PLANIFICACION', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },
  { codigo_unidad: 400, cenco: 501134, nombre: 'DIRECCION DE EDUCACION (CASA CENTRAL)', sector: 'ADMINISTRACION', dominio_sugerido: 'cmds.cl' },

  // EDUCACIÓN: LICEOS, ESCUELAS, JARDINES VTF Y PIE (cmds-educacion.cl)
  { codigo_unidad: 12, cenco: 501001, nombre: 'LICEO A-12 COMERCIAL JERARDO MUÑOZ CAMPOS', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 13, cenco: 501009, nombre: 'LICEO B-13 JOSE SANTOS OSSA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 14, cenco: 501002, nombre: 'LICEO A-14 TECNICO', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 15, cenco: 501003, nombre: 'LICEO A-15 MARIO BAHAMONDES SILVA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 16, cenco: 501004, nombre: 'LICEO A-16 INDUSTRIAL EULOGIO GORDO MONEO', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 17, cenco: 501005, nombre: 'LICEO A-17 MARTA NAREA DIAZ', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 22, cenco: 501006, nombre: 'LICEO A-22 LA PORTADA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 26, cenco: 501007, nombre: 'LICEO A-26 OSCAR BONILLA BRADANOVIC', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 29, cenco: 501010, nombre: 'LICEO B-29 ANDRES SABELLA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 32, cenco: 501011, nombre: 'LICEO B-32 DOMINGO HERRERA RIVERA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 33, cenco: 501008, nombre: 'LICEO POLITECNICO A-33 LOS ARENALES', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 35, cenco: 501012, nombre: 'COLEGIO B-35 ANTONIO RENDIC', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 36, cenco: 501013, nombre: 'LICEO B-36 EXPERIMENTAL ARTISTICO', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 56, cenco: 501031, nombre: 'ESCUELA E-56 SANTIAGO AMENGUAL', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 57, cenco: 501032, nombre: 'ESCUELA E-57 JUAN PABLO II', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 58, cenco: 501014, nombre: 'ESCUELA D-58 JAPON', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 59, cenco: 501015, nombre: 'ESCUELA D-59 ESPAÑA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 60, cenco: 501042, nombre: 'ESCUELA F-60 ARMANDO CARRERA GONZALEZ', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 65, cenco: 501016, nombre: 'ESCUELA D-65 PADRE GUSTAVO LE PAIGE', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 66, cenco: 501017, nombre: 'ESCUELA D-66 REPUBLICA DE ITALIA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 67, cenco: 501033, nombre: 'ESCUELA E-67 CLAUDIO MATTE PEREZ', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 68, cenco: 501018, nombre: 'ESCUELA D-68 JOSE PAPIC RADNIC', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 72, cenco: 501019, nombre: 'ESCUELA D-72 LJUBICA DOMIC W.', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 73, cenco: 501020, nombre: 'ESCUELA D-73 REPUBLICA DE LOS EE.UU.', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 74, cenco: 501021, nombre: 'ESCUELA D-74 ALCALDE MAXIMILIANO POBLETE', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 75, cenco: 501022, nombre: 'ESCUELA D-75 DARIO SALAS DIAZ', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 77, cenco: 501034, nombre: 'ESCUELA E-77 JUAN SANDOVAL CARRASCO', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 78, cenco: 501043, nombre: 'ESCUELA F-78 GENERAL MANUEL BAQUEDANO', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 79, cenco: 501035, nombre: 'ESCUELA E-79 REPUBLICA DEL ECUADOR', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 80, cenco: 501036, nombre: 'ESCUELA E-80 ARTURO PRAT CHACON', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 81, cenco: 501037, nombre: 'ESCUELA E-81 HEROES DE LA CONCEPCION', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 84, cenco: 501038, nombre: 'ESCUELA E-84 LAS AMERICAS', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 85, cenco: 501023, nombre: 'ESCUELA D-85 ROMULO PEÑA MATURANA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 86, cenco: 501024, nombre: 'ESCUELA D-86 JUAN LOPEZ', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 87, cenco: 501039, nombre: 'ESCUELA E-87 LAS ROCAS', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 88, cenco: 501040, nombre: 'ESCUELA E-88', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 89, cenco: 501044, nombre: 'ESCUELA F-89 FUNDACION MINERA ESCONDIDA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 90, cenco: 501025, nombre: 'ESCUELA D-90 REPUBLICA DE ARGENTINA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 94, cenco: 501045, nombre: 'ESCUELA F-94 SANTIAGO RIFO', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 96, cenco: 501046, nombre: 'LICEO F-96', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 97, cenco: 501041, nombre: 'ESCUELA E-97 LA BANDERA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 111, cenco: 501049, nombre: 'ESCUELA G-111 GABRIELA MISTRAL', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 112, cenco: 501047, nombre: 'ESCUELA F-112', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 113, cenco: 501050, nombre: 'ESCUELA G-113', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 121, cenco: 501026, nombre: 'ESCUELA D-121 HUMBERTO GONZALEZ ECHEGOYEN', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 128, cenco: 501048, nombre: 'ESCUELA F-128', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 129, cenco: 501027, nombre: 'ESCUELA D-129 JUAN PABLO II', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 135, cenco: 501051, nombre: 'ESCUELA D-135', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 136, cenco: 501028, nombre: 'ESCUELA D-136 REVERENDO PADRE PATRICIO CARIOLA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 138, cenco: 501029, nombre: 'ESCUELA D-138 PADRE ALBERTO HURTADO', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 139, cenco: 501030, nombre: 'ESCUELA D-139 "ELMO FUNES"', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 501, cenco: 505072, nombre: 'JARDIN INFANTIL "ESPERANZA"', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 502, cenco: 505071, nombre: 'JARDIN INFANTIL "RIQUEZA ESCONDIDA"', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 503, cenco: 505074, nombre: 'JARDIN INFANTIL "RINCONCITO FELIZ"', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 504, cenco: 505073, nombre: 'SALA CUNA "PEDACITO DE SOL"', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 505, cenco: 505076, nombre: 'JARDIN INFANTIL ARBOLIA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 506, cenco: 505077, nombre: 'JARDIN INFANTIL CABALLITO DE MAR', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 507, cenco: 505078, nombre: 'JARDIN INFANTIL PORTAL DE BELEN', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 508, cenco: 505075, nombre: 'JARDIN INFANTIL PANKARITA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 509, cenco: 505079, nombre: 'JARDIN INFANTIL SUEÑO DE COLORES', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 510, cenco: 505080, nombre: 'JARDIN INFANTIL PERLITAS DEL DESIERTO', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 511, cenco: 501053, nombre: 'GUARDIAS VTF', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 512, cenco: 505081, nombre: 'JARDIN INFANTIL SEMILLITA', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },
  { codigo_unidad: 530, cenco: 504153, nombre: 'PROYECTO DE INTEGRACION ESCOLAR (PIE)', sector: 'EDUCACION', dominio_sugerido: 'cmds-educacion.cl' },

  // SALUD APS (cmds-salud.cl)
  { codigo_unidad: 600, cenco: 801014, nombre: 'DIRECCION DE SALUD ATENCION PRIMARIA', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 601, cenco: 801004, nombre: 'CESFAM DR. ANTONIO RENDIC', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 602, cenco: 801003, nombre: 'CESFAM CENTRO SUR', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 603, cenco: 801006, nombre: 'CESFAM CORVALLIS', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 604, cenco: 801002, nombre: 'CESFAM JUAN PABLO II', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 605, cenco: 801001, nombre: 'CESFAM NORTE', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 606, cenco: 801005, nombre: 'CESFAM ORIENTE', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 607, cenco: 801009, nombre: 'CENTRAL DE SERVICIOS SALUD', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 608, cenco: 801014, nombre: 'DIRECCION DE SALUD CODIGO DEL TRABAJO', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 610, cenco: 501087, nombre: 'UNIDAD SALUD 610', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 611, cenco: 801018, nombre: 'CESFAM DRA. MARIA CRISTINA ROJAS', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 612, cenco: 801012, nombre: 'DROGUERIA DE SALUD', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 613, cenco: 801021, nombre: 'FARMACIA COMUNAL', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 614, cenco: 801007, nombre: 'CESFAM VALDIVIESO', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 615, cenco: 801022, nombre: 'LABORATORIO CLINICO SARITA NUÑEZ', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 616, cenco: 801023, nombre: 'CECOSF COVIEFI', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 617, cenco: 801024, nombre: 'CECOSF LA CHIMBA', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 618, cenco: 801025, nombre: 'CPR SUR (CENTRO DE REHABILITACION)', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 619, cenco: 801026, nombre: 'SAR (SERVICIO DE ALTA RESOLUTIVIDAD)', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 620, cenco: 801027, nombre: 'CPR NORTE (CENTRO DE REHABILITACION)', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' },
  { codigo_unidad: 621, cenco: 801028, nombre: 'BODEGA DE SALUD', sector: 'SALUD', dominio_sugerido: 'cmds-salud.cl' }
];

const INITIAL_ESTABLECIMIENTOS = RAW_UNIDADES_CMDS.map((u, idx) => ({
  id: idx + 1,
  ...u
}));

// ============================================================================
// SEMILLA DEMOSTRATIVA INICIAL DE USUARIOS M365 Y ASIGNACIONES
// ============================================================================
function buildInitialDemoData() {
  const defaultHash = bcrypt.hashSync('Cmds365#2026!', 12);

  const usuarios_sistema = [
    {
      id: 1,
      username: 'rhormazabal@cmds.cl',
      nombre_completo: 'Rodrigo Hormazábal Figueroa',
      email: 'rhormazabal@cmds.cl',
      cargo: 'Jefe Unidad de Tecnologías de la Información',
      password_hash: defaultHash,
      rol_acceso: 'ADMIN_SISTEMA',
      ambito: 'GLOBAL',
      debe_cambiar_clave: false,
      activo: true,
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      ultimo_acceso: null,
      created_at: '2026-10-01T08:30:00.000Z'
    },
    {
      id: 2,
      username: 'admin',
      nombre_completo: 'Administrador General Licencias 365',
      email: 'ti@cmds.cl',
      cargo: 'Administrador Tenant Microsoft 365',
      password_hash: defaultHash,
      rol_acceso: 'ADMIN_SISTEMA',
      ambito: 'GLOBAL',
      debe_cambiar_clave: false,
      activo: true,
      intentos_fallidos: 0,
      bloqueado_hasta: null,
      ultimo_acceso: null,
      created_at: '2026-10-01T08:30:00.000Z'
    }
  ];

  // Usuarios M365 iniciales representativos de los 3 dominios y 6 pools
  const findEstId = (codigo) => {
    const found = INITIAL_ESTABLECIMIENTOS.find(e => e.codigo_unidad === codigo);
    return found ? found.id : 1;
  };

  const usuarios_m365 = [
    // cmds.cl (Pool 1: Office 365 E3)
    { id: 1, rut: '12.345.678-9', nombres: 'Rodrigo', apellidos: 'Hormazábal Figueroa', nombre_completo: 'Rodrigo Hormazábal Figueroa', email: 'rhormazabal@cmds.cl', dominio_id: 1, establecimiento_id: findEstId(377), cargo: 'Jefe Departamento de Informática', departamento: 'Informática', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-08-10T09:00:00.000Z', updated_at: '2026-08-10T09:00:00.000Z' },
    { id: 2, rut: '14.567.890-1', nombres: 'María', apellidos: 'Tapia Cortés', nombre_completo: 'María Tapia Cortés', email: 'mtapia@cmds.cl', dominio_id: 1, establecimiento_id: findEstId(301), cargo: 'Secretaria General Ejecutiva', departamento: 'Dirección Ejecutiva', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-08-12T10:00:00.000Z', updated_at: '2026-08-12T10:00:00.000Z' },
    { id: 3, rut: '11.222.333-4', nombres: 'Carlos', apellidos: 'Mondaca Valdés', nombre_completo: 'Carlos Mondaca Valdés', email: 'cmondaca@cmds.cl', dominio_id: 1, establecimiento_id: findEstId(350), cargo: 'Director de Administración y Finanzas', departamento: 'DAF', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-08-14T11:00:00.000Z', updated_at: '2026-08-14T11:00:00.000Z' },
    { id: 4, rut: '15.887.412-3', nombres: 'Andrea', apellidos: 'Sepúlveda Muñoz', nombre_completo: 'Andrea Sepúlveda Muñoz', email: 'asepulveda@cmds.cl', dominio_id: 1, establecimiento_id: findEstId(355), cargo: 'Analista de Remuneraciones', departamento: 'Recursos Humanos', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-09-02T09:30:00.000Z', updated_at: '2026-09-02T09:30:00.000Z' },
    { id: 5, rut: '13.456.111-2', nombres: 'Mauricio', apellidos: 'Gutiérrez Rojas', nombre_completo: 'Mauricio Gutiérrez Rojas', email: 'mgutierrez@cmds.cl', dominio_id: 1, establecimiento_id: findEstId(375), cargo: 'Abogado Asesor', departamento: 'Jurídico', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-09-10T15:00:00.000Z', updated_at: '2026-09-10T15:00:00.000Z' },
    { id: 6, rut: '10.998.231-K', nombres: 'Hernán', apellidos: 'Fuentes Lira', nombre_completo: 'Hernán Fuentes Lira', email: 'hfuentes@cmds.cl', dominio_id: 1, establecimiento_id: findEstId(381), cargo: 'Arquitecto Revisor', departamento: 'Obras', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'BAJA', created_at: '2026-08-20T09:00:00.000Z', updated_at: '2026-10-28T17:30:00.000Z' },

    // cmds-salud.cl (Pool 2: E3, Pool 3: E1, Pool 4: Business Basic no Teams)
    { id: 7, rut: '13.777.888-9', nombres: 'Jorge', apellidos: 'Rojas Miranda', nombre_completo: 'Dr. Jorge Rojas Miranda', email: 'jrojas@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(600), cargo: 'Director de Salud APS', departamento: 'Dirección de Salud', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-08-15T08:30:00.000Z', updated_at: '2026-08-15T08:30:00.000Z' },
    { id: 8, rut: '16.543.210-4', nombres: 'Valentina', apellidos: 'Araya Gómez', nombre_completo: 'Dra. Valentina Araya Gómez', email: 'varaya@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(605), cargo: 'Médico Jefe SOME', departamento: 'Medicina General', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-09-01T08:45:00.000Z', updated_at: '2026-09-01T08:45:00.000Z' },
    { id: 9, rut: '17.112.334-5', nombres: 'Sebastián', apellidos: 'Vargas Contreras', nombre_completo: 'Sebastián Vargas Contreras', email: 'svargas@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(601), cargo: 'Enfermero Coordinador', departamento: 'Clínico', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-09-05T10:15:00.000Z', updated_at: '2026-09-05T10:15:00.000Z' },
    { id: 10, rut: '18.223.445-6', nombres: 'Camila', apellidos: 'Pizarro Alfaro', nombre_completo: 'Camila Pizarro Alfaro', email: 'cpizarro@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(603), cargo: 'Matrona Clínica', departamento: 'Salud Mujer', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-09-12T11:20:00.000Z', updated_at: '2026-09-12T11:20:00.000Z' },
    { id: 11, rut: '15.334.556-7', nombres: 'Gonzalo', apellidos: 'Díaz Cortés', nombre_completo: 'Gonzalo Díaz Cortés', email: 'gdiaz@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(602), cargo: 'TENS Admisión SOME', departamento: 'SOME', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-09-18T09:00:00.000Z', updated_at: '2026-09-18T09:00:00.000Z' },
    { id: 12, rut: '19.445.667-8', nombres: 'Daniela', apellidos: 'Morales Silva', nombre_completo: 'Daniela Morales Silva', email: 'dmorales@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(613), cargo: 'Químico Farmacéutico', departamento: 'Farmacia Comunal', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-10-02T14:00:00.000Z', updated_at: '2026-10-02T14:00:00.000Z' },
    { id: 13, rut: '14.889.001-2', nombres: 'Claudio', apellidos: 'Núñez Rivera', nombre_completo: 'Claudio Núñez Rivera', email: 'cnunez@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(612), cargo: 'Encargado Bodega e Insumos', departamento: 'Droguería', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-10-08T12:10:00.000Z', updated_at: '2026-10-08T12:10:00.000Z' },
    { id: 14, rut: '16.778.990-1', nombres: 'Fabiola', apellidos: 'Zepeda Toro', nombre_completo: 'Fabiola Zepeda Toro', email: 'fzepeda@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(606), cargo: 'Administrativa OIRS', departamento: 'Atención Usuario', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-10-15T09:40:00.000Z', updated_at: '2026-10-15T09:40:00.000Z' },
    { id: 15, rut: '12.654.987-3', nombres: 'Ricardo', apellidos: 'Olivares Páez', nombre_completo: 'Dr. Ricardo Olivares Páez', email: 'rolivares@cmds-salud.cl', dominio_id: 2, establecimiento_id: findEstId(604), cargo: 'Médico APS', departamento: 'Medicina General', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'BAJA', created_at: '2026-08-25T09:00:00.000Z', updated_at: '2026-11-03T18:00:00.000Z' },

    // cmds-educacion.cl (Pool 5: A3 Faculty, Pool 6: A3 Student)
    { id: 16, rut: '15.444.555-6', nombres: 'Patricia', apellidos: 'Alvear Silva', nombre_completo: 'Patricia Alvear Silva', email: 'palvear@cmds-educacion.cl', dominio_id: 3, establecimiento_id: findEstId(12), cargo: 'Directora Liceo A-12', departamento: 'Equipo Directivo', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-08-18T08:00:00.000Z', updated_at: '2026-08-18T08:00:00.000Z' },
    { id: 17, rut: '13.221.445-9', nombres: 'Roberto', apellidos: 'Carrasco Valdés', nombre_completo: 'Roberto Carrasco Valdés', email: 'rcarrasco@cmds-educacion.cl', dominio_id: 3, establecimiento_id: findEstId(16), cargo: 'Jefe UTP', departamento: 'Unidad Técnico Pedagógica', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-09-03T08:30:00.000Z', updated_at: '2026-09-03T08:30:00.000Z' },
    { id: 18, rut: '17.889.112-K', nombres: 'Marcela', apellidos: 'Godoy Espinoza', nombre_completo: 'Marcela Godoy Espinoza', email: 'mgodoy@cmds-educacion.cl', dominio_id: 3, establecimiento_id: findEstId(75), cargo: 'Docente Matemática', departamento: 'Segundo Ciclo Básico', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-09-14T10:00:00.000Z', updated_at: '2026-09-14T10:00:00.000Z' },
    { id: 19, rut: '18.901.234-1', nombres: 'Felipe', apellidos: 'Rojas Vega', nombre_completo: 'Felipe Rojas Vega', email: 'frojas@cmds-educacion.cl', dominio_id: 3, establecimiento_id: findEstId(29), cargo: 'Docente Historia y Cs. Sociales', departamento: 'Enseñanza Media', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-10-01T09:10:00.000Z', updated_at: '2026-10-01T09:10:00.000Z' },
    { id: 20, rut: '16.123.789-4', nombres: 'Paulina', apellidos: 'Cárdenas Soto', nombre_completo: 'Paulina Cárdenas Soto', email: 'pcardenas@cmds-educacion.cl', dominio_id: 3, establecimiento_id: findEstId(530), cargo: 'Educadora Diferencial PIE', departamento: 'Integración Escolar', tipo_usuario: 'FUNCIONARIO', estado_cuenta: 'ACTIVO', created_at: '2026-10-10T11:30:00.000Z', updated_at: '2026-10-10T11:30:00.000Z' },
    { id: 21, rut: '23.456.789-0', nombres: 'Matías Ignacio', apellidos: 'Salazar Castillo', nombre_completo: 'Matías Ignacio Salazar Castillo', email: 'matias.salazar@cmds-educacion.cl', dominio_id: 3, establecimiento_id: findEstId(15), cargo: 'Estudiante 3° Medio A', departamento: 'Alumnado', tipo_usuario: 'ESTUDIANTE', estado_cuenta: 'ACTIVO', created_at: '2026-10-18T12:00:00.000Z', updated_at: '2026-10-18T12:00:00.000Z' },
    { id: 22, rut: '24.112.233-5', nombres: 'Sofía Paz', apellidos: 'Henríquez Araya', nombre_completo: 'Sofía Paz Henríquez Araya', email: 'sofia.henriquez@cmds-educacion.cl', dominio_id: 3, establecimiento_id: findEstId(35), cargo: 'Estudiante 4° Medio B', departamento: 'Alumnado', tipo_usuario: 'ESTUDIANTE', estado_cuenta: 'ACTIVO', created_at: '2026-10-20T12:15:00.000Z', updated_at: '2026-10-20T12:15:00.000Z' },
    { id: 23, rut: '24.556.677-8', nombres: 'Benjamín Alonso', apellidos: 'Cortés Tapia', nombre_completo: 'Benjamín Alonso Cortés Tapia', email: 'benjamin.cortes@cmds-educacion.cl', dominio_id: 3, establecimiento_id: findEstId(22), cargo: 'Estudiante 2° Medio C', departamento: 'Alumnado', tipo_usuario: 'ESTUDIANTE', estado_cuenta: 'ACTIVO', created_at: '2026-11-02T10:30:00.000Z', updated_at: '2026-11-02T10:30:00.000Z' }
  ];

  // Asignaciones de licencias para estos usuarios (incluyendo 2 revocadas por baja)
  const asignaciones_licencia = [
    // cmds.cl -> Cupo 1 (Office 365 E3)
    { id: 1, usuario_id: 1, cupo_licencia_id: 1, estado: 'ACTIVA', numero_ticket: 'TK-2026-001', asignado_por: 'rhormazabal@cmds.cl', observaciones: 'Asignación Jefatura TI', fecha_alta: '2026-08-10T09:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 2, usuario_id: 2, cupo_licencia_id: 1, estado: 'ACTIVA', numero_ticket: 'TK-2026-002', asignado_por: 'rhormazabal@cmds.cl', observaciones: 'Asignación Dirección Ejecutiva', fecha_alta: '2026-08-12T10:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 3, usuario_id: 3, cupo_licencia_id: 1, estado: 'ACTIVA', numero_ticket: 'TK-2026-003', asignado_por: 'rhormazabal@cmds.cl', observaciones: 'Asignación Dirección DAF', fecha_alta: '2026-08-14T11:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 4, usuario_id: 4, cupo_licencia_id: 1, estado: 'ACTIVA', numero_ticket: 'TK-2026-014', asignado_por: 'admin.central@cmds.cl', observaciones: 'Incorporación RRHH', fecha_alta: '2026-09-02T09:30:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 5, usuario_id: 5, cupo_licencia_id: 1, estado: 'ACTIVA', numero_ticket: 'TK-2026-021', asignado_por: 'admin.central@cmds.cl', observaciones: 'Abogado Depto. Jurídico', fecha_alta: '2026-09-10T15:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 6, usuario_id: 6, cupo_licencia_id: 1, estado: 'REVOCADA', numero_ticket: 'TK-2026-008', asignado_por: 'admin.central@cmds.cl', observaciones: 'Arquitecto Obras', fecha_alta: '2026-08-20T09:00:00.000Z', fecha_baja: '2026-10-28T17:30:00.000Z', motivo_baja: 'Término de contrato / Renuncia voluntaria' },

    // cmds-salud.cl -> Cupo 2 (E3), Cupo 3 (E1), Cupo 4 (Business Basic no Teams)
    { id: 7, usuario_id: 7, cupo_licencia_id: 2, estado: 'ACTIVA', numero_ticket: 'TK-SAL-101', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Dirección de Salud APS', fecha_alta: '2026-08-15T08:30:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 8, usuario_id: 8, cupo_licencia_id: 2, estado: 'ACTIVA', numero_ticket: 'TK-SAL-104', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Jefatura SOME CESFAM Norte', fecha_alta: '2026-09-01T08:45:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 9, usuario_id: 9, cupo_licencia_id: 2, estado: 'ACTIVA', numero_ticket: 'TK-SAL-109', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Coordinación Clínica CESFAM Rendic', fecha_alta: '2026-09-05T10:15:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 10, usuario_id: 10, cupo_licencia_id: 2, estado: 'ACTIVA', numero_ticket: 'TK-SAL-115', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Box Matrona CESFAM Corvallis', fecha_alta: '2026-09-12T11:20:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 11, usuario_id: 11, cupo_licencia_id: 3, estado: 'ACTIVA', numero_ticket: 'TK-SAL-122', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Cuenta E1 Admisión SOME Centro Sur', fecha_alta: '2026-09-18T09:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 12, usuario_id: 12, cupo_licencia_id: 3, estado: 'ACTIVA', numero_ticket: 'TK-SAL-130', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Cuenta E1 Farmacia Comunal', fecha_alta: '2026-10-02T14:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 13, usuario_id: 13, cupo_licencia_id: 4, estado: 'ACTIVA', numero_ticket: 'TK-SAL-138', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Licencia Business Basic (sin Teams) Droguería', fecha_alta: '2026-10-08T12:10:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 14, usuario_id: 14, cupo_licencia_id: 4, estado: 'ACTIVA', numero_ticket: 'TK-SAL-142', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Licencia Business Basic (sin Teams) OIRS Oriente', fecha_alta: '2026-10-15T09:40:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 15, usuario_id: 15, cupo_licencia_id: 2, estado: 'REVOCADA', numero_ticket: 'TK-SAL-102', asignado_por: 'salud@cmds-salud.cl', observaciones: 'Médico CESFAM Juan Pablo II', fecha_alta: '2026-08-25T09:00:00.000Z', fecha_baja: '2026-11-03T18:00:00.000Z', motivo_baja: 'Traslado de servicio de salud' },

    // cmds-educacion.cl -> Cupo 5 (A3 Faculty), Cupo 6 (A3 Student)
    { id: 16, usuario_id: 16, cupo_licencia_id: 5, estado: 'ACTIVA', numero_ticket: 'TK-EDU-201', asignado_por: 'educacion@cmds-educacion.cl', observaciones: 'Dirección Liceo A-12', fecha_alta: '2026-08-18T08:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 17, usuario_id: 17, cupo_licencia_id: 5, estado: 'ACTIVA', numero_ticket: 'TK-EDU-205', asignado_por: 'educacion@cmds-educacion.cl', observaciones: 'Jefatura UTP Liceo Industrial A-16', fecha_alta: '2026-09-03T08:30:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 18, usuario_id: 18, cupo_licencia_id: 5, estado: 'ACTIVA', numero_ticket: 'TK-EDU-212', asignado_por: 'educacion@cmds-educacion.cl', observaciones: 'Docente Escuela D-75 Darío Salas', fecha_alta: '2026-09-14T10:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 19, usuario_id: 19, cupo_licencia_id: 5, estado: 'ACTIVA', numero_ticket: 'TK-EDU-220', asignado_por: 'educacion@cmds-educacion.cl', observaciones: 'Docente Liceo B-29 Andrés Sabella', fecha_alta: '2026-10-01T09:10:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 20, usuario_id: 20, cupo_licencia_id: 5, estado: 'ACTIVA', numero_ticket: 'TK-EDU-229', asignado_por: 'educacion@cmds-educacion.cl', observaciones: 'Profesional PIE Comunal', fecha_alta: '2026-10-10T11:30:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 21, usuario_id: 21, cupo_licencia_id: 6, estado: 'ACTIVA', numero_ticket: 'MAT-2026-01', asignado_por: 'educacion@cmds-educacion.cl', observaciones: 'Beneficio Estudiantil A3 Liceo A-15', fecha_alta: '2026-10-18T12:00:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 22, usuario_id: 22, cupo_licencia_id: 6, estado: 'ACTIVA', numero_ticket: 'MAT-2026-02', asignado_por: 'educacion@cmds-educacion.cl', observaciones: 'Beneficio Estudiantil A3 Colegio B-35 Rendic', fecha_alta: '2026-10-20T12:15:00.000Z', fecha_baja: null, motivo_baja: null },
    { id: 23, usuario_id: 23, cupo_licencia_id: 6, estado: 'ACTIVA', numero_ticket: 'MAT-2026-03', asignado_por: 'educacion@cmds-educacion.cl', observaciones: 'Beneficio Estudiantil A3 Liceo A-22 La Portada', fecha_alta: '2026-11-02T10:30:00.000Z', fecha_baja: null, motivo_baja: null }
  ];

  // Generar bitácora de movimientos a partir de las asignaciones
  const movimientos_licencia = [];
  let movId = 1;
  for (const asig of asignaciones_licencia) {
    const u = usuarios_m365.find(x => x.id === asig.usuario_id);
    const cupo = INITIAL_CUPOS_LICENCIA.find(c => c.id === asig.cupo_licencia_id);
    const dom = INITIAL_DOMINIOS.find(d => d.id === cupo.dominio_id);
    const lic = INITIAL_TIPOS_LICENCIA.find(t => t.id === cupo.tipo_licencia_id);
    const est = INITIAL_ESTABLECIMIENTOS.find(e => e.id === u.establecimiento_id);

    movimientos_licencia.push({
      id: movId++,
      tipo_movimiento: 'ALTA',
      usuario_id: u.id,
      usuario_email: u.email,
      usuario_nombre: u.nombre_completo,
      cupo_licencia_id: cupo.id,
      dominio_nombre: dom.dominio,
      licencia_nombre: lic.nombre,
      establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
      motivo: asig.observaciones || 'Alta inicial de licencia Microsoft 365',
      ticket_referencia: asig.numero_ticket || 'S/N',
      ejecutado_por: asig.asignado_por,
      fecha_movimiento: asig.fecha_alta
    });

    if (asig.estado === 'REVOCADA' && asig.fecha_baja) {
      movimientos_licencia.push({
        id: movId++,
        tipo_movimiento: 'BAJA',
        usuario_id: u.id,
        usuario_email: u.email,
        usuario_nombre: u.nombre_completo,
        cupo_licencia_id: cupo.id,
        dominio_nombre: dom.dominio,
        licencia_nombre: lic.nombre,
        establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
        motivo: asig.motivo_baja || 'Baja de licencia y liberación de cupo',
        ticket_referencia: `${asig.numero_ticket}-BAJA`,
        ejecutado_por: asig.asignado_por,
        fecha_movimiento: asig.fecha_baja
      });
    }
  }

  // Recalcular contadores asignados
  const cuposConConteo = INITIAL_CUPOS_LICENCIA.map(c => {
    const activas = asignaciones_licencia.filter(a => a.cupo_licencia_id === c.id && a.estado === 'ACTIVA').length;
    return {
      ...c,
      licencias_asignadas: activas
    };
  });

  return {
    dominios: INITIAL_DOMINIOS,
    tipos_licencia: INITIAL_TIPOS_LICENCIA,
    cupos_licencia: cuposConConteo,
    establecimientos: INITIAL_ESTABLECIMIENTOS,
    usuarios_m365,
    asignaciones_licencia,
    movimientos_licencia,
    usuarios_sistema,
    auditoria_accesos: [
      {
        id: 1,
        username: 'rhormazabal@cmds.cl',
        accion: 'INICIALIZACION_SISTEMA',
        ip: '127.0.0.1',
        exito: true,
        detalle: 'Aprovisionamiento inicial de Tenant Microsoft 365 CMDS (207.500 licencias en 3 dominios)',
        fecha: '2026-11-13T09:00:00.000Z'
      }
    ]
  };
}

// ============================================================================
// LECTURA / ESCRITURA STORE LOCAL DE RESPALDO
// ============================================================================
const REMOVED_DEMO_SYSTEM_USERS = new Set([
  'admin.central@cmds.cl',
  'educacion@cmds-educacion.cl',
  'salud@cmds-salud.cl',
  'auditor@cmds.cl',
  'consulta.salud@cmds-salud.cl',
  'consulta.educacion@cmds-educacion.cl'
]);

function readLocalStore() {
  try {
    if (fs.existsSync(STORE_PATH)) {
      const raw = fs.readFileSync(STORE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.dominios) && Array.isArray(parsed.cupos_licencia)) {
        if (Array.isArray(parsed.usuarios_sistema)) {
          const prevLen = parsed.usuarios_sistema.length;
          parsed.usuarios_sistema = parsed.usuarios_sistema.filter(
            u => !REMOVED_DEMO_SYSTEM_USERS.has(String(u.username || '').toLowerCase())
          );
          if (parsed.usuarios_sistema.length !== prevLen) {
            writeLocalStore(parsed);
          }
        }
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[DB] Advertencia leyendo store local:', e.message);
  }
  const initial = buildInitialDemoData();
  writeLocalStore(initial);
  return initial;
}

function writeLocalStore(data) {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('[DB] Advertencia escribiendo store local:', e.message);
  }
}

// ============================================================================
// CONEXIÓN Y AUTO-APROVISIONAMIENTO POSTGRESQL (192.168.30.47:5432)
// ============================================================================
let pgPool = null;
let pgAvailable = false;
const targetDbName = process.env.PG_DB || 'bd_licencias_365';

async function ensureDatabaseExists() {
  const adminClient = new Client({
    host: process.env.PG_HOST || '192.168.30.47',
    port: Number(process.env.PG_PORT || 5432),
    user: process.env.PG_USER || 'cmds_admin',
    password: process.env.PG_PASS || '',
    database: 'postgres',
    connectionTimeoutMillis: 4500
  });

  await adminClient.connect();
  try {
    const check = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [targetDbName]);
    if (check.rowCount === 0) {
      console.log(`[DB] Creando base de datos PostgreSQL '${targetDbName}' en ${process.env.PG_HOST || '192.168.30.47'}...`);
      await adminClient.query(`CREATE DATABASE "${targetDbName}" ENCODING 'UTF8'`);
      console.log(`[DB] Base de datos '${targetDbName}' creada exitosamente.`);
    }
  } finally {
    await adminClient.end();
  }
}

async function initDatabase() {
  const store = readLocalStore();
  try {
    await ensureDatabaseExists();

    pgPool = new Pool({
      host: process.env.PG_HOST || '192.168.30.47',
      port: Number(process.env.PG_PORT || 5432),
      user: process.env.PG_USER || 'cmds_admin',
      password: process.env.PG_PASS || '',
      database: targetDbName,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 4500
    });

    const client = await pgPool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS dominios (
          id SERIAL PRIMARY KEY,
          dominio VARCHAR(120) UNIQUE NOT NULL,
          nombre VARCHAR(200) NOT NULL,
          sector VARCHAR(50) NOT NULL,
          descripcion TEXT,
          activo BOOLEAN DEFAULT TRUE
        );

        CREATE TABLE IF NOT EXISTS tipos_licencia (
          id SERIAL PRIMARY KEY,
          codigo_sku VARCHAR(80) UNIQUE NOT NULL,
          sku_microsoft VARCHAR(100),
          nombre VARCHAR(220) NOT NULL,
          categoria VARCHAR(50) NOT NULL DEFAULT 'FUNCIONARIO',
          incluye_apps TEXT,
          incluye_teams BOOLEAN DEFAULT TRUE,
          color_hex VARCHAR(20) DEFAULT '#016098'
        );

        CREATE TABLE IF NOT EXISTS cupos_licencia (
          id SERIAL PRIMARY KEY,
          dominio_id INTEGER NOT NULL REFERENCES dominios(id) ON DELETE CASCADE,
          tipo_licencia_id INTEGER NOT NULL REFERENCES tipos_licencia(id) ON DELETE CASCADE,
          total_licencias INTEGER NOT NULL DEFAULT 0,
          licencias_asignadas INTEGER NOT NULL DEFAULT 0,
          umbral_alerta_pct INTEGER NOT NULL DEFAULT 85,
          observacion TEXT,
          UNIQUE(dominio_id, tipo_licencia_id)
        );

        CREATE TABLE IF NOT EXISTS establecimientos (
          id SERIAL PRIMARY KEY,
          codigo_unidad INTEGER UNIQUE NOT NULL,
          cenco INTEGER,
          nombre VARCHAR(250) NOT NULL,
          sector VARCHAR(50) NOT NULL,
          dominio_sugerido VARCHAR(120) NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usuarios_m365 (
          id SERIAL PRIMARY KEY,
          rut VARCHAR(30),
          nombres VARCHAR(150) NOT NULL,
          apellidos VARCHAR(150) NOT NULL,
          nombre_completo VARCHAR(300) NOT NULL,
          email VARCHAR(220) UNIQUE NOT NULL,
          email_alias VARCHAR(220) DEFAULT '',
          dominio_id INTEGER NOT NULL REFERENCES dominios(id),
          establecimiento_id INTEGER REFERENCES establecimientos(id),
          cargo VARCHAR(180),
          departamento VARCHAR(180),
          tipo_cuenta VARCHAR(30) DEFAULT 'PERSONA',
          tipo_usuario VARCHAR(40) DEFAULT 'FUNCIONARIO',
          estado_cuenta VARCHAR(40) DEFAULT 'ACTIVO',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        ALTER TABLE usuarios_m365 ADD COLUMN IF NOT EXISTS email_alias VARCHAR(220) DEFAULT '';
        ALTER TABLE usuarios_m365 ADD COLUMN IF NOT EXISTS tipo_cuenta VARCHAR(30) DEFAULT 'PERSONA';

        CREATE TABLE IF NOT EXISTS asignaciones_licencia (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL REFERENCES usuarios_m365(id) ON DELETE CASCADE,
          cupo_licencia_id INTEGER NOT NULL REFERENCES cupos_licencia(id) ON DELETE CASCADE,
          estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVA',
          numero_ticket VARCHAR(80),
          asignado_por VARCHAR(150),
          observaciones TEXT,
          fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          fecha_baja TIMESTAMP,
          motivo_baja TEXT
        );

        CREATE TABLE IF NOT EXISTS movimientos_licencia (
          id SERIAL PRIMARY KEY,
          tipo_movimiento VARCHAR(50) NOT NULL,
          usuario_id INTEGER,
          usuario_email VARCHAR(220),
          usuario_nombre VARCHAR(300),
          cupo_licencia_id INTEGER,
          dominio_nombre VARCHAR(120),
          licencia_nombre VARCHAR(220),
          establecimiento_nombre VARCHAR(250),
          motivo TEXT,
          ticket_referencia VARCHAR(100),
          ejecutado_por VARCHAR(150),
          fecha_movimiento TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS usuarios_sistema (
          id SERIAL PRIMARY KEY,
          username VARCHAR(150) UNIQUE NOT NULL,
          nombre_completo VARCHAR(250) NOT NULL,
          email VARCHAR(200) NOT NULL,
          cargo VARCHAR(180),
          password_hash TEXT NOT NULL,
          rol_acceso VARCHAR(40) NOT NULL DEFAULT 'VISUALIZADOR',
          ambito VARCHAR(40) NOT NULL DEFAULT 'GLOBAL',
          debe_cambiar_clave BOOLEAN DEFAULT FALSE,
          activo BOOLEAN DEFAULT TRUE,
          intentos_fallidos INTEGER DEFAULT 0,
          bloqueado_hasta TIMESTAMP,
          ultimo_acceso TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS auditoria_accesos (
          id SERIAL PRIMARY KEY,
          username VARCHAR(150),
          accion VARCHAR(100) NOT NULL,
          ip VARCHAR(80),
          exito BOOLEAN DEFAULT TRUE,
          detalle TEXT,
          fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Poblar tablas si están vacías
      const domCount = await client.query('SELECT COUNT(*)::int AS cnt FROM dominios');
      if (domCount.rows[0].cnt === 0) {
        console.log('[DB] Sembrando datos iniciales de Microsoft 365 CMDS en PostgreSQL...');
        for (const d of store.dominios) {
          await client.query(
            `INSERT INTO dominios (id, dominio, nombre, sector, descripcion, activo)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (dominio) DO NOTHING`,
            [d.id, d.dominio, d.nombre, d.sector, d.descripcion, d.activo]
          );
        }
        await client.query(`SELECT setval('dominios_id_seq', (SELECT COALESCE(MAX(id), 1) FROM dominios))`);

        for (const t of store.tipos_licencia) {
          await client.query(
            `INSERT INTO tipos_licencia (id, codigo_sku, sku_microsoft, nombre, categoria, incluye_apps, incluye_teams, color_hex)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (codigo_sku) DO NOTHING`,
            [t.id, t.codigo_sku, t.sku_microsoft, t.nombre, t.categoria, t.incluye_apps, t.incluye_teams, t.color_hex]
          );
        }
        await client.query(`SELECT setval('tipos_licencia_id_seq', (SELECT COALESCE(MAX(id), 1) FROM tipos_licencia))`);

        for (const c of store.cupos_licencia) {
          await client.query(
            `INSERT INTO cupos_licencia (id, dominio_id, tipo_licencia_id, total_licencias, licencias_asignadas, umbral_alerta_pct, observacion)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (dominio_id, tipo_licencia_id) DO NOTHING`,
            [c.id, c.dominio_id, c.tipo_licencia_id, c.total_licencias, c.licencias_asignadas, c.umbral_alerta_pct, c.observacion]
          );
        }
        await client.query(`SELECT setval('cupos_licencia_id_seq', (SELECT COALESCE(MAX(id), 1) FROM cupos_licencia))`);

        for (const e of store.establecimientos) {
          await client.query(
            `INSERT INTO establecimientos (id, codigo_unidad, cenco, nombre, sector, dominio_sugerido)
             VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (codigo_unidad) DO NOTHING`,
            [e.id, e.codigo_unidad, e.cenco, e.nombre, e.sector, e.dominio_sugerido]
          );
        }
        await client.query(`SELECT setval('establecimientos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM establecimientos))`);

        for (const u of store.usuarios_m365) {
          await client.query(
            `INSERT INTO usuarios_m365 (id, rut, nombres, apellidos, nombre_completo, email, dominio_id, establecimiento_id, cargo, departamento, tipo_usuario, estado_cuenta, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (email) DO NOTHING`,
            [u.id, u.rut, u.nombres, u.apellidos, u.nombre_completo, u.email, u.dominio_id, u.establecimiento_id, u.cargo, u.departamento, u.tipo_usuario, u.estado_cuenta, u.created_at, u.updated_at]
          );
        }
        await client.query(`SELECT setval('usuarios_m365_id_seq', (SELECT COALESCE(MAX(id), 1) FROM usuarios_m365))`);

        for (const a of store.asignaciones_licencia) {
          await client.query(
            `INSERT INTO asignaciones_licencia (id, usuario_id, cupo_licencia_id, estado, numero_ticket, asignado_por, observaciones, fecha_alta, fecha_baja, motivo_baja)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
            [a.id, a.usuario_id, a.cupo_licencia_id, a.estado, a.numero_ticket, a.asignado_por, a.observaciones, a.fecha_alta, a.fecha_baja, a.motivo_baja]
          );
        }
        await client.query(`SELECT setval('asignaciones_licencia_id_seq', (SELECT COALESCE(MAX(id), 1) FROM asignaciones_licencia))`);

        for (const m of store.movimientos_licencia) {
          await client.query(
            `INSERT INTO movimientos_licencia (id, tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) ON CONFLICT (id) DO NOTHING`,
            [m.id, m.tipo_movimiento, m.usuario_id, m.usuario_email, m.usuario_nombre, m.cupo_licencia_id, m.dominio_nombre, m.licencia_nombre, m.establecimiento_nombre, m.motivo, m.ticket_referencia, m.ejecutado_por, m.fecha_movimiento]
          );
        }
        await client.query(`SELECT setval('movimientos_licencia_id_seq', (SELECT COALESCE(MAX(id), 1) FROM movimientos_licencia))`);

        for (const s of store.usuarios_sistema) {
          await client.query(
            `INSERT INTO usuarios_sistema (id, username, nombre_completo, email, cargo, password_hash, rol_acceso, ambito, debe_cambiar_clave, activo, intentos_fallidos, bloqueado_hasta, ultimo_acceso, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) ON CONFLICT (username) DO NOTHING`,
            [s.id, s.username, s.nombre_completo, s.email, s.cargo, s.password_hash, s.rol_acceso, s.ambito, s.debe_cambiar_clave, s.activo, s.intentos_fallidos, s.bloqueado_hasta, s.ultimo_acceso, s.created_at]
          );
        }
        await client.query(`SELECT setval('usuarios_sistema_id_seq', (SELECT COALESCE(MAX(id), 1) FROM usuarios_sistema))`);

        for (const aud of store.auditoria_accesos) {
          await client.query(
            `INSERT INTO auditoria_accesos (id, username, accion, ip, exito, detalle, fecha)
             VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO NOTHING`,
            [aud.id, aud.username, aud.accion, aud.ip, aud.exito, aud.detalle, aud.fecha]
          );
        }
        await client.query(`SELECT setval('auditoria_accesos_id_seq', (SELECT COALESCE(MAX(id), 1) FROM auditoria_accesos))`);
      }

      // Eliminar cuentas demostrativas iniciales solicitadas por el administrador
      await client.query(
        `DELETE FROM usuarios_sistema WHERE LOWER(username) = ANY($1)`,
        [Array.from(REMOVED_DEMO_SYSTEM_USERS)]
      );

      // Sincronizar store local desde PostgreSQL para mantener espejo actualizado
      await syncPgToLocal(pgPool);
      pgAvailable = true;
      console.log(`[DB] Conectado a PostgreSQL (${process.env.PG_HOST || '192.168.30.47'}:${process.env.PG_PORT || 5432}/${targetDbName}) — Tablas listas.`);
    } finally {
      client.release();
    }
  } catch (err) {
    pgAvailable = false;
    console.warn(`[DB] PostgreSQL no disponible (${err.message}). Operando con motor local sincronizado (store.json).`);
  }
}

let lastStoreWriteTime = 0;

async function syncPgToLocal(clientOrPool) {
  const runner = clientOrPool || pgPool;
  if (!runner) return readLocalStore();

  // Recalcular contadores de licencias_asignadas en PG antes de leer
  await runner.query(`
    UPDATE cupos_licencia c
    SET licencias_asignadas = COALESCE((
      SELECT COUNT(*)::int
      FROM asignaciones_licencia a
      WHERE a.cupo_licencia_id = c.id AND a.estado = 'ACTIVA'
    ), 0)
  `);

  const [
    domRes,
    tipRes,
    cupRes,
    estRes,
    usrRes,
    asgRes,
    movRes,
    sysRes,
    audRes
  ] = await Promise.all([
    runner.query('SELECT * FROM dominios ORDER BY id ASC'),
    runner.query('SELECT * FROM tipos_licencia ORDER BY id ASC'),
    runner.query('SELECT * FROM cupos_licencia ORDER BY id ASC'),
    runner.query('SELECT * FROM establecimientos ORDER BY codigo_unidad ASC'),
    runner.query('SELECT * FROM usuarios_m365 ORDER BY id DESC'),
    runner.query('SELECT * FROM asignaciones_licencia ORDER BY id DESC'),
    runner.query('SELECT * FROM movimientos_licencia ORDER BY fecha_movimiento DESC, id DESC LIMIT 15000'),
    runner.query('SELECT * FROM usuarios_sistema ORDER BY id ASC'),
    runner.query('SELECT * FROM auditoria_accesos ORDER BY fecha DESC, id DESC LIMIT 500')
  ]);

  const synced = {
    dominios: domRes.rows,
    tipos_licencia: tipRes.rows,
    cupos_licencia: cupRes.rows,
    establecimientos: estRes.rows,
    usuarios_m365: usrRes.rows,
    asignaciones_licencia: asgRes.rows,
    movimientos_licencia: movRes.rows,
    usuarios_sistema: sysRes.rows,
    auditoria_accesos: audRes.rows
  };

  const now = Date.now();
  if (now - lastStoreWriteTime > 10000) {
    lastStoreWriteTime = now;
    fs.promises.writeFile(STORE_PATH, JSON.stringify(synced, null, 2), 'utf8').catch(() => {});
  }
  return synced;
}

async function getFullState() {
  if (pgAvailable && pgPool) {
    try {
      return await syncPgToLocal(pgPool);
    } catch (e) {
      console.warn('[DB] Fallo lectura PG, usando store local:', e.message);
    }
  }
  const store = readLocalStore();
  // Recalcular contadores en modo local
  store.cupos_licencia = store.cupos_licencia.map(c => ({
    ...c,
    licencias_asignadas: store.asignaciones_licencia.filter(
      a => a.cupo_licencia_id === c.id && a.estado === 'ACTIVA'
    ).length
  }));
  return store;
}

function getDbStatus() {
  return {
    engine: pgAvailable ? 'POSTGRESQL' : 'LOCAL_SYNC',
    host: pgAvailable ? 'Servidor Central PostgreSQL CMDS' : 'Motor Local Sincronizado',
    database: targetDbName,
    connected: pgAvailable
  };
}

module.exports = {
  initDatabase,
  getFullState,
  readLocalStore,
  writeLocalStore,
  getDbStatus,
  INITIAL_ESTABLECIMIENTOS,
  getPool: () => (pgAvailable ? pgPool : null),
  isPgAvailable: () => pgAvailable
};
