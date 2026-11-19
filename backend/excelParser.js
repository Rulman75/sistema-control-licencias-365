function normalizarTexto(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function limpiarLocalPartEmail(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/\.{2,}/g, '.')
    .replace(/^\.|\.$/g, '');
}

function capitalizarPalabras(str) {
  const s = String(str || '').trim().replace(/\s+/g, ' ');
  if (!s) return '';
  return s
    .split(' ')
    .map(w => {
      if (/^[A-Z]-\d+$/i.test(w) || /^PC\d*$/i.test(w) || /^II$/i.test(w)) {
        return w.toUpperCase();
      }
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

/**
 * Determina si una cuenta de @cmds-educacion.cl corresponde a una MÁQUINA / EQUIPO
 * (PC, Notebook, Tablet, Móvil, Laboratorio, Sala, CRA, Enlaces, o parte con Letra+Número como A14, A16, D59, etc.)
 * versus una PERSONA (Humano: Docente, Funcionario o Alumno).
 */
function esCuentaMaquinaEducacion(nombreCompleto, email) {
  const nombre = normalizarTexto(nombreCompleto);
  const localEmail = String(email || '').split('@')[0].toLowerCase().trim();

  // 1. Si el correo empieza o termina con código de establecimiento (ej. a14., a-14, d58., e67., f-78, comiteparitario.a12, utp.e67)
  const emailHasSchoolCode =
    /^[abcdefg][\.\-]?\d{2,3}(\b|\.|\-|_|sae|pc|lab|adm|utp|pie|cra|movil|sala|dir|insp|sec|bkp|prof)/i.test(localEmail) ||
    /^[abcdefg][\.\-]?\d{2,3}$/i.test(localEmail) ||
    /[\.\-_][abcdefg][\.\-]?\d{2,3}$/i.test(localEmail);

  // 2. Si el correo tiene estructura de persona real (nombre.apellido o nombre.apellido.apellido sin palabras de máquina/unidad)
  const looksLikeHumanEmail =
    /^[a-z]+\.[a-z]+(\.[a-z]+)?$/i.test(localEmail) &&
    !/\b(pc|lab|sala|movil|notebook|tablet|enlaces|cra|biblioteca|utp|direccion|secretaria|inspectoria|pie|comite|paritario|sae|backup|bkp|colegio|escuela|liceo|jardin|radio|talleres|enfermeria|orientacion|convivencia|psicosocial|dupla|kinder|prekinder|bodega|administracion|informatica|soporte|encargado|auditorio|gimnasio|casino|porteria|test)\b/i.test(
      localEmail
    );

  // 3. Si el nombre empieza con código de establecimiento (ej. "A-14 Movil PC 21", "D-65", "F-78 Sala 2") y no es un correo humano mal etiquetado
  const nameStartsWithSchoolCode = /^([ABCDEFG][\.\-\s]?\d{2,3})\b/i.test(nombre) && !looksLikeHumanEmail;

  // 4. Palabras clave explícitas de máquina/equipo/sala en nombre o correo (como token completo, sin falsos positivos en apellidos como Calabacero)
  const hwTokensRegex =
    /(^|[\s\.\-_])(PC\d*|NOTEBOOK\d*|TABLET\d*|MOVIL\d*|CARRO\d*|LAB\d*|LABORATORIO|ENLACES|COMPUTADOR|EQUIPO\d*|ALL\s*IN\s*ONE|AIO|PROYECTOR|PIZARRA|TOTEM|IMPRESORA|SALA\d*|AULA\d*|CRA|BIBLIOTECA|BACKUP|BKP|SAE|RADIO|AUDITORIO|TALLER\d*|COMITE|COMITEPARITARIO|TEST)($|[\s\.\-_0-9])/i;

  const hasHwToken = hwTokensRegex.test(nombre) || hwTokensRegex.test(localEmail);

  return emailHasSchoolCode || nameStartsWithSchoolCode || hasHwToken;
}

function resolverEstablecimientoCMDS({ codigoUnidad, texto, textosExtra = [], dominio, establecimientos }) {
  if (!establecimientos || establecimientos.length === 0) return null;

  // 1. Si viene codigo_unidad numérico directo (ej. plantilla CMDS)
  if (codigoUnidad && Number(codigoUnidad) > 0) {
    const byCod = establecimientos.find(e => Number(e.codigo_unidad) === Number(codigoUnidad));
    if (byCod) return byCod;
  }

  const normPrincipal = normalizarTexto(texto);
  const combinado = [normPrincipal, ...textosExtra.map(normalizarTexto)].filter(Boolean).join(' | ');

  // 2. Si es Casa Central / Administración (cmds.cl)
  if (dominio === 'cmds.cl') {
    const adminMap = [
      { match: ['SGE', 'SECRETARIA GENERAL'], codigo: 301 },
      { match: ['DAF', 'FINANZAS', 'ABASTECIMIENTO', 'CONTABILIDAD', 'PRESUPUESTO', 'TESORERIA', 'SERVICIOS GENERALES'], codigo: 350 },
      { match: ['RRHH', 'RECURSOS HUMANOS', 'REMUNERACIONES', 'PREVENCION DE RIESGOS', 'PREVENCION'], codigo: 355 },
      { match: ['COMUNICACION', 'COMUNICACIONES', 'PRENSA'], codigo: 373 },
      { match: ['CONTROL INTERNO', 'AUDITORIA'], codigo: 374 },
      { match: ['JURIDICA', 'JURIDICO', 'LEGAL'], codigo: 375 },
      { match: ['VIDA SANA'], codigo: 376 },
      { match: ['INFORMATICA', 'TI', 'SISTEMAS'], codigo: 377 },
      { match: ['EXTRAESCOLAR'], codigo: 378 },
      { match: ['OBRAS', 'INFRAESTRUCTURA'], codigo: 381 },
      { match: ['SEP', 'SUBVENCION ESCOLAR'], codigo: 384 },
      { match: ['PLANIFICACION'], codigo: 386 },
      { match: ['EDUCACION', 'GABINETE TECNICO'], codigo: 400 }
    ];

    for (const rule of adminMap) {
      if (rule.match.some(kw => normPrincipal.includes(kw) || combinado.includes(kw))) {
        const found = establecimientos.find(e => Number(e.codigo_unidad) === rule.codigo);
        if (found) return found;
      }
    }
    const fallbackAdmin = establecimientos.find(e => Number(e.codigo_unidad) === 301);
    if (fallbackAdmin) return fallbackAdmin;
  }

  // 3. Si es Salud (cmds-salud.cl) o texto coincide con unidad de Salud
  if (dominio === 'cmds-salud.cl' || normPrincipal.includes('CESFAM') || normPrincipal.includes('SALUD') || normPrincipal.includes('CECOSF')) {
    const saludMap = [
      { match: ['VALDIVIESO'], codigo: 614 },
      { match: ['MARIA CRISTINA', 'CRISTINA ROJAS'], codigo: 611 },
      { match: ['JUAN PABLO'], codigo: 604 },
      { match: ['CORVALLIS'], codigo: 603 },
      { match: ['CENTRO SUR'], codigo: 602 },
      { match: ['RENDIC'], codigo: 601 },
      { match: ['ORIENTE'], codigo: 606 },
      { match: ['CPR NORTE'], codigo: 620 },
      { match: ['CPR SUR'], codigo: 618 },
      { match: ['NORTE'], codigo: 605 },
      { match: ['LA CHIMBA', 'CHIMBA'], codigo: 617 },
      { match: ['COVIEFI'], codigo: 616 },
      { match: ['SARITA', 'LABORATORIO'], codigo: 615 },
      { match: ['DROGUERIA'], codigo: 612 },
      { match: ['FARMACIA'], codigo: 613 },
      { match: ['BODEGA SALUD', 'BODEGA DE SALUD'], codigo: 621 },
      { match: ['SAR'], codigo: 619 },
      { match: ['DIRECCION', 'CASA CENTRAL', 'PLANIFICACION', 'ABASTECIMIENTO', 'SALUD'], codigo: 600 }
    ];

    for (const rule of saludMap) {
      if (rule.match.some(kw => normPrincipal.includes(kw))) {
        const found = establecimientos.find(e => Number(e.codigo_unidad) === rule.codigo);
        if (found) return found;
      }
    }
    const fallbackSalud = establecimientos.find(e => Number(e.codigo_unidad) === 600);
    if (dominio === 'cmds-salud.cl' && fallbackSalud) return fallbackSalud;
  }

  // 4. Si es Educación (cmds-educacion.cl): buscar código de escuela/liceo (A-12, D-65, E-67, F-78, B-13, G-111, etc.)
  const schoolCodeRegex = /\b([ABCDEFG])[\.\-\s]?(\d{2,3})\b/i;
  const matchSchool = normPrincipal.match(schoolCodeRegex) || combinado.match(schoolCodeRegex);
  if (matchSchool) {
    const numCodigo = parseInt(matchSchool[2], 10);
    const foundSchool = establecimientos.find(
      e => Number(e.codigo_unidad) === numCodigo && e.sector === 'EDUCACION'
    );
    if (foundSchool) return foundSchool;
  }

  // 5. Jardines VTF y PIE en Educación
  const eduKeywords = [
    { match: ['ESPERANZA'], codigo: 501 },
    { match: ['RIQUEZA ESCONDIDA'], codigo: 502 },
    { match: ['RINCONCITO FELIZ', 'RINCONCITO'], codigo: 503 },
    { match: ['PEDACITO DE SOL', 'PEDACITO'], codigo: 504 },
    { match: ['ARBOLIA'], codigo: 505 },
    { match: ['CABALLITO DE MAR', 'CABALLITO'], codigo: 506 },
    { match: ['PORTAL DE BELEN', 'BELEN'], codigo: 507 },
    { match: ['PANKARITA'], codigo: 508 },
    { match: ['SUENO DE COLORES'], codigo: 509 },
    { match: ['PERLITAS DEL DESIERTO', 'PERLITAS'], codigo: 510 },
    { match: ['GUARDIAS VTF'], codigo: 511 },
    { match: ['SEMILLITA'], codigo: 512 },
    { match: ['PIE', 'BORGONO', 'INTEGRACION ESCOLAR', 'SALA DIFERENCIAL'], codigo: 530 },
    { match: ['ESCUELA ESPANA'], codigo: 59 },
    { match: ['CLAUDIO MATTE'], codigo: 67 },
    { match: ['ROMULO PENA'], codigo: 85 },
    { match: ['JERALDO MUNOZ', 'JERARDO MUNOZ'], codigo: 12 }
  ];

  for (const rule of eduKeywords) {
    if (rule.match.some(kw => combinado.includes(kw))) {
      const found = establecimientos.find(e => Number(e.codigo_unidad) === rule.codigo);
      if (found) return found;
    }
  }

  // 6. Coincidencia por nombre exacto o parcial en cualquier sector
  if (normPrincipal) {
    const exactOrPartial = establecimientos.find(
      e => normalizarTexto(e.nombre) === normPrincipal || normalizarTexto(e.nombre).includes(normPrincipal)
    );
    if (exactOrPartial) return exactOrPartial;
  }

  // 7. Fallback según dominio
  if (dominio === 'cmds-educacion.cl') {
    return establecimientos.find(e => Number(e.codigo_unidad) === 400) || establecimientos.find(e => e.sector === 'EDUCACION');
  }
  if (dominio === 'cmds-salud.cl') {
    return establecimientos.find(e => Number(e.codigo_unidad) === 600) || establecimientos.find(e => e.sector === 'SALUD');
  }
  return establecimientos.find(e => Number(e.codigo_unidad) === 301) || establecimientos[0];
}

function resolverLicenciaCMDS({ rawLicencia, dominioObj, tiposLicencia, cuposLicencia }) {
  const txt = normalizarTexto(rawLicencia);
  if (!txt || txt === 'FALSE' || txt === 'SIN_LICENCIA') {
    return { tipoTarget: null, cupoTarget: null };
  }

  let codigoSku = null;
  if (dominioObj.dominio === 'cmds-educacion.cl') {
    if (
      txt.includes('PROFESORES') ||
      txt.includes('FACULTY') ||
      txt.includes('DOCENTE') ||
      txt.includes('O365_A3_FACULTY') ||
      txt.includes('A3')
    ) {
      codigoSku = 'O365_A3_FACULTY';
    } else if (
      txt.includes('ESTUDIANTES') ||
      txt.includes('STUDENT') ||
      txt.includes('ALUMNO') ||
      txt.includes('O365_A3_STUDENT')
    ) {
      codigoSku = 'O365_A3_STUDENT';
    }
  }

  if (!codigoSku) {
    if (txt.includes('O365_E3') || txt.includes('OFFICE 365 E3') || txt === 'E3') {
      codigoSku = 'O365_E3';
    } else if (txt.includes('O365_E1') || txt.includes('OFFICE 365 E1') || txt === 'E1') {
      codigoSku = 'O365_E1';
    } else if (txt.includes('M365_BUS_BASIC') || txt.includes('BUSINESS BASIC') || txt.includes('BASIC')) {
      codigoSku = 'M365_BUS_BASIC';
    } else if (txt.includes('O365_A3_FACULTY') || txt.includes('A3 FACULTY') || txt.includes('PROFESORES')) {
      codigoSku = 'O365_A3_FACULTY';
    } else if (txt.includes('O365_A3_STUDENT') || txt.includes('A3 STUDENT') || txt.includes('ESTUDIANTES')) {
      codigoSku = 'O365_A3_STUDENT';
    }
  }

  const tipoTarget = codigoSku
    ? tiposLicencia.find(t => t.codigo_sku === codigoSku)
    : tiposLicencia.find(
        t =>
          normalizarTexto(t.codigo_sku) === txt ||
          normalizarTexto(t.nombre).includes(txt)
      );

  if (!tipoTarget) return { tipoTarget: null, cupoTarget: null };

  const cupoTarget = cuposLicencia.find(
    c => c.dominio_id === dominioObj.id && c.tipo_licencia_id === tipoTarget.id
  );

  return { tipoTarget, cupoTarget: cupoTarget || null };
}

/**
 * Extrae y normaliza filas desde un Workbook XLSX soportando:
 * 1) Exportación Microsoft 365 Admin Center (ej. CMDS-EDUCACION.xlsx)
 * 2) Planilla Casa Central (ej. Correos_Casa_Central.xlsx: USUARIO, CORREO, LICENCIA, DEPARTAMENTO)
 * 3) Planilla Migración / PIE con Alias (ej. PIE_LICENCIAS - A3_PROFESORES.xlsx: Nombre completo, Correo Alias Provisorio, Correo Principal, Licencia, Cargo)
 * 4) Formulario Correos Salud (ej. formulario correos editado.xlsx)
 * 5) Plantilla Oficial de Carga CMDS
 */
function parseWorkbookToNormalizedUsers(XLSX, wb, state, options = {}) {
  const { dominios, tipos_licencia, cupos_licencia, establecimientos } = state;
  const registrosNormalizados = [];
  const saludConsolidationMap = new Map();
  const seenEmailsInBatch = new Set();
  const errores = [];
  let omitidos = 0;

  for (const sheetName of wb.SheetNames) {
    if (sheetName.startsWith('CATALOGO_')) continue;

    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
    if (!rows || rows.length === 0) continue;

    const firstRowKeys = Object.keys(rows[0]);

    const isCasaCentral =
      firstRowKeys.includes('USUARIO') &&
      firstRowKeys.includes('CORREO') &&
      firstRowKeys.includes('LICENCIA') &&
      firstRowKeys.includes('DEPARTAMENTO');

    const isPieConAlias =
      firstRowKeys.includes('Correo Principal') &&
      (firstRowKeys.includes('Correo Alias Provisorio') || firstRowKeys.includes('Alias') || firstRowKeys.includes('Correo Alias'));

    const isFormularioSalud =
      firstRowKeys.includes('ID del establecimiento') &&
      firstRowKeys.includes('Establecimiento') &&
      firstRowKeys.includes('Nombre completo') &&
      firstRowKeys.includes('Correo');

    const isM365Export =
      firstRowKeys.includes('User principal name') &&
      firstRowKeys.includes('Display name');

    for (let i = 0; i < rows.length; i++) {
      let r = rows[i];
      const filaNum = i + 2;

      // ----------------------------------------------------------------------
      // CASO 1: PLANILLA CASA CENTRAL (Correos_Casa_Central.xlsx -> @cmds.cl)
      // ----------------------------------------------------------------------
      if (isCasaCentral) {
        const rawUsuario = String(r['USUARIO'] || '').trim();
        const rawCorreo = String(r['CORREO'] || '').trim().toLowerCase();
        const rawLicencia = String(r['LICENCIA'] || 'E3').trim();
        const rawDepto = String(r['DEPARTAMENTO'] || '').trim().toUpperCase();

        if (!rawCorreo && !rawUsuario) continue;

        const localPart = rawCorreo.includes('@')
          ? limpiarLocalPartEmail(rawCorreo.split('@')[0])
          : limpiarLocalPartEmail(rawCorreo || rawUsuario);

        if (!localPart) {
          omitidos++;
          errores.push(`Hoja ${sheetName} Fila ${filaNum}: Sin correo válido.`);
          continue;
        }

        const emailCmds = `${localPart}@cmds.cl`;
        const emailAlias = rawCorreo && rawCorreo !== emailCmds ? rawCorreo : '';

        if (seenEmailsInBatch.has(emailCmds)) {
          omitidos++;
          continue;
        }

        const domCmds = dominios.find(d => d.dominio === 'cmds.cl');
        const estObj = resolverEstablecimientoCMDS({
          texto: rawDepto,
          dominio: 'cmds.cl',
          establecimientos
        });

        const { tipoTarget, cupoTarget } = resolverLicenciaCMDS({
          rawLicencia,
          dominioObj: domCmds,
          tiposLicencia: tipos_licencia,
          cuposLicencia: cupos_licencia
        });

        const partesNombre = rawUsuario.split(/\s+/);
        const nombres = partesNombre.slice(0, Math.max(1, Math.ceil(partesNombre.length / 2))).join(' ');
        const apellidos = partesNombre.slice(Math.max(1, Math.ceil(partesNombre.length / 2))).join(' ') || 'Casa Central';

        seenEmailsInBatch.add(emailCmds);
        registrosNormalizados.push({
          rut: '',
          nombres: nombres.slice(0, 115),
          apellidos: apellidos.slice(0, 115),
          nombre_completo: (rawUsuario || localPart).slice(0, 195),
          email: emailCmds,
          email_alias: emailAlias,
          dominio_id: domCmds.id,
          dominio_nombre: domCmds.dominio,
          sector: domCmds.sector,
          establecimiento_id: estObj ? estObj.id : null,
          establecimiento_nombre: estObj ? estObj.nombre : 'SECRETARIA GENERAL EJECUTIVA',
          cargo: `Funcionario ${capitalizarPalabras(rawDepto)}`,
          departamento: rawDepto,
          tipo_usuario: 'FUNCIONARIO',
          estado_cuenta: 'ACTIVO',
          cupo_licencia_id: cupoTarget ? cupoTarget.id : null,
          licencia_nombre: tipoTarget ? tipoTarget.nombre : null,
          ticket: 'NOMINA-CASA-CENTRAL-2026',
          observaciones: `Nómina Casa Central (${rawDepto})`
        });
        continue;
      }

      // ----------------------------------------------------------------------
      // CASO 2: PLANILLA MIGRACIÓN / PIE CON ALIAS (PIE_LICENCIAS - A3_PROFESORES.xlsx)
      // ----------------------------------------------------------------------
      if (isPieConAlias) {
        const rawNombre = String(r['Nombre completo'] || '').trim();
        const rawPrincipal = String(r['Correo Principal'] || '').trim().toLowerCase();
        const rawAlias = String(
          r['Correo Alias Provisorio'] || r['Alias'] || r['Correo Alias'] || ''
        ).trim().toLowerCase();
        const rawLicencia = String(r['Licencia'] || 'A3 Profesores').trim();
        const rawCargo = String(r['Cargo'] || '').trim();
        const rawDepto = String(r['Departamento'] || r['Establecimiento'] || sheetName || 'PIE').trim();

        if (!rawPrincipal || !rawPrincipal.includes('@')) {
          omitidos++;
          errores.push(`Hoja ${sheetName} Fila ${filaNum}: Correo Principal inválido (${rawPrincipal}).`);
          continue;
        }

        if (seenEmailsInBatch.has(rawPrincipal)) {
          omitidos++;
          continue;
        }

        const emailDomain = rawPrincipal.split('@')[1];
        const domObj =
          dominios.find(d => d.dominio.toLowerCase() === emailDomain) ||
          dominios.find(d => d.dominio === 'cmds-educacion.cl');

        const estObj = resolverEstablecimientoCMDS({
          texto: rawDepto,
          textosExtra: [sheetName, rawCargo],
          dominio: domObj.dominio,
          establecimientos
        });

        const { tipoTarget, cupoTarget } = resolverLicenciaCMDS({
          rawLicencia,
          dominioObj: domObj,
          tiposLicencia: tipos_licencia,
          cuposLicencia: cupos_licencia
        });

        const partesNombre = rawNombre.split(/\s+/);
        const nombres = partesNombre.slice(0, Math.max(1, Math.ceil(partesNombre.length / 2))).join(' ');
        const apellidos = partesNombre.slice(Math.max(1, Math.ceil(partesNombre.length / 2))).join(' ') || '';

        seenEmailsInBatch.add(rawPrincipal);
        registrosNormalizados.push({
          rut: '',
          nombres: nombres.slice(0, 115),
          apellidos: apellidos.slice(0, 115),
          nombre_completo: (rawNombre || rawPrincipal.split('@')[0]).slice(0, 195),
          email: rawPrincipal,
          email_alias: rawAlias,
          dominio_id: domObj.id,
          dominio_nombre: domObj.dominio,
          sector: domObj.sector,
          establecimiento_id: estObj ? estObj.id : null,
          establecimiento_nombre: estObj ? estObj.nombre : 'PROYECTO DE INTEGRACION ESCOLAR (PIE)',
          cargo: rawCargo || 'Profesional PIE',
          departamento: rawDepto,
          tipo_usuario: 'FUNCIONARIO',
          estado_cuenta: 'ACTIVO',
          cupo_licencia_id: cupoTarget ? cupoTarget.id : null,
          licencia_nombre: tipoTarget ? tipoTarget.nombre : null,
          ticket: 'MIGRACION-PIE-A3',
          observaciones: rawAlias
            ? `Migrado desde alias ${rawAlias} (${rawDepto})`
            : `Nómina ${rawDepto}`
        });
        continue;
      }

      // ----------------------------------------------------------------------
      // CASO 3: FORMULARIO CORREOS SALUD (formulario correos editado.xlsx)
      // ----------------------------------------------------------------------
      if (isFormularioSalud) {
        const rawNombre = String(r['Nombre completo'] || '').trim();
        const rawCorreo = String(r['Correo'] || '').trim();
        const rawEst = String(r['Establecimiento'] || '').trim();
        const rawCargo = String(r['Cargo'] || '').trim();
        const rawIdEst = String(r['ID del establecimiento'] || '').trim();

        if ((!rawCorreo && !rawNombre) || rawNombre.toLowerCase() === 'ultima') {
          continue;
        }

        let localPart = '';
        if (rawCorreo.includes('@')) {
          localPart = limpiarLocalPartEmail(rawCorreo.split('@')[0]);
        } else if (rawCorreo) {
          localPart = limpiarLocalPartEmail(rawCorreo);
        }
        if (!localPart && rawNombre) {
          const partes = rawNombre.split(/\s+/);
          localPart = limpiarLocalPartEmail(`${partes[0]}.${partes[partes.length - 1] || 'salud'}`);
        }
        if (!localPart) {
          omitidos++;
          errores.push(`Hoja ${sheetName} Fila ${filaNum}: Sin correo ni nombre válido.`);
          continue;
        }

        const emailSalud = `${localPart}@cmds-salud.cl`;
        const emailAlias = rawCorreo && rawCorreo.toLowerCase().endsWith('@cmds.cl') ? rawCorreo.toLowerCase() : '';
        const domSalud = dominios.find(d => d.dominio === 'cmds-salud.cl');
        const estObj = resolverEstablecimientoCMDS({
          texto: rawEst,
          dominio: 'cmds-salud.cl',
          establecimientos
        });

        const nombreLimpio = capitalizarPalabras(rawNombre.replace(/\(.*?\)/g, '').trim()) || localPart;
        const cargoLimpio = capitalizarPalabras(rawCargo) || 'Funcionario Salud APS';
        const partesNombre = nombreLimpio.split(' ');
        const nombres = partesNombre.slice(0, Math.max(1, Math.ceil(partesNombre.length / 2))).join(' ');
        const apellidos = partesNombre.slice(Math.max(1, Math.ceil(partesNombre.length / 2))).join(' ') || 'APS';

        if (saludConsolidationMap.has(emailSalud)) {
          const prev = saludConsolidationMap.get(emailSalud);
          const normPrev = normalizarTexto(prev.nombre_completo);
          const normCurr = normalizarTexto(nombreLimpio);
          const tokenCheck = normCurr.split(' ').slice(0, 2).join(' ');
          if (tokenCheck && !normPrev.includes(tokenCheck)) {
            prev.nombre_completo = `${prev.nombre_completo} / ${nombreLimpio}`.slice(0, 195);
            if (cargoLimpio && !normalizarTexto(prev.cargo).includes(normalizarTexto(cargoLimpio))) {
              prev.cargo = `${prev.cargo} / ${cargoLimpio}`.slice(0, 145);
            }
          }
          continue;
        }

        const itemSalud = {
          rut: '',
          nombres,
          apellidos,
          nombre_completo: nombreLimpio,
          email: emailSalud,
          email_alias: emailAlias,
          dominio_id: domSalud.id,
          dominio_nombre: domSalud.dominio,
          sector: domSalud.sector,
          establecimiento_id: estObj ? estObj.id : null,
          establecimiento_nombre: estObj ? estObj.nombre : rawEst || 'DIRECCION DE SALUD ATENCION PRIMARIA',
          cargo: cargoLimpio,
          departamento: rawEst ? `${rawEst.toUpperCase()}` : `Form ID #${rawIdEst}`,
          tipo_usuario: 'FUNCIONARIO',
          estado_cuenta: 'ACTIVO',
          cupo_licencia_id: null,
          licencia_nombre: null,
          ticket: 'NOMINA-SALUD-2026',
          observaciones: `Importado desde formulario Salud (Correo origen: ${rawCorreo})`
        };

        saludConsolidationMap.set(emailSalud, itemSalud);
        registrosNormalizados.push(itemSalud);
        seenEmailsInBatch.add(emailSalud);
        continue;
      }

      // ----------------------------------------------------------------------
      // CASO 4: EXPORTACIÓN MICROSOFT 365 ADMIN CENTER (CMDS-EDUCACION.xlsx)
      // ----------------------------------------------------------------------
      if (isM365Export) {
        let upn = String(r['User principal name'] || '').trim().toLowerCase();
        let displayName = String(r['Display name'] || '').trim();
        let firstName = String(r['First name'] || '').trim();
        let lastName = String(r['Last name'] || '').trim();
        let dept = String(r['Department'] || '').trim();
        let title = String(r['Title'] || '').trim();
        let office = String(r['Office'] || '').trim();
        let rawLicenses = String(r['Licenses'] || '').trim();
        let whenCreated = String(r['When created'] || '').trim();

        if (!upn.includes('@') && String(r['Object Id'] || '').includes('@')) {
          const extraDisp = String(r['DirSyncEnabled'] || '').trim();
          displayName = `${displayName} ${extraDisp}`.trim();
          upn = String(r['Object Id'] || '').trim().toLowerCase();
          firstName = displayName;
          lastName = '';
          dept = extraDisp || 'D-85';
          rawLicenses = String(r['Password never expires'] || '').trim();
          whenCreated = String(r['Soft deletion time stamp'] || '').trim();
        }

        if (!upn || !upn.includes('@')) {
          omitidos++;
          errores.push(`Fila ${filaNum}: User principal name inválido (${upn}).`);
          continue;
        }

        if (seenEmailsInBatch.has(upn)) {
          omitidos++;
          continue;
        }

        const emailDomain = upn.split('@')[1];
        const domObj = dominios.find(d => d.dominio.toLowerCase() === emailDomain) ||
          dominios.find(d => d.dominio === 'cmds-educacion.cl');

        const estObj = resolverEstablecimientoCMDS({
          texto: dept || office,
          textosExtra: [displayName, firstName, upn.split('@')[0]],
          dominio: domObj.dominio,
          establecimientos
        });

        const { tipoTarget, cupoTarget } = resolverLicenciaCMDS({
          rawLicencia: rawLicenses,
          dominioObj: domObj,
          tiposLicencia: tipos_licencia,
          cuposLicencia: cupos_licencia
        });

        const nombresFinal = firstName || displayName.split(' ')[0] || upn.split('@')[0];
        const apellidosFinal = lastName || displayName.split(' ').slice(1).join(' ') || '';
        const nombreCompletoFinal = displayName || `${nombresFinal} ${apellidosFinal}`.trim();

        const esMaquina = domObj.dominio === 'cmds-educacion.cl' && esCuentaMaquinaEducacion(nombreCompletoFinal, upn);

        let finalCupo = cupoTarget;
        let finalTipo = tipoTarget;

        if (esMaquina && domObj.dominio === 'cmds-educacion.cl') {
          finalTipo = tipos_licencia.find(t => t.codigo_sku === 'O365_A3_STUDENT') || tipoTarget;
          finalCupo =
            cupos_licencia.find(c => c.dominio_id === domObj.id && finalTipo && c.tipo_licencia_id === finalTipo.id) ||
            cupoTarget;
        }

        const esEstudiante =
          !esMaquina &&
          ((finalTipo && finalTipo.categoria === 'ESTUDIANTE') ||
            (!normalizarTexto(rawLicenses).includes('PROFESORES') &&
              normalizarTexto(rawLicenses).includes('ESTUDIANTES')));

        const cargoFinal =
          title ||
          (esMaquina
            ? 'Equipo / Máquina Institucional'
            : esEstudiante
            ? 'Estudiante Red Educativa CMDS'
            : 'Docente / Funcionario Educación');

        seenEmailsInBatch.add(upn);
        registrosNormalizados.push({
          rut: '',
          nombres: nombresFinal.slice(0, 115),
          apellidos: apellidosFinal.slice(0, 115),
          nombre_completo: nombreCompletoFinal.slice(0, 195),
          email: upn,
          email_alias: '',
          dominio_id: domObj.id,
          dominio_nombre: domObj.dominio,
          sector: domObj.sector,
          establecimiento_id: estObj ? estObj.id : null,
          establecimiento_nombre: estObj ? estObj.nombre : 'DIRECCION DE EDUCACION (CASA CENTRAL)',
          cargo: cargoFinal.slice(0, 145),
          departamento: (dept || office || (estObj ? `Unidad ${estObj.codigo_unidad}` : 'Educación')).slice(0, 145),
          tipo_cuenta: esMaquina ? 'MAQUINA' : 'PERSONA',
          tipo_usuario: esMaquina ? 'MAQUINA' : esEstudiante ? 'ESTUDIANTE' : 'FUNCIONARIO',
          estado_cuenta: 'ACTIVO',
          cupo_licencia_id: finalCupo ? finalCupo.id : null,
          licencia_nombre: finalTipo ? finalTipo.nombre : null,
          ticket: 'M365-EDU-2026',
          observaciones: `Licencia origen M365: ${rawLicenses || 'Sin licencia'}`
        });
        continue;
      }

      // ----------------------------------------------------------------------
      // CASO 5: PLANTILLA OFICIAL CMDS O ARCHIVO GENÉRICO
      // ----------------------------------------------------------------------
      let rawEmail = String(
        r.Email || r.email || r['Correo Principal'] || r['User principal name'] || r['Nombre principal de usuario'] || r.Correo || r.correo || ''
      ).trim().toLowerCase();

      const rawEmailAlias = String(
        r.Email_Alias || r.email_alias || r['Correo Alias Provisorio'] || r['Correo Alias'] || r.Alias || r.alias || ''
      ).trim().toLowerCase();

      if (!rawEmail || !rawEmail.includes('@')) {
        omitidos++;
        errores.push(`Fila ${filaNum}: Correo electrónico inválido o vacío.`);
        continue;
      }

      if (seenEmailsInBatch.has(rawEmail)) {
        omitidos++;
        continue;
      }

      let emailDomain = rawEmail.split('@')[1];
      let domObj = dominios.find(d => d.dominio.toLowerCase() === emailDomain);
      if (!domObj && r.Dominio) {
        domObj = dominios.find(d => d.dominio.toLowerCase() === String(r.Dominio).trim().toLowerCase());
        if (domObj) {
          rawEmail = `${limpiarLocalPartEmail(rawEmail.split('@')[0])}@${domObj.dominio}`;
          emailDomain = domObj.dominio;
        }
      }

      if (!domObj) {
        omitidos++;
        errores.push(`Fila ${filaNum} (${rawEmail}): El dominio @${emailDomain} no pertenece al Tenant CMDS.`);
        continue;
      }

      const displayName = String(r['Nombre completo'] || r['Display name'] || r['Nombre para mostrar'] || r.USUARIO || '').trim();
      const nombres = String(r.Nombres || r.nombres || r['First name'] || displayName.split(' ')[0] || 'Usuario').trim();
      const apellidos = String(r.Apellidos || r.apellidos || r['Last name'] || displayName.split(' ').slice(1).join(' ') || '').trim();
      const nombreCompleto = displayName || `${nombres} ${apellidos}`.trim();
      const rut = String(r.RUT || r.rut || '').trim();
      const cargo = String(r.Cargo || r.cargo || r.Title || '').trim();
      const depto = String(r.Departamento || r.departamento || r.Department || r.DEPARTAMENTO || r.Establecimiento || '').trim();
      const ticket = String(r.Ticket_Referencia || 'CARGA-MASIVA').trim();
      const codUnidad = Number(r.Codigo_Unidad || r.codigo_unidad || 0);

      const estObj = resolverEstablecimientoCMDS({
        codigoUnidad: codUnidad,
        texto: depto || String(r.Establecimiento || ''),
        textosExtra: [nombreCompleto, rawEmail.split('@')[0]],
        dominio: domObj.dominio,
        establecimientos
      });

      const rawSku = String(r.Codigo_Licencia_SKU || r.Licencia || r.LICENCIA || r.Licenses || '').trim();
      const { tipoTarget, cupoTarget } = resolverLicenciaCMDS({
        rawLicencia: rawSku,
        dominioObj: domObj,
        tiposLicencia: tipos_licencia,
        cuposLicencia: cupos_licencia
      });

      seenEmailsInBatch.add(rawEmail);
      registrosNormalizados.push({
        rut,
        nombres,
        apellidos,
        nombre_completo: nombreCompleto,
        email: rawEmail,
        email_alias: rawEmailAlias,
        dominio_id: domObj.id,
        dominio_nombre: domObj.dominio,
        sector: domObj.sector,
        establecimiento_id: estObj ? estObj.id : null,
        establecimiento_nombre: estObj ? estObj.nombre : 'SIN ESTABLECIMIENTO',
        cargo,
        departamento: depto,
        tipo_usuario: tipoTarget && tipoTarget.categoria === 'ESTUDIANTE' ? 'ESTUDIANTE' : 'FUNCIONARIO',
        estado_cuenta: 'ACTIVO',
        cupo_licencia_id: cupoTarget ? cupoTarget.id : null,
        licencia_nombre: tipoTarget ? tipoTarget.nombre : null,
        ticket,
        observaciones: rawEmailAlias
          ? `Importación masiva (Alias migración: ${rawEmailAlias})`
          : 'Importación masiva Excel/CSV'
      });
    }
  }

  return { registrosNormalizados, omitidos, errores };
}

async function bulkImportNormalizedUsers({
  registrosNormalizados,
  state,
  pool,
  isPg,
  readLocalStore,
  writeLocalStore,
  operatorUsername = 'rhormazabal@cmds.cl',
  canManageSectorFn = null,
  operatorUser = null
}) {
  const existingUserByEmail = new Map(
    (state.usuarios_m365 || []).map(u => [String(u.email || '').trim().toLowerCase(), u])
  );

  const cupoLimitMap = new Map();
  const cupoUsedMap = new Map();
  for (const c of state.cupos_licencia || []) {
    cupoLimitMap.set(c.id, Number(c.total_licencias));
    cupoUsedMap.set(c.id, 0);
  }
  for (const a of state.asignaciones_licencia || []) {
    if (a.estado === 'ACTIVA') {
      cupoUsedMap.set(a.cupo_licencia_id, (cupoUsedMap.get(a.cupo_licencia_id) || 0) + 1);
    }
  }

  const validToInsert = [];
  const existingToUpdateAlias = [];
  const errores = [];
  let omitidos = 0;

  for (const item of registrosNormalizados) {
    const emailLower = item.email.toLowerCase();
    if (existingUserByEmail.has(emailLower)) {
      const existingUser = existingUserByEmail.get(emailLower);
      if (item.email_alias && item.email_alias !== existingUser.email_alias) {
        existingToUpdateAlias.push({
          id: existingUser.id,
          email_alias: item.email_alias,
          cargo: item.cargo || existingUser.cargo,
          establecimiento_id: item.establecimiento_id || existingUser.establecimiento_id
        });
      }
      omitidos++;
      errores.push(`${item.email}: El correo ya se encuentra registrado${item.email_alias ? ' (se actualizó su alias)' : ''}.`);
      continue;
    }

    if (canManageSectorFn && operatorUser && !canManageSectorFn(operatorUser, item.sector)) {
      omitidos++;
      errores.push(`${item.email}: Sin permisos para el sector ${item.sector}.`);
      continue;
    }

    if (item.cupo_licencia_id) {
      const used = cupoUsedMap.get(item.cupo_licencia_id) || 0;
      const limit = cupoLimitMap.get(item.cupo_licencia_id) || 0;
      if (used >= limit) {
        item.cupo_licencia_id = null;
        item.licencia_nombre = null;
        errores.push(`${item.email}: Pool sin cupo disponible (${used}/${limit}), creado sin licencia.`);
      } else {
        cupoUsedMap.set(item.cupo_licencia_id, used + 1);
      }
    }

    existingUserByEmail.set(emailLower, item);
    validToInsert.push(item);
  }

  let creados = 0;
  let asignados = 0;
  const nowIso = new Date().toISOString();

  if (isPg && pool && existingToUpdateAlias.length > 0) {
    for (const upd of existingToUpdateAlias) {
      await pool.query(
        `UPDATE usuarios_m365 SET email_alias = $1, cargo = $2, establecimiento_id = $3, updated_at = $4 WHERE id = $5`,
        [upd.email_alias, upd.cargo, upd.establecimiento_id, nowIso, upd.id]
      );
    }
  }

  if (validToInsert.length === 0) {
    return { creados: 0, asignados: 0, omitidos, errores, actualizadosAlias: existingToUpdateAlias.length };
  }

  if (isPg && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const BATCH_SIZE = 350;

      for (let start = 0; start < validToInsert.length; start += BATCH_SIZE) {
        const chunk = validToInsert.slice(start, start + BATCH_SIZE);
        const valuesUser = [];
        const paramsUser = [];
        let pIdx = 1;

        for (const u of chunk) {
          const createdTs = u.created_at || nowIso;
          valuesUser.push(
            `($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`
          );
          paramsUser.push(
            u.rut || '',
            u.nombres || '',
            u.apellidos || '',
            u.nombre_completo || '',
            u.email,
            u.email_alias || '',
            u.dominio_id,
            u.establecimiento_id,
            u.cargo || '',
            u.departamento || '',
            u.tipo_cuenta || (u.tipo_usuario === 'MAQUINA' ? 'MAQUINA' : 'PERSONA'),
            u.tipo_usuario || 'FUNCIONARIO',
            u.estado_cuenta || 'ACTIVO',
            createdTs,
            nowIso
          );
        }

        const resUsers = await client.query(
          `INSERT INTO usuarios_m365
           (rut, nombres, apellidos, nombre_completo, email, email_alias, dominio_id, establecimiento_id, cargo, departamento, tipo_cuenta, tipo_usuario, estado_cuenta, created_at, updated_at)
           VALUES ${valuesUser.join(', ')}
           RETURNING id, email`,
          paramsUser
        );

        creados += resUsers.rows.length;
        const idByEmail = new Map(resUsers.rows.map(r => [r.email.toLowerCase(), r.id]));

        const chunkWithLic = chunk.filter(u => u.cupo_licencia_id && idByEmail.has(u.email.toLowerCase()));
        if (chunkWithLic.length > 0) {
          const valuesAsig = [];
          const paramsAsig = [];
          let aIdx = 1;

          const valuesMov = [];
          const paramsMov = [];
          let mIdx = 1;

          for (const u of chunkWithLic) {
            const uid = idByEmail.get(u.email.toLowerCase());
            valuesAsig.push(`($${aIdx++}, $${aIdx++}, 'ACTIVA', $${aIdx++}, $${aIdx++}, $${aIdx++}, $${aIdx++})`);
            paramsAsig.push(
              uid,
              u.cupo_licencia_id,
              u.ticket || 'CARGA-MASIVA',
              operatorUsername,
              u.observaciones || 'Carga masiva Excel',
              nowIso
            );

            valuesMov.push(
              `('ALTA', $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++})`
            );
            paramsMov.push(
              uid,
              u.email,
              u.nombre_completo,
              u.cupo_licencia_id,
              u.dominio_nombre,
              u.licencia_nombre,
              u.establecimiento_nombre || 'SIN ESTABLECIMIENTO',
              u.observaciones || 'Alta por carga masiva Excel',
              u.ticket || 'CARGA-MASIVA',
              operatorUsername,
              nowIso
            );
          }

          await client.query(
            `INSERT INTO asignaciones_licencia
             (usuario_id, cupo_licencia_id, estado, numero_ticket, asignado_por, observaciones, fecha_alta)
             VALUES ${valuesAsig.join(', ')}`,
            paramsAsig
          );

          await client.query(
            `INSERT INTO movimientos_licencia
             (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
             VALUES ${valuesMov.join(', ')}`,
            paramsMov
          );

          asignados += chunkWithLic.length;
        }
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const store = readLocalStore();
    let nextUserId = store.usuarios_m365.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
    let nextAsigId = store.asignaciones_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
    let nextMovId = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;

    for (const u of validToInsert) {
      const uid = nextUserId++;
      store.usuarios_m365.push({
        id: uid,
        rut: u.rut || '',
        nombres: u.nombres || '',
        apellidos: u.apellidos || '',
        nombre_completo: u.nombre_completo || '',
        email: u.email,
        email_alias: u.email_alias || '',
        dominio_id: u.dominio_id,
        establecimiento_id: u.establecimiento_id,
        cargo: u.cargo || '',
        departamento: u.departamento || '',
        tipo_usuario: u.tipo_usuario || 'FUNCIONARIO',
        estado_cuenta: u.estado_cuenta || 'ACTIVO',
        created_at: u.created_at || nowIso,
        updated_at: nowIso
      });
      creados++;

      if (u.cupo_licencia_id) {
        store.asignaciones_licencia.push({
          id: nextAsigId++,
          usuario_id: uid,
          cupo_licencia_id: u.cupo_licencia_id,
          estado: 'ACTIVA',
          numero_ticket: u.ticket || 'CARGA-MASIVA',
          asignado_por: operatorUsername,
          observaciones: u.observaciones || 'Carga masiva Excel',
          fecha_alta: nowIso,
          fecha_baja: null,
          motivo_baja: null
        });
        store.movimientos_licencia.unshift({
          id: nextMovId++,
          tipo_movimiento: 'ALTA',
          usuario_id: uid,
          usuario_email: u.email,
          usuario_nombre: u.nombre_completo,
          cupo_licencia_id: u.cupo_licencia_id,
          dominio_nombre: u.dominio_nombre,
          licencia_nombre: u.licencia_nombre,
          establecimiento_nombre: u.establecimiento_nombre || 'SIN ESTABLECIMIENTO',
          motivo: u.observaciones || 'Alta por carga masiva Excel',
          ticket_referencia: u.ticket || 'CARGA-MASIVA',
          ejecutado_por: operatorUsername,
          fecha_movimiento: nowIso
        });
        asignados++;
      }
    }
    writeLocalStore(store);
  }

  return { creados, asignados, omitidos, errores, actualizadosAlias: existingToUpdateAlias.length };
}

/**
 * Detecta si un archivo Excel corresponde al formato exportado por nuestro propio sistema
 * (Nomina_Usuarios_Licencias_M365_CMDS.xlsx / Actualiza_cuentas_educacion_365.xlsx)
 * que contiene la columna `Correo_M365` para Actualización Masiva por correo.
 */
function isExportedNominaWorkbook(XLSX, wb) {
  if (!wb || !wb.SheetNames || wb.SheetNames.length === 0) return false;
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (!rows || rows.length === 0) return false;
  const keys = Object.keys(rows[0]);
  return keys.includes('Correo_M365');
}

/**
 * Actualiza masivamente cuentas existentes haciendo match por `Correo_M365`
 * (Establecimiento, Cargo, Departamento, Tipo_Cuenta/Tipo_Usuario, RUT, Nombre y Alias)
 * preservando intactas las licencias y el `m365_object_id`.
 */
async function bulkUpdateFromExportedNomina({
  XLSX,
  wb,
  state,
  pool,
  isPg,
  readLocalStore,
  writeLocalStore
}) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
  const nowIso = new Date().toISOString();

  const userByEmail = new Map(state.usuarios_m365.map(u => [u.email.toLowerCase(), u]));
  const estByName = new Map(state.establecimientos.map(e => [e.nombre.trim().toUpperCase(), e]));

  const updates = [];
  let omitidos = 0;
  const errores = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const email = String(r.Correo_M365 || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      omitidos++;
      continue;
    }

    const existing = userByEmail.get(email);
    if (!existing) {
      omitidos++;
      errores.push(`Fila ${i + 2}: Correo '${email}' no encontrado en el sistema.`);
      continue;
    }

    const domStr = String(r.Dominio || email.split('@')[1] || 'cmds-educacion.cl').trim().toLowerCase();
    const rawEst = String(r.Establecimiento_Unidad || '').trim();
    const rawDepto = String(r.Departamento || '').trim();
    let estId = existing.establecimiento_id;

    if (rawEst && rawEst.toUpperCase() !== 'SIN ESTABLECIMIENTO') {
      const exactEst = estByName.get(rawEst.toUpperCase());
      if (exactEst) {
        estId = exactEst.id;
      } else {
        const resolved = resolverEstablecimientoCMDS({
          texto: rawEst,
          textosExtra: [rawDepto, String(r.Nombre_Completo || ''), email.split('@')[0]],
          dominio: domStr,
          establecimientos: state.establecimientos
        });
        if (resolved) estId = resolved.id;
      }
    }

    const rawTipo = String(r.Tipo_Usuario || '').trim().toUpperCase();
    let tipoCuenta = existing.tipo_cuenta || (existing.tipo_usuario === 'MAQUINA' ? 'MAQUINA' : 'PERSONA');
    let tipoUsuario = existing.tipo_usuario || 'FUNCIONARIO';

    if (rawTipo === 'MAQUINA' || rawTipo === 'MÁQUINA') {
      tipoCuenta = 'MAQUINA';
      tipoUsuario = 'MAQUINA';
    } else if (rawTipo === 'ESTUDIANTE' || rawTipo === 'ALUMNO') {
      tipoCuenta = 'PERSONA';
      tipoUsuario = 'ESTUDIANTE';
    } else if (rawTipo === 'PERSONA' || rawTipo === 'FUNCIONARIO' || rawTipo === 'DOCENTE') {
      tipoCuenta = 'PERSONA';
      tipoUsuario = 'FUNCIONARIO';
    }

    const rut = r.RUT !== undefined && String(r.RUT).trim() !== '' ? String(r.RUT).trim() : (existing.rut || '');
    const nombreCompleto =
      r.Nombre_Completo !== undefined && String(r.Nombre_Completo).trim() !== ''
        ? String(r.Nombre_Completo).trim()
        : existing.nombre_completo;
    const emailAlias =
      r.Correo_Alias_Migracion !== undefined && String(r.Correo_Alias_Migracion).trim() !== ''
        ? String(r.Correo_Alias_Migracion).trim().toLowerCase()
        : (existing.email_alias || '');
    const cargo =
      r.Cargo !== undefined && String(r.Cargo).trim() !== ''
        ? String(r.Cargo).trim()
        : (existing.cargo || '');
    const departamento =
      rawDepto !== '' ? rawDepto : (existing.departamento || '');

    updates.push({
      id: existing.id,
      email,
      rut,
      nombre_completo: nombreCompleto,
      email_alias: emailAlias,
      establecimiento_id: estId,
      cargo,
      departamento,
      tipo_cuenta: tipoCuenta,
      tipo_usuario: tipoUsuario
    });
  }

  let actualizados = 0;

  if (isPg && pool) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const u of updates) {
        await client.query(
          `UPDATE usuarios_m365
           SET rut = $1,
               nombre_completo = $2,
               email_alias = $3,
               establecimiento_id = $4,
               cargo = $5,
               departamento = $6,
               tipo_cuenta = $7,
               tipo_usuario = $8,
               updated_at = $9
           WHERE id = $10`,
          [
            u.rut,
            u.nombre_completo,
            u.email_alias,
            u.establecimiento_id,
            u.cargo,
            u.departamento,
            u.tipo_cuenta,
            u.tipo_usuario,
            nowIso,
            u.id
          ]
        );
        actualizados++;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    const store = readLocalStore();
    const localByEmail = new Map(store.usuarios_m365.map(u => [u.email.toLowerCase(), u]));
    for (const u of updates) {
      const target = localByEmail.get(u.email);
      if (target) {
        target.rut = u.rut;
        target.nombre_completo = u.nombre_completo;
        target.email_alias = u.email_alias;
        target.establecimiento_id = u.establecimiento_id;
        target.cargo = u.cargo;
        target.departamento = u.departamento;
        target.tipo_cuenta = u.tipo_cuenta;
        target.tipo_usuario = u.tipo_usuario;
        target.updated_at = nowIso;
        actualizados++;
      }
    }
    writeLocalStore(store);
  }

  return { actualizados, omitidos, errores };
}

module.exports = {
  normalizarTexto,
  limpiarLocalPartEmail,
  esCuentaMaquinaEducacion,
  resolverEstablecimientoCMDS,
  resolverLicenciaCMDS,
  parseWorkbookToNormalizedUsers,
  bulkImportNormalizedUsers,
  isExportedNominaWorkbook,
  bulkUpdateFromExportedNomina
};
