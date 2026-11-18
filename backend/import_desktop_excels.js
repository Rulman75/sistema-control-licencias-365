const XLSX = require('xlsx');
const path = require('path');
const {
  initDatabase,
  getPool,
  isPgAvailable,
  getFullState,
  readLocalStore,
  writeLocalStore,
  INITIAL_ESTABLECIMIENTOS
} = require('./db');
const { parseWorkbookToNormalizedUsers, bulkImportNormalizedUsers } = require('./excelParser');

async function main() {
  await initDatabase();
  const pool = getPool();
  const isPg = isPgAvailable();

  console.log('1. Sincronizando catálogo ampliado de establecimientos CMDS...');
  if (isPg && pool) {
    for (const est of INITIAL_ESTABLECIMIENTOS) {
      await pool.query(
        `INSERT INTO establecimientos (codigo_unidad, cenco, nombre, sector, dominio_sugerido)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (codigo_unidad) DO UPDATE SET
           cenco = EXCLUDED.cenco,
           nombre = EXCLUDED.nombre,
           sector = EXCLUDED.sector,
           dominio_sugerido = EXCLUDED.dominio_sugerido`,
        [est.codigo_unidad, est.cenco, est.nombre, est.sector, est.dominio_sugerido]
      );
    }

    console.log('2. Limpiando los 23 usuarios y movimientos de prueba en PostgreSQL...');
    await pool.query('TRUNCATE TABLE movimientos_licencia, asignaciones_licencia, usuarios_m365 RESTART IDENTITY CASCADE');
  }

  let state = await getFullState();
  console.log('   Establecimientos disponibles en BD:', state.establecimientos.length);

  const desktop = 'C:/Users/rhormazabal/Desktop';

  // 3. Procesar CMDS-EDUCACION.xlsx
  console.log('\n3. Procesando CMDS-EDUCACION.xlsx...');
  const wbEdu = XLSX.readFile(path.join(desktop, 'CMDS-EDUCACION.xlsx'));
  const parsedEdu = parseWorkbookToNormalizedUsers(XLSX, wbEdu, state);
  console.log(`   -> Filas normalizadas Educación: ${parsedEdu.registrosNormalizados.length} (omitidas: ${parsedEdu.omitidos})`);

  const resEdu = await bulkImportNormalizedUsers({
    registrosNormalizados: parsedEdu.registrosNormalizados,
    state,
    pool,
    isPg,
    readLocalStore,
    writeLocalStore,
    operatorUsername: 'rhormazabal@cmds.cl'
  });
  console.log(`   -> Insertados Educación: ${resEdu.creados} usuarios | ${resEdu.asignados} licencias A3 asignadas`);

  // Refrescar estado para importar Salud
  state = await getFullState();

  // 4. Procesar formulario correos editado.xlsx
  console.log('\n4. Procesando formulario correos editado.xlsx (Salud -> @cmds-salud.cl)...');
  const wbSalud = XLSX.readFile(path.join(desktop, 'formulario correos editado.xlsx'));
  const parsedSalud = parseWorkbookToNormalizedUsers(XLSX, wbSalud, state);
  console.log(`   -> Cuentas únicas normalizadas Salud (@cmds-salud.cl): ${parsedSalud.registrosNormalizados.length} (consolidadas de 1.290 filas del formulario)`);

  const resSalud = await bulkImportNormalizedUsers({
    registrosNormalizados: parsedSalud.registrosNormalizados,
    state,
    pool,
    isPg,
    readLocalStore,
    writeLocalStore,
    operatorUsername: 'rhormazabal@cmds.cl'
  });
  console.log(`   -> Insertados Salud: ${resSalud.creados} usuarios activos en @cmds-salud.cl | ${resSalud.asignados} licencias asignadas`);

  // 5. Sincronizar estado final a store.json local y mostrar resumen
  const finalState = await getFullState();
  writeLocalStore(finalState);

  console.log('\n======================================================');
  console.log('RESUMEN FINAL EN BASE DE DATOS POSTGRESQL (bd_licencias_365):');
  console.log('Total Usuarios M365:', finalState.usuarios_m365.length);
  console.log('Total Licencias Activas:', finalState.asignaciones_licencia.filter(a => a.estado === 'ACTIVA').length);
  console.log('Total Movimientos Registrados:', finalState.movimientos_licencia.length);
  for (const c of finalState.cupos_licencia) {
    const dom = finalState.dominios.find(d => d.id === c.dominio_id);
    const tipo = finalState.tipos_licencia.find(t => t.id === c.tipo_licencia_id);
    const asig = finalState.asignaciones_licencia.filter(a => a.cupo_licencia_id === c.id && a.estado === 'ACTIVA').length;
    console.log(`  - [${dom.dominio}] ${tipo.nombre}: ${asig} asignadas / ${c.total_licencias} contratadas (${c.total_licencias - asig} disponibles)`);
  }
  console.log('======================================================');
  process.exit(0);
}

main().catch(err => {
  console.error('Error en importación:', err);
  process.exit(1);
});
