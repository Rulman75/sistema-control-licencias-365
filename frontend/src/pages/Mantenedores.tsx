import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Building2, Globe, Plus, Search, Edit3, X, CheckCircle2 } from 'lucide-react';
import { api, UserSession } from '../api';

export default function Mantenedores() {
  const { user } = useOutletContext<{ user: UserSession }>();
  const [establecimientos, setEstablecimientos] = useState<any[]>([]);
  const [dominios, setDominios] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filtroSector, setFiltroSector] = useState('');
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editingEst, setEditingEst] = useState<any | null>(null);
  const [formEst, setFormEst] = useState({
    codigo_unidad: '',
    cenco: '',
    nombre: '',
    sector: 'EDUCACION',
    dominio_sugerido: 'cmds-educacion.cl'
  });
  const [msg, setMsg] = useState('');

  const isReadOnly = user?.rol_acceso === 'VISUALIZADOR';

  const cargarCatalogos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/catalogos');
      setEstablecimientos(res.data.establecimientos || []);
      setDominios(res.data.dominios || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarCatalogos();
  }, []);

  const handleSaveEst = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingEst) {
        await api.put(`/catalogos/establecimientos/${editingEst.id}`, formEst);
        setMsg('Establecimiento actualizado correctamente.');
      } else {
        await api.post('/catalogos/establecimientos', formEst);
        setMsg('Establecimiento agregado correctamente.');
      }
      setShowModal(false);
      await cargarCatalogos();
      setTimeout(() => setMsg(''), 4000);
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error guardando establecimiento.');
    }
  };

  const filtrados = establecimientos.filter((e) => {
    if (filtroSector && e.sector !== filtroSector) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        e.nombre.toLowerCase().includes(q) ||
        String(e.codigo_unidad).includes(q) ||
        String(e.cenco || '').includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#016098]">
            Mantenedor de Establecimientos, Unidades y Dominios CMDS
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Catálogo oficial de los {establecimientos.length} establecimientos y direcciones de CMDS vinculados a los 3 dominios del Tenant Microsoft 365.
          </p>
        </div>

        {!isReadOnly && (
          <button
            type="button"
            onClick={() => {
              setEditingEst(null);
              setFormEst({
                codigo_unidad: '',
                cenco: '',
                nombre: '',
                sector: 'EDUCACION',
                dominio_sugerido: 'cmds-educacion.cl'
              });
              setShowModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>Agregar Establecimiento / Unidad</span>
          </button>
        )}
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{msg}</span>
        </div>
      )}

      {/* Tarjetas de los 3 Dominios Oficiales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {dominios.map((d) => (
          <div key={d.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#016098] flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-black text-[#016098]">@{d.dominio}</div>
              <div className="text-xs font-bold text-slate-700">{d.nombre}</div>
              <p className="text-[11px] text-slate-500 mt-1">{d.descripcion}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Buscador de Establecimientos */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar establecimiento por código de unidad, centro de costo o nombre..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 text-xs"
          />
        </div>
        <div className="flex gap-1.5">
          {['', 'ADMINISTRACION', 'EDUCACION', 'SALUD'].map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => setFiltroSector(sec)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                filtroSector === sec
                  ? 'bg-[#016098] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {sec === '' ? 'Todos' : sec}
            </button>
          ))}
        </div>
      </div>

      {/* Tabla de Establecimientos */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto max-h-[540px]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="sticky top-0 bg-slate-100 text-slate-600 uppercase text-[11px] border-b border-slate-200">
              <tr>
                <th className="py-3 px-4 font-bold">Cód. Unidad</th>
                <th className="py-3 px-4 font-bold">Centro Costo</th>
                <th className="py-3 px-4 font-bold">Nombre Establecimiento / Unidad</th>
                <th className="py-3 px-4 font-bold">Sector</th>
                <th className="py-3 px-4 font-bold">Dominio Asociado</th>
                {!isReadOnly && <th className="py-3 px-4 font-bold text-right">Editar</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    Cargando unidades...
                  </td>
                </tr>
              ) : (
                filtrados.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono font-bold text-[#016098]">#{e.codigo_unidad}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{e.cenco || '—'}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-800 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>{e.nombre}</span>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          e.sector === 'SALUD'
                            ? 'bg-teal-100 text-teal-800'
                            : e.sector === 'EDUCACION'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-blue-100 text-[#016098]'
                        }`}
                      >
                        {e.sector}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono font-semibold text-slate-700">
                      @{e.dominio_sugerido}
                    </td>
                    {!isReadOnly && (
                      <td className="py-2.5 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEst(e);
                            setFormEst({
                              codigo_unidad: String(e.codigo_unidad),
                              cenco: e.cenco ? String(e.cenco) : '',
                              nombre: e.nombre,
                              sector: e.sector,
                              dominio_sugerido: e.dominio_sugerido
                            });
                            setShowModal(true);
                          }}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#016098] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {editingEst ? 'Editar Establecimiento / Unidad' : 'Nuevo Establecimiento / Unidad'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-blue-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEst} className="p-6 space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Código Unidad *
                  </label>
                  <input
                    type="number"
                    required
                    value={formEst.codigo_unidad}
                    onChange={(e) => setFormEst({ ...formEst, codigo_unidad: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Centro de Costo
                  </label>
                  <input
                    type="number"
                    value={formEst.cenco}
                    onChange={(e) => setFormEst({ ...formEst, cenco: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Nombre Establecimiento / Unidad *
                </label>
                <input
                  type="text"
                  required
                  value={formEst.nombre}
                  onChange={(e) => setFormEst({ ...formEst, nombre: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Sector *
                </label>
                <select
                  value={formEst.sector}
                  onChange={(e) => {
                    const sec = e.target.value;
                    const domSug =
                      sec === 'ADMINISTRACION'
                        ? 'cmds.cl'
                        : sec === 'SALUD'
                        ? 'cmds-salud.cl'
                        : 'cmds-educacion.cl';
                    setFormEst({ ...formEst, sector: sec, dominio_sugerido: domSug });
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  <option value="ADMINISTRACION">ADMINISTRACION</option>
                  <option value="EDUCACION">EDUCACION</option>
                  <option value="SALUD">SALUD</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Dominio Asociado *
                </label>
                <select
                  value={formEst.dominio_sugerido}
                  onChange={(e) => setFormEst({ ...formEst, dominio_sugerido: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                >
                  <option value="cmds.cl">cmds.cl</option>
                  <option value="cmds-salud.cl">cmds-salud.cl</option>
                  <option value="cmds-educacion.cl">cmds-educacion.cl</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
