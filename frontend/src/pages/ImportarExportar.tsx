import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Eye,
  RefreshCw,
  ShieldCheck,
  Clock,
  Activity,
  KeyRound
} from 'lucide-react';
import { api, UserSession } from '../api';

export default function ImportarExportar() {
  const { user } = useOutletContext<{ user: UserSession }>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState('');

  // Estado Sincronización Automática Microsoft 365 (Graph API)
  const [syncConfig, setSyncConfig] = useState<any>({
    tenant_id: '95f4d8b5-b14f-45b1-9463-f6dff68ff1c6',
    client_id: '791d04cf-ce04-4eb7-b572-e6f6e55e6b94',
    thumbprint_sha1: '5F3D7A8FEEA58304DF808791086D82C789558BE6',
    has_certificate: true,
    auto_sync_enabled: true,
    interval_minutes: 15,
    last_sync_at: null,
    last_sync_status: 'PENDIENTE',
    last_sync_summary: ''
  });
  const [syncHistory, setSyncHistory] = useState<any[]>([]);
  const [testingGraph, setTestingGraph] = useState(false);
  const [syncingGraph, setSyncingGraph] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [graphFeedback, setGraphFeedback] = useState<{ type: 'ok' | 'err'; text: string; details?: any } | null>(null);

  const isReadOnly = user?.rol_acceso === 'VISUALIZADOR';
  const isSystemAdmin = user?.rol_acceso === 'ADMIN_SISTEMA';

  const cargarEstadoSync = async () => {
    try {
      const res = await api.get('/m365-sync/status');
      if (res.data.config) setSyncConfig(res.data.config);
      if (res.data.historial) setSyncHistory(res.data.historial);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    cargarEstadoSync();
  }, []);

  const descargarArchivo = async (endpoint: string, filename: string) => {
    try {
      const res = await api.get(endpoint, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', filename);
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      setError('Error al descargar el archivo solicitado.');
    }
  };

  const handleTestGraph = async () => {
    setTestingGraph(true);
    setGraphFeedback(null);
    try {
      const res = await api.post('/m365-sync/test');
      setGraphFeedback({
        type: 'ok',
        text: `Conexión exitosa con Microsoft 365 (${res.data.organizationName}) — Dominios verificados: ${(res.data.verifiedDomains || []).join(', ')}`,
        details: res.data
      });
    } catch (err: any) {
      setGraphFeedback({
        type: 'err',
        text: err.response?.data?.error || 'Error probando conexión con Microsoft Graph.'
      });
    } finally {
      setTestingGraph(false);
    }
  };

  const handleRunSyncNow = async () => {
    setSyncingGraph(true);
    setGraphFeedback(null);
    try {
      const res = await api.post('/m365-sync/run');
      setGraphFeedback({
        type: 'ok',
        text: res.data.message || 'Sincronización con Microsoft 365 completada exitosamente.'
      });
      await cargarEstadoSync();
    } catch (err: any) {
      setGraphFeedback({
        type: 'err',
        text: err.response?.data?.error || 'Error ejecutando la sincronización con Microsoft 365.'
      });
      await cargarEstadoSync();
    } finally {
      setSyncingGraph(false);
    }
  };

  const handleSaveSyncConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setGraphFeedback(null);
    try {
      const res = await api.post('/m365-sync/config', {
        tenant_id: syncConfig.tenant_id,
        client_id: syncConfig.client_id,
        auto_sync_enabled: syncConfig.auto_sync_enabled,
        interval_minutes: Number(syncConfig.interval_minutes)
      });
      setGraphFeedback({
        type: 'ok',
        text: res.data.message
      });
      await cargarEstadoSync();
    } catch (err: any) {
      setGraphFeedback({
        type: 'err',
        text: err.response?.data?.error || 'Error guardando configuración.'
      });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setUploading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('archivo', selectedFile);
      const res = await api.post('/import-export/usuarios', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setResult(res.data);
      setSelectedFile(null);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error procesando el archivo de carga masiva.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-2xl font-extrabold text-[#016098]">
          Sincronización Automática Microsoft 365 y Carga Masiva
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Conexión directa vía <strong>Microsoft Graph API (Entra ID)</strong> con <code>admin.cloud.microsoft</code> para alimentar automáticamente altas, bajas y alias, además de importación/exportación Excel.
        </p>
      </div>

      {/* PANEL 1: CONECTOR AUTOMÁTICO MICROSOFT 365 (GRAPH API / ENTRA ID) */}
      <div className="bg-white rounded-2xl shadow-sm border-2 border-[#016098]/25 overflow-hidden">
        <div className="bg-[#016098] text-white px-6 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-white/15 text-white mb-1">
              <ShieldCheck className="w-3.5 h-3.5 text-[#39BABD]" />
              <span>Conexión Oficial Microsoft Graph API v1.0 (Certificado X.509 RSA-2048)</span>
            </div>
            <h2 className="text-lg font-extrabold text-white">
              Sincronización Automática con Centro de Administración Microsoft 365
            </h2>
            <p className="text-xs text-blue-100">
              Detecta automáticamente nuevas asignaciones de licencias, revocaciones, cuentas nuevas y alias de migración desde <code>admin.cloud.microsoft</code>.
            </p>
          </div>

          {!isReadOnly && (
            <div className="flex flex-wrap items-center gap-2">
              {isSystemAdmin && (
                <button
                  type="button"
                  onClick={() =>
                    descargarArchivo('/m365-sync/certificado', 'CMDS_M365_Graph_Certificado.cer')
                  }
                  className="px-3.5 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold flex items-center gap-1.5 border border-white/25 cursor-pointer"
                  title="Descargar archivo .cer para cargar en Microsoft Entra ID -> Certificados"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Descargar Certificado .cer</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleTestGraph}
                disabled={testingGraph || syncingGraph}
                className="px-3.5 py-2 rounded-xl bg-white text-[#016098] hover:bg-blue-50 text-xs font-extrabold flex items-center gap-1.5 shadow cursor-pointer"
              >
                <Activity className={`w-3.5 h-3.5 ${testingGraph ? 'animate-spin' : ''}`} />
                <span>{testingGraph ? 'Probando...' : 'Probar Conexión'}</span>
              </button>

              <button
                type="button"
                onClick={handleRunSyncNow}
                disabled={syncingGraph || testingGraph}
                className="px-4 py-2 rounded-xl bg-[#39BABD] hover:bg-teal-500 text-white text-xs font-extrabold flex items-center gap-1.5 shadow cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingGraph ? 'animate-spin' : ''}`} />
                <span>{syncingGraph ? 'Sincronizando Tenant...' : 'Sincronizar Ahora con M365'}</span>
              </button>
            </div>
          )}
        </div>

        <div className="p-6 space-y-5">
          {graphFeedback && (
            <div
              className={`p-4 rounded-xl text-xs font-bold border flex flex-col gap-2 ${
                graphFeedback.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <div className="flex items-center gap-2">
                {graphFeedback.type === 'ok' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{graphFeedback.text}</span>
              </div>

              {graphFeedback.details?.skus && (
                <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {graphFeedback.details.skus.map((s: any) => (
                    <div
                      key={s.skuId}
                      className="bg-white p-2.5 rounded-lg border border-emerald-200 flex items-center justify-between text-[11px]"
                    >
                      <span className="font-mono font-bold text-[#016098]">{s.skuPartNumber}</span>
                      <span className="text-slate-600">
                        Usadas: <strong>{s.consumed}</strong> / {s.enabled}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Formulario de Credenciales Entra ID y Frecuencia Automática */}
          <form onSubmit={handleSaveSyncConfig} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Id. de Directorio (Tenant ID)
              </label>
              <input
                type="text"
                value={syncConfig.tenant_id}
                onChange={(e) => setSyncConfig({ ...syncConfig, tenant_id: e.target.value })}
                disabled={!isSystemAdmin}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Id. de Aplicación (Client ID)
              </label>
              <input
                type="text"
                value={syncConfig.client_id}
                onChange={(e) => setSyncConfig({ ...syncConfig, client_id: e.target.value })}
                disabled={!isSystemAdmin}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono bg-slate-50"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                Huella Certificado X.509 (Thumbprint)
              </label>
              <input
                type="text"
                readOnly
                value={syncConfig.thumbprint_sha1 || '5F3D7A8FEEA58304DF808791086D82C789558BE6'}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-[11px] font-mono bg-slate-100 text-slate-600"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="block text-[11px] font-bold uppercase text-slate-600 mb-1">
                  Frecuencia Automática
                </label>
                <select
                  value={syncConfig.interval_minutes}
                  onChange={(e) =>
                    setSyncConfig({ ...syncConfig, interval_minutes: Number(e.target.value) })
                  }
                  disabled={!isSystemAdmin}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                >
                  <option value={10}>Cada 10 minutos</option>
                  <option value={15}>Cada 15 minutos</option>
                  <option value={30}>Cada 30 minutos</option>
                  <option value={60}>Cada 60 minutos</option>
                </select>
              </div>

              {isSystemAdmin && (
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-4 py-2 rounded-xl bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
                >
                  {savingConfig ? '...' : 'Guardar'}
                </button>
              )}
            </div>
          </form>

          {/* Estado de última sincronización */}
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#016098]" />
              <span className="font-bold text-slate-700">Última Sincronización:</span>
              <span className="text-slate-600">
                {syncConfig.last_sync_at
                  ? new Date(syncConfig.last_sync_at).toLocaleString('es-CL')
                  : 'Pendiente de primera sincronización'}
              </span>
            </div>
            {syncConfig.last_sync_summary && (
              <div className="text-[11px] font-semibold text-slate-600">
                {syncConfig.last_sync_summary}
              </div>
            )}
          </div>

          {/* Historial de Sincronizaciones Automáticas */}
          {syncHistory.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-100 text-[11px] font-extrabold uppercase text-slate-600">
                Bitácora Reciente de Sincronización con Microsoft 365
              </div>
              <div className="overflow-x-auto max-h-48">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 text-[11px] border-b border-slate-200">
                      <th className="py-2 px-3">Fecha / Hora</th>
                      <th className="py-2 px-3">Origen</th>
                      <th className="py-2 px-3">Estado</th>
                      <th className="py-2 px-3 text-center">Usuarios M365</th>
                      <th className="py-2 px-3 text-center">Altas Detectadas</th>
                      <th className="py-2 px-3 text-center">Bajas Detectadas</th>
                      <th className="py-2 px-3">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {syncHistory.map((h) => (
                      <tr key={h.id} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-mono text-[11px]">
                          {h.fecha ? new Date(h.fecha).toLocaleString('es-CL') : ''}
                        </td>
                        <td className="py-2 px-3 font-bold text-[#016098]">{h.origen}</td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              h.estado === 'OK'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {h.estado}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center font-bold">{h.total_usuarios_graph}</td>
                        <td className="py-2 px-3 text-center font-bold text-emerald-700">
                          +{h.altas_licencia}
                        </td>
                        <td className="py-2 px-3 text-center font-bold text-rose-700">
                          -{h.bajas_licencia}
                        </td>
                        <td className="py-2 px-3 text-[11px] text-slate-600">{h.detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tarjetas de Descarga de Informes y Plantilla */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#016098] flex items-center justify-center mb-3">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800">
              1. Plantilla Oficial de Carga CMDS (.xlsx)
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Incluye la hoja de carga de usuarios junto con el catálogo de códigos SKU de licencias y los 89 Establecimientos de CMDS.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              descargarArchivo(
                '/import-export/plantilla',
                'Plantilla_Carga_Licencias_M365_CMDS.xlsx'
              )
            }
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold flex items-center justify-center gap-2 shadow cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Descargar Plantilla Oficial</span>
          </button>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center mb-3">
              <Download className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800">
              2. Exportar Nómina Completa de Usuarios M365
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Descarga en formato Excel (`.xlsx`) todos los usuarios registrados, su dominio, establecimiento y licencias activas.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              descargarArchivo(
                '/import-export/exportar-usuarios',
                'Nomina_Usuarios_Licencias_M365_CMDS.xlsx'
              )
            }
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-[#39BABD] hover:bg-teal-600 text-white text-xs font-bold flex items-center justify-center gap-2 shadow cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Nómina de Usuarios</span>
          </button>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div>
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center mb-3">
              <Download className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800">
              3. Exportar Reporte Histórico de Altas y Bajas
            </h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Descarga la bitácora completa de movimientos (Altas, Bajas y Ajustes) con fecha, motivo, ticket y operador.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              descargarArchivo(
                '/import-export/exportar-movimientos',
                'Reporte_Altas_Bajas_Licencias_M365_CMDS.xlsx'
              )
            }
            className="mt-4 w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center justify-center gap-2 shadow cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Exportar Bitácora Altas/Bajas</span>
          </button>
        </div>
      </div>

      {/* Área de Carga Masiva Manual Excel / CSV */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-base font-extrabold text-[#016098] mb-1">
          Importar Archivo Masivo de Usuarios y Licencias (.xlsx / .csv)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          El motor de carga reconoce automáticamente <strong>3 formatos oficiales</strong>: (1) Plantilla Oficial CMDS, (2) Exportación de Microsoft 365 Admin Center, y (3) Planilla Formulario Correos Salud.
        </p>

        {isReadOnly ? (
          <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-3">
            <Eye className="w-5 h-5 text-amber-600 shrink-0" />
            <span>
              Su cuenta tiene perfil de <strong>Solo Visualización</strong>. Usted puede descargar todas las nóminas y reportes en Excel, pero la carga masiva de registros está reservada para perfiles Gestor o Administrador.
            </span>
          </div>
        ) : (
          <form onSubmit={handleUpload} className="space-y-4">
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-300 rounded-2xl p-8 bg-blue-50/40 hover:bg-blue-50/80 transition cursor-pointer">
              <Upload className="w-8 h-8 text-[#016098] mb-2" />
              <span className="text-sm font-bold text-[#016098]">
                {selectedFile
                  ? `Archivo seleccionado: ${selectedFile.name}`
                  : 'Haga clic aquí para seleccionar su archivo Excel (.xlsx) o CSV (.csv)'}
              </span>
              <span className="text-xs text-slate-500 mt-1">
                Soporta la Plantilla Oficial CMDS o archivos exportados desde Microsoft 365 Admin Center
              </span>
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                className="hidden"
              />
            </label>

            {error && (
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {result && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-2">
                <div className="font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>{result.message}</span>
                </div>
                {result.resumen?.errores?.length > 0 && (
                  <div className="bg-white p-3 rounded-lg border border-emerald-200 max-h-40 overflow-y-auto text-[11px] text-slate-600 space-y-1">
                    <div className="font-bold text-slate-700">Detalle de observaciones en filas omitidas:</div>
                    {result.resumen.errores.map((errLine: string, i: number) => (
                      <div key={i}>• {errLine}</div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!selectedFile || uploading}
                className={`px-6 py-2.5 rounded-xl bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer ${
                  !selectedFile || uploading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {uploading ? 'Procesando archivo...' : 'Procesar e Importar Usuarios'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
