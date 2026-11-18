import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import {
  FileSpreadsheet,
  Upload,
  Download,
  CheckCircle2,
  AlertTriangle,
  Eye
} from 'lucide-react';
import { api, UserSession } from '../api';

export default function ImportarExportar() {
  const { user } = useOutletContext<{ user: UserSession }>();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [error, setError] = useState('');

  const isReadOnly = user?.rol_acceso === 'VISUALIZADOR';

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
          Carga Masiva e Informes Excel / CSV Microsoft 365
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Importación masiva de usuarios y licencias (compatible con la plantilla oficial CMDS y exportaciones de Microsoft 365 Admin Center) y descarga de reportes consolidados.
        </p>
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

      {/* Área de Carga Masiva */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h3 className="text-base font-extrabold text-[#016098] mb-1">
          Importar Archivo Masivo de Usuarios y Licencias (.xlsx / .csv)
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          El motor de carga reconoce automáticamente <strong>3 formatos oficiales</strong>: (1) Plantilla Oficial CMDS, (2) Exportación de Microsoft 365 Admin Center (ej. <code>CMDS-EDUCACION.xlsx</code> con mapeo automático A1→A3 Faculty/Student y códigos de escuela), y (3) Planilla Formulario Correos Salud (ej. <code>formulario correos editado.xlsx</code> con normalización automática a <code>@cmds-salud.cl</code> y CESFAMs).
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
