import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import {
  KeyRound,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  Globe,
  Printer,
  RefreshCw,
  GraduationCap,
  Briefcase
} from 'lucide-react';
import { api } from '../api';

export default function Dashboard() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filtroDominio, setFiltroDominio] = useState<string>('TODOS');
  const [incluirEstudiantesGrafico, setIncluirEstudiantesGrafico] = useState(false);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get('/dashboard');
      setData(res.data);
    } catch (e) {
      console.error('Error cargando dashboard:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading || !data) {
    return (
      <div className="p-12 text-center">
        <div className="w-10 h-10 border-4 border-[#016098] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm font-semibold text-[#016098]">Cargando métricas del Tenant Microsoft 365 CMDS...</p>
      </div>
    );
  }

  const func = data.kpis.funcionarios;
  const estu = data.kpis.estudiantes;

  const dominiosFiltrados = (data.resumenPorDominio || []).filter((d: any) =>
    filtroDominio === 'TODOS' ? true : d.dominio === filtroDominio
  );

  const poolsParaGrafico = (data.pools || [])
    .filter((p: any) => (incluirEstudiantesGrafico ? true : p.categoria === 'FUNCIONARIO'))
    .filter((p: any) => (filtroDominio === 'TODOS' ? true : p.dominio === filtroDominio))
    .map((p: any) => ({
      name: `${p.codigo_sku.replace('O365_', '').replace('M365_', '')} (${p.dominio.replace('cmds-', '').replace('.cl', '')})`,
      nombreCompleto: `${p.licencia_nombre} — @${p.dominio}`,
      Total: p.total_licencias,
      Asignadas: p.licencias_asignadas,
      Disponibles: p.licencias_disponibles,
      color: p.color_hex
    }));

  const pieData = (data.resumenPorTipoLicencia || [])
    .filter((t: any) => (incluirEstudiantesGrafico ? true : t.categoria === 'FUNCIONARIO'))
    .map((t: any) => ({
      name: t.nombre,
      value: t.total_licencias,
      asignadas: t.licencias_asignadas,
      color: t.color_hex
    }));

  return (
    <div className="space-y-6">
      {/* Cabecera Ejecutiva */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#016098]/10 text-[#016098]">
              Tenant Único Microsoft 365
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#39BABD]/15 text-teal-800">
              3 Dominios Oficiales
            </span>
          </div>
          <h1 className="text-2xl font-extrabold text-[#016098] mt-1">
            Dashboard de Licenciamiento Microsoft 365 — CMDS
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Control consolidado por dominio (<strong>cmds.cl</strong>, <strong>cmds-salud.cl</strong>,{' '}
            <strong>cmds-educacion.cl</strong>), tipo de licencia, establecimientos y flujo de altas/bajas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 no-print">
          <button
            type="button"
            onClick={fetchDashboard}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
            title="Actualizar contadores"
          >
            <RefreshCw className="w-3.5 h-3.5 text-[#016098]" />
            <span>Actualizar</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-white" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* 4 Tarjetas Superiores Limpias y Directas (Sin duplicar datos ni textos amarillos) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tarjeta 1: Licencias Funcionarios y Docentes (7.500) */}
        <div className="bg-[#016098] text-white p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-white/90">
              1. Licencias Funcionarios
            </span>
            <Briefcase className="w-5 h-5 text-white" />
          </div>

          <div className="my-3">
            <div className="text-3xl font-black text-white">
              {func.total.toLocaleString('es-CL')}
              <span className="text-xs font-medium text-blue-100 ml-1.5">contratadas</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-white/15 text-xs">
              <div>
                <div className="text-[10px] uppercase text-blue-100 font-semibold">Asignadas</div>
                <div className="text-lg font-extrabold text-white">
                  {func.asignadas.toLocaleString('es-CL')}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-blue-100 font-semibold">Disponibles</div>
                <div className="text-lg font-extrabold text-white">
                  {func.disponibles.toLocaleString('es-CL')}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="w-full bg-white/20 h-2 rounded-full overflow-hidden">
              <div
                className="bg-white h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(2, func.porcentaje_uso))}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-blue-100 mt-1.5 font-medium">
              <span>Ocupación: {func.porcentaje_uso}%</span>
              <span>Admin + Salud + Docentes</span>
            </div>
          </div>
        </div>

        {/* Tarjeta 2: Licencias Estudiantes (200.000) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Licencias Estudiantes A3
            </span>
            <GraduationCap className="w-5 h-5 text-[#016098]" />
          </div>

          <div className="my-3">
            <div className="text-3xl font-black text-slate-800">
              {estu.total.toLocaleString('es-CL')}
              <span className="text-xs font-medium text-slate-400 ml-1.5">contratadas</span>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100 text-xs">
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-bold">Asignadas</div>
                <div className="text-lg font-extrabold text-[#016098]">
                  {estu.asignadas.toLocaleString('es-CL')}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-400 font-bold">Disponibles</div>
                <div className="text-lg font-extrabold text-emerald-600">
                  {estu.disponibles.toLocaleString('es-CL')}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#39BABD] h-full rounded-full"
                style={{ width: `${Math.min(100, Math.max(2, estu.porcentaje_uso))}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-slate-500 mt-1.5 font-medium">
              <span>Ocupación: {estu.porcentaje_uso}%</span>
              <span>Dominio @cmds-educacion.cl</span>
            </div>
          </div>
        </div>

        {/* Tarjeta 3: Usuarios Registrados por Dominio */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              3. Cuentas Registradas
            </span>
            <Users className="w-5 h-5 text-[#016098]" />
          </div>

          <div className="my-3">
            <div className="text-3xl font-black text-slate-800">
              {data.kpis.usuarios.activos.toLocaleString('es-CL')}
              <span className="text-xs font-medium text-slate-400 ml-1.5">cuentas activas</span>
            </div>
            <div className="space-y-1.5 mt-3 pt-3 border-t border-slate-100 text-xs">
              {(data.resumenPorDominio || []).map((d: any) => (
                <div key={d.id} className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">@{d.dominio}</span>
                  <span className="font-extrabold text-slate-800">
                    {d.usuarios_activos.toLocaleString('es-CL')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span>En baja: {data.kpis.usuarios.bajas}</span>
            <Link to="/usuarios" className="text-[#016098] font-bold hover:underline">
              Ir a nómina &rarr;
            </Link>
          </div>
        </div>

        {/* Tarjeta 4: Movimientos (Altas y Bajas) */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              4. Reporte Altas y Bajas
            </span>
            <Building2 className="w-5 h-5 text-[#016098]" />
          </div>

          <div className="grid grid-cols-2 gap-2.5 my-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-emerald-700">
                <ArrowUpRight className="w-3.5 h-3.5" /> Altas
              </div>
              <div className="text-2xl font-black text-emerald-700 mt-0.5">
                {data.kpis.movimientos.altas.toLocaleString('es-CL')}
              </div>
            </div>
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase text-rose-700">
                <ArrowDownRight className="w-3.5 h-3.5" /> Bajas
              </div>
              <div className="text-2xl font-black text-rose-700 mt-0.5">
                {data.kpis.movimientos.bajas.toLocaleString('es-CL')}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">
              Balance neto: <strong className="text-slate-800">+{data.kpis.movimientos.neto.toLocaleString('es-CL')}</strong>
            </span>
            <Link to="/movimientos" className="text-[#016098] font-bold hover:underline">
              Ver bitácora &rarr;
            </Link>
          </div>
        </div>
      </div>

      {/* Filtro rápido por Dominio del Tenant */}
      <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-2 no-print">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600 px-2">
          <Globe className="w-4 h-4 text-[#016098]" />
          <span>Filtrar vista por Dominio:</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['TODOS', 'cmds.cl', 'cmds-salud.cl', 'cmds-educacion.cl'].map((dom) => (
            <button
              key={dom}
              type="button"
              onClick={() => setFiltroDominio(dom)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                filtroDominio === dom
                  ? 'bg-[#016098] text-white shadow'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {dom === 'TODOS' ? 'Todos los Dominios (3)' : `@${dom}`}
            </button>
          ))}
        </div>
      </div>

      {/* Tarjetas de Control por Dominio y sus Pools de Licencias */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {dominiosFiltrados.map((dom: any) => {
          const domHeaderColor =
            dom.dominio === 'cmds-salud.cl'
              ? '#0f766e'
              : dom.dominio === 'cmds-educacion.cl'
              ? '#3730a3'
              : '#016098';
          return (
            <div
              key={dom.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between"
            >
              <div>
                <div
                  className="text-white px-5 py-4 flex items-center justify-between"
                  style={{ backgroundColor: domHeaderColor }}
                >
                  <div>
                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-white/20 text-white">
                      Sector {dom.sector}
                    </span>
                    <h3 className="text-lg font-extrabold mt-1 text-white">@{dom.dominio}</h3>
                    <p className="text-[11px] text-white/80">{dom.nombre}</p>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-white/80">Usuarios Activos</div>
                    <div className="text-2xl font-black text-white">
                      {dom.usuarios_activos.toLocaleString('es-CL')}
                    </div>
                  </div>
                </div>

                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Contratadas</div>
                      <div className="text-sm font-black text-slate-800">
                        {dom.total_licencias.toLocaleString('es-CL')}
                      </div>
                    </div>
                    <div className="border-x border-slate-200">
                      <div className="text-[10px] uppercase font-bold text-slate-400">Asignadas</div>
                      <div className="text-sm font-black" style={{ color: domHeaderColor }}>
                        {dom.licencias_asignadas.toLocaleString('es-CL')}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-bold text-slate-400">Disponibles</div>
                      <div className="text-sm font-black text-emerald-600">
                        {dom.licencias_disponibles.toLocaleString('es-CL')}
                      </div>
                    </div>
                  </div>

                  {/* Desglose de cada tipo de licencia dentro de este dominio */}
                  <div className="space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Tipos de Licencia en @{dom.dominio}
                    </div>
                    {dom.pools.map((pool: any) => (
                      <div
                        key={pool.id}
                        className="p-3 rounded-xl border border-slate-200 bg-white hover:border-[#016098]/40 transition space-y-2"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5">
                              <span
                                className="w-2.5 h-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: pool.color_hex }}
                              />
                              <span>{pool.licencia_nombre}</span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                                {pool.codigo_sku}
                              </span>
                              {!pool.incluye_teams && (
                                <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                                  Sin Teams
                                </span>
                              )}
                              {pool.categoria === 'ESTUDIANTE' && (
                                <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                                  Estudiantes
                                </span>
                              )}
                            </div>
                          </div>
                          <span
                            className="text-xs font-black px-2 py-0.5 rounded shrink-0"
                            style={{ color: domHeaderColor, backgroundColor: `${domHeaderColor}14` }}
                          >
                            {pool.total_licencias.toLocaleString('es-CL')} total
                          </span>
                        </div>

                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, Math.max(pool.licencias_asignadas > 0 ? 3 : 0, pool.porcentaje_uso))}%`,
                              backgroundColor: pool.color_hex
                            }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-600">
                            Asignadas: <strong className="text-slate-900">{pool.licencias_asignadas.toLocaleString('es-CL')}</strong>
                          </span>
                          <span className="text-emerald-700 font-bold">
                            Disponibles: {pool.licencias_disponibles.toLocaleString('es-CL')}
                          </span>
                        </div>
                        {pool.licencias_asignadas > 0 && (
                          <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-slate-100 text-slate-500">
                            <span>
                              👤 Personas: <strong className="text-slate-700">{(pool.asignadas_personas || 0).toLocaleString('es-CL')}</strong>
                              {pool.asignadas_estudiantes > 0 ? ` (${pool.asignadas_estudiantes.toLocaleString('es-CL')} alumnos)` : ''}
                            </span>
                            <span className="text-violet-700 font-semibold">
                              🖥️ Máquinas: {(pool.asignadas_maquinas || 0).toLocaleString('es-CL')}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200/80 flex items-center justify-between text-xs no-print">
                <Link
                  to={`/usuarios?dominio_id=${dom.id}`}
                  className="font-bold hover:underline"
                  style={{ color: domHeaderColor }}
                >
                  Ver usuarios de @{dom.dominio} &rarr;
                </Link>
                <Link to="/licencias" className="text-slate-500 hover:text-slate-800 font-semibold">
                  Detalle cupos
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      {/* Gráficos Analíticos: Por Pool y por Tipo de Licencia */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">
                Capacidad Contratada vs Licencias Asignadas por Pool
              </h3>
              <p className="text-xs text-slate-500">
                Comparativa de licencias contratadas, asignadas y disponibles
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIncluirEstudiantesGrafico(!incluirEstudiantesGrafico)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer no-print"
            >
              {incluirEstudiantesGrafico
                ? 'Ver escala solo Funcionarios (7.500)'
                : 'Incluir Pool Estudiantes (200.000) en gráfico'}
            </button>
          </div>

          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={poolsParaGrafico} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: any) => Number(value).toLocaleString('es-CL')}
                  labelFormatter={(label, payload) =>
                    payload && payload[0] ? payload[0].payload.nombreCompleto : label
                  }
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Total" name="Total Contratado" fill="#016098" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Disponibles" name="Disponibles" fill="#39BABD" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Asignadas" name="Asignadas" fill="#6366f1" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
          <h3 className="text-sm font-extrabold text-slate-800 mb-1">
            Distribución por Tipo de Licencia
          </h3>
          <p className="text-xs text-slate-500 mb-4">
            Proporción de cupos según familia de licencia Microsoft 365
          </p>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={82}
                  paddingAngle={3}
                >
                  {pieData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: any) => `${Number(value).toLocaleString('es-CL')} licencias`} />
                <Legend wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Tabla Maestra Consolidada por Tipo de Licencia */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-[#016098]">
              Resumen Oficial de Licenciamiento Microsoft 365 por Familia y Dominio
            </h3>
            <p className="text-xs text-slate-500">
              Consolidado de las 5 familias de licencias y su distribución en los 3 dominios del Tenant CMDS
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-600 uppercase text-[11px] border-b border-slate-200">
                <th className="py-3 px-4 font-bold">Tipo de Licencia Microsoft 365</th>
                <th className="py-3 px-4 font-bold">Categoría</th>
                <th className="py-3 px-4 font-bold">Distribución por Dominio</th>
                <th className="py-3 px-4 font-bold text-right">Total Contratado</th>
                <th className="py-3 px-4 font-bold text-right">Asignadas</th>
                <th className="py-3 px-4 font-bold text-right">Disponibles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.resumenPorTipoLicencia || []).map((t: any) => (
                <tr key={t.id} className="hover:bg-slate-50/80">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800 flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color_hex }} />
                      <span>{t.nombre}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{t.incluye_apps}</div>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        t.categoria === 'ESTUDIANTE'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-blue-100 text-[#016098]'
                      }`}
                    >
                      {t.categoria}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1.5">
                      {t.dominios_asociados.map((da: any, idx: number) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-semibold text-slate-700"
                        >
                          <strong>@{da.dominio}:</strong> {da.total.toLocaleString('es-CL')} ({da.asignadas.toLocaleString('es-CL')} en uso)
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-extrabold text-slate-800">
                    {t.total_licencias.toLocaleString('es-CL')}
                  </td>
                  <td className="py-3 px-4 text-right font-extrabold text-[#016098]">
                    {t.licencias_asignadas.toLocaleString('es-CL')}
                  </td>
                  <td className="py-3 px-4 text-right font-extrabold text-emerald-600">
                    {t.licencias_disponibles.toLocaleString('es-CL')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sección Inferior: Establecimientos con Mayor Uso + Últimos Movimientos (Altas y Bajas) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Establecimientos */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">
                Licencias Activas por Establecimiento / Unidad CMDS
              </h3>
              <p className="text-xs text-slate-500">Unidades con cuentas activas registradas</p>
            </div>
            <Link to="/usuarios" className="text-xs font-bold text-[#016098] hover:underline no-print">
              Ver todos &rarr;
            </Link>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {(data.rankingEstablecimientos || []).slice(0, 10).map((est: any) => (
              <div key={est.id} className="px-5 py-3 flex items-center justify-between hover:bg-slate-50">
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    {est.codigo_unidad ? `[#${est.codigo_unidad}] ` : ''}
                    {est.nombre}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Sector: {est.sector} · Dominio: @{est.dominio_sugerido}
                  </div>
                </div>
                <div className="text-right">
                  <span className="px-2.5 py-1 rounded-full bg-blue-50 text-[#016098] font-extrabold text-xs">
                    {est.licencias_activas.toLocaleString('es-CL')} lic.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Últimas Altas y Bajas */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-800">
                Últimos Reportes de Altas y Bajas
              </h3>
              <p className="text-xs text-slate-500">Trazabilidad en tiempo real de entregas y revocaciones</p>
            </div>
            <Link to="/movimientos" className="text-xs font-bold text-[#016098] hover:underline no-print">
              Reporte completo &rarr;
            </Link>
          </div>
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {(data.ultimosMovimientos || []).map((m: any) => (
              <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50">
                <div className="flex items-start gap-2.5 min-w-0">
                  <span
                    className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-extrabold shrink-0 ${
                      m.tipo_movimiento === 'ALTA'
                        ? 'bg-emerald-100 text-emerald-800'
                        : m.tipo_movimiento === 'BAJA'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {m.tipo_movimiento}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-800 truncate">{m.usuario_nombre}</div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {m.usuario_email} · <strong>{m.licencia_nombre}</strong>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate">{m.motivo}</div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-semibold text-slate-600">
                    {m.fecha_movimiento ? new Date(m.fecha_movimiento).toLocaleDateString('es-CL') : ''}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">{m.ticket_referencia}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
