const fs = require('fs');
const zlib = require('zlib');
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const XLSX = require('xlsx');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  initDatabase,
  getFullState,
  invalidateStateCache,
  getStateVersion,
  readLocalStore,
  writeLocalStore,
  getDbStatus,
  getPool,
  isPgAvailable
} = require('./db');
const {
  parseWorkbookToNormalizedUsers,
  bulkImportNormalizedUsers,
  isExportedNominaWorkbook,
  bulkUpdateFromExportedNomina
} = require('./excelParser');
const {
  getSyncConfig,
  saveSyncConfig,
  getSyncHistory,
  testGraphConnection,
  runMicrosoft365Sync,
  startAutoSyncScheduler
} = require('./graphSync');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3008);
const JWT_SECRET = process.env.JWT_SECRET || 'cmds_m365_licencias_jwt_secret_key_2026_prod_9f8e7d6c5b4a3';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Cabeceras de Seguridad HTTP Hardening (Exposición a Internet / OWASP)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  );
  if (req.path.startsWith('/api')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});

// ============================================================================
// LIMITADORES DE TASA POR IP (RATE LIMITING ANTI-FUERZA BRUTA Y ANTI-DOS)
// ============================================================================
const loginRateMap = new Map();
const apiRateMap = new Map();

function createIpRateLimiter(storeMap, windowMs, maxRequests, errorMessage) {
  return (req, res, next) => {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1')
      .split(',')[0]
      .trim();
    const now = Date.now();
    let entry = storeMap.get(ip);
    if (!entry || now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      storeMap.set(ip, entry);
    }
    entry.count += 1;
    res.setHeader('X-RateLimit-Limit', String(maxRequests));
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, maxRequests - entry.count)));

    if (entry.count > maxRequests) {
      const retrySecs = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retrySecs));
      return res.status(429).json({ error: errorMessage });
    }
    next();
  };
}

// Limpieza periódica de tablas de Rate Limit cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginRateMap.entries()) {
    if (now > v.resetAt) loginRateMap.delete(k);
  }
  for (const [k, v] of apiRateMap.entries()) {
    if (now > v.resetAt) apiRateMap.delete(k);
  }
}, 10 * 60 * 1000).unref();

const loginIpLimiter = createIpRateLimiter(
  loginRateMap,
  15 * 60 * 1000,
  15,
  'Demasiados intentos de autenticación desde esta dirección IP. Por seguridad, espere 15 minutos antes de reintentar.'
);

const apiIpLimiter = createIpRateLimiter(
  apiRateMap,
  60 * 1000,
  300,
  'Límite de solicitudes por minuto excedido desde su dirección IP. Intente nuevamente en unos segundos.'
);

app.use('/api', apiIpLimiter, (req, res, next) => {
  if (req.method !== 'GET') {
    invalidateStateCache();
    res.on('finish', () => invalidateStateCache());
  }
  next();
});

// ============================================================================
// UTILIDADES DE SEGURIDAD Y CONTRASEÑAS FUERTES
// ============================================================================
function validateStrongPassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Debe ingresar una contraseña.' };
  }
  if (password.length < 10) {
    return { valid: false, message: 'La contraseña debe tener al menos 10 caracteres.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'La contraseña debe incluir al menos una letra mayúscula (A-Z).' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'La contraseña debe incluir al menos una letra minúscula (a-z).' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'La contraseña debe incluir al menos un número (0-9).' };
  }
  if (!/[!@#$%^&*._\-+=?]/.test(password)) {
    return { valid: false, message: 'La contraseña debe incluir al menos un carácter especial (!@#$%^&*._-+=?).' };
  }
  return { valid: true };
}

function generateStrongPassword(length = 12) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*+=';
  const all = upper + lower + digits + symbols;

  const chars = [
    upper[crypto.randomInt(0, upper.length)],
    upper[crypto.randomInt(0, upper.length)],
    lower[crypto.randomInt(0, lower.length)],
    lower[crypto.randomInt(0, lower.length)],
    digits[crypto.randomInt(0, digits.length)],
    digits[crypto.randomInt(0, digits.length)],
    symbols[crypto.randomInt(0, symbols.length)],
    symbols[crypto.randomInt(0, symbols.length)]
  ];

  while (chars.length < length) {
    chars.push(all[crypto.randomInt(0, all.length)]);
  }

  // Mezclar con Fisher-Yates criptográfico
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

async function registrarAuditoria(username, accion, ip, exito, detalle) {
  const now = new Date().toISOString();
  const pool = getPool();
  if (isPgAvailable() && pool) {
    try {
      await pool.query(
        `INSERT INTO auditoria_accesos (username, accion, ip, exito, detalle, fecha)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [username, accion, ip || '127.0.0.1', exito, detalle, now]
      );
      return;
    } catch (e) {
      console.warn('[AUDITORIA] Error insertando en PG:', e.message);
    }
  }
  const store = readLocalStore();
  const nextId = store.auditoria_accesos.reduce((max, x) => Math.max(max, x.id || 0), 0) + 1;
  store.auditoria_accesos.unshift({
    id: nextId,
    username,
    accion,
    ip: ip || '127.0.0.1',
    exito,
    detalle,
    fecha: now
  });
  writeLocalStore(store);
}

// ============================================================================
// MIDDLEWARES DE AUTENTICACIÓN Y CONTROL DE PERMISOS (RBAC + SECTOR)
// ============================================================================
async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autenticado. Inicie sesión para continuar.' });
  }
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    const state = await getFullState();
    const dbUser = state.usuarios_sistema.find(u => u.id === decoded.id);
    if (!dbUser || !dbUser.activo) {
      return res.status(401).json({ error: 'Su cuenta ha sido desactivada o ya no existe.' });
    }
    req.user = {
      id: dbUser.id,
      username: dbUser.username,
      nombre_completo: dbUser.nombre_completo,
      email: dbUser.email,
      cargo: dbUser.cargo,
      rol_acceso: dbUser.rol_acceso, // ADMIN_SISTEMA | GESTOR | VISUALIZADOR
      ambito: dbUser.ambito, // GLOBAL | ADMINISTRACION | EDUCACION | SALUD
      debe_cambiar_clave: Boolean(dbUser.debe_cambiar_clave)
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sesión expirada o token inválido. Inicie sesión nuevamente.' });
  }
}

function requireWriteAccess(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado.' });
  }
  if (req.user.rol_acceso === 'VISUALIZADOR') {
    return res.status(403).json({
      error: 'Acceso denegado: Su perfil es de Solo Visualización y no está autorizado para asignar licencias ni modificar registros.'
    });
  }
  next();
}

function requireSystemAdmin(req, res, next) {
  if (!req.user || req.user.rol_acceso !== 'ADMIN_SISTEMA') {
    return res.status(403).json({
      error: 'Acceso restringido: Solo los Administradores del Sistema pueden realizar esta acción.'
    });
  }
  next();
}

function canManageSector(user, sectorDominio) {
  if (!user) return false;
  if (user.rol_acceso === 'ADMIN_SISTEMA') return true;
  if (user.rol_acceso === 'VISUALIZADOR') return false;
  if (user.ambito === 'GLOBAL') return true;
  return user.ambito === sectorDominio;
}

// ============================================================================
// ENDPOINTS DE AUTENTICACIÓN Y GESTIÓN DE SESIÓN (/api/auth/*)
// ============================================================================
app.post('/api/auth/login', loginIpLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const ip = String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1')
      .split(',')[0]
      .trim();
    if (!username || !password) {
      return res.status(400).json({ error: 'Ingrese usuario y contraseña.' });
    }

    const cleanUser = String(username).trim().toLowerCase();
    const state = await getFullState();
    const user = state.usuarios_sistema.find(
      u =>
        u.username.toLowerCase() === cleanUser ||
        (u.email && u.email.toLowerCase() === cleanUser) ||
        (cleanUser === 'rhormaza' && u.username.toLowerCase() === 'rhormazabal@cmds.cl')
    );

    if (!user) {
      await registrarAuditoria(cleanUser, 'LOGIN_FALLIDO', ip, false, 'Usuario inexistente');
      return res.status(401).json({ error: 'Credenciales inválidas. Verifique su usuario y contraseña.' });
    }

    if (!user.activo) {
      await registrarAuditoria(user.username, 'LOGIN_RECHAZADO_INACTIVO', ip, false, 'Cuenta deshabilitada por el administrador');
      return res.status(403).json({ error: 'Su cuenta se encuentra deshabilitada. Contacte al Administrador del Sistema.' });
    }

    // Verificar bloqueo anti-fuerza bruta
    if (user.bloqueado_hasta && new Date(user.bloqueado_hasta) > new Date()) {
      const minsLeft = Math.ceil((new Date(user.bloqueado_hasta).getTime() - Date.now()) / 60000);
      await registrarAuditoria(user.username, 'LOGIN_CUENTA_BLOQUEADA', ip, false, `Intento durante bloqueo activo (${minsLeft} min restantes)`);
      return res.status(429).json({
        error: `Cuenta bloqueada temporalmente por múltiples intentos fallidos. Intente nuevamente en ${minsLeft} minuto(s) o solicite desbloqueo al Administrador.`
      });
    }

    const rawPass = String(password);
    const trimmedPass = rawPass.trim();
    let passwordMatch =
      (await bcrypt.compare(rawPass, user.password_hash)) ||
      (await bcrypt.compare(trimmedPass, user.password_hash));

    const pool = getPool();

    if (!passwordMatch) {
      const nuevosIntentos = (Number(user.intentos_fallidos) || 0) + 1;
      const seBloquea = nuevosIntentos >= 5;
      const bloqueadoHasta = seBloquea ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;

      if (isPgAvailable() && pool) {
        await pool.query(
          `UPDATE usuarios_sistema SET intentos_fallidos = $1, bloqueado_hasta = $2 WHERE id = $3`,
          [nuevosIntentos, bloqueadoHasta, user.id]
        );
      } else {
        const store = readLocalStore();
        const target = store.usuarios_sistema.find(u => u.id === user.id);
        if (target) {
          target.intentos_fallidos = nuevosIntentos;
          target.bloqueado_hasta = bloqueadoHasta;
          writeLocalStore(store);
        }
      }

      const restantes = Math.max(0, 5 - nuevosIntentos);
      await registrarAuditoria(
        user.username,
        seBloquea ? 'CUENTA_BLOQUEADA_FUERZA_BRUTA' : 'LOGIN_FALLIDO',
        ip,
        false,
        seBloquea ? 'Bloqueada por 15 minutos tras 5 intentos fallidos' : `Contraseña incorrecta (Intento ${nuevosIntentos}/5)`
      );

      return res.status(401).json({
        error: seBloquea
          ? 'Ha superado los 5 intentos permitidos. Su cuenta ha sido bloqueada preventivamente por 15 minutos.'
          : `Contraseña incorrecta. Le quedan ${restantes} intento(s) antes del bloqueo temporal.`
      });
    }

    // Login exitoso: limpiar intentos fallidos y registrar fecha de último acceso
    const nowIso = new Date().toISOString();
    if (isPgAvailable() && pool) {
      await pool.query(
        `UPDATE usuarios_sistema SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = $1 WHERE id = $2`,
        [nowIso, user.id]
      );
    } else {
      const store = readLocalStore();
      const target = store.usuarios_sistema.find(u => u.id === user.id);
      if (target) {
        target.intentos_fallidos = 0;
        target.bloqueado_hasta = null;
        target.ultimo_acceso = nowIso;
        writeLocalStore(store);
      }
    }

    await registrarAuditoria(user.username, 'LOGIN_EXITOSO', ip, true, `Ingreso con perfil ${user.ambito} (${user.rol_acceso})`);

    const userPayload = {
      id: user.id,
      username: user.username,
      nombre_completo: user.nombre_completo,
      email: user.email,
      cargo: user.cargo,
      rol_acceso: user.rol_acceso,
      ambito: user.ambito,
      debe_cambiar_clave: Boolean(user.debe_cambiar_clave)
    };

    const token = jwt.sign(userPayload, JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN });
    return res.json({
      status: 'ok',
      token,
      user: userPayload,
      dbStatus: getDbStatus()
    });
  } catch (err) {
    console.error('[AUTH LOGIN ERROR]:', err);
    return res.status(500).json({ error: 'Error interno al procesar inicio de sesión.' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    dbStatus: getDbStatus()
  });
});

app.post('/api/auth/cambiar-clave', requireAuth, async (req, res) => {
  try {
    const { passwordActual, nuevaPassword } = req.body;
    const ip = String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1')
      .split(',')[0]
      .trim();

    if (!passwordActual || !nuevaPassword) {
      return res.status(400).json({ error: 'Debe ingresar su contraseña actual y la nueva contraseña.' });
    }

    const validation = validateStrongPassword(nuevaPassword);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    if (passwordActual === nuevaPassword) {
      return res.status(400).json({ error: 'La nueva contraseña debe ser diferente a la contraseña actual.' });
    }

    const state = await getFullState();
    const dbUser = state.usuarios_sistema.find(u => u.id === req.user.id);
    if (!dbUser) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const trimmedCurrent = String(passwordActual).trim();
    const validCurrent =
      (await bcrypt.compare(String(passwordActual), dbUser.password_hash)) ||
      (await bcrypt.compare(trimmedCurrent, dbUser.password_hash));
    if (!validCurrent) {
      return res.status(400).json({ error: 'La contraseña actual ingresada no es correcta.' });
    }

    const newHash = await bcrypt.hash(String(nuevaPassword), 12);
    const pool = getPool();

    if (isPgAvailable() && pool) {
      await pool.query(
        `UPDATE usuarios_sistema SET password_hash = $1, debe_cambiar_clave = FALSE WHERE id = $2`,
        [newHash, dbUser.id]
      );
    } else {
      const store = readLocalStore();
      const target = store.usuarios_sistema.find(u => u.id === dbUser.id);
      if (target) {
        target.password_hash = newHash;
        target.debe_cambiar_clave = false;
        writeLocalStore(store);
      }
    }

    await registrarAuditoria(dbUser.username, 'CAMBIO_CLAVE_PROPIA', ip, true, 'Usuario actualizó su contraseña personal');

    const updatedPayload = {
      ...req.user,
      debe_cambiar_clave: false
    };
    const newToken = jwt.sign(updatedPayload, JWT_SECRET, { algorithm: 'HS256', expiresIn: JWT_EXPIRES_IN });

    res.json({
      status: 'ok',
      message: 'Contraseña actualizada exitosamente.',
      token: newToken,
      user: updatedPayload
    });
  } catch (err) {
    console.error('[CAMBIAR CLAVE ERROR]:', err);
    res.status(500).json({ error: 'Error al actualizar la contraseña.' });
  }
});

// ============================================================================
// ENDPOINT DE DASHBOARD Y ANALÍTICA GLOBAL (/api/dashboard)
// ============================================================================
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const state = await getFullState();
    const {
      dominios,
      tipos_licencia,
      cupos_licencia,
      establecimientos,
      usuarios_m365,
      asignaciones_licencia,
      movimientos_licencia
    } = state;

    const userByIdForDash = new Map(usuarios_m365.map(u => [u.id, u]));

    // Enriquecer pools de licencias
    const poolsEnriquecidos = cupos_licencia.map(c => {
      const dom = dominios.find(d => d.id === c.dominio_id) || {};
      const tipo = tipos_licencia.find(t => t.id === c.tipo_licencia_id) || {};
      const asigsPool = asignaciones_licencia.filter(
        a => a.cupo_licencia_id === c.id && a.estado === 'ACTIVA'
      );
      const asignadas = asigsPool.length;
      const disponibles = Math.max(0, c.total_licencias - asignadas);
      const pctUso = c.total_licencias > 0 ? Number(((asignadas / c.total_licencias) * 100).toFixed(2)) : 0;

      let asignadasMaquinas = 0;
      let asignadasEstudiantes = 0;
      let asignadasFuncionarios = 0;
      for (const a of asigsPool) {
        const u = userByIdForDash.get(a.usuario_id);
        if (!u) continue;
        if (u.tipo_cuenta === 'MAQUINA' || u.tipo_usuario === 'MAQUINA') {
          asignadasMaquinas++;
        } else if (u.tipo_usuario === 'ESTUDIANTE') {
          asignadasEstudiantes++;
        } else {
          asignadasFuncionarios++;
        }
      }

      return {
        ...c,
        dominio: dom.dominio,
        dominio_nombre: dom.nombre,
        sector: dom.sector,
        codigo_sku: tipo.codigo_sku,
        sku_microsoft: tipo.sku_microsoft,
        licencia_nombre: tipo.nombre,
        categoria: tipo.categoria,
        incluye_apps: tipo.incluye_apps,
        incluye_teams: tipo.incluye_teams,
        color_hex: tipo.color_hex,
        licencias_asignadas: asignadas,
        licencias_disponibles: disponibles,
        porcentaje_uso: pctUso,
        asignadas_maquinas: asignadasMaquinas,
        asignadas_estudiantes: asignadasEstudiantes,
        asignadas_funcionarios: asignadasFuncionarios,
        asignadas_personas: asignadasEstudiantes + asignadasFuncionarios
      };
    });

    // Totales Globales (Tenant Completo vs Solo Funcionarios)
    const poolsFuncionarios = poolsEnriquecidos.filter(p => p.categoria === 'FUNCIONARIO');
    const poolsEstudiantes = poolsEnriquecidos.filter(p => p.categoria === 'ESTUDIANTE');

    const totalTenant = poolsEnriquecidos.reduce((s, p) => s + p.total_licencias, 0);
    const asignadasTenant = poolsEnriquecidos.reduce((s, p) => s + p.licencias_asignadas, 0);
    const disponiblesTenant = Math.max(0, totalTenant - asignadasTenant);

    const totalFuncionarios = poolsFuncionarios.reduce((s, p) => s + p.total_licencias, 0);
    const asignadasFuncionarios = poolsFuncionarios.reduce((s, p) => s + p.licencias_asignadas, 0);
    const disponiblesFuncionarios = Math.max(0, totalFuncionarios - asignadasFuncionarios);

    const totalEstudiantes = poolsEstudiantes.reduce((s, p) => s + p.total_licencias, 0);
    const asignadasEstudiantes = poolsEstudiantes.reduce((s, p) => s + p.licencias_asignadas, 0);
    const disponiblesEstudiantes = Math.max(0, totalEstudiantes - asignadasEstudiantes);

    // Resumen por Dominio
    const resumenPorDominio = dominios.map(d => {
      const poolsDom = poolsEnriquecidos.filter(p => p.dominio_id === d.id);
      const poolsFuncDom = poolsDom.filter(p => p.categoria === 'FUNCIONARIO');
      const usuariosDom = usuarios_m365.filter(u => u.dominio_id === d.id);
      const usuariosActivosDom = usuariosDom.filter(u => u.estado_cuenta === 'ACTIVO');

      const totalDom = poolsDom.reduce((s, p) => s + p.total_licencias, 0);
      const asigDom = poolsDom.reduce((s, p) => s + p.licencias_asignadas, 0);
      const dispDom = Math.max(0, totalDom - asigDom);

      const totalFuncDom = poolsFuncDom.reduce((s, p) => s + p.total_licencias, 0);
      const asigFuncDom = poolsFuncDom.reduce((s, p) => s + p.licencias_asignadas, 0);
      const dispFuncDom = Math.max(0, totalFuncDom - asigFuncDom);

      return {
        ...d,
        total_licencias: totalDom,
        licencias_asignadas: asigDom,
        licencias_disponibles: dispDom,
        porcentaje_uso: totalDom > 0 ? Number(((asigDom / totalDom) * 100).toFixed(2)) : 0,
        total_funcionarios: totalFuncDom,
        asignadas_funcionarios: asigFuncDom,
        disponibles_funcionarios: dispFuncDom,
        porcentaje_uso_funcionarios: totalFuncDom > 0 ? Number(((asigFuncDom / totalFuncDom) * 100).toFixed(2)) : 0,
        usuarios_registrados: usuariosDom.length,
        usuarios_activos: usuariosActivosDom.length,
        pools: poolsDom
      };
    });

    // Resumen por Tipo de Licencia
    const resumenPorTipoLicencia = tipos_licencia.map(t => {
      const poolsTipo = poolsEnriquecidos.filter(p => p.tipo_licencia_id === t.id);
      const total = poolsTipo.reduce((s, p) => s + p.total_licencias, 0);
      const asignadas = poolsTipo.reduce((s, p) => s + p.licencias_asignadas, 0);
      const disponibles = Math.max(0, total - asignadas);
      return {
        ...t,
        total_licencias: total,
        licencias_asignadas: asignadas,
        licencias_disponibles: disponibles,
        porcentaje_uso: total > 0 ? Number(((asignadas / total) * 100).toFixed(2)) : 0,
        dominios_asociados: poolsTipo.map(p => ({
          dominio: p.dominio,
          total: p.total_licencias,
          asignadas: p.licencias_asignadas,
          disponibles: p.licencias_disponibles
        }))
      };
    });

    // Ranking de Establecimientos con más licencias activas y usuarios registrados (O(N) indexado)
    const userByIdMap = new Map(usuarios_m365.map(u => [u.id, u]));
    const estByIdMap = new Map(establecimientos.map(e => [e.id, e]));
    const conteoPorEstablecimiento = {};

    for (const u of usuarios_m365) {
      if (u.estado_cuenta !== 'ACTIVO') continue;
      const est = estByIdMap.get(u.establecimiento_id);
      const key = est ? est.id : 0;
      if (!conteoPorEstablecimiento[key]) {
        conteoPorEstablecimiento[key] = {
          id: key,
          codigo_unidad: est ? est.codigo_unidad : 0,
          nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO ASIGNADO',
          sector: est ? est.sector : 'OTRO',
          dominio_sugerido: est ? est.dominio_sugerido : '',
          licencias_activas: 0,
          usuarios_activos: new Set()
        };
      }
      conteoPorEstablecimiento[key].usuarios_activos.add(u.id);
    }

    for (const a of asignaciones_licencia) {
      if (a.estado !== 'ACTIVA') continue;
      const u = userByIdMap.get(a.usuario_id);
      if (!u) continue;
      const est = estByIdMap.get(u.establecimiento_id);
      const key = est ? est.id : 0;
      if (!conteoPorEstablecimiento[key]) {
        conteoPorEstablecimiento[key] = {
          id: key,
          codigo_unidad: est ? est.codigo_unidad : 0,
          nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO ASIGNADO',
          sector: est ? est.sector : 'OTRO',
          dominio_sugerido: est ? est.dominio_sugerido : '',
          licencias_activas: 0,
          usuarios_activos: new Set()
        };
      }
      conteoPorEstablecimiento[key].licencias_activas += 1;
      conteoPorEstablecimiento[key].usuarios_activos.add(u.id);
    }

    const rankingEstablecimientos = Object.values(conteoPorEstablecimiento)
      .map(item => ({
        ...item,
        usuarios_activos: item.usuarios_activos.size
      }))
      .sort((a, b) => b.licencias_activas - a.licencias_activas || b.usuarios_activos - a.usuarios_activos);

    // Estadísticas de Altas y Bajas por mes
    const mesesMap = {};
    let totalAltasHistoricas = 0;
    let totalBajasHistoricas = 0;

    for (const m of movimientos_licencia) {
      const fecha = m.fecha_movimiento ? new Date(m.fecha_movimiento) : new Date();
      const periodo = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      if (!mesesMap[periodo]) {
        mesesMap[periodo] = { periodo, altas: 0, bajas: 0, cambios: 0 };
      }
      if (m.tipo_movimiento === 'ALTA' || m.tipo_movimiento === 'CARGA_MASIVA') {
        mesesMap[periodo].altas += 1;
        totalAltasHistoricas += 1;
      } else if (m.tipo_movimiento === 'BAJA') {
        mesesMap[periodo].bajas += 1;
        totalBajasHistoricas += 1;
      } else if (m.tipo_movimiento === 'CAMBIO_LICENCIA') {
        mesesMap[periodo].cambios += 1;
      }
    }

    const evolucionMensual = Object.values(mesesMap).sort((a, b) => a.periodo.localeCompare(b.periodo));

    res.json({
      kpis: {
        tenant: {
          total: totalTenant,
          asignadas: asignadasTenant,
          disponibles: disponiblesTenant,
          porcentaje_uso: totalTenant > 0 ? Number(((asignadasTenant / totalTenant) * 100).toFixed(2)) : 0
        },
        funcionarios: {
          total: totalFuncionarios,
          asignadas: asignadasFuncionarios,
          disponibles: disponiblesFuncionarios,
          porcentaje_uso: totalFuncionarios > 0 ? Number(((asignadasFuncionarios / totalFuncionarios) * 100).toFixed(2)) : 0
        },
        estudiantes: {
          total: totalEstudiantes,
          asignadas: asignadasEstudiantes,
          disponibles: disponiblesEstudiantes,
          porcentaje_uso: totalEstudiantes > 0 ? Number(((asignadasEstudiantes / totalEstudiantes) * 100).toFixed(4)) : 0
        },
        usuarios: (() => {
          const activeUserIdsWithLic = new Set(
            asignaciones_licencia.filter(a => a.estado === 'ACTIVA').map(a => a.usuario_id)
          );
          const bloqueadasList = usuarios_m365.filter(u => Boolean(u.cuenta_bloqueada));
          return {
            total: usuarios_m365.length,
            activos: usuarios_m365.filter(u => u.estado_cuenta === 'ACTIVO').length,
            bajas: usuarios_m365.filter(u => u.estado_cuenta === 'BAJA').length,
            bloqueadas: bloqueadasList.length,
            bloqueadas_con_licencia: bloqueadasList.filter(u => activeUserIdsWithLic.has(u.id)).length
          };
        })(),
        movimientos: {
          altas: totalAltasHistoricas,
          bajas: totalBajasHistoricas,
          neto: totalAltasHistoricas - totalBajasHistoricas
        }
      },
      resumenPorDominio,
      resumenPorTipoLicencia,
      pools: poolsEnriquecidos,
      rankingEstablecimientos,
      evolucionMensual,
      ultimosMovimientos: movimientos_licencia.slice(0, 12),
      dbStatus: getDbStatus()
    });
  } catch (err) {
    console.error('[DASHBOARD ERROR]:', err);
    res.status(500).json({ error: 'Error cargando indicadores del dashboard.' });
  }
});

// ============================================================================
// ENDPOINTS DE CUPOS Y TIPOS DE LICENCIA (/api/licencias/*)
// ============================================================================
app.get('/api/licencias/cupos', requireAuth, async (req, res) => {
  try {
    const state = await getFullState();
    const { dominios, tipos_licencia, cupos_licencia, asignaciones_licencia, usuarios_m365, establecimientos } = state;

    const userByIdMap = new Map(usuarios_m365.map(u => [u.id, u]));
    const estByIdMap = new Map(establecimientos.map(e => [e.id, e]));
    const asigsByCupoMap = new Map();
    for (const a of asignaciones_licencia) {
      if (a.estado !== 'ACTIVA') continue;
      if (!asigsByCupoMap.has(a.cupo_licencia_id)) {
        asigsByCupoMap.set(a.cupo_licencia_id, []);
      }
      asigsByCupoMap.get(a.cupo_licencia_id).push(a);
    }

    const result = cupos_licencia.map(c => {
      const dom = dominios.find(d => d.id === c.dominio_id) || {};
      const tipo = tipos_licencia.find(t => t.id === c.tipo_licencia_id) || {};
      const asigsActivas = asigsByCupoMap.get(c.id) || [];
      const asignadas = asigsActivas.length;
      const disponibles = Math.max(0, c.total_licencias - asignadas);

      let asignadasMaquinas = 0;
      let asignadasEstudiantes = 0;
      let asignadasFuncionarios = 0;
      for (const a of asigsActivas) {
        const u = userByIdMap.get(a.usuario_id);
        if (!u) continue;
        if (u.tipo_cuenta === 'MAQUINA' || u.tipo_usuario === 'MAQUINA') {
          asignadasMaquinas++;
        } else if (u.tipo_usuario === 'ESTUDIANTE') {
          asignadasEstudiantes++;
        } else {
          asignadasFuncionarios++;
        }
      }

      const usuariosAsignados = asigsActivas.slice(0, 300).map(a => {
        const u = userByIdMap.get(a.usuario_id) || {};
        const est = estByIdMap.get(u.establecimiento_id);
        return {
          asignacion_id: a.id,
          usuario_id: u.id,
          nombre_completo: u.nombre_completo,
          email: u.email,
          rut: u.rut,
          cargo: u.cargo,
          establecimiento: est ? est.nombre : 'Sin establecimiento',
          fecha_alta: a.fecha_alta,
          numero_ticket: a.numero_ticket
        };
      });

      return {
        ...c,
        dominio: dom.dominio,
        dominio_nombre: dom.nombre,
        sector: dom.sector,
        codigo_sku: tipo.codigo_sku,
        sku_microsoft: tipo.sku_microsoft,
        licencia_nombre: tipo.nombre,
        categoria: tipo.categoria,
        incluye_apps: tipo.incluye_apps,
        incluye_teams: tipo.incluye_teams,
        color_hex: tipo.color_hex,
        licencias_asignadas: asignadas,
        licencias_disponibles: disponibles,
        asignadas_maquinas: asignadasMaquinas,
        asignadas_estudiantes: asignadasEstudiantes,
        asignadas_funcionarios: asignadasFuncionarios,
        asignadas_personas: asignadasEstudiantes + asignadasFuncionarios,
        porcentaje_uso: c.total_licencias > 0 ? Number(((asignadas / c.total_licencias) * 100).toFixed(2)) : 0,
        usuarios_asignados: usuariosAsignados
      };
    });

    res.json({
      cupos: result,
      dominios,
      tipos_licencia
    });
  } catch (err) {
    console.error('[CUPOS ERROR]:', err);
    res.status(500).json({ error: 'Error obteniendo cupos de licencias.' });
  }
});

app.put('/api/licencias/cupos/:id', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const cupoId = Number(req.params.id);
    const { total_licencias, umbral_alerta_pct, observacion, motivo } = req.body;
    const nuevoTotal = Number(total_licencias);

    if (isNaN(nuevoTotal) || nuevoTotal < 0) {
      return res.status(400).json({ error: 'El total de licencias debe ser un número mayor o igual a 0.' });
    }

    const state = await getFullState();
    const cupo = state.cupos_licencia.find(c => c.id === cupoId);
    if (!cupo) {
      return res.status(404).json({ error: 'Pool de licencias no encontrado.' });
    }

    const asignadasActuales = state.asignaciones_licencia.filter(
      a => a.cupo_licencia_id === cupoId && a.estado === 'ACTIVA'
    ).length;

    if (nuevoTotal < asignadasActuales) {
      return res.status(400).json({
        error: `No puede reducir el cupo total (${nuevoTotal}) por debajo de las licencias actualmente asignadas (${asignadasActuales}).`
      });
    }

    const dom = state.dominios.find(d => d.id === cupo.dominio_id) || {};
    const tipo = state.tipos_licencia.find(t => t.id === cupo.tipo_licencia_id) || {};
    const totalAnterior = cupo.total_licencias;
    const nowIso = new Date().toISOString();
    const pool = getPool();

    if (isPgAvailable() && pool) {
      await pool.query(
        `UPDATE cupos_licencia
         SET total_licencias = $1, umbral_alerta_pct = $2, observacion = $3
         WHERE id = $4`,
        [nuevoTotal, Number(umbral_alerta_pct || cupo.umbral_alerta_pct), observacion ?? cupo.observacion, cupoId]
      );

      await pool.query(
        `INSERT INTO movimientos_licencia
         (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
         VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          'AJUSTE_CUPO',
          dom.dominio,
          `Pool ${tipo.nombre}`,
          cupoId,
          dom.dominio,
          tipo.nombre,
          'TENANT CMDS',
          motivo || `Ajuste de cupo contratado de ${totalAnterior} a ${nuevoTotal} licencias`,
          'AJUSTE-ADMIN',
          req.user.username,
          nowIso
        ]
      );
    } else {
      const store = readLocalStore();
      const target = store.cupos_licencia.find(c => c.id === cupoId);
      if (target) {
        target.total_licencias = nuevoTotal;
        target.umbral_alerta_pct = Number(umbral_alerta_pct || target.umbral_alerta_pct);
        target.observacion = observacion ?? target.observacion;
      }
      const nextMovId = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      store.movimientos_licencia.unshift({
        id: nextMovId,
        tipo_movimiento: 'AJUSTE_CUPO',
        usuario_id: null,
        usuario_email: dom.dominio,
        usuario_nombre: `Pool ${tipo.nombre}`,
        cupo_licencia_id: cupoId,
        dominio_nombre: dom.dominio,
        licencia_nombre: tipo.nombre,
        establecimiento_nombre: 'TENANT CMDS',
        motivo: motivo || `Ajuste de cupo contratado de ${totalAnterior} a ${nuevoTotal} licencias`,
        ticket_referencia: 'AJUSTE-ADMIN',
        ejecutado_por: req.user.username,
        fecha_movimiento: nowIso
      });
      writeLocalStore(store);
    }

    res.json({ status: 'ok', message: 'Cupo de licencias actualizado correctamente.' });
  } catch (err) {
    console.error('[UPDATE CUPO ERROR]:', err);
    res.status(500).json({ error: 'Error actualizando el cupo de licencias.' });
  }
});

// ============================================================================
// ENDPOINTS DE USUARIOS MICROSOFT 365 Y ASIGNACIÓN DE LICENCIAS (/api/usuarios/*)
// ============================================================================
let usuariosMemCache = {
  version: -1,
  enrichedUsers: [],
  allJsonStr: '',
  allGzipBuf: null
};

app.get('/api/usuarios', requireAuth, async (req, res) => {
  try {
    const state = await getFullState();
    const curVer = getStateVersion();
    const {
      search,
      dominio_id,
      tipo_licencia_id,
      establecimiento_id,
      sector,
      estado_cuenta,
      tipo_usuario,
      tipo_cuenta,
      page,
      limit
    } = req.query;
    const isPaginated = page !== undefined || limit !== undefined;
    const pageNum = Math.max(1, Number(page || 1));
    const limitNum = Math.max(10, Math.min(500, Number(limit || 100)));
    const hasFilters = Boolean(
      search || dominio_id || tipo_licencia_id || establecimiento_id || sector || estado_cuenta || tipo_usuario || tipo_cuenta
    );
    const acceptEnc = String(req.headers['accept-encoding'] || '');

    if (usuariosMemCache.version !== curVer) {
      const {
        dominios,
        tipos_licencia,
        cupos_licencia,
        establecimientos,
        usuarios_m365,
        asignaciones_licencia
      } = state;

      const domById = new Map(dominios.map(d => [d.id, d]));
      const estById = new Map(establecimientos.map(e => [e.id, e]));
      const cupoById = new Map(cupos_licencia.map(c => [c.id, c]));
      const tipoById = new Map(tipos_licencia.map(t => [t.id, t]));

      const asigsByUserId = new Map();
      for (const a of asignaciones_licencia) {
        if (!asigsByUserId.has(a.usuario_id)) {
          asigsByUserId.set(a.usuario_id, []);
        }
        const cupo = cupoById.get(a.cupo_licencia_id) || {};
        const tipo = tipoById.get(cupo.tipo_licencia_id) || {};
        asigsByUserId.get(a.usuario_id).push({
          id: a.id,
          cupo_licencia_id: a.cupo_licencia_id,
          tipo_licencia_id: cupo.tipo_licencia_id,
          estado: a.estado,
          licencia_nombre: tipo.nombre,
          incluye_teams: tipo.incluye_teams,
          color_hex: tipo.color_hex,
          fecha_alta: a.fecha_alta,
          fecha_baja: a.fecha_baja,
          motivo_baja: a.motivo_baja,
          numero_ticket: a.numero_ticket,
          asignado_por: a.asignado_por
        });
      }

      const enrichedUsers = usuarios_m365.map(u => {
        const dom = domById.get(u.dominio_id) || {};
        const est = estById.get(u.establecimiento_id) || null;
        const misAsignaciones = asigsByUserId.get(u.id) || [];
        const licenciasActivas = misAsignaciones.filter(a => a.estado === 'ACTIVA');

        const tipoCuentaNorm = u.tipo_cuenta || (u.tipo_usuario === 'MAQUINA' ? 'MAQUINA' : 'PERSONA');
        const item = {
          id: u.id,
          rut: u.rut || '',
          nombres: u.nombres,
          apellidos: u.apellidos,
          nombre_completo: u.nombre_completo,
          email: u.email,
          email_alias: u.email_alias || '',
          m365_object_id: u.m365_object_id || '',
          dominio_id: u.dominio_id,
          establecimiento_id: u.establecimiento_id,
          cargo: u.cargo || '',
          departamento: u.departamento || '',
          tipo_cuenta: tipoCuentaNorm,
          tipo_usuario: u.tipo_usuario,
          estado_cuenta: u.estado_cuenta,
          cuenta_bloqueada: Boolean(u.cuenta_bloqueada),
          dominio: dom.dominio,
          dominio_sector: dom.sector,
          establecimiento_nombre: est ? est.nombre : 'Sin Establecimiento',
          licencias_activas: licenciasActivas
        };
        if (misAsignaciones.length > licenciasActivas.length) {
          item.historial_asignaciones = misAsignaciones;
        }
        return item;
      });

      const allJsonStr = JSON.stringify({
        usuarios: enrichedUsers,
        total: enrichedUsers.length
      });
      const allGzipBuf = zlib.gzipSync(Buffer.from(allJsonStr, 'utf8'));

      usuariosMemCache = {
        version: curVer,
        enrichedUsers,
        allJsonStr,
        allGzipBuf
      };
    }

    if (!isPaginated && !hasFilters) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (acceptEnc.includes('gzip') && usuariosMemCache.allGzipBuf) {
        res.setHeader('Content-Encoding', 'gzip');
        return res.send(usuariosMemCache.allGzipBuf);
      }
      return res.send(usuariosMemCache.allJsonStr);
    }

    const q = search && String(search).trim() !== '' ? String(search).trim().toLowerCase() : '';
    const domNum = dominio_id ? Number(dominio_id) : null;
    const estNum = establecimiento_id ? Number(establecimiento_id) : null;
    const targetLicNum = tipo_licencia_id && tipo_licencia_id !== 'SIN_LICENCIA' ? Number(tipo_licencia_id) : null;

    const filtered = [];
    const sinLicenciaIds = [];

    for (let i = 0; i < usuariosMemCache.enrichedUsers.length; i++) {
      const u = usuariosMemCache.enrichedUsers[i];
      if (domNum !== null && u.dominio_id !== domNum) continue;
      if (estNum !== null && u.establecimiento_id !== estNum) continue;
      if (sector && u.dominio_sector !== sector) continue;
      if (estado_cuenta) {
        if (estado_cuenta === 'BLOQUEADA') {
          if (!u.cuenta_bloqueada) continue;
        } else if (estado_cuenta === 'BLOQUEADA_CON_LICENCIA') {
          if (!u.cuenta_bloqueada || !(u.licencias_activas && u.licencias_activas.length > 0)) continue;
        } else if (u.estado_cuenta !== estado_cuenta) {
          continue;
        }
      }
      if (tipo_cuenta && u.tipo_cuenta !== tipo_cuenta) continue;
      if (tipo_usuario) {
        const esMaq = u.tipo_cuenta === 'MAQUINA' || u.tipo_usuario === 'MAQUINA';
        if (tipo_usuario === 'PERSONA_TODAS') {
          if (esMaq) continue;
        } else if (tipo_usuario === 'MAQUINA') {
          if (!esMaq) continue;
        } else if (u.tipo_usuario !== tipo_usuario) {
          continue;
        }
      }
      const hasAnyLic = u.licencias_activas && u.licencias_activas.length > 0;
      if (tipo_licencia_id) {
        if (tipo_licencia_id === 'SIN_LICENCIA') {
          if (hasAnyLic) continue;
        } else if (targetLicNum !== null) {
          const hasLic = hasAnyLic && u.licencias_activas.some(la => la.tipo_licencia_id === targetLicNum);
          if (!hasLic) continue;
        }
      }
      if (q) {
        const match =
          (u.nombre_completo && u.nombre_completo.toLowerCase().includes(q)) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.email_alias && u.email_alias.toLowerCase().includes(q)) ||
          (u.rut && u.rut.toLowerCase().includes(q)) ||
          (u.cargo && u.cargo.toLowerCase().includes(q)) ||
          (u.departamento && u.departamento.toLowerCase().includes(q)) ||
          (u.establecimiento_nombre && u.establecimiento_nombre.toLowerCase().includes(q));
        if (!match) continue;
      }
      if (!hasAnyLic && sinLicenciaIds.length < 3000) {
        sinLicenciaIds.push(u.id);
      }
      filtered.push(u);
    }

    const rowsToReturn = isPaginated
      ? filtered.slice((pageNum - 1) * limitNum, pageNum * limitNum)
      : filtered;

    const payloadStr = JSON.stringify({
      usuarios: rowsToReturn,
      total: filtered.length,
      page: pageNum,
      total_pages: Math.max(1, Math.ceil(filtered.length / limitNum)),
      sin_licencia_count: sinLicenciaIds.length,
      sin_licencia_ids: sinLicenciaIds
    });

    if (acceptEnc.includes('gzip')) {
      zlib.gzip(Buffer.from(payloadStr, 'utf8'), (err, compressed) => {
        if (err) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          return res.send(payloadStr);
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Encoding', 'gzip');
        res.send(compressed);
      });
    } else {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.send(payloadStr);
    }
  } catch (err) {
    console.error('[GET USUARIOS ERROR]:', err);
    res.status(500).json({ error: 'Error obteniendo listado de usuarios Microsoft 365.' });
  }
});

// Crear Usuario M365 + Asignar Licencia (Alta)
app.post('/api/usuarios', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const {
      rut,
      nombres,
      apellidos,
      email,
      email_alias,
      dominio_id,
      establecimiento_id,
      cargo,
      departamento,
      tipo_cuenta,
      tipo_usuario,
      cupo_licencia_id,
      numero_ticket,
      observaciones
    } = req.body;

    if (!nombres || !apellidos || !email || !dominio_id) {
      return res.status(400).json({ error: 'Nombres, apellidos, correo electrónico y dominio son obligatorios.' });
    }

    const state = await getFullState();
    const dom = state.dominios.find(d => d.id === Number(dominio_id));
    if (!dom) {
      return res.status(400).json({ error: 'El dominio seleccionado no es válido.' });
    }

    // Validar permiso sectorial del operador
    if (!canManageSector(req.user, dom.sector)) {
      return res.status(403).json({
        error: `Su perfil (${req.user.ambito}) solo permite gestionar cuentas del sector ${req.user.ambito}, no del dominio @${dom.dominio}.`
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!cleanEmail.endsWith(`@${dom.dominio.toLowerCase()}`)) {
      return res.status(400).json({
        error: `La dirección de correo (${cleanEmail}) debe pertenecer al dominio seleccionado (@${dom.dominio}).`
      });
    }

    const emailExiste = state.usuarios_m365.find(u => u.email.toLowerCase() === cleanEmail);
    if (emailExiste) {
      return res.status(409).json({
        error: `Ya existe un usuario registrado con el correo ${cleanEmail}.`
      });
    }

    // Si seleccionó licencia a asignar inmediatamente, validar cupo y disponibilidad
    let cupoSeleccionado = null;
    let tipoLicenciaObj = null;
    if (cupo_licencia_id) {
      cupoSeleccionado = state.cupos_licencia.find(c => c.id === Number(cupo_licencia_id));
      if (!cupoSeleccionado) {
        return res.status(400).json({ error: 'El pool de licencia seleccionado no existe.' });
      }
      if (cupoSeleccionado.dominio_id !== dom.id) {
        return res.status(400).json({ error: 'La licencia seleccionada no corresponde al dominio del usuario.' });
      }
      const asignadas = state.asignaciones_licencia.filter(
        a => a.cupo_licencia_id === cupoSeleccionado.id && a.estado === 'ACTIVA'
      ).length;
      if (asignadas >= cupoSeleccionado.total_licencias) {
        return res.status(400).json({
          error: `No quedan licencias disponibles en este pool (${asignadas}/${cupoSeleccionado.total_licencias} utilizadas).`
        });
      }
      tipoLicenciaObj = state.tipos_licencia.find(t => t.id === cupoSeleccionado.tipo_licencia_id);
    }

    const nombreCompleto = `${String(nombres).trim()} ${String(apellidos).trim()}`.trim();
    const estObj = state.establecimientos.find(e => e.id === Number(establecimiento_id)) || null;
    const nowIso = new Date().toISOString();
    const tipoCuentaFinal = tipo_cuenta === 'MAQUINA' || tipo_usuario === 'MAQUINA' ? 'MAQUINA' : 'PERSONA';
    const categoriaInferida =
      tipoCuentaFinal === 'MAQUINA'
        ? 'MAQUINA'
        : tipo_usuario || (tipoLicenciaObj && tipoLicenciaObj.categoria === 'ESTUDIANTE' ? 'ESTUDIANTE' : 'FUNCIONARIO');

    const cleanAlias = email_alias ? String(email_alias).trim().toLowerCase() : '';
    const pool = getPool();
    let nuevoUsuarioId = null;

    if (isPgAvailable() && pool) {
      const insertUser = await pool.query(
        `INSERT INTO usuarios_m365
         (rut, nombres, apellidos, nombre_completo, email, email_alias, dominio_id, establecimiento_id, cargo, departamento, tipo_cuenta, tipo_usuario, estado_cuenta, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ACTIVO', $13, $13)
         RETURNING id`,
        [
          rut || '',
          String(nombres).trim(),
          String(apellidos).trim(),
          nombreCompleto,
          cleanEmail,
          cleanAlias,
          dom.id,
          estObj ? estObj.id : null,
          cargo || '',
          departamento || '',
          tipoCuentaFinal,
          categoriaInferida,
          nowIso
        ]
      );
      nuevoUsuarioId = insertUser.rows[0].id;

      if (cupoSeleccionado && tipoLicenciaObj) {
        await pool.query(
          `INSERT INTO asignaciones_licencia
           (usuario_id, cupo_licencia_id, estado, numero_ticket, asignado_por, observaciones, fecha_alta)
           VALUES ($1, $2, 'ACTIVA', $3, $4, $5, $6)`,
          [
            nuevoUsuarioId,
            cupoSeleccionado.id,
            numero_ticket || 'ALTA-WEB',
            req.user.username,
            observaciones || 'Alta de usuario y asignación de licencia M365',
            nowIso
          ]
        );

        await pool.query(
          `INSERT INTO movimientos_licencia
           (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
           VALUES ('ALTA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            nuevoUsuarioId,
            cleanEmail,
            nombreCompleto,
            cupoSeleccionado.id,
            dom.dominio,
            tipoLicenciaObj.nombre,
            estObj ? estObj.nombre : 'SIN ESTABLECIMIENTO',
            observaciones || 'Alta de usuario y entrega de licencia Microsoft 365',
            numero_ticket || 'ALTA-WEB',
            req.user.username,
            nowIso
          ]
        );
      }
    } else {
      const store = readLocalStore();
      nuevoUsuarioId = store.usuarios_m365.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      store.usuarios_m365.unshift({
        id: nuevoUsuarioId,
        rut: rut || '',
        nombres: String(nombres).trim(),
        apellidos: String(apellidos).trim(),
        nombre_completo: nombreCompleto,
        email: cleanEmail,
        email_alias: cleanAlias,
        dominio_id: dom.id,
        establecimiento_id: estObj ? estObj.id : null,
        cargo: cargo || '',
        departamento: departamento || '',
        tipo_usuario: categoriaInferida,
        estado_cuenta: 'ACTIVO',
        created_at: nowIso,
        updated_at: nowIso
      });

      if (cupoSeleccionado && tipoLicenciaObj) {
        const nextAsigId = store.asignaciones_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
        store.asignaciones_licencia.unshift({
          id: nextAsigId,
          usuario_id: nuevoUsuarioId,
          cupo_licencia_id: cupoSeleccionado.id,
          estado: 'ACTIVA',
          numero_ticket: numero_ticket || 'ALTA-WEB',
          asignado_por: req.user.username,
          observaciones: observaciones || 'Alta de usuario y asignación de licencia M365',
          fecha_alta: nowIso,
          fecha_baja: null,
          motivo_baja: null
        });

        const nextMovId = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
        store.movimientos_licencia.unshift({
          id: nextMovId,
          tipo_movimiento: 'ALTA',
          usuario_id: nuevoUsuarioId,
          usuario_email: cleanEmail,
          usuario_nombre: nombreCompleto,
          cupo_licencia_id: cupoSeleccionado.id,
          dominio_nombre: dom.dominio,
          licencia_nombre: tipoLicenciaObj.nombre,
          establecimiento_nombre: estObj ? estObj.nombre : 'SIN ESTABLECIMIENTO',
          motivo: observaciones || 'Alta de usuario y entrega de licencia Microsoft 365',
          ticket_referencia: numero_ticket || 'ALTA-WEB',
          ejecutado_por: req.user.username,
          fecha_movimiento: nowIso
        });
      }
      writeLocalStore(store);
    }

    res.status(201).json({
      status: 'ok',
      message: cupoSeleccionado
        ? `Usuario ${cleanEmail} creado y licencia ${tipoLicenciaObj.nombre} asignada exitosamente.`
        : `Usuario ${cleanEmail} registrado exitosamente.`,
      usuario_id: nuevoUsuarioId
    });
  } catch (err) {
    console.error('[CREATE USUARIO ERROR]:', err);
    res.status(500).json({ error: 'Error al registrar el usuario.' });
  }
});

// Editar datos de Usuario M365
app.put('/api/usuarios/:id', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { rut, nombres, apellidos, email_alias, establecimiento_id, cargo, departamento, tipo_cuenta, tipo_usuario } = req.body;

    const state = await getFullState();
    const user = state.usuarios_m365.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const dom = state.dominios.find(d => d.id === user.dominio_id) || {};
    if (!canManageSector(req.user, dom.sector)) {
      return res.status(403).json({
        error: `No tiene permisos para modificar usuarios del dominio @${dom.dominio}.`
      });
    }

    const nuevosNombres = nombres ? String(nombres).trim() : user.nombres;
    const nuevosApellidos = apellidos ? String(apellidos).trim() : user.apellidos;
    const nombreCompleto = `${nuevosNombres} ${nuevosApellidos}`.trim();
    const nuevoAlias = email_alias !== undefined ? String(email_alias || '').trim().toLowerCase() : (user.email_alias || '');
    const nuevoTipoCuenta = tipo_cuenta || (tipo_usuario === 'MAQUINA' ? 'MAQUINA' : user.tipo_cuenta || 'PERSONA');
    const nuevoTipoUsuario =
      nuevoTipoCuenta === 'MAQUINA'
        ? 'MAQUINA'
        : tipo_usuario && tipo_usuario !== 'MAQUINA'
        ? tipo_usuario
        : user.tipo_usuario === 'MAQUINA'
        ? 'FUNCIONARIO'
        : user.tipo_usuario;
    const nowIso = new Date().toISOString();
    const pool = getPool();

    if (isPgAvailable() && pool) {
      await pool.query(
        `UPDATE usuarios_m365
         SET rut = $1, nombres = $2, apellidos = $3, nombre_completo = $4, email_alias = $5, establecimiento_id = $6, cargo = $7, departamento = $8, tipo_cuenta = $9, tipo_usuario = $10, updated_at = $11
         WHERE id = $12`,
        [
          rut ?? user.rut,
          nuevosNombres,
          nuevosApellidos,
          nombreCompleto,
          nuevoAlias,
          establecimiento_id ? Number(establecimiento_id) : user.establecimiento_id,
          cargo ?? user.cargo,
          departamento ?? user.departamento,
          nuevoTipoCuenta,
          nuevoTipoUsuario,
          nowIso,
          userId
        ]
      );
    } else {
      const store = readLocalStore();
      const target = store.usuarios_m365.find(u => u.id === userId);
      if (target) {
        target.rut = rut ?? target.rut;
        target.nombres = nuevosNombres;
        target.apellidos = nuevosApellidos;
        target.nombre_completo = nombreCompleto;
        target.email_alias = nuevoAlias;
        target.establecimiento_id = establecimiento_id ? Number(establecimiento_id) : target.establecimiento_id;
        target.cargo = cargo ?? target.cargo;
        target.departamento = departamento ?? target.departamento;
        target.tipo_cuenta = nuevoTipoCuenta;
        target.tipo_usuario = nuevoTipoUsuario;
        target.updated_at = nowIso;
        writeLocalStore(store);
      }
    }

    res.json({ status: 'ok', message: 'Ficha del usuario actualizada correctamente.' });
  } catch (err) {
    console.error('[UPDATE USUARIO ERROR]:', err);
    res.status(500).json({ error: 'Error actualizando usuario.' });
  }
});

// Asignar Licencia a un Usuario Existente (Alta)
app.post('/api/usuarios/:id/asignar', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { cupo_licencia_id, numero_ticket, observaciones } = req.body;

    if (!cupo_licencia_id) {
      return res.status(400).json({ error: 'Debe seleccionar el tipo de licencia a asignar.' });
    }

    const state = await getFullState();
    const user = state.usuarios_m365.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const dom = state.dominios.find(d => d.id === user.dominio_id) || {};
    if (!canManageSector(req.user, dom.sector)) {
      return res.status(403).json({
        error: `No tiene permisos para asignar licencias en el dominio @${dom.dominio}.`
      });
    }

    const cupo = state.cupos_licencia.find(c => c.id === Number(cupo_licencia_id));
    if (!cupo || cupo.dominio_id !== user.dominio_id) {
      return res.status(400).json({ error: 'El pool de licencia no corresponde al dominio del usuario.' });
    }

    const yaTieneMisma = state.asignaciones_licencia.find(
      a => a.usuario_id === userId && a.cupo_licencia_id === cupo.id && a.estado === 'ACTIVA'
    );
    if (yaTieneMisma) {
      return res.status(409).json({ error: 'El usuario ya posee una licencia activa de este mismo tipo.' });
    }

    const asignadas = state.asignaciones_licencia.filter(
      a => a.cupo_licencia_id === cupo.id && a.estado === 'ACTIVA'
    ).length;
    if (asignadas >= cupo.total_licencias) {
      return res.status(400).json({
        error: `Sin stock disponible: este pool tiene ${asignadas} de ${cupo.total_licencias} licencias ocupadas.`
      });
    }

    const tipo = state.tipos_licencia.find(t => t.id === cupo.tipo_licencia_id) || {};
    const est = state.establecimientos.find(e => e.id === user.establecimiento_id);
    const nowIso = new Date().toISOString();
    const pool = getPool();

    if (isPgAvailable() && pool) {
      await pool.query(`UPDATE usuarios_m365 SET estado_cuenta = 'ACTIVO', updated_at = $1 WHERE id = $2`, [nowIso, userId]);
      await pool.query(
        `INSERT INTO asignaciones_licencia (usuario_id, cupo_licencia_id, estado, numero_ticket, asignado_por, observaciones, fecha_alta)
         VALUES ($1, $2, 'ACTIVA', $3, $4, $5, $6)`,
        [userId, cupo.id, numero_ticket || 'ALTA-LIC', req.user.username, observaciones || 'Asignación de licencia M365', nowIso]
      );
      await pool.query(
        `INSERT INTO movimientos_licencia
         (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
         VALUES ('ALTA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          user.email,
          user.nombre_completo,
          cupo.id,
          dom.dominio,
          tipo.nombre,
          est ? est.nombre : 'SIN ESTABLECIMIENTO',
          observaciones || 'Asignación de licencia Microsoft 365',
          numero_ticket || 'ALTA-LIC',
          req.user.username,
          nowIso
        ]
      );
    } else {
      const store = readLocalStore();
      const targetUser = store.usuarios_m365.find(u => u.id === userId);
      if (targetUser) {
        targetUser.estado_cuenta = 'ACTIVO';
        targetUser.updated_at = nowIso;
      }
      const nextAsigId = store.asignaciones_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      store.asignaciones_licencia.unshift({
        id: nextAsigId,
        usuario_id: userId,
        cupo_licencia_id: cupo.id,
        estado: 'ACTIVA',
        numero_ticket: numero_ticket || 'ALTA-LIC',
        asignado_por: req.user.username,
        observaciones: observaciones || 'Asignación de licencia M365',
        fecha_alta: nowIso,
        fecha_baja: null,
        motivo_baja: null
      });
      const nextMovId = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      store.movimientos_licencia.unshift({
        id: nextMovId,
        tipo_movimiento: 'ALTA',
        usuario_id: userId,
        usuario_email: user.email,
        usuario_nombre: user.nombre_completo,
        cupo_licencia_id: cupo.id,
        dominio_nombre: dom.dominio,
        licencia_nombre: tipo.nombre,
        establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
        motivo: observaciones || 'Asignación de licencia Microsoft 365',
        ticket_referencia: numero_ticket || 'ALTA-LIC',
        ejecutado_por: req.user.username,
        fecha_movimiento: nowIso
      });
      writeLocalStore(store);
    }

    res.json({
      status: 'ok',
      message: `Licencia ${tipo.nombre} asignada a ${user.email}.`
    });
  } catch (err) {
    console.error('[ASIGNAR LICENCIA ERROR]:', err);
    res.status(500).json({ error: 'Error al asignar licencia.' });
  }
});

// Dar de Baja Licencia(s) y/o Usuario (Baja y Liberación de Stock)
app.post('/api/usuarios/:id/baja', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { asignacion_id, motivo_baja, numero_ticket, desactivar_cuenta } = req.body;

    if (!motivo_baja || String(motivo_baja).trim() === '') {
      return res.status(400).json({ error: 'Debe indicar el motivo de la baja para el registro de auditoría.' });
    }

    const state = await getFullState();
    const user = state.usuarios_m365.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const dom = state.dominios.find(d => d.id === user.dominio_id) || {};
    if (!canManageSector(req.user, dom.sector)) {
      return res.status(403).json({
        error: `No tiene permisos para cursar bajas en el dominio @${dom.dominio}.`
      });
    }

    const activas = state.asignaciones_licencia.filter(
      a => a.usuario_id === userId && a.estado === 'ACTIVA' && (!asignacion_id || a.id === Number(asignacion_id))
    );

    if (activas.length === 0 && !desactivar_cuenta) {
      return res.status(400).json({ error: 'El usuario no tiene licencias activas para dar de baja.' });
    }

    const est = state.establecimientos.find(e => e.id === user.establecimiento_id);
    const nowIso = new Date().toISOString();
    const pool = getPool();

    if (isPgAvailable() && pool) {
      for (const asig of activas) {
        const cupo = state.cupos_licencia.find(c => c.id === asig.cupo_licencia_id) || {};
        const tipo = state.tipos_licencia.find(t => t.id === cupo.tipo_licencia_id) || {};

        await pool.query(
          `UPDATE asignaciones_licencia
           SET estado = 'REVOCADA', fecha_baja = $1, motivo_baja = $2
           WHERE id = $3`,
          [nowIso, motivo_baja, asig.id]
        );

        await pool.query(
          `INSERT INTO movimientos_licencia
           (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
           VALUES ('BAJA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            userId,
            user.email,
            user.nombre_completo,
            cupo.id,
            dom.dominio,
            tipo.nombre || 'Licencia M365',
            est ? est.nombre : 'SIN ESTABLECIMIENTO',
            motivo_baja,
            numero_ticket || 'BAJA-WEB',
            req.user.username,
            nowIso
          ]
        );
      }

      if (desactivar_cuenta !== false) {
        await pool.query(`UPDATE usuarios_m365 SET estado_cuenta = 'BAJA', updated_at = $1 WHERE id = $2`, [nowIso, userId]);
      }
    } else {
      const store = readLocalStore();
      for (const asig of activas) {
        const targetAsig = store.asignaciones_licencia.find(a => a.id === asig.id);
        if (targetAsig) {
          targetAsig.estado = 'REVOCADA';
          targetAsig.fecha_baja = nowIso;
          targetAsig.motivo_baja = motivo_baja;
        }
        const cupo = store.cupos_licencia.find(c => c.id === asig.cupo_licencia_id) || {};
        const tipo = store.tipos_licencia.find(t => t.id === cupo.tipo_licencia_id) || {};
        const nextMovId = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
        store.movimientos_licencia.unshift({
          id: nextMovId,
          tipo_movimiento: 'BAJA',
          usuario_id: userId,
          usuario_email: user.email,
          usuario_nombre: user.nombre_completo,
          cupo_licencia_id: cupo.id,
          dominio_nombre: dom.dominio,
          licencia_nombre: tipo.nombre || 'Licencia M365',
          establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
          motivo: motivo_baja,
          ticket_referencia: numero_ticket || 'BAJA-WEB',
          ejecutado_por: req.user.username,
          fecha_movimiento: nowIso
        });
      }
      if (desactivar_cuenta !== false) {
        const targetUser = store.usuarios_m365.find(u => u.id === userId);
        if (targetUser) {
          targetUser.estado_cuenta = 'BAJA';
          targetUser.updated_at = nowIso;
        }
      }
      writeLocalStore(store);
    }

    res.json({
      status: 'ok',
      message: `Baja cursada exitosamente. Se liberaron ${activas.length} licencia(s) al stock disponible.`
    });
  } catch (err) {
    console.error('[BAJA USUARIO ERROR]:', err);
    res.status(500).json({ error: 'Error al procesar la baja.' });
  }
});

// Cambiar Tipo de Licencia (Ej: de E1 a E3 en cmds-salud.cl)
app.post('/api/usuarios/:id/cambiar-licencia', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { asignacion_actual_id, nuevo_cupo_licencia_id, motivo, numero_ticket } = req.body;

    if (!nuevo_cupo_licencia_id) {
      return res.status(400).json({ error: 'Debe indicar la nueva licencia de destino.' });
    }

    const state = await getFullState();
    const user = state.usuarios_m365.find(u => u.id === userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const dom = state.dominios.find(d => d.id === user.dominio_id) || {};
    if (!canManageSector(req.user, dom.sector)) {
      return res.status(403).json({
        error: `No tiene permisos para modificar licencias en el dominio @${dom.dominio}.`
      });
    }

    const nuevoCupo = state.cupos_licencia.find(c => c.id === Number(nuevo_cupo_licencia_id));
    if (!nuevoCupo || nuevoCupo.dominio_id !== user.dominio_id) {
      return res.status(400).json({ error: 'El nuevo pool de licencia no pertenece al dominio del usuario.' });
    }

    const asignadasNuevo = state.asignaciones_licencia.filter(
      a => a.cupo_licencia_id === nuevoCupo.id && a.estado === 'ACTIVA'
    ).length;
    if (asignadasNuevo >= nuevoCupo.total_licencias) {
      return res.status(400).json({ error: 'El nuevo pool seleccionado no cuenta con licencias disponibles.' });
    }

    const asigAnterior = asignacion_actual_id
      ? state.asignaciones_licencia.find(a => a.id === Number(asignacion_actual_id) && a.usuario_id === userId)
      : state.asignaciones_licencia.find(a => a.usuario_id === userId && a.estado === 'ACTIVA');

    const nuevoTipo = state.tipos_licencia.find(t => t.id === nuevoCupo.tipo_licencia_id) || {};
    const est = state.establecimientos.find(e => e.id === user.establecimiento_id);
    const nowIso = new Date().toISOString();
    const pool = getPool();

    if (isPgAvailable() && pool) {
      if (asigAnterior && asigAnterior.estado === 'ACTIVA') {
        const antCupo = state.cupos_licencia.find(c => c.id === asigAnterior.cupo_licencia_id) || {};
        const antTipo = state.tipos_licencia.find(t => t.id === antCupo.tipo_licencia_id) || {};
        await pool.query(
          `UPDATE asignaciones_licencia SET estado = 'REVOCADA', fecha_baja = $1, motivo_baja = $2 WHERE id = $3`,
          [nowIso, `Cambio de licencia hacia ${nuevoTipo.nombre}`, asigAnterior.id]
        );
        await pool.query(
          `INSERT INTO movimientos_licencia
           (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
           VALUES ('BAJA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            userId,
            user.email,
            user.nombre_completo,
            antCupo.id,
            dom.dominio,
            antTipo.nombre,
            est ? est.nombre : 'SIN ESTABLECIMIENTO',
            `Reemplazada por cambio a ${nuevoTipo.nombre}`,
            numero_ticket || 'CAMBIO-LIC',
            req.user.username,
            nowIso
          ]
        );
      }

      await pool.query(
        `INSERT INTO asignaciones_licencia (usuario_id, cupo_licencia_id, estado, numero_ticket, asignado_por, observaciones, fecha_alta)
         VALUES ($1, $2, 'ACTIVA', $3, $4, $5, $6)`,
        [userId, nuevoCupo.id, numero_ticket || 'CAMBIO-LIC', req.user.username, motivo || `Cambio a ${nuevoTipo.nombre}`, nowIso]
      );

      await pool.query(
        `INSERT INTO movimientos_licencia
         (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
         VALUES ('ALTA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId,
          user.email,
          user.nombre_completo,
          nuevoCupo.id,
          dom.dominio,
          nuevoTipo.nombre,
          est ? est.nombre : 'SIN ESTABLECIMIENTO',
          motivo || `Alta por cambio de licencia a ${nuevoTipo.nombre}`,
          numero_ticket || 'CAMBIO-LIC',
          req.user.username,
          nowIso
        ]
      );
    } else {
      const store = readLocalStore();
      if (asigAnterior && asigAnterior.estado === 'ACTIVA') {
        const targetAnt = store.asignaciones_licencia.find(a => a.id === asigAnterior.id);
        if (targetAnt) {
          targetAnt.estado = 'REVOCADA';
          targetAnt.fecha_baja = nowIso;
          targetAnt.motivo_baja = `Cambio de licencia hacia ${nuevoTipo.nombre}`;
        }
        const antCupo = store.cupos_licencia.find(c => c.id === asigAnterior.cupo_licencia_id) || {};
        const antTipo = store.tipos_licencia.find(t => t.id === antCupo.tipo_licencia_id) || {};
        const nextMov1 = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
        store.movimientos_licencia.unshift({
          id: nextMov1,
          tipo_movimiento: 'BAJA',
          usuario_id: userId,
          usuario_email: user.email,
          usuario_nombre: user.nombre_completo,
          cupo_licencia_id: antCupo.id,
          dominio_nombre: dom.dominio,
          licencia_nombre: antTipo.nombre,
          establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
          motivo: `Reemplazada por cambio a ${nuevoTipo.nombre}`,
          ticket_referencia: numero_ticket || 'CAMBIO-LIC',
          ejecutado_por: req.user.username,
          fecha_movimiento: nowIso
        });
      }

      const nextAsigId = store.asignaciones_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      store.asignaciones_licencia.unshift({
        id: nextAsigId,
        usuario_id: userId,
        cupo_licencia_id: nuevoCupo.id,
        estado: 'ACTIVA',
        numero_ticket: numero_ticket || 'CAMBIO-LIC',
        asignado_por: req.user.username,
        observaciones: motivo || `Cambio a ${nuevoTipo.nombre}`,
        fecha_alta: nowIso,
        fecha_baja: null,
        motivo_baja: null
      });

      const nextMov2 = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      store.movimientos_licencia.unshift({
        id: nextMov2,
        tipo_movimiento: 'ALTA',
        usuario_id: userId,
        usuario_email: user.email,
        usuario_nombre: user.nombre_completo,
        cupo_licencia_id: nuevoCupo.id,
        dominio_nombre: dom.dominio,
        licencia_nombre: nuevoTipo.nombre,
        establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
        motivo: motivo || `Alta por cambio de licencia a ${nuevoTipo.nombre}`,
        ticket_referencia: numero_ticket || 'CAMBIO-LIC',
        ejecutado_por: req.user.username,
        fecha_movimiento: nowIso
      });
      writeLocalStore(store);
    }

    res.json({
      status: 'ok',
      message: `Licencia cambiada exitosamente a ${nuevoTipo.nombre}.`
    });
  } catch (err) {
    console.error('[CAMBIAR LICENCIA ERROR]:', err);
    res.status(500).json({ error: 'Error al cambiar la licencia.' });
  }
});

// ============================================================================
// ENDPOINTS DE REPORTES DE ALTAS Y BAJAS (/api/movimientos)
// ============================================================================
let movimientosMemCache = {
  version: -1,
  allJsonStr: '',
  allGzipBuf: null
};

app.get('/api/movimientos', requireAuth, async (req, res) => {
  try {
    const state = await getFullState();
    const curVer = getStateVersion();
    const { tipo_movimiento, dominio, licencia, fecha_desde, fecha_hasta, search } = req.query;
    const hasFilters = Boolean(tipo_movimiento || dominio || licencia || fecha_desde || fecha_hasta || search);
    const acceptEnc = String(req.headers['accept-encoding'] || '');

    if (!hasFilters && movimientosMemCache.version === curVer && movimientosMemCache.allJsonStr) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (acceptEnc.includes('gzip') && movimientosMemCache.allGzipBuf) {
        res.setHeader('Content-Encoding', 'gzip');
        return res.send(movimientosMemCache.allGzipBuf);
      }
      return res.send(movimientosMemCache.allJsonStr);
    }

    const dDesde = fecha_desde ? new Date(`${fecha_desde}T00:00:00`).getTime() : null;
    const dHasta = fecha_hasta ? new Date(`${fecha_hasta}T23:59:59`).getTime() : null;
    const q = search && String(search).trim() !== '' ? String(search).trim().toLowerCase() : '';

    let totalAltas = 0;
    let totalBajas = 0;
    let totalAjustes = 0;
    let totalMatch = 0;
    const sliced = [];
    const MAX_UI_MOVIMIENTOS = 1000;

    for (const m of state.movimientos_licencia) {
      if (tipo_movimiento && m.tipo_movimiento !== tipo_movimiento) continue;
      if (dominio && m.dominio_nombre !== dominio) continue;
      if (licencia && m.licencia_nombre !== licencia) continue;
      if (dDesde || dHasta) {
        const tMov = new Date(m.fecha_movimiento).getTime();
        if (dDesde && tMov < dDesde) continue;
        if (dHasta && tMov > dHasta) continue;
      }
      if (q) {
        const match =
          (m.usuario_email && m.usuario_email.toLowerCase().includes(q)) ||
          (m.usuario_nombre && m.usuario_nombre.toLowerCase().includes(q)) ||
          (m.establecimiento_nombre && m.establecimiento_nombre.toLowerCase().includes(q)) ||
          (m.motivo && m.motivo.toLowerCase().includes(q)) ||
          (m.ticket_referencia && m.ticket_referencia.toLowerCase().includes(q));
        if (!match) continue;
      }

      totalMatch++;
      if (m.tipo_movimiento === 'ALTA' || m.tipo_movimiento === 'CARGA_MASIVA') totalAltas++;
      else if (m.tipo_movimiento === 'BAJA') totalBajas++;
      else if (m.tipo_movimiento === 'AJUSTE_CUPO') totalAjustes++;

      if (sliced.length < MAX_UI_MOVIMIENTOS) {
        sliced.push(m);
      }
    }

    const payloadStr = JSON.stringify({
      movimientos: sliced,
      resumen: {
        total_registros: totalMatch,
        altas: totalAltas,
        bajas: totalBajas,
        ajustes: totalAjustes,
        balance_neto: totalAltas - totalBajas
      }
    });

    const gzipBuf = zlib.gzipSync(Buffer.from(payloadStr, 'utf8'));

    if (!hasFilters) {
      movimientosMemCache = {
        version: curVer,
        allJsonStr: payloadStr,
        allGzipBuf: gzipBuf
      };
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (acceptEnc.includes('gzip')) {
      res.setHeader('Content-Encoding', 'gzip');
      return res.send(gzipBuf);
    }
    res.send(payloadStr);
  } catch (err) {
    console.error('[MOVIMIENTOS ERROR]:', err);
    res.status(500).json({ error: 'Error consultando bitácora de altas y bajas.' });
  }
});

// ============================================================================
// ENDPOINTS DEL MANTENEDOR DE USUARIOS DEL SISTEMA (/api/sistema-usuarios/*)
// ============================================================================
app.get('/api/sistema-usuarios', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const state = await getFullState();
    const sanitized = state.usuarios_sistema.map(({ password_hash, ...rest }) => rest);
    res.json({
      usuarios_sistema: sanitized,
      auditoria: state.auditoria_accesos.slice(0, 100)
    });
  } catch (err) {
    console.error('[GET SISTEMA USUARIOS ERROR]:', err);
    res.status(500).json({ error: 'Error cargando usuarios del sistema.' });
  }
});

app.post('/api/sistema-usuarios', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const {
      username,
      nombre_completo,
      email,
      cargo,
      password,
      rol_acceso,
      ambito,
      debe_cambiar_clave
    } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    if (!username || !nombre_completo || !email || !password || !rol_acceso || !ambito) {
      return res.status(400).json({ error: 'Todos los campos principales son obligatorios.' });
    }

    const rolesValidos = ['ADMIN_SISTEMA', 'GESTOR', 'VISUALIZADOR'];
    const ambitosValidos = ['GLOBAL', 'ADMINISTRACION', 'EDUCACION', 'SALUD'];

    if (!rolesValidos.includes(rol_acceso)) {
      return res.status(400).json({ error: 'Nivel de acceso inválido.' });
    }
    if (!ambitosValidos.includes(ambito)) {
      return res.status(400).json({ error: 'Perfil sectorial inválido.' });
    }

    const valPass = validateStrongPassword(password);
    if (!valPass.valid) {
      return res.status(400).json({ error: valPass.message });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const state = await getFullState();
    if (state.usuarios_sistema.some(u => u.username.toLowerCase() === cleanUsername)) {
      return res.status(409).json({ error: `El nombre de usuario '${cleanUsername}' ya se encuentra registrado.` });
    }

    const hash = await bcrypt.hash(String(password), 12);
    const nowIso = new Date().toISOString();
    const pool = getPool();

    if (isPgAvailable() && pool) {
      await pool.query(
        `INSERT INTO usuarios_sistema
         (username, nombre_completo, email, cargo, password_hash, rol_acceso, ambito, debe_cambiar_clave, activo, intentos_fallidos, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, 0, $9)`,
        [
          cleanUsername,
          String(nombre_completo).trim(),
          String(email).trim().toLowerCase(),
          cargo || '',
          hash,
          rol_acceso,
          ambito,
          debe_cambiar_clave !== false,
          nowIso
        ]
      );
    } else {
      const store = readLocalStore();
      const nextId = store.usuarios_sistema.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      store.usuarios_sistema.push({
        id: nextId,
        username: cleanUsername,
        nombre_completo: String(nombre_completo).trim(),
        email: String(email).trim().toLowerCase(),
        cargo: cargo || '',
        password_hash: hash,
        rol_acceso,
        ambito,
        debe_cambiar_clave: debe_cambiar_clave !== false,
        activo: true,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
        ultimo_acceso: null,
        created_at: nowIso
      });
      writeLocalStore(store);
    }

    await registrarAuditoria(
      req.user.username,
      'CREAR_USUARIO_SISTEMA',
      ip,
      true,
      `Creado usuario '${cleanUsername}' con perfil ${ambito} y rol ${rol_acceso}`
    );

    res.status(201).json({
      status: 'ok',
      message: `Usuario del sistema '${cleanUsername}' creado exitosamente.`
    });
  } catch (err) {
    console.error('[CREATE SISTEMA USUARIO ERROR]:', err);
    res.status(500).json({ error: 'Error al crear el usuario del sistema.' });
  }
});

app.put('/api/sistema-usuarios/:id', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const { nombre_completo, email, cargo, rol_acceso, ambito, activo, desbloquear } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const state = await getFullState();
    const target = state.usuarios_sistema.find(u => u.id === targetId);
    if (!target) {
      return res.status(404).json({ error: 'Usuario del sistema no encontrado.' });
    }

    if (target.id === req.user.id && activo === false) {
      return res.status(400).json({ error: 'No puede desactivar su propia cuenta de administrador en sesión.' });
    }

    const pool = getPool();
    if (isPgAvailable() && pool) {
      await pool.query(
        `UPDATE usuarios_sistema
         SET nombre_completo = $1, email = $2, cargo = $3, rol_acceso = $4, ambito = $5, activo = $6,
             intentos_fallidos = CASE WHEN $7 = TRUE THEN 0 ELSE intentos_fallidos END,
             bloqueado_hasta = CASE WHEN $7 = TRUE THEN NULL ELSE bloqueado_hasta END
         WHERE id = $8`,
        [
          nombre_completo ?? target.nombre_completo,
          email ?? target.email,
          cargo ?? target.cargo,
          rol_acceso ?? target.rol_acceso,
          ambito ?? target.ambito,
          activo !== undefined ? Boolean(activo) : target.activo,
          Boolean(desbloquear),
          targetId
        ]
      );
    } else {
      const store = readLocalStore();
      const row = store.usuarios_sistema.find(u => u.id === targetId);
      if (row) {
        row.nombre_completo = nombre_completo ?? row.nombre_completo;
        row.email = email ?? row.email;
        row.cargo = cargo ?? row.cargo;
        row.rol_acceso = rol_acceso ?? row.rol_acceso;
        row.ambito = ambito ?? row.ambito;
        if (activo !== undefined) row.activo = Boolean(activo);
        if (desbloquear) {
          row.intentos_fallidos = 0;
          row.bloqueado_hasta = null;
        }
        writeLocalStore(store);
      }
    }

    await registrarAuditoria(
      req.user.username,
      'EDITAR_USUARIO_SISTEMA',
      ip,
      true,
      `Actualizado usuario '${target.username}' -> Perfil: ${ambito ?? target.ambito}, Rol: ${rol_acceso ?? target.rol_acceso}, Activo: ${activo ?? target.activo}`
    );

    res.json({ status: 'ok', message: 'Usuario del sistema actualizado exitosamente.' });
  } catch (err) {
    console.error('[UPDATE SISTEMA USUARIO ERROR]:', err);
    res.status(500).json({ error: 'Error al actualizar el usuario del sistema.' });
  }
});

app.delete('/api/sistema-usuarios/:id', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const ip = String(req.headers['x-forwarded-for'] || req.ip || req.socket.remoteAddress || '127.0.0.1')
      .split(',')[0]
      .trim();

    const state = await getFullState();
    const target = state.usuarios_sistema.find(u => u.id === targetId);
    if (!target) {
      return res.status(404).json({ error: 'Usuario del sistema no encontrado.' });
    }

    if (target.id === req.user.id) {
      return res.status(400).json({ error: 'Por seguridad, no puede eliminar su propia cuenta de administrador en sesión.' });
    }

    const pool = getPool();
    if (isPgAvailable() && pool) {
      await pool.query('DELETE FROM usuarios_sistema WHERE id = $1', [targetId]);
    }
    const store = readLocalStore();
    if (Array.isArray(store.usuarios_sistema)) {
      store.usuarios_sistema = store.usuarios_sistema.filter(u => u.id !== targetId);
      writeLocalStore(store);
    }

    await registrarAuditoria(
      req.user.username,
      'ELIMINAR_USUARIO_SISTEMA',
      ip,
      true,
      `Eliminado usuario del sistema '${target.username}' (${target.nombre_completo})`
    );

    res.json({
      status: 'ok',
      message: `Usuario '${target.username}' eliminado permanentemente del sistema.`
    });
  } catch (err) {
    console.error('[DELETE SISTEMA USUARIO ERROR]:', err);
    res.status(500).json({ error: 'Error al eliminar el usuario del sistema.' });
  }
});

// Reseteo Seguro de Contraseña en el Mantenedor de Usuarios
app.post('/api/sistema-usuarios/:id/reset-password', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const targetId = Number(req.params.id);
    const { nuevaPassword, generarAutomatica, forzarCambio } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    const state = await getFullState();
    const target = state.usuarios_sistema.find(u => u.id === targetId);
    if (!target) {
      return res.status(404).json({ error: 'Usuario del sistema no encontrado.' });
    }

    const passwordFinal = generarAutomatica ? generateStrongPassword(12) : String(nuevaPassword || '');
    const validation = validateStrongPassword(passwordFinal);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.message });
    }

    const hash = await bcrypt.hash(passwordFinal, 12);
    const debeCambiar = forzarCambio !== false;
    const pool = getPool();

    if (isPgAvailable() && pool) {
      await pool.query(
        `UPDATE usuarios_sistema
         SET password_hash = $1, debe_cambiar_clave = $2, intentos_fallidos = 0, bloqueado_hasta = NULL
         WHERE id = $3`,
        [hash, debeCambiar, targetId]
      );
    } else {
      const store = readLocalStore();
      const row = store.usuarios_sistema.find(u => u.id === targetId);
      if (row) {
        row.password_hash = hash;
        row.debe_cambiar_clave = debeCambiar;
        row.intentos_fallidos = 0;
        row.bloqueado_hasta = null;
        writeLocalStore(store);
      }
    }

    await registrarAuditoria(
      req.user.username,
      'RESETEO_CLAVE_ADMIN',
      ip,
      true,
      `Contraseña reseteada para '${target.username}' (Cambio obligatorio al iniciar: ${debeCambiar ? 'SÍ' : 'NO'})`
    );

    res.json({
      status: 'ok',
      message: `Contraseña de '${target.username}' reseteada exitosamente.`,
      passwordTemporal: passwordFinal,
      debe_cambiar_clave: debeCambiar
    });
  } catch (err) {
    console.error('[RESET PASSWORD ERROR]:', err);
    res.status(500).json({ error: 'Error al resetear la contraseña.' });
  }
});

app.get('/api/sistema-usuarios/generar-clave', requireAuth, requireSystemAdmin, (req, res) => {
  res.json({ password: generateStrongPassword(12) });
});

// ============================================================================
// ENDPOINTS DE CATÁLOGOS Y MANTENEDORES (/api/catalogos/*)
// ============================================================================
app.get('/api/catalogos', requireAuth, async (req, res) => {
  try {
    const state = await getFullState();
    res.json({
      dominios: state.dominios,
      tipos_licencia: state.tipos_licencia,
      cupos_licencia: state.cupos_licencia,
      establecimientos: state.establecimientos
    });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo catálogos.' });
  }
});

app.post('/api/catalogos/establecimientos', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const { codigo_unidad, cenco, nombre, sector, dominio_sugerido } = req.body;
    if (!codigo_unidad || !nombre || !sector || !dominio_sugerido) {
      return res.status(400).json({ error: 'Código de unidad, nombre, sector y dominio sugerido son requeridos.' });
    }
    const state = await getFullState();
    if (state.establecimientos.some(e => e.codigo_unidad === Number(codigo_unidad))) {
      return res.status(409).json({ error: `Ya existe una unidad con el código ${codigo_unidad}.` });
    }

    const pool = getPool();
    if (isPgAvailable() && pool) {
      await pool.query(
        `INSERT INTO establecimientos (codigo_unidad, cenco, nombre, sector, dominio_sugerido)
         VALUES ($1, $2, $3, $4, $5)`,
        [Number(codigo_unidad), cenco ? Number(cenco) : null, String(nombre).trim().toUpperCase(), sector, dominio_sugerido]
      );
    } else {
      const store = readLocalStore();
      const nextId = store.establecimientos.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      store.establecimientos.push({
        id: nextId,
        codigo_unidad: Number(codigo_unidad),
        cenco: cenco ? Number(cenco) : null,
        nombre: String(nombre).trim().toUpperCase(),
        sector,
        dominio_sugerido
      });
      writeLocalStore(store);
    }

    res.status(201).json({ status: 'ok', message: 'Establecimiento / Unidad agregado exitosamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error creando establecimiento.' });
  }
});

app.put('/api/catalogos/establecimientos/:id', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const estId = Number(req.params.id);
    const { codigo_unidad, cenco, nombre, sector, dominio_sugerido } = req.body;
    const state = await getFullState();
    const target = state.establecimientos.find(e => e.id === estId);
    if (!target) {
      return res.status(404).json({ error: 'Establecimiento no encontrado.' });
    }

    const pool = getPool();
    if (isPgAvailable() && pool) {
      await pool.query(
        `UPDATE establecimientos
         SET codigo_unidad = $1, cenco = $2, nombre = $3, sector = $4, dominio_sugerido = $5
         WHERE id = $6`,
        [
          codigo_unidad ? Number(codigo_unidad) : target.codigo_unidad,
          cenco !== undefined && cenco !== '' ? Number(cenco) : target.cenco,
          nombre ? String(nombre).trim().toUpperCase() : target.nombre,
          sector || target.sector,
          dominio_sugerido || target.dominio_sugerido,
          estId
        ]
      );
    } else {
      const store = readLocalStore();
      const row = store.establecimientos.find(e => e.id === estId);
      if (row) {
        if (codigo_unidad) row.codigo_unidad = Number(codigo_unidad);
        if (cenco !== undefined) row.cenco = cenco !== '' ? Number(cenco) : null;
        if (nombre) row.nombre = String(nombre).trim().toUpperCase();
        if (sector) row.sector = sector;
        if (dominio_sugerido) row.dominio_sugerido = dominio_sugerido;
        writeLocalStore(store);
      }
    }

    res.json({ status: 'ok', message: 'Establecimiento actualizado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error actualizando establecimiento.' });
  }
});

// ============================================================================
// ENDPOINTS DE IMPORTACIÓN Y EXPORTACIÓN EXCEL (.XLSX)
// ============================================================================
app.get('/api/import-export/plantilla', requireAuth, async (req, res) => {
  try {
    const state = await getFullState();
    const wb = XLSX.utils.book_new();

    const ejemplos = [
      {
        RUT: '15.234.567-8',
        Nombres: 'Juan Alberto',
        Apellidos: 'Pérez González',
        Email: 'jperez@cmds.cl',
        Dominio: 'cmds.cl',
        Codigo_Licencia_SKU: 'O365_E3',
        Codigo_Unidad: 350,
        Cargo: 'Analista Contable',
        Departamento: 'DAF',
        Ticket_Referencia: 'CARGA-2026'
      },
      {
        RUT: '16.876.543-2',
        Nombres: 'Claudia Andrea',
        Apellidos: 'Soto Ramírez',
        Email: 'csoto@cmds-salud.cl',
        Dominio: 'cmds-salud.cl',
        Codigo_Licencia_SKU: 'O365_E3',
        Codigo_Unidad: 605,
        Cargo: 'Enfermera Clínica',
        Departamento: 'CESFAM Norte',
        Ticket_Referencia: 'CARGA-2026'
      },
      {
        RUT: '17.345.678-9',
        Nombres: 'Pedro Ignacio',
        Apellidos: 'Araya Morales',
        Email: 'paraya@cmds-educacion.cl',
        Dominio: 'cmds-educacion.cl',
        Codigo_Licencia_SKU: 'O365_A3_FACULTY',
        Codigo_Unidad: 12,
        Cargo: 'Docente Lenguaje',
        Departamento: 'Liceo A-12',
        Ticket_Referencia: 'CARGA-2026'
      }
    ];

    const wsUsuarios = XLSX.utils.json_to_sheet(ejemplos);
    wsUsuarios['!cols'] = [
      { wch: 15 }, { wch: 20 }, { wch: 22 }, { wch: 30 }, { wch: 20 },
      { wch: 22 }, { wch: 15 }, { wch: 25 }, { wch: 22 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, wsUsuarios, 'CARGA_USUARIOS_M365');

    const catLicencias = state.cupos_licencia.map(c => {
      const dom = state.dominios.find(d => d.id === c.dominio_id) || {};
      const tipo = state.tipos_licencia.find(t => t.id === c.tipo_licencia_id) || {};
      return {
        Dominio: dom.dominio,
        Codigo_Licencia_SKU: tipo.codigo_sku,
        Nombre_Licencia_Microsoft_365: tipo.nombre,
        Categoria: tipo.categoria,
        Cupo_Total: c.total_licencias
      };
    });
    const wsLic = XLSX.utils.json_to_sheet(catLicencias);
    wsLic['!cols'] = [{ wch: 20 }, { wch: 22 }, { wch: 48 }, { wch: 16 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, wsLic, 'CATALOGO_LICENCIAS');

    const catEst = state.establecimientos.map(e => ({
      Codigo_Unidad: e.codigo_unidad,
      Centro_Costo: e.cenco || '',
      Nombre_Establecimiento_Unidad: e.nombre,
      Sector: e.sector,
      Dominio_Sugerido: e.dominio_sugerido
    }));
    const wsEst = XLSX.utils.json_to_sheet(catEst);
    wsEst['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 45 }, { wch: 18 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsEst, 'CATALOGO_89_UNIDADES_CMDS');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Plantilla_Carga_Licencias_M365_CMDS.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('[PLANTILLA ERROR]:', err);
    res.status(500).json({ error: 'Error generando plantilla Excel.' });
  }
});

// Asignación Masiva de Licencia a un Conjunto de Usuarios (ej. Nómina Salud @cmds-salud.cl)
app.post('/api/usuarios/asignar-licencia-masiva', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const { usuario_ids, cupo_licencia_id, numero_ticket, observaciones } = req.body;
    if (!Array.isArray(usuario_ids) || usuario_ids.length === 0 || !cupo_licencia_id) {
      return res.status(400).json({ error: 'Debe seleccionar al menos un usuario y un pool de licencia.' });
    }

    const state = await getFullState();
    const cupo = state.cupos_licencia.find(c => c.id === Number(cupo_licencia_id));
    if (!cupo) {
      return res.status(404).json({ error: 'El pool de licencia seleccionado no existe.' });
    }

    const dom = state.dominios.find(d => d.id === cupo.dominio_id) || {};
    const tipo = state.tipos_licencia.find(t => t.id === cupo.tipo_licencia_id) || {};

    if (!canManageSector(req.user, dom.sector)) {
      return res.status(403).json({
        error: `Su perfil (${req.user.ambito}) no tiene permisos para asignar licencias del dominio @${dom.dominio}.`
      });
    }

    const userById = new Map(state.usuarios_m365.map(u => [u.id, u]));
    const estById = new Map(state.establecimientos.map(e => [e.id, e]));
    const activeAsigsByUserCupo = new Set(
      state.asignaciones_licencia
        .filter(a => a.estado === 'ACTIVA' && a.cupo_licencia_id === cupo.id)
        .map(a => a.usuario_id)
    );

    let asignadasActuales = state.asignaciones_licencia.filter(
      a => a.cupo_licencia_id === cupo.id && a.estado === 'ACTIVA'
    ).length;

    const candidatos = [];
    for (const rawId of usuario_ids) {
      const u = userById.get(Number(rawId));
      if (!u) continue;
      if (u.dominio_id !== cupo.dominio_id) continue;
      if (activeAsigsByUserCupo.has(u.id)) continue;
      if (asignadasActuales + candidatos.length >= cupo.total_licencias) break;
      candidatos.push(u);
    }

    if (candidatos.length === 0) {
      return res.status(400).json({
        error: 'Ninguno de los usuarios seleccionados es elegible (ya poseen esta licencia, pertenecen a otro dominio o no hay cupo disponible).'
      });
    }

    const nowIso = new Date().toISOString();
    const ticket = numero_ticket || 'ALTA-MASIVA';
    const glosa = observaciones || `Asignación masiva de licencia ${tipo.nombre}`;
    const pool = getPool();

    if (isPgAvailable() && pool) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const u of candidatos) {
          const est = estById.get(u.establecimiento_id);
          await client.query(
            `INSERT INTO asignaciones_licencia (usuario_id, cupo_licencia_id, estado, numero_ticket, asignado_por, observaciones, fecha_alta)
             VALUES ($1, $2, 'ACTIVA', $3, $4, $5, $6)`,
            [u.id, cupo.id, ticket, req.user.username, glosa, nowIso]
          );
          await client.query(
            `INSERT INTO movimientos_licencia
             (tipo_movimiento, usuario_id, usuario_email, usuario_nombre, cupo_licencia_id, dominio_nombre, licencia_nombre, establecimiento_nombre, motivo, ticket_referencia, ejecutado_por, fecha_movimiento)
             VALUES ('ALTA', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
              u.id,
              u.email,
              u.nombre_completo,
              cupo.id,
              dom.dominio,
              tipo.nombre,
              est ? est.nombre : 'SIN ESTABLECIMIENTO',
              glosa,
              ticket,
              req.user.username,
              nowIso
            ]
          );
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
      let nextAsigId = store.asignaciones_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      let nextMovId = store.movimientos_licencia.reduce((m, x) => Math.max(m, x.id || 0), 0) + 1;
      for (const u of candidatos) {
        const est = estById.get(u.establecimiento_id);
        store.asignaciones_licencia.unshift({
          id: nextAsigId++,
          usuario_id: u.id,
          cupo_licencia_id: cupo.id,
          estado: 'ACTIVA',
          numero_ticket: ticket,
          asignado_por: req.user.username,
          observaciones: glosa,
          fecha_alta: nowIso,
          fecha_baja: null,
          motivo_baja: null
        });
        store.movimientos_licencia.unshift({
          id: nextMovId++,
          tipo_movimiento: 'ALTA',
          usuario_id: u.id,
          usuario_email: u.email,
          usuario_nombre: u.nombre_completo,
          cupo_licencia_id: cupo.id,
          dominio_nombre: dom.dominio,
          licencia_nombre: tipo.nombre,
          establecimiento_nombre: est ? est.nombre : 'SIN ESTABLECIMIENTO',
          motivo: glosa,
          ticket_referencia: ticket,
          ejecutado_por: req.user.username,
          fecha_movimiento: nowIso
        });
      }
      writeLocalStore(store);
    }

    res.json({
      status: 'ok',
      message: `Se asignó exitosamente la licencia ${tipo.nombre} (@${dom.dominio}) a ${candidatos.length} usuario(s).`,
      asignados: candidatos.length
    });
  } catch (err) {
    console.error('[ASIGNACION MASIVA ERROR]:', err);
    res.status(500).json({ error: 'Error ejecutando la asignación masiva de licencias.' });
  }
});

app.post('/api/import-export/usuarios', requireAuth, requireWriteAccess, upload.single('archivo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Debe adjuntar un archivo Excel (.xlsx) o CSV.' });
    }

    const ext = path.extname(req.file.originalname || '').toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      return res.status(400).json({
        error: 'Formato de archivo no permitido por política de seguridad. Solo se aceptan archivos .xlsx, .xls o .csv.'
      });
    }

    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const state = await getFullState();
    const pool = getPool();

    // Si el archivo tiene el formato exportado por nuestro sistema (columna Correo_M365), ejecutar Actualización Masiva
    if (isExportedNominaWorkbook(XLSX, wb)) {
      const upd = await bulkUpdateFromExportedNomina({
        XLSX,
        wb,
        state,
        pool,
        isPg: isPgAvailable(),
        readLocalStore,
        writeLocalStore
      });
      invalidateStateCache();
      return res.json({
        status: 'ok',
        message: `Actualización masiva completada: ${upd.actualizados} cuenta(s) actualizadas por Correo M365, ${upd.omitidos} fila(s) omitidas.`,
        resumen: {
          creados: 0,
          actualizados: upd.actualizados,
          asignados: 0,
          omitidos: upd.omitidos,
          errores: upd.errores.slice(0, 30)
        }
      });
    }

    const parsed = parseWorkbookToNormalizedUsers(XLSX, wb, state);
    if (!parsed.registrosNormalizados || parsed.registrosNormalizados.length === 0) {
      return res.status(400).json({
        error: 'El archivo seleccionado no contiene filas válidas para importar.',
        detalles: parsed.errores.slice(0, 20)
      });
    }

    const result = await bulkImportNormalizedUsers({
      registrosNormalizados: parsed.registrosNormalizados,
      state,
      pool,
      isPg: isPgAvailable(),
      readLocalStore,
      writeLocalStore,
      operatorUsername: req.user.username,
      canManageSectorFn: canManageSector,
      operatorUser: req.user
    });

    const totalOmitidos = parsed.omitidos + result.omitidos;
    const allErrors = [...parsed.errores, ...result.errores];

    res.json({
      status: 'ok',
      message: `Proceso finalizado: ${result.creados} usuario(s) creados, ${result.asignados} licencia(s) asignadas, ${totalOmitidos} fila(s) omitidas o ya existentes.`,
      resumen: {
        creados: result.creados,
        asignados: result.asignados,
        omitidos: totalOmitidos,
        errores: allErrors.slice(0, 30)
      }
    });
  } catch (err) {
    console.error('[IMPORT EXCEL ERROR]:', err);
    res.status(500).json({ error: 'Error procesando el archivo Excel/CSV.' });
  }
});

app.get('/api/import-export/exportar-usuarios', requireAuth, async (req, res) => {
  try {
    const state = await getFullState();
    const domById = new Map(state.dominios.map(d => [d.id, d]));
    const estById = new Map(state.establecimientos.map(e => [e.id, e]));
    const cupoById = new Map(state.cupos_licencia.map(c => [c.id, c]));
    const tipoById = new Map(state.tipos_licencia.map(t => [t.id, t]));

    const licActivasByUser = new Map();
    for (const a of state.asignaciones_licencia) {
      if (a.estado !== 'ACTIVA') continue;
      const cupo = cupoById.get(a.cupo_licencia_id) || {};
      const tipo = tipoById.get(cupo.tipo_licencia_id) || {};
      if (!licActivasByUser.has(a.usuario_id)) {
        licActivasByUser.set(a.usuario_id, []);
      }
      if (tipo.nombre) {
        licActivasByUser.get(a.usuario_id).push(tipo.nombre);
      }
    }

    const rows = state.usuarios_m365.map(u => {
      const dom = domById.get(u.dominio_id) || {};
      const est = estById.get(u.establecimiento_id) || {};
      const activas = (licActivasByUser.get(u.id) || []).join(' + ');

      return {
        ID: u.id,
        RUT: u.rut || '',
        Nombre_Completo: u.nombre_completo,
        Correo_M365: u.email,
        Correo_Alias_Migracion: u.email_alias || '',
        Dominio: dom.dominio || '',
        Sector: dom.sector || '',
        Establecimiento_Unidad: est.nombre || 'SIN ESTABLECIMIENTO',
        Cargo: u.cargo || '',
        Departamento: u.departamento || '',
        Tipo_Usuario: u.tipo_usuario,
        Licencias_Activas: activas || 'SIN LICENCIA ACTIVA',
        Estado_Cuenta: u.estado_cuenta,
        Inicio_Sesion_Bloqueado: u.cuenta_bloqueada ? 'SI' : 'NO',
        Fecha_Registro: u.created_at ? new Date(u.created_at).toLocaleDateString('es-CL') : ''
      };
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 15 }, { wch: 30 }, { wch: 32 }, { wch: 30 }, { wch: 18 }, { wch: 16 },
      { wch: 38 }, { wch: 24 }, { wch: 22 }, { wch: 15 }, { wch: 38 }, { wch: 14 }, { wch: 24 }, { wch: 15 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'NOMINA_USUARIOS_M365');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Nomina_Usuarios_Licencias_M365_CMDS.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Error exportando nómina de usuarios.' });
  }
});

app.get('/api/import-export/exportar-movimientos', requireAuth, async (req, res) => {
  try {
    const state = await getFullState();
    const rows = state.movimientos_licencia.map(m => ({
      ID: m.id,
      Fecha_Hora: m.fecha_movimiento ? new Date(m.fecha_movimiento).toLocaleString('es-CL') : '',
      Tipo_Movimiento: m.tipo_movimiento,
      Correo_Usuario: m.usuario_email,
      Nombre_Usuario: m.usuario_nombre,
      Dominio: m.dominio_nombre,
      Licencia_Microsoft_365: m.licencia_nombre,
      Establecimiento_Unidad: m.establecimiento_nombre,
      Motivo_Detalle: m.motivo,
      Ticket_Referencia: m.ticket_referencia,
      Ejecutado_Por: m.ejecutado_por
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 }, { wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 28 }, { wch: 18 },
      { wch: 40 }, { wch: 36 }, { wch: 38 }, { wch: 18 }, { wch: 24 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'REPORTE_ALTAS_Y_BAJAS');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="Reporte_Altas_Bajas_Licencias_M365_CMDS.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Error exportando reporte de altas y bajas.' });
  }
});

// ============================================================================
// ENDPOINTS DE SINCRONIZACIÓN AUTOMÁTICA CON MICROSOFT 365 (GRAPH API / ENTRA ID)
// ============================================================================
app.get('/api/m365-sync/status', requireAuth, async (req, res) => {
  try {
    const [config, historial] = await Promise.all([
      getSyncConfig(),
      getSyncHistory(20)
    ]);

    res.json({
      config: {
        tenant_id: config.tenant_id || '',
        client_id: config.client_id || '',
        thumbprint_sha1: config.thumbprint_sha1 || '',
        has_certificate: Boolean(config.cert_pem && config.private_key_pem),
        auto_sync_enabled: Boolean(config.auto_sync_enabled),
        interval_minutes: Number(config.interval_minutes || 15),
        last_sync_at: config.last_sync_at || null,
        last_sync_status: config.last_sync_status || 'PENDIENTE',
        last_sync_summary: config.last_sync_summary || ''
      },
      historial
    });
  } catch (err) {
    console.error('[M365 SYNC STATUS ERROR]:', err);
    res.status(500).json({ error: 'Error consultando estado de sincronización Microsoft 365.' });
  }
});

app.get('/api/m365-sync/certificado', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const config = await getSyncConfig();
    if (!config.cert_pem) {
      return res.status(404).json({ error: 'Certificado X.509 no disponible.' });
    }
    res.setHeader('Content-Disposition', 'attachment; filename="CMDS_M365_Graph_Certificado.cer"');
    res.setHeader('Content-Type', 'application/x-x509-ca-cert');
    res.send(config.cert_pem);
  } catch (err) {
    res.status(500).json({ error: 'Error descargando el certificado X.509.' });
  }
});

app.post('/api/m365-sync/config', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const { tenant_id, client_id, auto_sync_enabled, interval_minutes } = req.body;
    const saved = await saveSyncConfig({
      tenant_id,
      client_id,
      auto_sync_enabled,
      interval_minutes
    });
    res.json({
      status: 'ok',
      message: 'Configuración de sincronización Microsoft 365 guardada exitosamente.',
      config: {
        tenant_id: saved.tenant_id,
        client_id: saved.client_id,
        thumbprint_sha1: saved.thumbprint_sha1,
        has_certificate: Boolean(saved.cert_pem && saved.private_key_pem),
        auto_sync_enabled: saved.auto_sync_enabled,
        interval_minutes: saved.interval_minutes
      }
    });
  } catch (err) {
    console.error('[M365 SYNC CONFIG ERROR]:', err);
    res.status(500).json({ error: 'Error guardando configuración de sincronización.' });
  }
});

app.post('/api/m365-sync/test', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const result = await testGraphConnection();
    res.json({
      status: 'ok',
      ...result
    });
  } catch (err) {
    res.status(400).json({
      status: 'error',
      error: err.message || 'No fue posible conectar con Microsoft Graph.'
    });
  }
});

app.post('/api/m365-sync/run', requireAuth, requireWriteAccess, async (req, res) => {
  try {
    const result = await runMicrosoft365Sync({
      trigger: 'MANUAL_UI',
      operatorUsername: req.user.username
    });
    res.json(result);
  } catch (err) {
    console.error('[M365 SYNC RUN ERROR]:', err);
    res.status(400).json({
      status: 'error',
      error: err.message || 'Error ejecutando la sincronización con Microsoft 365.'
    });
  }
});

// ============================================================================
// SERVIR FRONTEND COMPILADO EN PRODUCCIÓN
// ============================================================================
const publicDir = path.join(__dirname, 'public');
if (fs.existsSync(publicDir)) {
  app.use(
    express.static(publicDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        }
      }
    })
  );
  app.get('/{*splat}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.sendFile('index.html', { root: publicDir });
  });
}

// Iniciar BD y levantar servidor
initDatabase().then(() => {
  startAutoSyncScheduler();
  app.listen(PORT, () => {
    console.log(`====================================================================`);
    console.log(`  CMDS — Sistema de Control de Licencias Microsoft 365`);
    console.log(`  Servidor activo en: http://localhost:${PORT}`);
    console.log(`====================================================================`);
  });
});
