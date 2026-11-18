import React, { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import {
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Users,
  Settings,
  X,
  Search,
  Building2,
  ShieldCheck,
  Globe
} from 'lucide-react';
import { api, UserSession } from '../api';

// Configuración visual de colores por Dominio y subcolores por Licencia
const DOMAIN_THEMES: Record<
  string,
  {
    headerBg: string;
    containerBg: string;
    containerBorder: string;
    badgeBg: string;
    subColors: Record<string, string>;
  }
> = {
  'cmds.cl': {
    headerBg: '#016098', // Azul Corporativo Casa Central
    containerBg: 'bg-sky-50/50',
    containerBorder: 'border-sky-200',
    badgeBg: '#016098',
    subColors: {
      O365_E3: '#0284c7' // Subcolor Azul E3 Administración
    }
  },
  'cmds-salud.cl': {
    headerBg: '#0f766e', // Verde Azulado / Teal Salud APS
    containerBg: 'bg-teal-50/50',
    containerBorder: 'border-teal-200',
    badgeBg: '#0f766e',
    subColors: {
      O365_E3: '#0d9488', // Subcolor 1 Salud: Teal Intenso (E3)
      O365_E1: '#0891b2', // Subcolor 2 Salud: Turquesa / Cian (E1)
      M365_BUS_BASIC: '#059669' // Subcolor 3 Salud: Esmeralda (Business Basic)
    }
  },
  'cmds-educacion.cl': {
    headerBg: '#3730a3', // Índigo Educación
    containerBg: 'bg-indigo-50/50',
    containerBorder: 'border-indigo-200',
    badgeBg: '#3730a3',
    subColors: {
      O365_A3_FACULTY: '#4f46e5', // Subcolor 1 Educación: Índigo (A3 Profesores/Funcionarios)
      O365_A3_STUDENT: '#7c3aed' // Subcolor 2 Educación: Violeta (A3 Estudiantes)
    }
  }
};

export default function ControlLicencias() {
  const { user } = useOutletContext<{ user: UserSession }>();
  const [cupos, setCupos] = useState<any[]>([]);
  const [dominios, setDominios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroDominio, setFiltroDominio] = useState('TODOS');
  const [modalUsuariosPool, setModalUsuariosPool] = useState<any | null>(null);
  const [searchPoolUser, setSearchPoolUser] = useState('');

  // Modal Ajuste de Cupo (Solo ADMIN_SISTEMA)
  const [modalAjustar, setModalAjustar] = useState<any | null>(null);
  const [nuevoTotal, setNuevoTotal] = useState<number>(0);
  const [nuevoUmbral, setNuevoUmbral] = useState<number>(85);
  const [motivoAjuste, setMotivoAjuste] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const cargarCupos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/licencias/cupos');
      setCupos(res.data.cupos || []);
      setDominios(res.data.dominios || []);
    } catch (e) {
      console.error('Error cargando cupos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCupos();
  }, []);

  const handleGuardarAjuste = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalAjustar) return;
    setSaving(true);
    setMsg(null);
    try {
      await api.put(`/licencias/cupos/${modalAjustar.id}`, {
        total_licencias: nuevoTotal,
        umbral_alerta_pct: nuevoUmbral,
        motivo: motivoAjuste || `Ajuste administrativo de cupo contratado`
      });
      setMsg({ type: 'ok', text: 'Cupo de licencias actualizado correctamente.' });
      await cargarCupos();
      setTimeout(() => {
        setModalAjustar(null);
        setMsg(null);
      }, 900);
    } catch (err: any) {
      setMsg({
        type: 'err',
        text: err.response?.data?.error || 'Error al actualizar el cupo.'
      });
    } finally {
      setSaving(false);
    }
  };

  const dominiosVisibles = dominios.filter((d) =>
    filtroDominio === 'TODOS' ? true : d.dominio === filtroDominio
  );

  const isSystemAdmin = user?.rol_acceso === 'ADMIN_SISTEMA';

  return (
    <div className="space-y-6">
      {/* Cabecera y Filtro de Dominio con su Color Identificador */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#016098]">
            Control de Cupos y Contadores por Licencia Microsoft 365
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Inventario agrupado por los 3 dominios del Tenant CMDS con colores por sector y subcolores por tipo de licencia.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFiltroDominio('TODOS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
              filtroDominio === 'TODOS'
                ? 'bg-slate-800 text-white shadow'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todos los Dominios (3)
          </button>

          {dominios.map((d) => {
            const theme = DOMAIN_THEMES[d.dominio] || DOMAIN_THEMES['cmds.cl'];
            const active = filtroDominio === d.dominio;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setFiltroDominio(d.dominio)}
                style={active ? { backgroundColor: theme.headerBg } : undefined}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  active ? 'text-white shadow' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: active ? '#ffffff' : theme.headerBg }}
                />
                <span>@{d.dominio}</span>
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-sm font-semibold text-[#016098]">
          Cargando inventario de licencias...
        </div>
      ) : (
        <div className="space-y-8">
          {dominiosVisibles.map((dom) => {
            const theme = DOMAIN_THEMES[dom.dominio] || DOMAIN_THEMES['cmds.cl'];
            const cuposDom = cupos.filter((c) => c.dominio_id === dom.id);
            const totalDom = cuposDom.reduce((s, c) => s + c.total_licencias, 0);
            const asigDom = cuposDom.reduce((s, c) => s + c.licencias_asignadas, 0);
            const dispDom = Math.max(0, totalDom - asigDom);

            return (
              <div
                key={dom.id}
                className={`rounded-2xl border ${theme.containerBorder} ${theme.containerBg} overflow-hidden shadow-sm`}
              >
                {/* Encabezado de Grupo por Dominio */}
                <div
                  className="px-6 py-4 text-white flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                  style={{ backgroundColor: theme.headerBg }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full text-white">
                          SECTOR {dom.sector}
                        </span>
                        <span className="text-xs text-white/80 font-medium">
                          {cuposDom.length} {cuposDom.length === 1 ? 'tipo de licencia' : 'tipos de licencia'}
                        </span>
                      </div>
                      <h2 className="text-lg font-extrabold text-white mt-0.5">
                        Dominio @{dom.dominio} — {dom.nombre}
                      </h2>
                    </div>
                  </div>

                  {/* Resumen Consolidado del Dominio */}
                  <div className="grid grid-cols-3 gap-3 bg-black/20 px-4 py-2.5 rounded-xl border border-white/15 text-center shrink-0">
                    <div className="px-2">
                      <div className="text-[10px] uppercase text-white/80 font-bold">Total Dominio</div>
                      <div className="text-base font-black text-white">
                        {totalDom.toLocaleString('es-CL')}
                      </div>
                    </div>
                    <div className="px-2 border-x border-white/15">
                      <div className="text-[10px] uppercase text-white/80 font-bold">Asignadas</div>
                      <div className="text-base font-black text-white">
                        {asigDom.toLocaleString('es-CL')}
                      </div>
                    </div>
                    <div className="px-2">
                      <div className="text-[10px] uppercase text-white/80 font-bold">Disponibles</div>
                      <div className="text-base font-black text-white">
                        {dispDom.toLocaleString('es-CL')}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Grilla de Tarjetas de Licencias del Dominio con Subcolores */}
                <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {cuposDom.map((c) => {
                    const alerta = c.porcentaje_uso >= c.umbral_alerta_pct;
                    const subColor = theme.subColors[c.codigo_sku] || c.color_hex || theme.headerBg;

                    return (
                      <div
                        key={c.id}
                        className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col justify-between hover:shadow-md transition"
                      >
                        <div>
                          {/* Cabecera de la Licencia con su Subcolor */}
                          <div
                            className="px-5 py-4 text-white flex items-start justify-between"
                            style={{ backgroundColor: subColor }}
                          >
                            <div>
                              <span className="inline-block text-[10px] font-extrabold uppercase tracking-wider bg-black/20 px-2.5 py-0.5 rounded-full text-white">
                                @{c.dominio} · {c.codigo_sku}
                              </span>
                              <h3 className="text-base font-extrabold mt-1.5 leading-snug text-white">
                                {c.licencia_nombre}
                              </h3>
                              <p className="text-[11px] text-white/85 font-mono mt-0.5">
                                SKU Microsoft: {c.sku_microsoft}
                              </p>
                            </div>
                            <KeyRound className="w-5 h-5 text-white shrink-0" />
                          </div>

                          <div className="p-5 space-y-4">
                            {/* Badges de características */}
                            <div className="flex flex-wrap gap-1.5">
                              <span
                                className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                                style={{ backgroundColor: subColor }}
                              >
                                {c.categoria}
                              </span>
                              {c.incluye_teams ? (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" /> Incluye Microsoft Teams
                                </span>
                              ) : (
                                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Sin Microsoft Teams
                                </span>
                              )}
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                              {c.incluye_apps}
                            </p>

                            {/* Tres Contadores Principales */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                                <div className="text-[10px] font-bold uppercase text-slate-400">
                                  Contratadas
                                </div>
                                <div className="text-lg font-black text-slate-800 mt-0.5">
                                  {c.total_licencias.toLocaleString('es-CL')}
                                </div>
                              </div>
                              <div
                                className="p-3 rounded-xl border"
                                style={{
                                  backgroundColor: `${subColor}12`,
                                  borderColor: `${subColor}40`
                                }}
                              >
                                <div
                                  className="text-[10px] font-bold uppercase"
                                  style={{ color: subColor }}
                                >
                                  Asignadas
                                </div>
                                <div
                                  className="text-lg font-black mt-0.5"
                                  style={{ color: subColor }}
                                >
                                  {c.licencias_asignadas.toLocaleString('es-CL')}
                                </div>
                              </div>
                              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                                <div className="text-[10px] font-bold uppercase text-emerald-700">
                                  Disponibles
                                </div>
                                <div className="text-lg font-black text-emerald-700 mt-0.5">
                                  {c.licencias_disponibles.toLocaleString('es-CL')}
                                </div>
                              </div>
                            </div>

                            {/* Desglose Persona vs Máquina dentro del Pool */}
                            {c.licencias_asignadas > 0 && (
                              <div className="flex flex-wrap items-center justify-between gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-200/80 text-[11px]">
                                <span className="font-semibold text-slate-600">
                                  👤 Personas:{' '}
                                  <strong className="text-slate-900">
                                    {(c.asignadas_personas || 0).toLocaleString('es-CL')}
                                  </strong>
                                  {c.asignadas_estudiantes > 0 && (
                                    <span className="text-slate-500">
                                      {' '}
                                      ({c.asignadas_estudiantes.toLocaleString('es-CL')} alumnos)
                                    </span>
                                  )}
                                </span>
                                <span className="font-semibold text-violet-700">
                                  🖥️ Máquinas:{' '}
                                  <strong>{(c.asignadas_maquinas || 0).toLocaleString('es-CL')}</strong>
                                </span>
                              </div>
                            )}

                            {/* Barra de Ocupación con el Subcolor */}
                            <div>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-semibold text-slate-600">Nivel de Ocupación</span>
                                <span
                                  className="font-extrabold"
                                  style={{ color: alerta ? '#e11d48' : subColor }}
                                >
                                  {c.porcentaje_uso}% (Alerta: {c.umbral_alerta_pct}%)
                                </span>
                              </div>
                              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${Math.min(
                                      100,
                                      Math.max(c.licencias_asignadas > 0 ? 3 : 0, c.porcentaje_uso)
                                    )}%`,
                                    backgroundColor: alerta ? '#e11d48' : subColor
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Acciones del Pool */}
                        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSearchPoolUser('');
                              setModalUsuariosPool({ ...c, subColor });
                            }}
                            className="flex items-center gap-1.5 text-xs font-bold hover:underline cursor-pointer"
                            style={{ color: subColor }}
                          >
                            <Users className="w-3.5 h-3.5" />
                            <span>Ver asignados ({c.licencias_asignadas.toLocaleString('es-CL')})</span>
                          </button>

                          <div className="flex items-center gap-2">
                            <Link
                              to={`/usuarios?dominio_id=${c.dominio_id}&tipo_licencia_id=${c.tipo_licencia_id}`}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-semibold"
                            >
                              Gestionar
                            </Link>
                            {isSystemAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setModalAjustar({ ...c, subColor });
                                  setNuevoTotal(c.total_licencias);
                                  setNuevoUmbral(c.umbral_alerta_pct);
                                  setMotivoAjuste('');
                                  setMsg(null);
                                }}
                                style={{ backgroundColor: subColor }}
                                className="p-1.5 rounded-lg text-white hover:opacity-90 cursor-pointer"
                                title="Ajustar Cupo Contratado"
                              >
                                <Settings className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL VER USUARIOS CON ESTA LICENCIA */}
      {modalUsuariosPool && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
            <div
              className="px-6 py-4 text-white flex items-center justify-between"
              style={{ backgroundColor: modalUsuariosPool.subColor || '#016098' }}
            >
              <div>
                <h3 className="font-bold text-sm">{modalUsuariosPool.licencia_nombre}</h3>
                <p className="text-xs text-white/85">
                  Dominio @{modalUsuariosPool.dominio} — {modalUsuariosPool.licencias_asignadas.toLocaleString('es-CL')} licencias activas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalUsuariosPool(null)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-slate-50">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
                <input
                  type="text"
                  value={searchPoolUser}
                  onChange={(e) => setSearchPoolUser(e.target.value)}
                  placeholder="Buscar por nombre, correo o establecimiento..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 bg-white text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 divide-y divide-slate-100">
              {(modalUsuariosPool.usuarios_asignados || [])
                .filter((u: any) => {
                  if (!searchPoolUser.trim()) return true;
                  const q = searchPoolUser.toLowerCase();
                  return (
                    (u.nombre_completo && u.nombre_completo.toLowerCase().includes(q)) ||
                    (u.email && u.email.toLowerCase().includes(q)) ||
                    (u.establecimiento && u.establecimiento.toLowerCase().includes(q))
                  );
                })
                .map((u: any) => (
                  <div
                    key={u.asignacion_id}
                    className="px-6 py-3 flex items-center justify-between text-xs hover:bg-slate-50"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{u.nombre_completo}</div>
                      <div className="text-slate-500 font-mono">{u.email}</div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Building2 className="w-3 h-3" /> {u.establecimiento} ({u.cargo || 'Sin cargo'})
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                        ACTIVA
                      </span>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Alta: {u.fecha_alta ? new Date(u.fecha_alta).toLocaleDateString('es-CL') : ''}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL AJUSTAR CUPO CONTRATADO (SOLO ADMIN_SISTEMA) */}
      {modalAjustar && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div
              className="px-6 py-4 text-white flex items-center justify-between"
              style={{ backgroundColor: modalAjustar.subColor || '#016098' }}
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-white" />
                <h3 className="font-bold text-sm">Ajustar Cupo de Licencias</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalAjustar(null)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarAjuste} className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700">
                <div>
                  <strong>Licencia:</strong> {modalAjustar.licencia_nombre}
                </div>
                <div>
                  <strong>Dominio:</strong> @{modalAjustar.dominio}
                </div>
                <div>
                  <strong>Asignadas actualmente:</strong> {modalAjustar.licencias_asignadas.toLocaleString('es-CL')}
                </div>
              </div>

              {msg && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold border ${
                    msg.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {msg.text}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Total de Licencias Contratadas
                </label>
                <input
                  type="number"
                  required
                  min={modalAjustar.licencias_asignadas}
                  value={nuevoTotal}
                  onChange={(e) => setNuevoTotal(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Umbral de Alerta de Ocupación (%)
                </label>
                <input
                  type="number"
                  required
                  min={50}
                  max={100}
                  value={nuevoUmbral}
                  onChange={(e) => setNuevoUmbral(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Motivo / Orden de Compra / Referencia
                </label>
                <input
                  type="text"
                  required
                  value={motivoAjuste}
                  onChange={(e) => setMotivoAjuste(e.target.value)}
                  placeholder="Ej: Ampliación contrato anual Microsoft 2026"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalAjustar(null)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ backgroundColor: modalAjustar.subColor || '#016098' }}
                  className="flex-1 py-2.5 rounded-lg text-white text-xs font-bold shadow cursor-pointer"
                >
                  {saving ? 'Guardando...' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
