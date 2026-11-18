import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Download,
  Printer,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { api } from '../api';

export default function ReportesMovimientos() {
  const [movimientos, setMovimientos] = useState<any[]>([]);
  const [resumen, setResumen] = useState({
    total_registros: 0,
    altas: 0,
    bajas: 0,
    ajustes: 0,
    balance_neto: 0
  });
  const [loading, setLoading] = useState(true);

  const [tipoMovimiento, setTipoMovimiento] = useState('');
  const [dominio, setDominio] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;

  const cargarMovimientos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/movimientos', {
        params: {
          tipo_movimiento: tipoMovimiento || undefined,
          dominio: dominio || undefined,
          fecha_desde: fechaDesde || undefined,
          fecha_hasta: fechaHasta || undefined,
          search: search || undefined
        }
      });
      setMovimientos(res.data.movimientos || []);
      setPage(1);
      setResumen(
        res.data.resumen || {
          total_registros: 0,
          altas: 0,
          bajas: 0,
          ajustes: 0,
          balance_neto: 0
        }
      );
    } catch (e) {
      console.error('Error cargando movimientos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarMovimientos();
  }, [tipoMovimiento, dominio, fechaDesde, fechaHasta]);

  const handleExportarExcel = async () => {
    try {
      const res = await api.get('/import-export/exportar-movimientos', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', 'Reporte_Altas_Bajas_Licencias_M365_CMDS.xlsx');
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      alert('Error al descargar el reporte Excel.');
    }
  };

  const totalPages = Math.max(1, Math.ceil(movimientos.length / PAGE_SIZE));
  const movimientosPaginados = movimientos.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#016098]">
            Reportes de Altas y Bajas de Licencias Microsoft 365
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Bitácora histórica y kardex auditable de entregas de licencias (Altas), desvinculaciones (Bajas) y ajustes de stock.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={handleExportarExcel}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#016098]" />
            <span>Exportar Reporte Excel</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* Tarjetas de Resumen del Período Filtrado */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-slate-400">Total Movimientos</span>
            <div className="text-2xl font-black text-slate-800 mt-0.5">{resumen.total_registros}</div>
          </div>
          <ArrowLeftRight className="w-7 h-7 text-[#016098]" />
        </div>

        <div className="bg-emerald-50 p-4 rounded-2xl shadow-sm border border-emerald-200 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-emerald-700">Altas de Licencias (+)</span>
            <div className="text-2xl font-black text-emerald-700 mt-0.5">+{resumen.altas}</div>
          </div>
          <ArrowUpRight className="w-7 h-7 text-emerald-600" />
        </div>

        <div className="bg-rose-50 p-4 rounded-2xl shadow-sm border border-rose-200 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-rose-700">Bajas / Liberaciones (-)</span>
            <div className="text-2xl font-black text-rose-700 mt-0.5">-{resumen.bajas}</div>
          </div>
          <ArrowDownRight className="w-7 h-7 text-rose-600" />
        </div>

        <div className="bg-blue-50 p-4 rounded-2xl shadow-sm border border-blue-200 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase text-[#016098]">Variación Neta Período</span>
            <div className="text-2xl font-black text-[#016098] mt-0.5">
              {resumen.balance_neto >= 0 ? `+${resumen.balance_neto}` : resumen.balance_neto}
            </div>
          </div>
          <Calendar className="w-7 h-7 text-[#016098]" />
        </div>
      </div>

      {/* Filtros de Búsqueda */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-6 gap-3 no-print">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && cargarMovimientos()}
            placeholder="Buscar usuario, correo, motivo, ticket o unidad..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
          />
        </div>

        <select
          value={tipoMovimiento}
          onChange={(e) => setTipoMovimiento(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700"
        >
          <option value="">Tipo: Todos</option>
          <option value="ALTA">Solo ALTAS (+)</option>
          <option value="BAJA">Solo BAJAS (-)</option>
          <option value="AJUSTE_CUPO">Ajustes de Cupo</option>
        </select>

        <select
          value={dominio}
          onChange={(e) => setDominio(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700"
        >
          <option value="">Dominio: Todos</option>
          <option value="cmds.cl">@cmds.cl</option>
          <option value="cmds-salud.cl">@cmds-salud.cl</option>
          <option value="cmds-educacion.cl">@cmds-educacion.cl</option>
        </select>

        <input
          type="date"
          value={fechaDesde}
          onChange={(e) => setFechaDesde(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700"
          title="Fecha Desde"
        />

        <div className="flex gap-2">
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700"
            title="Fecha Hasta"
          />
          <button
            type="button"
            onClick={cargarMovimientos}
            className="px-3 py-2 rounded-xl bg-[#016098] text-white text-xs font-bold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tabla de Bitácora */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 uppercase text-[11px] border-b border-slate-200">
                <th className="py-3 px-4 font-bold">Fecha / Hora</th>
                <th className="py-3 px-4 font-bold">Tipo</th>
                <th className="py-3 px-4 font-bold">Usuario / Correo</th>
                <th className="py-3 px-4 font-bold">Dominio y Licencia</th>
                <th className="py-3 px-4 font-bold">Establecimiento / Unidad</th>
                <th className="py-3 px-4 font-bold">Motivo y Ticket</th>
                <th className="py-3 px-4 font-bold">Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 font-semibold">
                    Cargando bitácora de movimientos...
                  </td>
                </tr>
              ) : movimientosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No existen movimientos registrados para los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                movimientosPaginados.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                      {m.fecha_movimiento ? new Date(m.fecha_movimiento).toLocaleString('es-CL') : ''}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                          m.tipo_movimiento === 'ALTA'
                            ? 'bg-emerald-100 text-emerald-800'
                            : m.tipo_movimiento === 'BAJA'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {m.tipo_movimiento}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-800">{m.usuario_nombre}</div>
                      <div className="font-mono text-[#016098] text-[11px]">{m.usuario_email}</div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-700">{m.licencia_nombre}</div>
                      <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-600 font-semibold">
                        @{m.dominio_nombre}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-medium">{m.establecimiento_nombre}</td>
                    <td className="py-3 px-4">
                      <div className="text-slate-700">{m.motivo}</div>
                      <div className="text-[10px] font-mono text-slate-400">Ref: {m.ticket_referencia}</div>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">{m.ejecutado_por}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs no-print">
            <span className="text-slate-600 font-medium">
              Mostrando registros <strong>{(page - 1) * PAGE_SIZE + 1}</strong> al{' '}
              <strong>{Math.min(page * PAGE_SIZE, movimientos.length)}</strong> de{' '}
              <strong>{movimientos.length.toLocaleString('es-CL')}</strong>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold text-slate-700 cursor-pointer"
              >
                ← Anterior
              </button>
              <span className="px-2 font-bold text-[#016098]">
                Página {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 font-bold text-slate-700 cursor-pointer"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
