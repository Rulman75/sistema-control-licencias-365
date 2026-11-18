const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  getFullState,
  readLocalStore,
  writeLocalStore,
  getPool,
  isPgAvailable
} = require('./db');
const {
  esCuentaMaquinaEducacion,
  resolverEstablecimientoCMDS
} = require('./excelParser');

function splitFullName(fullName, email) {
  const clean = String(fullName || '').trim().replace(/\s+/g, ' ');
  if (!clean) {
    const local = String(email || '').split('@')[0].replace(/[._-]/g, ' ').trim();
    return { nombres: local || 'Usuario', apellidos: '' };
  }
  const parts = clean.split(' ');
  if (parts.length === 1) {
    return { nombres: parts[0], apellidos: '' };
  }
  if (parts.length === 2) {
    return { nombres: parts[0], apellidos: parts[1] };
  }
  return {
    nombres: parts.slice(0, -2).join(' '),
    apellidos: parts.slice(-2).join(' ')
  };
}

function clasificarCuentaM365({ nombreCompleto, email, dominio, rawLicencia, skuHint }) {
  const dom = String(dominio || '').toLowerCase();
  if (dom === 'cmds-educacion.cl') {
    if (esCuentaMaquinaEducacion(nombreCompleto, email)) {
      return { tipo_cuenta: 'MAQUINA', tipo_usuario: 'MAQUINA' };
    }
    const rawUp = String(rawLicencia || '').toUpperCase();
    const isStudent =
      skuHint === 'O365_A3_STUDENT' ||
      rawUp.includes('STU') ||
      rawUp.includes('STUDENT') ||
      rawUp.includes('ESTUDIANTE');
    return {
      tipo_cuenta: 'PERSONA',
      tipo_usuario: isStudent ? 'ESTUDIANTE' : 'FUNCIONARIO'
    };
  }
  return { tipo_cuenta: 'PERSONA', tipo_usuario: 'FUNCIONARIO' };
}

function resolveEstablecimientoId(rawUnitHint, sector, establecimientos, extraHints = []) {
  const dominio =
    sector === 'EDUCACION'
      ? 'cmds-educacion.cl'
      : sector === 'SALUD'
      ? 'cmds-salud.cl'
      : 'cmds.cl';
  const est = resolverEstablecimientoCMDS({
    texto: rawUnitHint || '',
    textosExtra: extraHints,
    dominio,
    establecimientos
  });
  return est ? est.id : (establecimientos[0]?.id || 1);
}

const CERT_LOCAL_PATH = path.join(__dirname, 'data', 'm365_cert.json');
let syncInProgress = false;

// ============================================================================
// 1. GENERADOR NATIVO DE CERTIFICADO X.509 RSA-2048 PARA MICROSOFT ENTRA ID
// ============================================================================
function derLen(len) {
  if (len < 128) return Buffer.from([len]);
  const bytes = [];
  let n = len;
  while (n > 0) {
    bytes.unshift(n & 0xff);
    n >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
function derTag(tag, buf) {
  return Buffer.concat([Buffer.from([tag]), derLen(buf.length), buf]);
}
function derSeq(...items) {
  return derTag(0x30, Buffer.concat(items));
}
function derSet(...items) {
  return derTag(0x31, Buffer.concat(items));
}
function derOid(oidBytes) {
  return derTag(0x06, Buffer.from(oidBytes));
}
function derUtf8(str) {
  return derTag(0x0c, Buffer.from(str, 'utf8'));
}
function derUtcTime(date) {
  const s = date.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z';
  return derTag(0x17, Buffer.from(s, 'ascii'));
}
function derInt(buf) {
  let b = Buffer.isBuffer(buf) ? buf : Buffer.from([buf]);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0x00]), b]);
  return derTag(0x02, b);
}
function derBitString(buf) {
  return derTag(0x03, Buffer.concat([Buffer.from([0x00]), buf]));
}

function generateX509CertPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
  });

  const algId = derSeq(
    derOid([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]),
    Buffer.from([0x05, 0x00])
  );
  const cnAttr = derSet(derSeq(derOid([0x55, 0x04, 0x03]), derUtf8('CMDS-Sincronizador-Licencias-M365')));
  const oAttr = derSet(derSeq(derOid([0x55, 0x04, 0x0a]), derUtf8('CMDS Antofagasta')));
  const name = derSeq(oAttr, cnAttr);

  const now = new Date(Date.now() - 3600 * 1000);
  const exp = new Date(Date.now() + 5 * 365 * 24 * 3600 * 1000);
  const validity = derSeq(derUtcTime(now), derUtcTime(exp));
  const serial = derInt(crypto.randomBytes(16));
  const version = derTag(0xa0, derInt(2));

  const tbs = derSeq(version, serial, algId, name, validity, name, publicKey);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(tbs);
  const sig = signer.sign(privateKey);
  const certDer = derSeq(tbs, algId, derBitString(sig));

  const sha1Hex = crypto.createHash('sha1').update(certDer).digest('hex').toUpperCase();
  const x5t = crypto.createHash('sha1').update(certDer).digest('base64url');
  const certPem =
    '-----BEGIN CERTIFICATE-----\n' +
    certDer.toString('base64').match(/.{1,64}/g).join('\n') +
    '\n-----END CERTIFICATE-----\n';

  return {
    thumbprint_sha1: sha1Hex,
    x5t,
    cert_pem: certPem,
    private_key_pem: privateKey
  };
}

// ============================================================================
// 2. LECTURA Y GUARDADO DE CONFIGURACIÓN DE SINCRONIZACIÓN
// ============================================================================
async function getSyncConfig() {
  const pool = getPool();
  if (isPgAvailable() && pool) {
    try {
      const res = await pool.query('SELECT * FROM config_m365_sync WHERE id = 1');
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (e) {
      console.warn('[GRAPH SYNC] Error leyendo config_m365_sync de PG:', e.message);
    }
  }

  if (fs.existsSync(CERT_LOCAL_PATH)) {
    try {
      const local = JSON.parse(fs.readFileSync(CERT_LOCAL_PATH, 'utf8'));
      return {
        id: 1,
        tenant_id: local.tenant_id || '95f4d8b5-b14f-45b1-9463-f6dff68ff1c6',
        client_id: local.client_id || '791d04cf-ce04-4eb7-b572-e6f6e55e6b94',
        client_secret: local.client_secret || '',
        thumbprint_sha1: local.thumbprint_sha1 || '',
        x5t: local.x5t || '',
        cert_pem: local.cert_pem || '',
        private_key_pem: local.private_key_pem || '',
        auto_sync_enabled: local.auto_sync_enabled !== false,
        interval_minutes: Number(local.interval_minutes || 15),
        last_sync_at: local.last_sync_at || null,
        last_sync_status: local.last_sync_status || 'PENDIENTE',
        last_sync_summary: local.last_sync_summary || ''
      };
    } catch (e) {
      // ignore
    }
  }

  const generated = generateX509CertPair();
  const initialConfig = {
    id: 1,
    tenant_id: '95f4d8b5-b14f-45b1-9463-f6dff68ff1c6',
    client_id: '791d04cf-ce04-4eb7-b572-e6f6e55e6b94',
    client_secret: '',
    ...generated,
    auto_sync_enabled: true,
    interval_minutes: 15,
    last_sync_at: null,
    last_sync_status: 'PENDIENTE',
    last_sync_summary: ''
  };
  await saveSyncConfig(initialConfig);
  return initialConfig;
}

async function saveSyncConfig(partial) {
  let current = {};
  if (fs.existsSync(CERT_LOCAL_PATH)) {
    try {
      current = JSON.parse(fs.readFileSync(CERT_LOCAL_PATH, 'utf8'));
    } catch (e) {
      current = {};
    }
  }
  const pool = getPool();
  if (isPgAvailable() && pool) {
    try {
      const res = await pool.query('SELECT * FROM config_m365_sync WHERE id = 1');
      if (res.rows[0]) current = { ...current, ...res.rows[0] };
    } catch (e) {
      // ignore
    }
  }

  const merged = {
    tenant_id: partial.tenant_id !== undefined ? String(partial.tenant_id).trim() : (current.tenant_id || '95f4d8b5-b14f-45b1-9463-f6dff68ff1c6'),
    client_id: partial.client_id !== undefined ? String(partial.client_id).trim() : (current.client_id || '791d04cf-ce04-4eb7-b572-e6f6e55e6b94'),
    client_secret: partial.client_secret !== undefined ? String(partial.client_secret).trim() : (current.client_secret || ''),
    thumbprint_sha1: partial.thumbprint_sha1 || current.thumbprint_sha1 || '',
    x5t: partial.x5t || current.x5t || '',
    cert_pem: partial.cert_pem || current.cert_pem || '',
    private_key_pem: partial.private_key_pem || current.private_key_pem || '',
    auto_sync_enabled: partial.auto_sync_enabled !== undefined ? Boolean(partial.auto_sync_enabled) : (current.auto_sync_enabled !== false),
    interval_minutes: Math.max(5, Number(partial.interval_minutes || current.interval_minutes || 15)),
    last_sync_at: partial.last_sync_at !== undefined ? partial.last_sync_at : (current.last_sync_at || null),
    last_sync_status: partial.last_sync_status || current.last_sync_status || 'PENDIENTE',
    last_sync_summary: partial.last_sync_summary !== undefined ? partial.last_sync_summary : (current.last_sync_summary || '')
  };

  if (!merged.cert_pem || !merged.private_key_pem) {
    const gen = generateX509CertPair();
    merged.thumbprint_sha1 = gen.thumbprint_sha1;
    merged.x5t = gen.x5t;
    merged.cert_pem = gen.cert_pem;
    merged.private_key_pem = gen.private_key_pem;
  }

  try {
    fs.writeFileSync(CERT_LOCAL_PATH, JSON.stringify(merged, null, 2), 'utf8');
  } catch (e) {
    console.warn('[GRAPH SYNC] Advertencia guardando m365_cert.json local:', e.message);
  }

  if (isPgAvailable() && pool) {
    await pool.query(
      `INSERT INTO config_m365_sync
        (id, tenant_id, client_id, client_secret, thumbprint_sha1, x5t, cert_pem, private_key_pem, auto_sync_enabled, interval_minutes, last_sync_at, last_sync_status, last_sync_summary, updated_at)
       VALUES (1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO UPDATE SET
         tenant_id = EXCLUDED.tenant_id,
         client_id = EXCLUDED.client_id,
         client_secret = EXCLUDED.client_secret,
         thumbprint_sha1 = EXCLUDED.thumbprint_sha1,
         x5t = EXCLUDED.x5t,
         cert_pem = EXCLUDED.cert_pem,
         private_key_pem = EXCLUDED.private_key_pem,
         auto_sync_enabled = EXCLUDED.auto_sync_enabled,
         interval_minutes = EXCLUDED.interval_minutes,
         last_sync_at = EXCLUDED.last_sync_at,
         last_sync_status = EXCLUDED.last_sync_status,
         last_sync_summary = EXCLUDED.last_sync_summary,
         updated_at = CURRENT_TIMESTAMP`,
      [
        merged.tenant_id,
        merged.client_id,
        merged.client_secret,
        merged.thumbprint_sha1,
        merged.x5t,
        merged.cert_pem,
        merged.private_key_pem,
        merged.auto_sync_enabled,
        merged.interval_minutes,
        merged.last_sync_at,
        merged.last_sync_status,
        merged.last_sync_summary
      ]
    );
  }

  return merged;
}

async function getSyncHistory(limit = 20) {
  const pool = getPool();
  if (isPgAvailable() && pool) {
    try {
      const res = await pool.query(
        'SELECT * FROM historial_sync_m365 ORDER BY fecha DESC, id DESC LIMIT $1',
        [limit]
      );
      return res.rows;
    } catch (e) {
      return [];
    }
  }
  const store = readLocalStore();
  return Array.isArray(store.historial_sync_m365) ? store.historial_sync_m365.slice(0, limit) : [];
}

// ============================================================================
// 3. AUTENTICACIÓN OAUTH 2.0 ENTRA ID (CERTIFICADO X.509 RS256 client_assertion)
// ============================================================================
function createClientAssertionJwt(tenantId, clientId, x5t, privateKeyPem) {
  const tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const nowSec = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
    x5t
  };

  const payload = {
    aud: tokenEndpoint,
    iss: clientId,
    sub: clientId,
    jti: crypto.randomUUID(),
    nbf: nowSec - 60,
    exp: nowSec + 600
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signingInput = `${b64Header}.${b64Payload}`;

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = signer.sign(privateKeyPem).toString('base64url');

  return `${signingInput}.${signature}`;
}

async function getGraphAccessToken(config) {
  const tenantId = (config.tenant_id || '').trim();
  const clientId = (config.client_id || '').trim();

  if (!tenantId || !clientId) {
    throw new Error('Falta configurar Tenant ID o Client ID de Microsoft Entra ID.');
  }

  const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams();
  params.append('client_id', clientId);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');

  if (config.private_key_pem && config.x5t) {
    const assertion = createClientAssertionJwt(tenantId, clientId, config.x5t, config.private_key_pem);
    params.append('client_assertion_type', 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer');
    params.append('client_assertion', assertion);
  } else if (config.client_secret) {
    params.append('client_secret', config.client_secret);
  } else {
    throw new Error('No hay Certificado X.509 ni Client Secret configurado para autenticar contra Microsoft Entra ID.');
  }

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    const desc = data.error_description || data.error || 'Error obteniendo token OAuth2 de Microsoft Entra ID.';
    if (String(desc).includes('AADSTS700027')) {
      throw new Error(
        `Falta subir el certificado público CMDS_M365_Graph_Certificado.cer (Huella: ${config.thumbprint_sha1}) en Microsoft Entra ID -> Certificados y secretos -> Certificados -> Cargar certificado.`
      );
    }
    throw new Error(desc);
  }

  return data.access_token;
}

async function graphGet(accessToken, url) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      ConsistencyLevel: 'eventual'
    }
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `Error HTTP ${res.status} consultando Microsoft Graph.`;
    throw new Error(msg);
  }
  return data;
}

// ============================================================================
// 4. PRUEBA EN VIVO DE CONEXIÓN Y LECTURA DE SKUS DEL TENANT CMDS
// ============================================================================
async function testGraphConnection(customConfig) {
  const config = customConfig || (await getSyncConfig());
  const token = await getGraphAccessToken(config);

  const [orgData, skusData] = await Promise.all([
    graphGet(token, 'https://graph.microsoft.com/v1.0/organization?$select=id,displayName,verifiedDomains'),
    graphGet(token, 'https://graph.microsoft.com/v1.0/subscribedSkus')
  ]);

  const org = (orgData.value && orgData.value[0]) || {};
  const dominiosVerificados = (org.verifiedDomains || []).map(d => d.name);

  const skus = (skusData.value || []).map(s => ({
    skuId: s.skuId,
    skuPartNumber: s.skuPartNumber,
    capabilityStatus: s.capabilityStatus,
    enabled: s.prepaidUnits?.enabled || 0,
    consumed: s.consumedUnits || 0
  }));

  return {
    connected: true,
    organizationName: org.displayName || 'Tenant CMDS Microsoft 365',
    organizationId: org.id || config.tenant_id,
    verifiedDomains: dominiosVerificados,
    skus
  };
}

// ============================================================================
// 5. MAPEO DE SKUS DE MICROSOFT GRAPH -> 6 POOLS DE LICENCIAS CMDS
// ============================================================================
function mapGraphSkuToInternalCode(skuPartNumber) {
  const up = String(skuPartNumber || '').trim().toUpperCase();
  if (!up) return null;

  // Office 365 E3
  if (up === 'ENTERPRISEPACK' || up.includes('O365_E3') || up === 'SPE_E3' || up === 'ENTERPRISEPREMIUM') {
    return 'O365_E3';
  }
  // Office 365 E1
  if (up === 'STANDARDPACK' || up.includes('O365_E1')) {
    return 'O365_E1';
  }
  // Microsoft 365 Business Basic
  if (
    up.includes('O365_BUSINESS_ESSENTIALS') ||
    up.includes('SMB_BUSINESS_ESSENTIALS') ||
    up.includes('M365_BUS_BASIC') ||
    up.includes('BUSINESS_BASIC')
  ) {
    return 'M365_BUS_BASIC';
  }
  // Office 365 A3 Faculty
  if (
    up.includes('A3_FACULTY') ||
    up === 'M365EDU_A3_FACULTY' ||
    up === 'ENTERPRISEPACKPLUS_FACULTY' ||
    up === 'STANDARDWOFFPACK_FACULTY'
  ) {
    return 'O365_A3_FACULTY';
  }
  // Office 365 A3 Student
  if (
    up.includes('STUUSEBNFT') ||
    up.includes('A3_STU') ||
    up.includes('A3_STUDENT') ||
    up === 'M365EDU_A3_STUUSEBNFT' ||
    up === 'ENTERPRISEPACKPLUS_STUUSEBNFT' ||
    up === 'ENTERPRISEPACKPLUS_STUDENT' ||
    up === 'STANDARDWOFFPACK_STUDENT' ||
    up === 'STANDARDWOFFPACK_IW_STUDENT'
  ) {
    return 'O365_A3_STUDENT';
  }

  return null;
}

function extractSecondaryAlias(upn, mail, proxyAddresses) {
  const primary = String(upn || '').trim().toLowerCase();
  const candidates = [];

  if (Array.isArray(proxyAddresses)) {
    for (const addr of proxyAddresses) {
      const str = String(addr || '').trim();
      if (str.toLowerCase().startsWith('smtp:')) {
        const email = str.slice(5).trim().toLowerCase();
        if (email && email !== primary && !email.endsWith('.onmicrosoft.com')) {
          candidates.push(email);
        }
      }
    }
  }
  const cleanMail = String(mail || '').trim().toLowerCase();
  if (cleanMail && cleanMail !== primary && !cleanMail.endsWith('.onmicrosoft.com') && !candidates.includes(cleanMail)) {
    candidates.push(cleanMail);
  }

  // Priorizar alias @cmds.cl (migraciones desde cmds.cl hacia cmds-educacion.cl o cmds-salud.cl)
  const cmdsAlias = candidates.find(c => c.endsWith('@cmds.cl'));
  return cmdsAlias || candidates[0] || '';
}

// ============================================================================
// 6. MOTOR DE SINCRONIZACIÓN DELTA MICROSOFT 365 -> POSTGRESQL CMDS
// ============================================================================
async function runMicrosoft365Sync({ trigger = 'MANUAL', operatorUsername = 'Microsoft Graph Sync' } = {}) {
  if (syncInProgress) {
    throw new Error('Ya hay una sincronización con Microsoft 365 en curso. Espere unos segundos.');
  }

  syncInProgress = true;
  const startTime = Date.now();

  try {
    const config = await getSyncConfig();
    const token = await getGraphAccessToken(config);

    // 1. Obtener SKUs contratados del Tenant
    const skusData = await graphGet(token, 'https://graph.microsoft.com/v1.0/subscribedSkus');
    const skuPartById = new Map();
    for (const s of skusData.value || []) {
      if (s.skuId && s.skuPartNumber) {
        skuPartById.set(String(s.skuId).toLowerCase(), s.skuPartNumber);
      }
    }

    // 2. Obtener todos los usuarios del Tenant paginando con @odata.nextLink
    const graphUsers = [];
    let nextUrl =
      'https://graph.microsoft.com/v1.0/users?$top=999&$select=id,displayName,givenName,surname,userPrincipalName,mail,proxyAddresses,department,jobTitle,officeLocation,companyName,accountEnabled,assignedLicenses,createdDateTime';

    while (nextUrl) {
      const page = await graphGet(token, nextUrl);
      if (Array.isArray(page.value)) {
        graphUsers.push(...page.value);
      }
      nextUrl = page['@odata.nextLink'] || null;
    }

    const state = await getFullState();
    const domByName = new Map(state.dominios.map(d => [d.dominio.toLowerCase(), d]));
    const tipoByCode = new Map(state.tipos_licencia.map(t => [t.codigo_sku.toUpperCase(), t]));
    const cupoByDomAndTipo = new Map(
      state.cupos_licencia.map(c => [`${c.dominio_id}_${c.tipo_licencia_id}`, c])
    );
    const cupoById = new Map(state.cupos_licencia.map(c => [c.id, c]));
    const tipoById = new Map(state.tipos_licencia.map(t => [t.id, t]));
    const estById = new Map(state.establecimientos.map(e => [e.id, e]));

    const userByEmail = new Map(state.usuarios_m365.map(u => [u.email.toLowerCase(), u]));
    const activeAsigsByUserId = new Map();
    for (const a of state.asignaciones_licencia) {
      if (a.estado !== 'ACTIVA') continue;
      if (!activeAsigsByUserId.has(a.usuario_id)) {
        activeAsigsByUserId.set(a.usuario_id, []);
      }
      activeAsigsByUserId.get(a.usuario_id).push(a);
    }

    let usuariosNuevos = 0;
    let usuariosActualizados = 0;
    let altasLicencia = 0;
    let bajasLicencia = 0;
    let aliasActualizados = 0;
    let usuariosDepurados = 0;
    let totalUsuariosDominiosCmds = 0;

    // Conjunto de todos los correos reales existentes en Microsoft 365 Admin Center
    const validGraphEmails = new Set();
    for (const gu of graphUsers) {
      const upn = String(gu.userPrincipalName || '').trim().toLowerCase();
      if (upn.includes('@')) validGraphEmails.add(upn);
      const alias = extractSecondaryAlias(upn, gu.mail, gu.proxyAddresses);
      if (alias) validGraphEmails.add(alias.toLowerCase());
    }

    const nowIso = new Date().toISOString();
    const pool = getPool();

    if (isPgAvailable() && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const gu of graphUsers) {
          const upn = String(gu.userPrincipalName || '').trim().toLowerCase();
          if (!upn.includes('@')) continue;

          const domainStr = upn.split('@')[1];
          const domObj = domByName.get(domainStr);
          if (!domObj) continue; // Ignorar cuentas técnicas @*.onmicrosoft.com que no pertenecen a los 3 dominios oficiales

          totalUsuariosDominiosCmds++;

          const displayName = String(gu.displayName || '').trim();
          const givenName = String(gu.givenName || '').trim();
          const surname = String(gu.surname || '').trim();
          const fullName =
            displayName ||
            [givenName, surname].filter(Boolean).join(' ') ||
            upn.split('@')[0].replace(/[._-]/g, ' ');
          const split = splitFullName(fullName, upn);
          const nombres = givenName || split.nombres;
          const apellidos = surname || split.apellidos;

          const alias = extractSecondaryAlias(upn, gu.mail, gu.proxyAddresses);
          const estadoCuenta = gu.accountEnabled === false ? 'BAJA' : 'ACTIVO';

          // Mapear licencias asignadas en Microsoft 365 para este usuario
          const assignedRawSkus = (gu.assignedLicenses || [])
            .map(al => skuPartById.get(String(al.skuId || '').toLowerCase()) || '')
            .filter(Boolean);

          const clasificacion = clasificarCuentaM365({
            nombreCompleto: fullName,
            email: upn,
            dominio: domainStr,
            rawLicencia: assignedRawSkus.join(' + '),
            skuHint: assignedRawSkus.map(mapGraphSkuToInternalCode).filter(Boolean)[0] || null
          });

          // Determinar cupos de licencia que corresponden según lo asignado en Microsoft 365
          const targetCupoIds = new Set();
          for (const rawSkuPart of assignedRawSkus) {
            let internalCode = mapGraphSkuToInternalCode(rawSkuPart);
            if (!internalCode) continue;

            // Regla CMDS Educación: Máquinas en @cmds-educacion.cl usan pool A3 Student (cupo_licencia_id = 6)
            if (domainStr === 'cmds-educacion.cl' && clasificacion.tipo_cuenta === 'MAQUINA') {
              internalCode = 'O365_A3_STUDENT';
            }

            const tipoLic = tipoByCode.get(internalCode);
            if (!tipoLic) continue;

            // Solo asignar cupos pertenecientes al mismo dominio de la cuenta
            const cupo = cupoByDomAndTipo.get(`${domObj.id}_${tipoLic.id}`);
            if (cupo) {
              targetCupoIds.add(cupo.id);
            }
          }

          let dbUser = userByEmail.get(upn);

          if (!dbUser) {
            // Crear nuevo usuario detectado en Microsoft 365
            const rawUnitHint = [gu.officeLocation, gu.department, gu.companyName].filter(Boolean).join(' ');
            const estId = resolveEstablecimientoId(rawUnitHint, domObj.sector, state.establecimientos);

            const insRes = await client.query(
              `INSERT INTO usuarios_m365
               (rut, nombres, apellidos, nombre_completo, email, email_alias, m365_object_id, dominio_id, establecimiento_id, cargo, departamento, tipo_cuenta, tipo_usuario, estado_cuenta, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $15)
               RETURNING *`,
              [
                '',
                nombres,
                apellidos,
                fullName,
                upn,
                alias,
                gu.id || '',
                domObj.id,
                estId,
                gu.jobTitle || (clasificacion.tipo_cuenta === 'MAQUINA' ? 'Equipo / Laboratorio' : 'Funcionario CMDS'),
                gu.department || domObj.nombre,
                clasificacion.tipo_cuenta,
                clasificacion.tipo_usuario,
                estadoCuenta,
                nowIso
              ]
            );
            dbUser = insRes.rows[0];
            userByEmail.set(upn, dbUser);
            usuariosNuevos++;
            if (alias) aliasActualizados++;
          } else {
            // Actualizar alias, m365_object_id o estado si cambiaron en M365
            const newAlias = alias || dbUser.email_alias || '';
            const aliasChanged = newAlias !== (dbUser.email_alias || '');
            const statusChanged = estadoCuenta !== dbUser.estado_cuenta;
            const objIdChanged = gu.id && gu.id !== dbUser.m365_object_id;

            if (aliasChanged || statusChanged || objIdChanged) {
              await client.query(
                `UPDATE usuarios_m365
                 SET email_alias = $1,
                     estado_cuenta = $2,
                     m365_object_id = $3,
                     updated_at = $4
                 WHERE id = $5`,
                [newAlias, estadoCuenta, gu.id || dbUser.m365_object_id || '', nowIso, dbUser.id]
              );
              if (aliasChanged && alias) aliasActualizados++;
              usuariosActualizados++;
            }
          }

          // Reconciliar asignaciones de licencias (Altas y Bajas automáticas desde M365)
          const currentActiveAsigs = activeAsigsByUserId.get(dbUser.id) || [];
          const currentCupoIds = new Set(currentActiveAsigs.map(a => a.cupo_licencia_id));
          const est = estById.get(dbUser.establecimiento_id);

          // A) Detectar NUEVAS ALTAS de licencias en Microsoft 365
          for (const targetCupoId of targetCupoIds) {
            if (!currentCupoIds.has(targetCupoId)) {
              const cupo = cupoById.get(targetCupoId) || {};
              const tipo = tipoById.get(cupo.tipo_licencia_id) || {};
              const glosaAlta = 'Asignación detectada automáticamente en Centro de Administración Microsoft 365';

              await client.query(
                `INSERT INTO asignaciones_licencia
                 (usuario_id, cupo_licencia_id, estado, numero_ticket, asignado_por, observaciones, fecha_alta)
                 VALUES ($1, $2, 'ACTIVA', 'SYNC-M365-AUTO', $3, $4, $5)`,
                [dbUser.id, targetCupoId, operatorUsername, glosaAlta, nowIso]
              );

              await client.query(
                `INSERT INTO movimientos_licencia
                 (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
                 VALUES ('ALTA', $1, $2, $3, $4, $5, $6, $7, $8, 'SYNC-M365-AUTO', $9, $10)`,
                [
                  dbUser.id,
                  dbUser.email,
                  dbUser.nombre_completo,
                  targetCupoId,
                  domObj.dominio,
                  tipo.nombre || 'Licencia Microsoft 365',
                  est ? est.nombre : 'SIN ESTABLECIMIENTO',
                  glosaAlta,
                  operatorUsername,
                  nowIso
                ]
              );

              altasLicencia++;
            }
          }

          // B) Detectar BAJAS / REVOCACIONES de licencias en Microsoft 365
          for (const activeAsig of currentActiveAsigs) {
            if (!targetCupoIds.has(activeAsig.cupo_licencia_id)) {
              const cupo = cupoById.get(activeAsig.cupo_licencia_id) || {};
              const tipo = tipoById.get(cupo.tipo_licencia_id) || {};
              const glosaBaja = 'Licencia desasignada en Centro de Administración Microsoft 365 (Sincronización Automática)';

              await client.query(
                `UPDATE asignaciones_licencia
                 SET estado = 'REVOCADA', fecha_baja = $1, motivo_baja = $2
                 WHERE id = $3`,
                [nowIso, glosaBaja, activeAsig.id]
              );

              await client.query(
                `INSERT INTO movimientos_licencia
                 (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
                 VALUES ('BAJA', $1, $2, $3, $4, $5, $6, $7, $8, 'SYNC-M365-BAJA', $9, $10)`,
                [
                  dbUser.id,
                  dbUser.email,
                  dbUser.nombre_completo,
                  activeAsig.cupo_licencia_id,
                  domObj.dominio,
                  tipo.nombre || 'Licencia Microsoft 365',
                  est ? est.nombre : 'SIN ESTABLECIMIENTO',
                  glosaBaja,
                  operatorUsername,
                  nowIso
                ]
              );

              bajasLicencia++;
            }
          }
        }

        // C) Depurar cualquier cuenta en BD que NO exista en el Centro de Administración Microsoft 365
        if (validGraphEmails.size > 0) {
          const validEmailsArray = Array.from(validGraphEmails);
          const delRes = await client.query(
            `DELETE FROM usuarios_m365 WHERE NOT (LOWER(email) = ANY($1))`,
            [validEmailsArray]
          );
          usuariosDepurados = delRes.rowCount || 0;
        }

        const durationMs = Date.now() - startTime;
        const summaryText = `Sincronizados ${totalUsuariosDominiosCmds} usuarios M365: ${usuariosNuevos} nuevos, ${altasLicencia} altas de licencia, ${bajasLicencia} bajas de licencia, ${aliasActualizados} alias actualizados${usuariosDepurados > 0 ? `, ${usuariosDepurados} cuentas inexistentes en M365 depuradas` : ''} (${durationMs} ms).`;

        await client.query(
          `INSERT INTO historial_sync_m365
           (fecha, origen, estado, duracion_ms, total_usuarios_graph, usuarios_nuevos, usuarios_actualizados, altas_licencia, bajas_licencia, alias_actualizados, detalle, ejecutado_por)
           VALUES ($1, $2, 'OK', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            nowIso,
            trigger,
            durationMs,
            totalUsuariosDominiosCmds,
            usuariosNuevos,
            usuariosActualizados,
            altasLicencia,
            bajasLicencia,
            aliasActualizados,
            summaryText,
            operatorUsername
          ]
        );

        await client.query(
          `UPDATE config_m365_sync
           SET last_sync_at = $1, last_sync_status = 'OK', last_sync_summary = $2, updated_at = $1
           WHERE id = 1`,
          [nowIso, summaryText]
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } else {
      // Modo LOCAL_SYNC (store.json en servidor Linux DMZ cuando PG no está en alcance directo)
      const store = readLocalStore();
      let nextUserId = store.usuarios_m365.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      let nextAsigId = store.asignaciones_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      let nextMovId = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      const localUserByEmail = new Map(store.usuarios_m365.map(u => [u.email.toLowerCase(), u]));
      const localActiveAsigsByUser = new Map();
      for (const a of store.asignaciones_licencia) {
        if (a.estado !== 'ACTIVA') continue;
        if (!localActiveAsigsByUser.has(a.usuario_id)) localActiveAsigsByUser.set(a.usuario_id, []);
        localActiveAsigsByUser.get(a.usuario_id).push(a);
      }

      for (const gu of graphUsers) {
        const upn = String(gu.userPrincipalName || '').trim().toLowerCase();
        if (!upn.includes('@')) continue;

        const domainStr = upn.split('@')[1];
        const domObj = domByName.get(domainStr);
        if (!domObj) continue;

        totalUsuariosDominiosCmds++;

        const displayName = String(gu.displayName || '').trim();
        const givenName = String(gu.givenName || '').trim();
        const surname = String(gu.surname || '').trim();
        const fullName =
          displayName ||
          [givenName, surname].filter(Boolean).join(' ') ||
          upn.split('@')[0].replace(/[._-]/g, ' ');
        const split = splitFullName(fullName, upn);
        const nombres = givenName || split.nombres;
        const apellidos = surname || split.apellidos;
        const alias = extractSecondaryAlias(upn, gu.mail, gu.proxyAddresses);
        const estadoCuenta = gu.accountEnabled === false ? 'BAJA' : 'ACTIVO';

        const assignedRawSkus = (gu.assignedLicenses || [])
          .map(al => skuPartById.get(String(al.skuId || '').toLowerCase()) || '')
          .filter(Boolean);

        const clasificacion = clasificarCuentaM365({
          nombreCompleto: fullName,
          email: upn,
          dominio: domainStr,
          rawLicencia: assignedRawSkus.join(' + '),
          skuHint: assignedRawSkus.map(mapGraphSkuToInternalCode).filter(Boolean)[0] || null
        });

        const targetCupoIds = new Set();
        for (const rawSkuPart of assignedRawSkus) {
          let internalCode = mapGraphSkuToInternalCode(rawSkuPart);
          if (!internalCode) continue;
          if (domainStr === 'cmds-educacion.cl' && clasificacion.tipo_cuenta === 'MAQUINA') {
            internalCode = 'O365_A3_STUDENT';
          }
          const tipoLic = tipoByCode.get(internalCode);
          if (!tipoLic) continue;
          const cupo = cupoByDomAndTipo.get(`${domObj.id}_${tipoLic.id}`);
          if (cupo) targetCupoIds.add(cupo.id);
        }

        let dbUser = localUserByEmail.get(upn);
        if (!dbUser) {
          const rawUnitHint = [gu.officeLocation, gu.department, gu.companyName].filter(Boolean).join(' ');
          const estId = resolveEstablecimientoId(rawUnitHint, domObj.sector, store.establecimientos);
          dbUser = {
            id: nextUserId++,
            rut: '',
            nombres,
            apellidos,
            nombre_completo: fullName,
            email: upn,
            email_alias: alias,
            m365_object_id: gu.id || '',
            dominio_id: domObj.id,
            establecimiento_id: estId,
            cargo: gu.jobTitle || (clasificacion.tipo_cuenta === 'MAQUINA' ? 'Equipo / Laboratorio' : 'Funcionario CMDS'),
            departamento: gu.department || domObj.nombre,
            tipo_cuenta: clasificacion.tipo_cuenta,
            tipo_usuario: clasificacion.tipo_usuario,
            estado_cuenta: estadoCuenta,
            created_at: nowIso,
            updated_at: nowIso
          };
          store.usuarios_m365.unshift(dbUser);
          localUserByEmail.set(upn, dbUser);
          usuariosNuevos++;
          if (alias) aliasActualizados++;
        } else {
          const newAlias = alias || dbUser.email_alias || '';
          const aliasChanged = newAlias !== (dbUser.email_alias || '');
          const statusChanged = estadoCuenta !== dbUser.estado_cuenta;
          const objIdChanged = gu.id && gu.id !== dbUser.m365_object_id;
          if (aliasChanged || statusChanged || objIdChanged) {
            dbUser.email_alias = newAlias;
            dbUser.estado_cuenta = estadoCuenta;
            dbUser.m365_object_id = gu.id || dbUser.m365_object_id || '';
            dbUser.updated_at = nowIso;
            if (aliasChanged && alias) aliasActualizados++;
            usuariosActualizados++;
          }
        }

        const currentActiveAsigs = localActiveAsigsByUser.get(dbUser.id) || [];
        const currentCupoIds = new Set(currentActiveAsigs.map(a => a.cupo_licencia_id));
        const est = estById.get(dbUser.establecimiento_id);

        for (const targetCupoId of targetCupoIds) {
          if (!currentCupoIds.has(targetCupoId)) {
            const cupo = cupoById.get(targetCupoId) || {};
            const tipo = tipoById.get(cupo.tipo_licencia_id) || {};
            const glosaAlta = 'Asignación detectada automáticamente en Centro de Administración Microsoft 365';
            store.asignaciones_licencia.unshift({
              id: nextAsigId++,
              usuario_id: dbUser.id,
              cupo_licencia_id: targetCupoId,
              estado: 'ACTIVA',
              numero_ticket: 'SYNC-M365-AUTO',
              asignado_por: operatorUsername,
              observaciones: glosaAlta,
              fecha_alta: nowIso,
              fecha_baja: null,
              motivo_baja: null
            });
            store.movimientos_licencia.unshift({
              id: nextMovId++,
              tipo_movimiento: 'ALTA',
              usuario_id: dbUser.id,
              usuario_email: dbUser.email,
              usuario_nombre: dbUser.nombre_completo,
              cupo_licencia_id: targetCupoId,
              dominio_nombre: domObj.dominio,
              licencia_nombre: tipo.nombre || 'Licencia Microsoft 365',
              establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
              motivo: glosaAlta,
              ticket_referencia: 'SYNC-M365-AUTO',
              ejecutado_por: operatorUsername,
              fecha_movimiento: nowIso
            });
            altasLicencia++;
          }
        }

        for (const activeAsig of currentActiveAsigs) {
          if (!targetCupoIds.has(activeAsig.cupo_licencia_id)) {
            const cupo = cupoById.get(activeAsig.cupo_licencia_id) || {};
            const tipo = tipoById.get(cupo.tipo_licencia_id) || {};
            const glosaBaja = 'Licencia desasignada en Centro de Administración Microsoft 365 (Sincronización Automática)';
            activeAsig.estado = 'REVOCADA';
            activeAsig.fecha_baja = nowIso;
            activeAsig.motivo_baja = glosaBaja;
            store.movimientos_licencia.unshift({
              id: nextMovId++,
              tipo_movimiento: 'BAJA',
              usuario_id: dbUser.id,
              usuario_email: dbUser.email,
              usuario_nombre: dbUser.nombre_completo,
              cupo_licencia_id: activeAsig.cupo_licencia_id,
              dominio_nombre: domObj.dominio,
              licencia_nombre: tipo.nombre || 'Licencia Microsoft 365',
              establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
              motivo: glosaBaja,
              ticket_referencia: 'SYNC-M365-BAJA',
              ejecutado_por: operatorUsername,
              fecha_movimiento: nowIso
            });
            bajasLicencia++;
          }
        }
      }

      // C) Depurar cualquier cuenta en store local que NO exista en el Centro de Administración Microsoft 365
      if (validGraphEmails.size > 0) {
        const idsToRemove = new Set(
          store.usuarios_m365
            .filter(u => !validGraphEmails.has(String(u.email || '').toLowerCase()))
            .map(u => u.id)
        );
        if (idsToRemove.size > 0) {
          usuariosDepurados = idsToRemove.size;
          store.usuarios_m365 = store.usuarios_m365.filter(u => !idsToRemove.has(u.id));
          store.asignaciones_licencia = store.asignaciones_licencia.filter(
            a => !idsToRemove.has(a.usuario_id)
          );
        }
      }

      const durationMs = Date.now() - startTime;
      const summaryText = `Sincronizados ${totalUsuariosDominiosCmds} usuarios M365: ${usuariosNuevos} nuevos, ${altasLicencia} altas de licencia, ${bajasLicencia} bajas de licencia, ${aliasActualizados} alias actualizados${usuariosDepurados > 0 ? `, ${usuariosDepurados} cuentas inexistentes en M365 depuradas` : ''} (${durationMs} ms).`;
      if (!Array.isArray(store.historial_sync_m365)) store.historial_sync_m365 = [];
      store.historial_sync_m365.unshift({
        id: store.historial_sync_m365.length + 1,
        fecha: nowIso,
        origen: trigger,
        estado: 'OK',
        duracion_ms: durationMs,
        total_usuarios_graph: totalUsuariosDominiosCmds,
        usuarios_nuevos: usuariosNuevos,
        usuarios_actualizados: usuariosActualizados,
        altas_licencia: altasLicencia,
        bajas_licencia: bajasLicencia,
        alias_actualizados: aliasActualizados,
        detalle: summaryText,
        ejecutado_por: operatorUsername
      });
      writeLocalStore(store);
      await saveSyncConfig({
        last_sync_at: nowIso,
        last_sync_status: 'OK',
        last_sync_summary: summaryText
      });
    }

    const durationMs = Date.now() - startTime;
    const summaryText = `Sincronizados ${totalUsuariosDominiosCmds} usuarios M365: ${usuariosNuevos} nuevos, ${altasLicencia} altas de licencia, ${bajasLicencia} bajas de licencia, ${aliasActualizados} alias actualizados.`;

    return {
      status: 'ok',
      duracion_ms: durationMs,
      total_usuarios_graph: totalUsuariosDominiosCmds,
      usuarios_nuevos: usuariosNuevos,
      usuarios_actualizados: usuariosActualizados,
      altas_licencia: altasLicencia,
      bajas_licencia: bajasLicencia,
      alias_actualizados: aliasActualizados,
      message: summaryText
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errMsg = err.message || 'Error en sincronización con Microsoft Graph.';
    const pool = getPool();
    if (isPgAvailable() && pool) {
      try {
        await pool.query(
          `INSERT INTO historial_sync_m365
           (origen, estado, duracion_ms, detalle, ejecutado_por)
           VALUES ($1, 'ERROR', $2, $3, $4)`,
          [trigger, durationMs, errMsg, operatorUsername]
        );
        await pool.query(
          `UPDATE config_m365_sync
           SET last_sync_status = 'ERROR', last_sync_summary = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = 1`,
          [errMsg]
        );
      } catch (e) {
        // ignore
      }
    }
    throw err;
  } finally {
    syncInProgress = false;
  }
}

// ============================================================================
// 7. SCHEDULER AUTOMÁTICO EN SEGUNDO PLANO (CADA N MINUTOS)
// ============================================================================
function startAutoSyncScheduler() {
  setInterval(async () => {
    if (syncInProgress) return;
    try {
      const config = await getSyncConfig();
      if (!config.auto_sync_enabled || !config.tenant_id || !config.client_id) return;

      const intervalMs = Math.max(5, Number(config.interval_minutes || 15)) * 60 * 1000;
      const lastSync = config.last_sync_at ? new Date(config.last_sync_at).getTime() : 0;

      if (Date.now() - lastSync >= intervalMs) {
        await runMicrosoft365Sync({
          trigger: 'AUTO_CRON',
          operatorUsername: 'Sincronizador Automático M365'
        });
      }
    } catch (e) {
      // Si aún no se ha cargado el certificado .cer en Entra ID, se reintentará en el siguiente ciclo silenciosamente
    }
  }, 60 * 1000).unref();
}

module.exports = {
  generateX509CertPair,
  getSyncConfig,
  saveSyncConfig,
  getSyncHistory,
  testGraphConnection,
  runMicrosoft365Sync,
  startAutoSyncScheduler
};
