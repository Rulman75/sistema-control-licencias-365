import React, { useEffect, useState } from 'react';
import {
  Shield,
  UserPlus,
  KeyRound,
  Lock,
  Unlock,
  Edit3,
  Trash2,
  Copy,
  Check,
  Sparkles,
  Eye,
  X,
  CheckCircle2,
  AlertTriangle,
  History
} from 'lucide-react';
import { api, checkPasswordStrength, getStoredUser } from '../api';

export default function UsuariosSistema() {
  const currentUser = getStoredUser();
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [auditoria, setAuditoria] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'USUARIOS' | 'AUDITORIA'>('USUARIOS');
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal Crear / Editar Usuario del Sistema
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [formUser, setFormUser] = useState({
    username: '',
    nombre_completo: '',
    email: '',
    cargo: '',
    password: '',
    rol_acceso: 'GESTOR',
    ambito: 'ADMINISTRACION',
    debe_cambiar_clave: true,
    activo: true
  });
  const [saving, setSaving] = useState(false);

  // Modal Resetear Contraseña Segura
  const [resetTarget, setResetTarget] = useState<any | null>(null);
  const [nuevaPassReset, setNuevaPassReset] = useState('');
  const [forzarCambioReset, setForzarCambioReset] = useState(true);
  const [copiedPass, setCopiedPass] = useState(false);

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const res = await api.get('/sistema-usuarios');
      setUsuarios(res.data.usuarios_sistema || []);
      setAuditoria(res.data.auditoria || []);
    } catch (e) {
      console.error('Error cargando usuarios del sistema:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const showToast = (type: 'ok' | 'err', text: string) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 6000);
  };

  const generarClaveSegura = async (destino: 'CREAR' | 'RESET') => {
    try {
      const res = await api.get('/sistema-usuarios/generar-clave');
      const pwd = res.data.password;
      if (destino === 'CREAR') {
        setFormUser((prev) => ({ ...prev, password: pwd }));
      } else {
        setNuevaPassReset(pwd);
        setCopiedPass(false);
      }
    } catch {
      const fallback = 'CmDs#2026!x9Q';
      if (destino === 'CREAR') setFormUser((prev) => ({ ...prev, password: fallback }));
      else setNuevaPassReset(fallback);
    }
  };

  const abrirCrearModal = async () => {
    setEditingUser(null);
    setFormUser({
      username: '',
      nombre_completo: '',
      email: '',
      cargo: '',
      password: '',
      rol_acceso: 'GESTOR',
      ambito: 'ADMINISTRACION',
      debe_cambiar_clave: true,
      activo: true
    });
    setShowUserModal(true);
    await generarClaveSegura('CREAR');
  };

  const abrirEditarModal = (u: any) => {
    setEditingUser(u);
    setFormUser({
      username: u.username,
      nombre_completo: u.nombre_completo,
      email: u.email,
      cargo: u.cargo || '',
      password: '',
      rol_acceso: u.rol_acceso,
      ambito: u.ambito,
      debe_cambiar_clave: Boolean(u.debe_cambiar_clave),
      activo: Boolean(u.activo)
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editingUser) {
        const res = await api.put(`/sistema-usuarios/${editingUser.id}`, {
          nombre_completo: formUser.nombre_completo,
          email: formUser.email,
          cargo: formUser.cargo,
          rol_acceso: formUser.rol_acceso,
          ambito: formUser.ambito,
          activo: formUser.activo
        });
        showToast('ok', res.data.message);
      } else {
        const res = await api.post('/sistema-usuarios', formUser);
        showToast('ok', res.data.message);
      }
      setShowUserModal(false);
      await cargarDatos();
    } catch (err: any) {
      showToast('err', err.response?.data?.error || 'Error guardando usuario del sistema.');
    } finally {
      setSaving(false);
    }
  };

  const abrirModalResetPassword = async (u: any) => {
    setResetTarget(u);
    setForzarCambioReset(true);
    setCopiedPass(false);
    await generarClaveSegura('RESET');
  };

  const handleConfirmResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    setSaving(true);
    try {
      const res = await api.post(`/sistema-usuarios/${resetTarget.id}/reset-password`, {
        nuevaPassword: nuevaPassReset,
        generarAutomatica: false,
        forzarCambio: forzarCambioReset
      });
      showToast(
        'ok',
        `${res.data.message} Clave asignada: ${res.data.passwordTemporal}`
      );
      setResetTarget(null);
      await cargarDatos();
    } catch (err: any) {
      showToast('err', err.response?.data?.error || 'Error al resetear la contraseña.');
    } finally {
      setSaving(false);
    }
  };

  const handleDesbloquear = async (u: any) => {
    try {
      await api.put(`/sistema-usuarios/${u.id}`, { desbloquear: true, activo: true });
      showToast('ok', `Cuenta '${u.username}' desbloqueada exitosamente.`);
      await cargarDatos();
    } catch {
      showToast('err', 'Error al desbloquear la cuenta.');
    }
  };

  const handleEliminarUsuario = async (u: any) => {
    if (currentUser && u.id === currentUser.id) {
      showToast('err', 'No puede eliminar su propia cuenta de administrador en sesión.');
      return;
    }
    const ok = window.confirm(
      `¿Está seguro que desea eliminar permanentemente al usuario del sistema '${u.username}' (${u.nombre_completo})?`
    );
    if (!ok) return;

    try {
      const res = await api.delete(`/sistema-usuarios/${u.id}`);
      showToast('ok', res.data.message || `Usuario '${u.username}' eliminado exitosamente.`);
      await cargarDatos();
    } catch (err: any) {
      showToast('err', err.response?.data?.error || 'Error al eliminar el usuario del sistema.');
    }
  };

  const passStrength = checkPasswordStrength(editingUser ? 'Placeholder#1234!' : formUser.password);
  const resetStrength = checkPasswordStrength(nuevaPassReset);

  return (
    <div className="space-y-5">
      {/* Cabecera */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#016098]/10 text-[#016098] mb-1">
            <Shield className="w-3.5 h-3.5" /> Seguridad para Exposición a Internet
          </div>
          <h1 className="text-2xl font-extrabold text-[#016098]">
            Mantenedor de Usuarios del Sistema, Perfiles y Contraseñas
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Administración de cuentas de acceso por perfil sectorial (<strong>Administración</strong>, <strong>Educación</strong>, <strong>Salud</strong>, <strong>Global</strong>), modo de <strong>Solo Visualización</strong> y reseteo seguro de contraseñas.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('USUARIOS')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
                activeTab === 'USUARIOS' ? 'bg-[#016098] text-white shadow' : 'text-slate-600'
              }`}
            >
              Cuentas y Perfiles ({usuarios.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('AUDITORIA')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'AUDITORIA' ? 'bg-[#016098] text-white shadow' : 'text-slate-600'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Bitácora de Seguridad</span>
            </button>
          </div>

          <button
            type="button"
            onClick={abrirCrearModal}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-white" />
            <span>Nuevo Usuario del Sistema</span>
          </button>
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

      {/* Guía rápida de Perfiles y Niveles de Permiso */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-extrabold text-[#016098] flex items-center gap-1.5">
            <Shield className="w-4 h-4" /> Superadministrador (ADMIN_SISTEMA)
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Control total sobre los 3 dominios del Tenant, ajuste de cupos de licencias y administración de usuarios/contraseñas de este sistema.
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-extrabold text-emerald-700 flex items-center gap-1.5">
            <KeyRound className="w-4 h-4" /> Gestor Sectorial (GESTOR)
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Puede visualizar todo el sistema y dar de alta, asignar o dar de baja licencias dentro de su perfil asignado (<strong>Administración</strong>, <strong>Educación</strong>, <strong>Salud</strong> o <strong>Global</strong>).
          </p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
          <div className="text-xs font-extrabold text-amber-700 flex items-center gap-1.5">
            <Eye className="w-4 h-4" /> Solo Visualización (VISUALIZADOR)
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Puede consultar el Dashboard, ver la distribución y descargar reportes Excel/PDF, pero <strong>no puede asignar, ni dar de baja, ni modificar nada</strong>.
          </p>
        </div>
      </div>

      {activeTab === 'USUARIOS' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 uppercase text-[11px] border-b border-slate-200">
                  <th className="py-3 px-4 font-bold">Usuario / Correo</th>
                  <th className="py-3 px-4 font-bold">Nombre y Cargo</th>
                  <th className="py-3 px-4 font-bold">Perfil Sectorial</th>
                  <th className="py-3 px-4 font-bold">Nivel de Permiso</th>
                  <th className="py-3 px-4 font-bold text-center">Estado / Seguridad</th>
                  <th className="py-3 px-4 font-bold">Último Acceso</th>
                  <th className="py-3 px-4 font-bold text-right">Acciones Administrativas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-500 font-semibold">
                      Cargando cuentas del sistema...
                    </td>
                  </tr>
                ) : (
                  usuarios.map((u) => {
                    const bloqueado = u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date();
                    return (
                      <tr key={u.id} className="hover:bg-slate-50">
                        <td className="py-3 px-4">
                          <div className="font-mono font-bold text-[#016098]">{u.username}</div>
                          <div className="text-[11px] text-slate-400">{u.email}</div>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-800">{u.nombre_completo}</div>
                          <div className="text-[11px] text-slate-500">{u.cargo || 'Sin cargo'}</div>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${
                              u.ambito === 'GLOBAL'
                                ? 'bg-blue-100 text-[#016098]'
                                : u.ambito === 'SALUD'
                                ? 'bg-teal-100 text-teal-900'
                                : u.ambito === 'EDUCACION'
                                ? 'bg-indigo-100 text-indigo-900'
                                : 'bg-slate-200 text-slate-800'
                            }`}
                          >
                            {u.ambito === 'GLOBAL'
                              ? 'GLOBAL (3 Dominios)'
                              : u.ambito === 'ADMINISTRACION'
                              ? 'ADMINISTRACIÓN (cmds.cl)'
                              : u.ambito === 'SALUD'
                              ? 'SALUD (cmds-salud.cl)'
                              : 'EDUCACIÓN (cmds-educacion.cl)'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block whitespace-nowrap px-2.5 py-1 rounded-lg text-[10px] font-extrabold ${
                              u.rol_acceso === 'ADMIN_SISTEMA'
                                ? 'bg-[#016098] text-white'
                                : u.rol_acceso === 'GESTOR'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {u.rol_acceso === 'ADMIN_SISTEMA'
                              ? 'ADMIN SISTEMA'
                              : u.rol_acceso === 'GESTOR'
                              ? 'GESTOR (Asignación)'
                              : 'SOLO VISUALIZACIÓN'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center space-y-1">
                          <div>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                !u.activo
                                  ? 'bg-rose-100 text-rose-800'
                                  : bloqueado
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {!u.activo ? 'INACTIVO' : bloqueado ? 'BLOQUEADO TEMP.' : 'ACTIVO'}
                            </span>
                          </div>
                          {u.debe_cambiar_clave && (
                            <div className="text-[10px] text-amber-700 font-semibold">
                              Cambio clave pendiente
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[11px] text-slate-500">
                          {u.ultimo_acceso
                            ? new Date(u.ultimo_acceso).toLocaleString('es-CL')
                            : 'Sin ingresos registrados'}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => abrirModalResetPassword(u)}
                              className="px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold flex items-center gap-1 shadow-sm cursor-pointer"
                              title="Resetear Contraseña Segura"
                            >
                              <KeyRound className="w-3.5 h-3.5" />
                              <span>Resetear Clave</span>
                            </button>

                            {bloqueado && (
                              <button
                                type="button"
                                onClick={() => handleDesbloquear(u)}
                                className="px-2 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                title="Desbloquear cuenta"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => abrirEditarModal(u)}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 cursor-pointer"
                              title="Editar Perfil y Permisos"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>

                            {(!currentUser || currentUser.id !== u.id) && (
                              <button
                                type="button"
                                onClick={() => handleEliminarUsuario(u)}
                                className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white transition-colors cursor-pointer"
                                title="Eliminar Usuario del Sistema"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* TAB BITÁCORA DE AUDITORÍA DE ACCESOS Y SEGURIDAD */
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700">
            Registro de Inicios de Sesión, Intentos Fallidos y Acciones de Seguridad
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 uppercase text-[11px] border-b border-slate-200">
                  <th className="py-3 px-4 font-bold">Fecha / Hora</th>
                  <th className="py-3 px-4 font-bold">Usuario</th>
                  <th className="py-3 px-4 font-bold">Acción</th>
                  <th className="py-3 px-4 font-bold">Dirección IP</th>
                  <th className="py-3 px-4 font-bold">Resultado</th>
                  <th className="py-3 px-4 font-bold">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {auditoria.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-500">
                      {a.fecha ? new Date(a.fecha).toLocaleString('es-CL') : ''}
                    </td>
                    <td className="py-2.5 px-4 font-mono font-bold text-[#016098]">{a.username}</td>
                    <td className="py-2.5 px-4 font-bold text-slate-700">{a.accion}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-500">{a.ip}</td>
                    <td className="py-2.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          a.exito ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {a.exito ? 'EXITOSO' : 'ALERTA / RECHAZADO'}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{a.detalle}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 1: CREAR / EDITAR USUARIO DEL SISTEMA Y PERFILES
      ===================================================================== */}
      {showUserModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 max-h-[92vh] flex flex-col">
            <div className="px-6 py-4 bg-[#016098] text-white flex items-center justify-between">
              <h3 className="font-bold text-sm">
                {editingUser ? `Editar Cuenta: ${editingUser.username}` : 'Crear Nuevo Usuario del Sistema'}
              </h3>
              <button
                type="button"
                onClick={() => setShowUserModal(false)}
                className="text-blue-100 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Usuario / Login *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={Boolean(editingUser)}
                    value={formUser.username}
                    onChange={(e) => setFormUser({ ...formUser, username: e.target.value })}
                    placeholder="Ej: jperez@cmds.cl"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono disabled:bg-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Correo de Contacto *
                  </label>
                  <input
                    type="email"
                    required
                    value={formUser.email}
                    onChange={(e) => setFormUser({ ...formUser, email: e.target.value })}
                    placeholder="correo@cmds.cl"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={formUser.nombre_completo}
                    onChange={(e) => setFormUser({ ...formUser, nombre_completo: e.target.value })}
                    placeholder="Nombre y Apellidos del Funcionario"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                    Cargo / Unidad
                  </label>
                  <input
                    type="text"
                    value={formUser.cargo}
                    onChange={(e) => setFormUser({ ...formUser, cargo: e.target.value })}
                    placeholder="Ej: Encargado TI Salud / Auditor Control Interno"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#016098] mb-1">
                    Perfil Sectorial (Ámbito) *
                  </label>
                  <select
                    value={formUser.ambito}
                    onChange={(e) => setFormUser({ ...formUser, ambito: e.target.value })}
                    className="w-full rounded-lg border border-blue-300 bg-blue-50/40 px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    <option value="ADMINISTRACION">ADMINISTRACIÓN (@cmds.cl)</option>
                    <option value="EDUCACION">EDUCACIÓN (@cmds-educacion.cl)</option>
                    <option value="SALUD">SALUD (@cmds-salud.cl)</option>
                    <option value="GLOBAL">GLOBAL (Todos los Dominios)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-[#016098] mb-1">
                    Nivel de Permiso (Rol) *
                  </label>
                  <select
                    value={formUser.rol_acceso}
                    onChange={(e) => setFormUser({ ...formUser, rol_acceso: e.target.value })}
                    className="w-full rounded-lg border border-blue-300 bg-blue-50/40 px-3 py-2 text-xs font-bold text-slate-800"
                  >
                    <option value="VISUALIZADOR">SOLO VISUALIZACIÓN (Sin asignar)</option>
                    <option value="GESTOR">GESTOR OPERATIVO (Asignar y Bajas)</option>
                    <option value="ADMIN_SISTEMA">SUPERADMINISTRADOR</option>
                  </select>
                </div>
              </div>

              {!editingUser && (
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-slate-700">
                      Contraseña Inicial Segura *
                    </label>
                    <button
                      type="button"
                      onClick={() => generarClaveSegura('CREAR')}
                      className="text-[11px] font-bold text-[#016098] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Generar otra clave segura
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    value={formUser.password}
                    onChange={(e) => setFormUser({ ...formUser, password: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono font-bold text-[#016098]"
                  />
                  <div className="text-[11px] text-slate-500">
                    Política obligatoria: 10+ caracteres, mayúscula, minúscula, número y símbolo especial.
                  </div>
                </div>
              )}

              {editingUser && (
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={formUser.activo}
                    onChange={(e) => setFormUser({ ...formUser, activo: e.target.checked })}
                  />
                  <span>Cuenta habilitada para iniciar sesión</span>
                </label>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || (!editingUser && !passStrength.isValid())}
                  className="flex-1 py-2.5 rounded-lg bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: RESETEAR CONTRASEÑA SEGURA DE USUARIO
      ===================================================================== */}
      {resetTarget && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-amber-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                <h3 className="font-bold text-sm">Resetear Contraseña de Usuario</h3>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="text-white/90 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmResetPassword} className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950">
                <div>
                  <strong>Usuario:</strong> {resetTarget.nombre_completo}
                </div>
                <div className="font-mono text-[11px]">{resetTarget.username}</div>
                <div className="mt-1 text-[11px]">
                  Perfil: <strong>{resetTarget.ambito}</strong> · Rol: <strong>{resetTarget.rol_acceso}</strong>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold uppercase text-slate-700">
                    Nueva Contraseña Segura
                  </label>
                  <button
                    type="button"
                    onClick={() => generarClaveSegura('RESET')}
                    className="text-xs font-bold text-[#016098] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Generar Automática
                  </button>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    required
                    value={nuevaPassReset}
                    onChange={(e) => {
                      setNuevaPassReset(e.target.value);
                      setCopiedPass(false);
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono font-bold text-[#016098]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(nuevaPassReset);
                      setCopiedPass(true);
                    }}
                    className="px-3 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-xs font-bold text-slate-700 flex items-center gap-1 cursor-pointer"
                    title="Copiar contraseña al portapapeles"
                  >
                    {copiedPass ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedPass ? 'Copiada' : 'Copiar'}</span>
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                <div className={resetStrength.minLength ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                  ✓ Mínimo 10 caracteres
                </div>
                <div className={resetStrength.hasUpper && resetStrength.hasLower ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                  ✓ Letras mayúsculas y minúsculas
                </div>
                <div className={resetStrength.hasDigit && resetStrength.hasSymbol ? 'text-emerald-700 font-semibold' : 'text-slate-400'}>
                  ✓ Números y caracteres especiales (!@#$%&*+=)
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={forzarCambioReset}
                  onChange={(e) => setForzarCambioReset(e.target.checked)}
                />
                <span>Solicitar cambio obligatorio de contraseña en el próximo inicio de sesión</span>
              </label>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving || !resetStrength.isValid()}
                  className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow cursor-pointer disabled:opacity-50"
                >
                  {saving ? 'Aplicando...' : 'Confirmar Reseteo de Clave'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
