import React, { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import {
  Users,
  UserPlus,
  Search,
  KeyRound,
  UserMinus,
  RefreshCw,
  Edit3,
  History,
  X,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Download
} from 'lucide-react';
import { api, UserSession, canUserWrite } from '../api';

export default function GestionUsuarios() {
  const { user } = useOutletContext<{ user: UserSession }>();
  const [searchParams] = useSearchParams();

  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [cupos, setCupos] = useState<any[]>([]);
  const [dominios, setDominios] = useState<any[]>([]);
  const [tiposLicencia, setTiposLicencia] = useState<any[]>([]);
  const [establecimientos, setEstablecimientos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de búsqueda
  const [search, setSearch] = useState('');
  const [filtroDominio, setFiltroDominio] = useState(searchParams.get('dominio_id') || '');
  const [filtroTipoLic, setFiltroTipoLic] = useState(searchParams.get('tipo_licencia_id') || '');
  const [filtroEstablecimiento, setFiltroEstablecimiento] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipoUsuario, setFiltroTipoUsuario] = useState('');

  // Notificación global
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal Crear Usuario + Asignar Licencia (Alta)
  const [showModalAlta, setShowModalAlta] = useState(false);
  const [formAlta, setFormAlta] = useState({
    rut: '',
    nombres: '',
    apellidos: '',
    email: '',
    email_alias: '',
    dominio_id: '',
    establecimiento_id: '',
    cargo: '',
    departamento: '',
    tipo_usuario: 'FUNCIONARIO',
    cupo_licencia_id: '',
    numero_ticket: '',
    observaciones: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Modal Asignar / Cambiar Licencia
  const [modalLicenciaUser, setModalLicenciaUser] = useState<any | null>(null);
  const [modoLicencia, setModoLicencia] = useState<'ASIGNAR' | 'CAMBIAR'>('ASIGNAR');
  const [selectedCupoId, setSelectedCupoId] = useState('');
  const [ticketLicencia, setTicketLicencia] = useState('');
  const [obsLicencia, setObsLicencia] = useState('');

  // Modal Baja de Licencia / Usuario
  const [modalBajaUser, setModalBajaUser] = useState<any | null>(null);
  const [motivoBaja, setMotivoBaja] = useState('Término de contrato / Desvinculación');
  const [detalleMotivoBaja, setDetalleMotivoBaja] = useState('');
  const [ticketBaja, setTicketBaja] = useState('');
  const [desactivarCuentaBaja, setDesactivarCuentaBaja] = useState(true);

  // Modal Editar Usuario
  const [modalEditarUser, setModalEditarUser] = useState<any | null>(null);

  // Modal Historial de Usuario
  const [modalHistorialUser, setModalHistorialUser] = useState<any | null>(null);

  // Paginación y Selección en Lote
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 100;
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [showModalMasivo, setShowModalMasivo] = useState(false);
  const [cupoMasivoId, setCupoMasivoId] = useState('');
  const [ticketMasivo, setTicketMasivo] = useState('');
  const [obsMasivo, setObsMasivo] = useState('');

  const cargarTodo = async () => {
    setLoading(true);
    try {
      const [resUsers, resCupos, resCat] = await Promise.all([
        api.get('/usuarios'),
        api.get('/licencias/cupos'),
        api.get('/catalogos')
      ]);

      setUsuarios(resUsers.data.usuarios || []);
      setCupos(resCupos.data.cupos || []);
      setDominios(resCat.data.dominios || []);
      setTiposLicencia(resCat.data.tipos_licencia || []);
      setEstablecimientos(resCat.data.establecimientos || []);
    } catch (e) {
      console.error('Error cargando gestión de usuarios:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarTodo();
  }, []);

  // Resetear paginación a 1 al digitar o cambiar cualquier filtro
  useEffect(() => {
    setPage(1);
  }, [search, filtroDominio, filtroTipoLic, filtroEstablecimiento, filtroEstado, filtroTipoUsuario]);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Auto-sugerir correo al escribir nombres/apellidos o elegir dominio
  const sugerirEmail = (nombres: string, apellidos: string, domId: string) => {
    const dom = dominios.find((d) => String(d.id) === String(domId));
    if (!dom || !nombres.trim() || !apellidos.trim()) return;
    const clean = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
    const primerNombre = clean(nombres.trim().split(' ')[0]);
    const primerApellido = clean(apellidos.trim().split(' ')[0]);
    if (primerNombre && primerApellido) {
      setFormAlta((prev) => ({
        ...prev,
        email: `${primerNombre.charAt(0)}${primerApellido}@${dom.dominio}`
      }));
    }
  };

  const abrirModalAlta = () => {
    // Si el operador tiene perfil sectorial específico, preseleccionar su dominio
    let defaultDom = dominios[0]?.id ? String(dominios[0].id) : '1';
    if (user.ambito !== 'GLOBAL') {
      const found = dominios.find((d) => d.sector === user.ambito);
      if (found) defaultDom = String(found.id);
    }
    const poolsDom = cupos.filter((c) => String(c.dominio_id) === defaultDom);

    setFormAlta({
      rut: '',
      nombres: '',
      apellidos: '',
      email: '',
      email_alias: '',
      dominio_id: defaultDom,
      establecimiento_id: '',
      cargo: '',
      departamento: '',
      tipo_usuario: 'FUNCIONARIO',
      cupo_licencia_id: poolsDom[0] ? String(poolsDom[0].id) : '',
      numero_ticket: '',
      observaciones: ''
    });
    setShowModalAlta(true);
  };

  const handleCrearUsuarioAlta = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.post('/usuarios', formAlta);
      showToast('ok', res.data.message);
      setShowModalAlta(false);
      await cargarTodo();
    } catch (err: any) {
      showToast('err', err.response?.data?.error || 'Error al registrar el usuario.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAsignarOCambiarLicencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalLicenciaUser || !selectedCupoId) return;
    setSubmitting(true);
    try {
      if (modoLicencia === 'ASIGNAR') {
        const res = await api.post(`/usuarios/${modalLicenciaUser.id}/asignar`, {
          cupo_licencia_id: Number(selectedCupoId),
          numero_ticket: ticketLicencia || 'ALTA-LIC',
          observaciones: obsLicencia || 'Asignación de licencia Microsoft 365'
        });
        showToast('ok', res.data.message);
      } else {
        const res = await api.post(`/usuarios/${modalLicenciaUser.id}/cambiar-licencia`, {
          nuevo_cupo_licencia_id: Number(selectedCupoId),
          numero_ticket: ticketLicencia || 'CAMBIO-LIC',
          motivo: obsLicencia || 'Cambio de tipo de licencia Microsoft 365'
        });
        showToast('ok', res.data.message);
      }
      setModalLicenciaUser(null);
      await cargarTodo();
    } catch (err: any) {
      showToast('err', err.response?.data?.error || 'Error procesando la licencia.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmarBaja = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalBajaUser) return;
    setSubmitting(true);
    try {
      const motivoCompleto = detalleMotivoBaja
        ? `${motivoBaja} — ${detalleMotivoBaja}`
        : motivoBaja;
      const res = await api.post(`/usuarios/${modalBajaUser.id}/baja`, {
        motivo_baja: motivoCompleto,
        numero_ticket: ticketBaja || 'BAJA-WEB',
        desactivar_cuenta: desactivarCuentaBaja
      });
      showToast('ok', res.data.message);
      setModalBajaUser(null);
      await cargarTodo();
    } catch (err: any) {
      showToast('err', err.response?.data?.error || 'Error al cursar la baja.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleGuardarEdicionUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modalEditarUser) return;
    setSubmitting(true);
    try {
      const res = await api.put(`/usuarios/${modalEditarUser.id}`, modalEditarUser);
      showToast('ok', res.data.message);
      setModalEditarUser(null);
      await cargarTodo();
    } catch (err: any) {
      showToast('err', err.response?.data?.error || 'Error actualizando usuario.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportarExcel = async () => {
    try {
      const res = await api.get('/import-export/exportar-usuarios', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.setAttribute('download', 'Nomina_Usuarios_Licencias_M365_CMDS.xlsx');
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch {
      showToast('err', 'Error al descargar el archivo Excel.');
    }
  };

  const isReadOnly = user?.rol_acceso === 'VISUALIZADOR';

  // Dominio actualmente seleccionado en el filtro
  const dominioFiltroObj = dominios.find((d) => String(d.id) === String(filtroDominio)) || null;

  // Filtrar Tipos de Licencia en cascada según el Dominio seleccionado
  const tiposLicenciaFiltradosPorDominio = filtroDominio
    ? tiposLicencia.filter((t) =>
        cupos.some((c) => String(c.dominio_id) === String(filtroDominio) && c.tipo_licencia_id === t.id)
      )
    : tiposLicencia;

  // Filtrar Establecimientos en cascada según el Dominio seleccionado
  const establecimientosFiltradosPorDominio = dominioFiltroObj
    ? establecimientos.filter(
        (e) => e.dominio_sugerido === dominioFiltroObj.dominio || e.sector === dominioFiltroObj.sector
      )
    : establecimientos;

  // Filtrado instantáneo en tiempo real mientras se digita o cambia cualquier selector
  const usuariosFiltrados = usuarios.filter((u) => {
    if (filtroDominio && String(u.dominio_id) !== String(filtroDominio)) return false;
    if (filtroEstablecimiento && String(u.establecimiento_id) !== String(filtroEstablecimiento)) return false;
    if (filtroEstado && u.estado_cuenta !== filtroEstado) return false;
    if (filtroTipoUsuario) {
      const esMaq = u.tipo_cuenta === 'MAQUINA' || u.tipo_usuario === 'MAQUINA';
      if (filtroTipoUsuario === 'PERSONA_TODAS') {
        if (esMaq) return false;
      } else if (filtroTipoUsuario === 'MAQUINA') {
        if (!esMaq) return false;
      } else if (u.tipo_usuario !== filtroTipoUsuario) {
        return false;
      }
    }
    if (filtroTipoLic) {
      if (filtroTipoLic === 'SIN_LICENCIA') {
        if (u.licencias_activas && u.licencias_activas.length > 0) return false;
      } else {
        const targetId = Number(filtroTipoLic);
        const hasLic = (u.licencias_activas || []).some(
          (la: any) => Number(la.tipo_licencia_id) === targetId
        );
        if (!hasLic) return false;
      }
    }
    if (search.trim() !== '') {
      const q = search.trim().toLowerCase();
      const match =
        (u.nombre_completo && u.nombre_completo.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.email_alias && u.email_alias.toLowerCase().includes(q)) ||
        (u.rut && u.rut.toLowerCase().includes(q)) ||
        (u.cargo && u.cargo.toLowerCase().includes(q)) ||
        (u.departamento && u.departamento.toLowerCase().includes(q)) ||
        (u.establecimiento_nombre && u.establecimiento_nombre.toLowerCase().includes(q));
      if (!match) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(usuariosFiltrados.length / PAGE_SIZE));
  const usuariosPaginados = usuariosFiltrados.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleToggleSelectUser = (id: number) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSelectPageOrFiltered = (mode: 'PAGE' | 'SIN_LICENCIA_FILTRADOS') => {
    if (mode === 'PAGE') {
      const pageIds = usuariosPaginados.map((u) => u.id);
      const allSelected = pageIds.every((id) => selectedUserIds.includes(id));
      if (allSelected) {
        setSelectedUserIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      } else {
        setSelectedUserIds((prev) => Array.from(new Set([...prev, ...pageIds])));
      }
    } else {
      const sinLicIds = usuariosFiltrados
        .filter((u) => !u.licencias_activas || u.licencias_activas.length === 0)
        .map((u) => u.id);
      setSelectedUserIds(sinLicIds);
    }
  };

  const handleAsignarMasivoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserIds.length === 0 || !cupoMasivoId) return;
    setSubmitting(true);
    try {
      const res = await api.post('/usuarios/asignar-licencia-masiva', {
        usuario_ids: selectedUserIds,
        cupo_licencia_id: Number(cupoMasivoId),
        numero_ticket: ticketMasivo || 'ALTA-LOTE',
        observaciones: obsMasivo || 'Asignación masiva por lote'
      });
      showToast('ok', res.data.message);
      setShowModalMasivo(false);
      setSelectedUserIds([]);
      await cargarTodo();
    } catch (err: any) {
      showToast('err', err.response?.data?.error || 'Error en asignación masiva.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filtrar dominios permitidos en formulario de alta según ámbito del operador
  const dominiosPermitidosAlta = dominios.filter((d) =>
    canUserWrite(user, d.sector)
  );

  const cuposDominioAlta = cupos.filter(
    (c) => String(c.dominio_id) === String(formAlta.dominio_id)
  );

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#016098]">
            Nómina de Usuarios y Asignación de Licencias Microsoft 365
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administración de cuentas por dominio, establecimiento, entrega de licencias (Altas), cambios de SKU y revocación (Bajas).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportarExcel}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold cursor-pointer"
          >
            <Download className="w-4 h-4 text-[#016098]" />
            <span>Exportar Excel</span>
          </button>

          {!isReadOnly && (
            <button
              type="button"
              onClick={abrirModalAlta}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-white" />
              <span>Nueva Alta de Usuario / Licencia</span>
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-2xl text-xs font-bold border flex items-center justify-between shadow-sm ${
            feedback.type === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-700'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'ok' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button type="button" onClick={() => setFeedback(null)} className="cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Barra de Búsqueda y Filtros Multicriterio */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar al instante por nombre, correo, alias, RUT o cargo..."
              className="w-full pl-9 pr-8 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <select
            value={filtroDominio}
            onChange={(e) => {
              const newDomId = e.target.value;
              setFiltroDominio(newDomId);
              if (newDomId) {
                const domObj = dominios.find((d) => String(d.id) === String(newDomId));
                // Si la licencia seleccionada no pertenece al nuevo dominio, limpiarla
                if (filtroTipoLic && filtroTipoLic !== 'SIN_LICENCIA') {
                  const licValida = cupos.some(
                    (c) => String(c.dominio_id) === String(newDomId) && String(c.tipo_licencia_id) === String(filtroTipoLic)
                  );
                  if (!licValida) setFiltroTipoLic('');
                }
                // Si el establecimiento seleccionado no pertenece al nuevo dominio, limpiarlo
                if (filtroEstablecimiento && domObj) {
                  const estObj = establecimientos.find((est) => String(est.id) === String(filtroEstablecimiento));
                  if (estObj && estObj.dominio_sugerido !== domObj.dominio && estObj.sector !== domObj.sector) {
                    setFiltroEstablecimiento('');
                  }
                }
              }
            }}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#016098]"
          >
            <option value="">Todos los Dominios</option>
            {dominios.map((d) => (
              <option key={d.id} value={d.id}>
                @{d.dominio} ({d.sector})
              </option>
            ))}
          </select>

          <select
            value={filtroTipoLic}
            onChange={(e) => setFiltroTipoLic(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#016098]"
          >
            <option value="">
              {dominioFiltroObj
                ? `Licencias de @${dominioFiltroObj.dominio} (${tiposLicenciaFiltradosPorDominio.length})`
                : 'Todos los Tipos de Licencia'}
            </option>
            <option value="SIN_LICENCIA">⚠️ Sin Licencia Activa (Pendientes)</option>
            {tiposLicenciaFiltradosPorDominio.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}
              </option>
            ))}
          </select>

          <select
            value={filtroEstablecimiento}
            onChange={(e) => setFiltroEstablecimiento(e.target.value)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#016098]"
          >
            <option value="">
              {dominioFiltroObj
                ? `Establecimientos de @${dominioFiltroObj.dominio} (${establecimientosFiltradosPorDominio.length})`
                : `Todos los Establecimientos (${establecimientosFiltradosPorDominio.length})`}
            </option>
            {establecimientosFiltradosPorDominio.map((e) => (
              <option key={e.id} value={e.id}>
                [{e.codigo_unidad}] {e.nombre}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#016098]"
            >
              <option value="">Estado: Todos</option>
              <option value="ACTIVO">Activos</option>
              <option value="BAJA">En Baja</option>
            </select>
            <button
              type="button"
              onClick={cargarTodo}
              className="px-3 py-2 rounded-xl bg-[#016098] text-white text-xs font-bold hover:bg-[#024a8d] cursor-pointer"
              title="Buscar"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Tabla de Usuarios M365 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold">
              Total filtrado: <strong>{usuariosFiltrados.length.toLocaleString('es-CL')}</strong> cuenta(s) · Página{' '}
              <strong>{page}</strong> de <strong>{totalPages}</strong>
            </span>
            {!isReadOnly && (
              <button
                type="button"
                onClick={() => handleSelectPageOrFiltered('SIN_LICENCIA_FILTRADOS')}
                className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 font-bold text-[11px] hover:bg-amber-100 cursor-pointer"
              >
                Seleccionar sin licencia ({usuariosFiltrados.filter((u) => !u.licencias_activas || u.licencias_activas.length === 0).length})
              </button>
            )}
            {selectedUserIds.length > 0 && !isReadOnly && (
              <button
                type="button"
                onClick={() => {
                  const firstSelected = usuarios.find((u) => u.id === selectedUserIds[0]);
                  const domId = firstSelected ? firstSelected.dominio_id : cupos[0]?.dominio_id;
                  const defaultPool = cupos.find((c) => c.dominio_id === domId) || cupos[0];
                  setCupoMasivoId(defaultPool ? String(defaultPool.id) : '');
                  setTicketMasivo('ALTA-SALUD-2026');
                  setObsMasivo('');
                  setShowModalMasivo(true);
                }}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-1.5 shadow cursor-pointer"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Asignar Licencia en Lote ({selectedUserIds.length} seleccionados)</span>
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: '', label: 'Todos' },
              { id: 'PERSONA_TODAS', label: '👤 Personas (Humanos)' },
              { id: 'FUNCIONARIO', label: '👔 Funcionarios / Docentes' },
              { id: 'ESTUDIANTE', label: '🎓 Alumnos' },
              { id: 'MAQUINA', label: '🖥️ Máquinas / Equipos' }
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFiltroTipoUsuario(item.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition ${
                  filtroTipoUsuario === item.id
                    ? 'bg-[#016098] text-white shadow-sm'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/80 text-slate-600 uppercase text-[11px] border-b border-slate-200">
                {!isReadOnly && (
                  <th className="py-3 px-3 w-8 text-center">
                    <input
                      type="checkbox"
                      checked={
                        usuariosPaginados.length > 0 &&
                        usuariosPaginados.every((u) => selectedUserIds.includes(u.id))
                      }
                      onChange={() => handleSelectPageOrFiltered('PAGE')}
                      className="rounded border-slate-300 cursor-pointer"
                      title="Seleccionar página actual"
                    />
                  </th>
                )}
                <th className="py-3 px-4 font-bold">Usuario / RUT</th>
                <th className="py-3 px-4 font-bold">Correo y Dominio</th>
                <th className="py-3 px-4 font-bold">Establecimiento / Unidad</th>
                <th className="py-3 px-4 font-bold">Licencia(s) Asignada(s)</th>
                <th className="py-3 px-4 font-bold text-center">Estado</th>
                <th className="py-3 px-4 font-bold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-500 font-semibold">
                    Cargando usuarios Microsoft 365...
                  </td>
                </tr>
              ) : usuariosPaginados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-slate-400">
                    No se encontraron cuentas con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                usuariosPaginados.map((u) => {
                  const puedeEditarFila = canUserWrite(user, u.dominio_sector);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/90">
                      {!isReadOnly && (
                        <td className="py-3 px-3 text-center">
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(u.id)}
                            onChange={() => handleToggleSelectUser(u.id)}
                            className="rounded border-slate-300 cursor-pointer"
                          />
                        </td>
                      )}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-800">{u.nombre_completo}</span>
                          {u.tipo_cuenta === 'MAQUINA' || u.tipo_usuario === 'MAQUINA' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-violet-100 text-violet-800 border border-violet-200">
                              🖥️ Máquina / Equipo
                            </span>
                          ) : u.tipo_usuario === 'ESTUDIANTE' ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              🎓 Persona · Alumno
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-sky-100 text-[#016098] border border-sky-200">
                              👤 Persona · Funcionario
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {u.rut ? `RUT: ${u.rut} · ` : ''}
                          {u.cargo || 'Sin cargo especificado'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-[#016098]">{u.email}</div>
                        {u.email_alias && (
                          <div className="text-[11px] font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded mt-0.5 inline-block mr-1">
                            Alias: <strong>{u.email_alias}</strong>
                          </div>
                        )}
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-bold">
                            @{u.dominio} ({u.dominio_sector})
                          </span>
                          {u.m365_object_id ? (
                            <span
                              title={`Cuenta verificada en admin.cloud.microsoft (Entra Object ID: ${u.m365_object_id})`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold"
                            >
                              ✔ Verificado M365
                            </span>
                          ) : (
                            <span
                              title="Cuenta registrada manualmente o pendiente de sincronizar con Microsoft 365"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold"
                            >
                              Registro Local
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-700 flex items-center gap-1">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{u.establecimiento_nombre}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {u.departamento || u.tipo_usuario}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {u.licencias_activas && u.licencias_activas.length > 0 ? (
                          <div className="space-y-1">
                            {u.licencias_activas.map((la: any) => (
                              <div
                                key={la.id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-[#016098] font-bold text-[11px]"
                              >
                                <span
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: la.color_hex || '#016098' }}
                                />
                                <span>{la.licencia_nombre}</span>
                                {!la.incluye_teams && (
                                  <span className="text-[9px] bg-amber-200 text-amber-900 px-1 rounded">
                                    Sin Teams
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] italic text-slate-400">Sin licencia activa</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                            u.estado_cuenta === 'ACTIVO'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {u.estado_cuenta}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {puedeEditarFila && (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  const poolsUserDom = cupos.filter((c) => c.dominio_id === u.dominio_id);
                                  setModoLicencia(u.licencias_activas?.length > 0 ? 'CAMBIAR' : 'ASIGNAR');
                                  setSelectedCupoId(poolsUserDom[0] ? String(poolsUserDom[0].id) : '');
                                  setTicketLicencia('');
                                  setObsLicencia('');
                                  setModalLicenciaUser(u);
                                }}
                                className="px-2.5 py-1.5 rounded-lg bg-[#016098] hover:bg-[#024a8d] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                title="Asignar o Cambiar Licencia"
                              >
                                <KeyRound className="w-3 h-3" />
                                <span>{u.licencias_activas?.length > 0 ? 'Cambiar Lic.' : 'Asignar Lic.'}</span>
                              </button>

                              {u.licencias_activas?.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMotivoBaja('Término de contrato / Desvinculación');
                                    setDetalleMotivoBaja('');
                                    setTicketBaja('');
                                    setDesactivarCuentaBaja(true);
                                    setModalBajaUser(u);
                                  }}
                                  className="px-2 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                  title="Cursar Baja y Liberar Licencia"
                                >
                                  <UserMinus className="w-3 h-3" />
                                  <span>Baja</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => setModalEditarUser({ ...u })}
                                className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                                title="Editar datos del usuario"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          <button
                            type="button"
                            onClick={() => setModalHistorialUser(u)}
                            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-[#016098] cursor-pointer"
                            title="Ver Historial de Licencias del Usuario"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Barra de Paginación */}
        {totalPages > 1 && (
          <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">
              Mostrando registros <strong>{(page - 1) * PAGE_SIZE + 1}</strong> al{' '}
              <strong>{Math.min(page * PAGE_SIZE, usuariosFiltrados.length)}</strong> de{' '}
              <strong>{usuariosFiltrados.length.toLocaleString('es-CL')}</strong>
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

      {/* =====================================================================
          MODAL 0: ASIGNACIÓN MASIVA EN LOTE (SALUD / EDUCACIÓN / ADMIN)
      ===================================================================== */}
      {showModalMasivo && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-emerald-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-white" />
                <h3 className="font-bold text-sm">
                  Asignación Masiva de Licencia ({selectedUserIds.length} usuarios seleccionados)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModalMasivo(false)}
                className="text-emerald-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAsignarMasivoSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Seleccione el Pool de Licencia a Asignar *
                </label>
                <select
                  required
                  value={cupoMasivoId}
                  onChange={(e) => setCupoMasivoId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
                >
                  {cupos.map((c) => (
                    <option key={c.id} value={c.id}>
                      [@{c.dominio}] {c.licencia_nombre} — Disponibles: {c.licencias_disponibles.toLocaleString('es-CL')} / {c.total_licencias.toLocaleString('es-CL')}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  Se asignará automáticamente a los usuarios seleccionados que pertenezcan al mismo dominio del pool elegido.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  N° Ticket / Referencia
                </label>
                <input
                  type="text"
                  value={ticketMasivo}
                  onChange={(e) => setTicketMasivo(e.target.value)}
                  placeholder="Ej: ALTA-SALUD-2026"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Motivo / Observación
                </label>
                <input
                  type="text"
                  value={obsMasivo}
                  onChange={(e) => setObsMasivo(e.target.value)}
                  placeholder="Ej: Asignación inicial dotación Salud APS"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModalMasivo(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  {submitting ? 'Procesando...' : `Confirmar Asignación (${selectedUserIds.length})`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: ALTA DE NUEVO USUARIO Y ENTREGA DE LICENCIA M365
      ===================================================================== */}
      {showModalAlta && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-[#016098] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-white" />
                <h3 className="font-bold text-sm">
                  Alta de Usuario Microsoft 365 y Asignación de Licencia
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowModalAlta(false)}
                className="text-blue-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCrearUsuarioAlta} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Establecimiento / Unidad CMDS *
                  </label>
                  <select
                    required
                    value={formAlta.establecimiento_id}
                    onChange={(e) => {
                      const estId = e.target.value;
                      const estObj = establecimientos.find((x) => String(x.id) === estId);
                      let nuevoDomId = formAlta.dominio_id;
                      if (estObj) {
                        const domSugerido = dominiosPermitidosAlta.find(
                          (d) => d.dominio === estObj.dominio_sugerido
                        );
                        if (domSugerido) nuevoDomId = String(domSugerido.id);
                      }
                      const poolsDom = cupos.filter((c) => String(c.dominio_id) === nuevoDomId);
                      setFormAlta((prev) => ({
                        ...prev,
                        establecimiento_id: estId,
                        dominio_id: nuevoDomId,
                        cupo_licencia_id: poolsDom[0] ? String(poolsDom[0].id) : ''
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  >
                    <option value="">-- Seleccione Establecimiento / Unidad --</option>
                    {establecimientos.map((e) => (
                      <option key={e.id} value={e.id}>
                        [{e.codigo_unidad}] {e.nombre} ({e.sector})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Dominio del Tenant *
                  </label>
                  <select
                    required
                    value={formAlta.dominio_id}
                    onChange={(e) => {
                      const domId = e.target.value;
                      const poolsDom = cupos.filter((c) => String(c.dominio_id) === domId);
                      setFormAlta((prev) => ({
                        ...prev,
                        dominio_id: domId,
                        cupo_licencia_id: poolsDom[0] ? String(poolsDom[0].id) : ''
                      }));
                      sugerirEmail(formAlta.nombres, formAlta.apellidos, domId);
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-[#016098] focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  >
                    {dominiosPermitidosAlta.map((d) => (
                      <option key={d.id} value={d.id}>
                        @{d.dominio} — {d.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Nombres *
                  </label>
                  <input
                    type="text"
                    required
                    value={formAlta.nombres}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormAlta((prev) => ({ ...prev, nombres: val }));
                      sugerirEmail(val, formAlta.apellidos, formAlta.dominio_id);
                    }}
                    placeholder="Ej: María Fernanda"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Apellidos *
                  </label>
                  <input
                    type="text"
                    required
                    value={formAlta.apellidos}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormAlta((prev) => ({ ...prev, apellidos: val }));
                      sugerirEmail(formAlta.nombres, val, formAlta.dominio_id);
                    }}
                    placeholder="Ej: Soto Morales"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    RUT Funcionario / Estudiante
                  </label>
                  <input
                    type="text"
                    value={formAlta.rut}
                    onChange={(e) => setFormAlta((prev) => ({ ...prev, rut: e.target.value }))}
                    placeholder="Ej: 15.887.412-3"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Correo Principal Microsoft 365 *
                  </label>
                  <input
                    type="email"
                    required
                    value={formAlta.email}
                    onChange={(e) => setFormAlta((prev) => ({ ...prev, email: e.target.value }))}
                    placeholder="usuario@dominio.cl"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Correo Alias Provisorio / Migración (Opcional)
                  </label>
                  <input
                    type="email"
                    value={formAlta.email_alias}
                    onChange={(e) => setFormAlta((prev) => ({ ...prev, email_alias: e.target.value }))}
                    placeholder="Ej: usuario@cmds.cl"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Cargo / Función
                  </label>
                  <input
                    type="text"
                    value={formAlta.cargo}
                    onChange={(e) => setFormAlta((prev) => ({ ...prev, cargo: e.target.value }))}
                    placeholder="Ej: Docente, Médico, Administrativo, Estudiante"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Tipo de Cuenta (Persona vs Máquina) *
                  </label>
                  <select
                    value={formAlta.tipo_usuario}
                    onChange={(e) => {
                      const val = e.target.value;
                      let sugeridoCupo = formAlta.cupo_licencia_id;
                      const poolsDom = cupos.filter((c) => String(c.dominio_id) === String(formAlta.dominio_id));
                      if (val === 'MAQUINA' || val === 'ESTUDIANTE') {
                        const stuPool = poolsDom.find((c) => c.codigo_sku === 'O365_A3_STUDENT');
                        if (stuPool) sugeridoCupo = String(stuPool.id);
                      } else if (val === 'FUNCIONARIO') {
                        const facPool = poolsDom.find((c) => c.codigo_sku !== 'O365_A3_STUDENT');
                        if (facPool) sugeridoCupo = String(facPool.id);
                      }
                      setFormAlta((prev) => ({
                        ...prev,
                        tipo_usuario: val,
                        cupo_licencia_id: sugeridoCupo
                      }));
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  >
                    <option value="FUNCIONARIO">👤 Persona (Humano) — Funcionario / Docente</option>
                    <option value="ESTUDIANTE">🎓 Persona (Humano) — Alumno / Estudiante</option>
                    <option value="MAQUINA">🖥️ Máquina / Equipo (PC, Notebook, Tablet, Lab)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Departamento / Curso / Sala
                  </label>
                  <input
                    type="text"
                    value={formAlta.departamento}
                    onChange={(e) => setFormAlta((prev) => ({ ...prev, departamento: e.target.value }))}
                    placeholder="Ej: SOME, UTP, DAF, Laboratorio Enlaces"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  />
                </div>
              </div>

              {/* Selección de Licencia a Entregar */}
              <div className="bg-blue-50/70 p-4 rounded-xl border border-blue-200 space-y-3">
                <label className="block text-xs font-extrabold uppercase text-[#016098]">
                  Licencia Microsoft 365 a Asignar (Descuenta del Stock Disponible)
                </label>
                <select
                  value={formAlta.cupo_licencia_id}
                  onChange={(e) => setFormAlta((prev) => ({ ...prev, cupo_licencia_id: e.target.value }))}
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#016098]"
                >
                  <option value="">-- Registrar solo usuario sin licencia por ahora --</option>
                  {cuposDominioAlta.map((c) => (
                    <option key={c.id} value={c.id} disabled={c.licencias_disponibles <= 0}>
                      {c.licencia_nombre} — Disponibles: {c.licencias_disponibles.toLocaleString('es-CL')} de{' '}
                      {c.total_licencias.toLocaleString('es-CL')}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      N° Ticket / Solicitud / Memo
                    </label>
                    <input
                      type="text"
                      value={formAlta.numero_ticket}
                      onChange={(e) => setFormAlta((prev) => ({ ...prev, numero_ticket: e.target.value }))}
                      placeholder="Ej: TK-2026-450"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Observación de Alta
                    </label>
                    <input
                      type="text"
                      value={formAlta.observaciones}
                      onChange={(e) => setFormAlta((prev) => ({ ...prev, observaciones: e.target.value }))}
                      placeholder="Ej: Solicitud Dirección Establecimiento"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModalAlta(false)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
                >
                  {submitting ? 'Procesando Alta...' : 'Confirmar Alta y Asignar Licencia'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: ASIGNAR O CAMBIAR LICENCIA A USUARIO EXISTENTE
      ===================================================================== */}
      {modalLicenciaUser && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#016098] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-white" />
                <h3 className="font-bold text-sm">
                  {modoLicencia === 'ASIGNAR' ? 'Asignar Licencia M365' : 'Cambiar o Agregar Licencia M365'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setModalLicenciaUser(null)}
                className="text-blue-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAsignarOCambiarLicencia} className="p-6 space-y-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs">
                <div className="font-bold text-slate-800">{modalLicenciaUser.nombre_completo}</div>
                <div className="text-[#016098] font-mono">{modalLicenciaUser.email}</div>
                <div className="text-slate-500 mt-0.5">{modalLicenciaUser.establecimiento_nombre}</div>
              </div>

              {modalLicenciaUser.licencias_activas?.length > 0 && (
                <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setModoLicencia('CAMBIAR')}
                    className={`flex-1 py-1.5 rounded-lg cursor-pointer ${
                      modoLicencia === 'CAMBIAR' ? 'bg-[#016098] text-white' : 'text-slate-600'
                    }`}
                  >
                    Reemplazar Licencia Actual
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoLicencia('ASIGNAR')}
                    className={`flex-1 py-1.5 rounded-lg cursor-pointer ${
                      modoLicencia === 'ASIGNAR' ? 'bg-[#016098] text-white' : 'text-slate-600'
                    }`}
                  >
                    Sumar Licencia Adicional
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Seleccione Pool de Licencia (@{modalLicenciaUser.dominio})
                </label>
                <select
                  required
                  value={selectedCupoId}
                  onChange={(e) => setSelectedCupoId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#016098]"
                >
                  {cupos
                    .filter((c) => c.dominio_id === modalLicenciaUser.dominio_id)
                    .map((c) => (
                      <option key={c.id} value={c.id} disabled={c.licencias_disponibles <= 0}>
                        {c.licencia_nombre} ({c.licencias_disponibles.toLocaleString('es-CL')} disp.)
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  N° Ticket / Solicitud
                </label>
                <input
                  type="text"
                  value={ticketLicencia}
                  onChange={(e) => setTicketLicencia(e.target.value)}
                  placeholder="Ej: TK-2026-501"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Motivo / Observación
                </label>
                <input
                  type="text"
                  value={obsLicencia}
                  onChange={(e) => setObsLicencia(e.target.value)}
                  placeholder="Ej: Cambio de funciones a perfil clínico E3"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalLicenciaUser(null)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
                >
                  {submitting ? 'Procesando...' : 'Confirmar Operación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: CURSAR BAJA DE LICENCIA / DESVINCULACIÓN
      ===================================================================== */}
      {modalBajaUser && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#EB567F] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserMinus className="w-4 h-4" />
                <h3 className="font-bold text-sm">Cursar Baja y Liberar Licencia(s)</h3>
              </div>
              <button
                type="button"
                onClick={() => setModalBajaUser(null)}
                className="text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmarBaja} className="p-6 space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-900">
                <div className="font-bold">{modalBajaUser.nombre_completo}</div>
                <div className="font-mono">{modalBajaUser.email}</div>
                <div className="mt-1">
                  Se revocará(n) <strong>{modalBajaUser.licencias_activas?.length || 0}</strong> licencia(s) activa(s) y volverán inmediatamente al contador de <strong>Disponibles</strong>.
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Causal de Baja *
                </label>
                <select
                  value={motivoBaja}
                  onChange={(e) => setMotivoBaja(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold"
                >
                  <option value="Término de contrato / Desvinculación">Término de contrato / Desvinculación</option>
                  <option value="Renuncia voluntaria">Renuncia voluntaria</option>
                  <option value="Traslado de Establecimiento / Unidad">Traslado de Establecimiento / Unidad</option>
                  <option value="Egreso o retiro de estudiante">Egreso o retiro de estudiante</option>
                  <option value="Optimización de licencias sin uso">Optimización de licencias sin uso</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Detalle Adicional
                </label>
                <input
                  type="text"
                  value={detalleMotivoBaja}
                  onChange={(e) => setDetalleMotivoBaja(e.target.value)}
                  placeholder="Ej: Solicitado por RRHH según oficio N°..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  N° Ticket / Documento de Respaldo
                </label>
                <input
                  type="text"
                  value={ticketBaja}
                  onChange={(e) => setTicketBaja(e.target.value)}
                  placeholder="Ej: BAJA-RRHH-2026"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={desactivarCuentaBaja}
                  onChange={(e) => setDesactivarCuentaBaja(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Marcar estado de la cuenta como EN BAJA</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalBajaUser(null)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg bg-[#EB567F] hover:bg-[#d9436c] text-white text-xs font-bold shadow cursor-pointer"
                >
                  {submitting ? 'Procesando Baja...' : 'Confirmar Baja'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: EDITAR FICHA DE USUARIO
      ===================================================================== */}
      {modalEditarUser && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#016098] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">Editar Datos de Usuario M365</h3>
              <button
                type="button"
                onClick={() => setModalEditarUser(null)}
                className="text-blue-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarEdicionUsuario} className="p-6 space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Nombres</label>
                <input
                  type="text"
                  required
                  value={modalEditarUser.nombres}
                  onChange={(e) => setModalEditarUser({ ...modalEditarUser, nombres: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Apellidos</label>
                <input
                  type="text"
                  required
                  value={modalEditarUser.apellidos}
                  onChange={(e) => setModalEditarUser({ ...modalEditarUser, apellidos: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">RUT</label>
                <input
                  type="text"
                  value={modalEditarUser.rut || ''}
                  onChange={(e) => setModalEditarUser({ ...modalEditarUser, rut: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Correo Alias Provisorio / Migración (Ej: usuario@cmds.cl)
                </label>
                <input
                  type="email"
                  value={modalEditarUser.email_alias || ''}
                  onChange={(e) => setModalEditarUser({ ...modalEditarUser, email_alias: e.target.value })}
                  placeholder="Ej: juan.gonzalez@cmds.cl"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Establecimiento / Unidad
                </label>
                <select
                  value={modalEditarUser.establecimiento_id || ''}
                  onChange={(e) =>
                    setModalEditarUser({ ...modalEditarUser, establecimiento_id: Number(e.target.value) })
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                >
                  {establecimientos.map((e) => (
                    <option key={e.id} value={e.id}>
                      [{e.codigo_unidad}] {e.nombre}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Tipo de Cuenta (Persona vs Máquina)
                </label>
                <select
                  value={modalEditarUser.tipo_usuario || 'FUNCIONARIO'}
                  onChange={(e) => {
                    const val = e.target.value;
                    setModalEditarUser({
                      ...modalEditarUser,
                      tipo_usuario: val,
                      tipo_cuenta: val === 'MAQUINA' ? 'MAQUINA' : 'PERSONA'
                    });
                  }}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-800"
                >
                  <option value="FUNCIONARIO">👤 Persona (Humano) — Funcionario / Docente</option>
                  <option value="ESTUDIANTE">🎓 Persona (Humano) — Alumno / Estudiante</option>
                  <option value="MAQUINA">🖥️ Máquina / Equipo (PC, Notebook, Tablet, Lab)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">Cargo</label>
                <input
                  type="text"
                  value={modalEditarUser.cargo || ''}
                  onChange={(e) => setModalEditarUser({ ...modalEditarUser, cargo: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalEditarUser(null)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
                >
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: HISTORIAL DE ASIGNACIONES DEL USUARIO
      ===================================================================== */}
      {modalHistorialUser && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#016098] text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-sm">Historial de Licencias del Usuario</h3>
                <p className="text-xs text-blue-200">
                  {modalHistorialUser.nombre_completo} ({modalHistorialUser.email})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalHistorialUser(null)}
                className="text-blue-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3 max-h-96 overflow-y-auto">
              {(modalHistorialUser.historial_asignaciones || []).length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  Este usuario no registra asignaciones históricas de licencias.
                </p>
              ) : (
                modalHistorialUser.historial_asignaciones.map((h: any) => (
                  <div
                    key={h.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800">{h.licencia_nombre}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Alta: {h.fecha_alta ? new Date(h.fecha_alta).toLocaleString('es-CL') : ''} · Por:{' '}
                        <strong>{h.asignado_por}</strong> ({h.numero_ticket})
                      </div>
                      {h.observaciones && (
                        <div className="text-[11px] text-slate-600 mt-1">{h.observaciones}</div>
                      )}
                      {h.fecha_baja && (
                        <div className="text-[11px] text-rose-700 font-semibold mt-1">
                          Baja: {new Date(h.fecha_baja).toLocaleString('es-CL')} — Motivo: {h.motivo_baja}
                        </div>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                        h.estado === 'ACTIVA'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {h.estado}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
