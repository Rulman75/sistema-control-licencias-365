import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  KeyRound,
  Users,
  ArrowLeftRight,
  FileSpreadsheet,
  Shield,
  Building2,
  LogOut,
  Menu,
  X,
  Eye,
  Lock,
  CheckCircle2,
  AlertTriangle,
  Database
} from 'lucide-react';
import { api, getStoredUser, UserSession, checkPasswordStrength } from '../api';
import { VERSION_DISPLAY, VERSION_TOOLTIP } from '../version';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [user, setUser] = useState<UserSession | null>(getStoredUser());
  const [dbStatus, setDbStatus] = useState<{ engine: string; host: string; database: string; connected: boolean } | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Modal Cambio de Contraseña (Obligatorio o Voluntario)
  const [showPassModal, setShowPassModal] = useState(false);
  const [passwordActual, setPasswordActual] = useState('');
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [confirmarPassword, setConfirmarPassword] = useState('');
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingPass, setSavingPass] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('cmds_m365_token');
    if (!token) {
      navigate('/login');
      return;
    }

    api
      .get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        setDbStatus(res.data.dbStatus);
        localStorage.setItem('cmds_m365_user', JSON.stringify(res.data.user));
        if (res.data.user?.debe_cambiar_clave) {
          setShowPassModal(true);
        }
      })
      .catch(() => {
        localStorage.removeItem('cmds_m365_token');
        localStorage.removeItem('cmds_m365_user');
        navigate('/login');
      });
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('cmds_m365_token');
    localStorage.removeItem('cmds_m365_user');
    navigate('/login');
  };

  const strength = checkPasswordStrength(nuevaPassword);

  const handleCambiarClave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);

    if (!strength.isValid()) {
      setPassMsg({
        type: 'err',
        text: 'La nueva contraseña no cumple con todos los requisitos de seguridad.'
      });
      return;
    }

    if (nuevaPassword !== confirmarPassword) {
      setPassMsg({
        type: 'err',
        text: 'La confirmación de contraseña no coincide.'
      });
      return;
    }

    setSavingPass(true);
    try {
      const res = await api.post('/auth/cambiar-clave', {
        passwordActual,
        nuevaPassword
      });
      localStorage.setItem('cmds_m365_token', res.data.token);
      localStorage.setItem('cmds_m365_user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      setPassMsg({ type: 'ok', text: 'Contraseña actualizada correctamente.' });
      setPasswordActual('');
      setNuevaPassword('');
      setConfirmarPassword('');
      setTimeout(() => {
        setShowPassModal(false);
        setPassMsg(null);
      }, 1200);
    } catch (err: any) {
      setPassMsg({
        type: 'err',
        text: err.response?.data?.error || 'Error al actualizar la contraseña.'
      });
    } finally {
      setSavingPass(false);
    }
  };

  if (!user) return null;

  const isActive = (path: string) => location.pathname === path;
  const isReadOnly = user.rol_acceso === 'VISUALIZADOR';
  const isSystemAdmin = user.rol_acceso === 'ADMIN_SISTEMA';

  const getRolLabel = (rol: string) => {
    switch (rol) {
      case 'ADMIN_SISTEMA':
        return 'Superadministrador';
      case 'GESTOR':
        return 'Gestor Operativo';
      case 'VISUALIZADOR':
        return 'Solo Visualización';
      default:
        return rol;
    }
  };

  const getAmbitoBadge = (ambito: string) => {
    switch (ambito) {
      case 'GLOBAL':
        return { label: 'Tenant Global (3 Dominios)', bg: 'bg-white/20 text-white' };
      case 'ADMINISTRACION':
        return { label: 'Administración (cmds.cl)', bg: 'bg-blue-200 text-[#016098]' };
      case 'EDUCACION':
        return { label: 'Educación (cmds-educacion.cl)', bg: 'bg-indigo-200 text-indigo-950' };
      case 'SALUD':
        return { label: 'Salud APS (cmds-salud.cl)', bg: 'bg-teal-200 text-teal-950' };
      default:
        return { label: ambito, bg: 'bg-gray-200 text-gray-800' };
    }
  };

  const ambitoInfo = getAmbitoBadge(user.ambito);

  return (
    <div className="flex flex-col md:flex-row h-screen bg-[#f4f7f6] font-sans text-[#1e293b] overflow-hidden print:bg-white print:h-auto">
      {/* Botón menú móvil */}
      <button
        className="md:hidden fixed top-4 right-4 z-50 p-2 bg-white rounded-lg shadow-md text-[#016098] no-print"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40 no-print"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar Corporativo CMDS */}
      <aside
        className={`
          fixed md:static inset-y-0 left-0 z-40 no-print
          w-[280px] bg-[#016098] text-white shrink-0 shadow-xl flex flex-col justify-between
          transform transition-transform duration-300 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="p-4 overflow-y-auto flex-1">
          {/* Encabezado Institucional */}
          <div className="flex flex-col items-center pb-4 mb-4 border-b border-white/15 text-center">
            <img
              src="/logo.png"
              alt="Logo CMDS"
              className="max-w-[88px] h-auto mb-2.5 bg-white p-2 rounded-xl shadow-md"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h1 className="text-base font-extrabold tracking-wide text-white leading-tight">
              LICENCIAS M365 CMDS
            </h1>
            <p className="text-[11px] text-blue-100 mt-0.5 font-medium">
              Control de Tenant y Dominios
            </p>
            <div className="flex items-center gap-1.5 mt-2">
              <span
                title={VERSION_TOOLTIP}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-white/10 text-blue-100 border border-white/15"
              >
                {VERSION_DISPLAY}
              </span>
              {dbStatus && (
                <span
                  title={`Base de Datos: ${dbStatus.database} (${dbStatus.host})`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                    dbStatus.connected
                      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                      : 'bg-amber-500/20 text-amber-200 border-amber-400/30'
                  }`}
                >
                  <Database className="w-2.5 h-2.5" />
                  {dbStatus.connected ? 'PostgreSQL' : 'Local Sync'}
                </span>
              )}
            </div>

            {/* Ficha del Usuario en Sesión */}
            <div className="mt-3.5 w-full bg-[#024a8d] p-3 rounded-xl border border-white/10 text-left space-y-1.5 shadow-inner">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-blue-200 font-bold">
                  Operador Activo
                </span>
                <span
                  className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                    isReadOnly
                      ? 'bg-amber-400 text-slate-900'
                      : isSystemAdmin
                      ? 'bg-[#39BABD] text-white'
                      : 'bg-emerald-500 text-white'
                  }`}
                >
                  {getRolLabel(user.rol_acceso)}
                </span>
              </div>
              <p className="text-xs font-bold text-white truncate" title={user.nombre_completo}>
                {user.nombre_completo}
              </p>
              <p className="text-[11px] text-blue-200 truncate font-mono">{user.username}</p>
              <div className="pt-1">
                <span className={`inline-block text-[10px] font-extrabold px-2 py-0.5 rounded ${ambitoInfo.bg}`}>
                  Perfil: {ambitoInfo.label}
                </span>
              </div>
            </div>
          </div>

          {/* Menú de Navegación */}
          <div className="pb-1.5 px-2 text-[10px] font-bold uppercase tracking-wider text-blue-200/80">
            Gestión Microsoft 365
          </div>

          <nav className="space-y-1 text-sm">
            <Link
              to="/dashboard"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-semibold transition-all text-xs ${
                isActive('/dashboard')
                  ? 'bg-[#39BABD] text-white shadow-md'
                  : 'text-blue-50/90 hover:bg-white/10'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" />
              <span>Dashboard Global y Dominios</span>
            </Link>

            <Link
              to="/licencias"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-semibold transition-all text-xs ${
                isActive('/licencias')
                  ? 'bg-[#39BABD] text-white shadow-md'
                  : 'text-blue-50/90 hover:bg-white/10'
              }`}
            >
              <KeyRound className="w-4 h-4 shrink-0" />
              <span>Control de Cupos por Licencia</span>
            </Link>

            <Link
              to="/usuarios"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-semibold transition-all text-xs ${
                isActive('/usuarios')
                  ? 'bg-[#39BABD] text-white shadow-md'
                  : 'text-blue-50/90 hover:bg-white/10'
              }`}
            >
              <Users className="w-4 h-4 shrink-0" />
              <span>Usuarios y Asignación M365</span>
            </Link>

            <Link
              to="/movimientos"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-semibold transition-all text-xs ${
                isActive('/movimientos')
                  ? 'bg-[#39BABD] text-white shadow-md'
                  : 'text-blue-50/90 hover:bg-white/10'
              }`}
            >
              <ArrowLeftRight className="w-4 h-4 shrink-0" />
              <span>Reportes de Altas y Bajas</span>
            </Link>

            <Link
              to="/importar"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-semibold transition-all text-xs ${
                isActive('/importar')
                  ? 'bg-[#39BABD] text-white shadow-md'
                  : 'text-blue-50/90 hover:bg-white/10'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 shrink-0" />
              <span>Carga Masiva y Exportación</span>
            </Link>

            <div className="pt-3 pb-1 px-2 text-[10px] font-bold uppercase tracking-wider text-blue-200/80">
              Configuración y Seguridad
            </div>

            <Link
              to="/mantenedores"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-semibold transition-all text-xs ${
                isActive('/mantenedores')
                  ? 'bg-[#39BABD] text-white shadow-md'
                  : 'text-blue-50/90 hover:bg-white/10'
              }`}
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span>Establecimientos y Dominios</span>
            </Link>

            {isSystemAdmin && (
              <Link
                to="/usuarios-sistema"
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 py-2.5 px-3.5 rounded-xl font-semibold transition-all text-xs ${
                  isActive('/usuarios-sistema')
                    ? 'bg-[#39BABD] text-white shadow-md'
                    : 'text-white hover:bg-white/10'
                }`}
              >
                <Shield className="w-4 h-4 shrink-0" />
                <span>Usuarios del Sistema y Perfiles</span>
              </Link>
            )}
          </nav>
        </div>

        {/* Footer del Sidebar */}
        <div className="p-4 border-t border-white/15 bg-[#015282] space-y-2">
          <button
            type="button"
            onClick={() => {
              setPassMsg(null);
              setShowPassModal(true);
            }}
            className="w-full py-2 px-3 bg-white/10 hover:bg-white/20 text-blue-100 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Cambiar Mi Contraseña</span>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-3 bg-[#EB567F] hover:bg-[#d9436c] text-white rounded-lg text-xs font-bold transition flex items-center justify-center gap-2 shadow cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Área Principal de Contenido */}
      <main className="flex-1 flex flex-col overflow-y-auto">
        {/* Banner superior de modo Solo Lectura o Alcance Sectorial */}
        {isReadOnly && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center justify-between text-xs text-amber-900 no-print">
            <div className="flex items-center gap-2 font-semibold">
              <Eye className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Modo Solo Visualización Activo:</strong> Su perfil permite visualizar dashboards, distribución de licencias y descargar reportes, pero no realizar asignaciones, altas ni bajas.
              </span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full bg-amber-200/80 text-amber-950 font-bold text-[11px] shrink-0">
              Perfil: {user.ambito}
            </span>
          </div>
        )}

        {!isReadOnly && user.ambito !== 'GLOBAL' && user.rol_acceso !== 'ADMIN_SISTEMA' && (
          <div className="bg-blue-50 border-b border-blue-200 px-6 py-2 flex items-center justify-between text-xs text-[#016098] no-print">
            <div className="flex items-center gap-2 font-semibold">
              <Shield className="w-4 h-4 text-[#016098] shrink-0" />
              <span>
                <strong>Perfil Sectorial {user.ambito}:</strong> Usted está habilitado para gestionar y asignar licencias correspondientes al sector <strong>{user.ambito}</strong>.
              </span>
            </div>
          </div>
        )}

        <div className="p-6 md:p-8 flex-1">
          <Outlet context={{ user }} />
        </div>
      </main>

      {/* MODAL CAMBIO DE CONTRASEÑA (OBLIGATORIO O VOLUNTARIO) */}
      {showPassModal && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
            <div className="px-6 py-4 bg-[#016098] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-white" />
                <h3 className="font-bold text-sm">
                  {user.debe_cambiar_clave
                    ? 'Actualización Obligatoria de Contraseña Segura'
                    : 'Cambiar Mi Contraseña'}
                </h3>
              </div>
              {!user.debe_cambiar_clave && (
                <button
                  type="button"
                  onClick={() => setShowPassModal(false)}
                  className="text-blue-100 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <form onSubmit={handleCambiarClave} className="p-6 space-y-4">
              {user.debe_cambiar_clave && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <span>
                    Su contraseña ha sido reseteada por el Administrador. Por seguridad, debe definir una nueva contraseña personal segura antes de continuar.
                  </span>
                </div>
              )}

              {passMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold border ${
                    passMsg.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}
                >
                  {passMsg.text}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Contraseña Actual / Temporal
                </label>
                <input
                  type="password"
                  required
                  value={passwordActual}
                  onChange={(e) => setPasswordActual(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  placeholder="Ingrese su contraseña actual"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Nueva Contraseña Segura
                </label>
                <input
                  type="password"
                  required
                  value={nuevaPassword}
                  onChange={(e) => setNuevaPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  placeholder="Mínimo 10 caracteres"
                />
              </div>

              {/* Checklist visual de complejidad */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1 text-[11px]">
                <p className="font-bold text-slate-700 mb-1">Requisitos de seguridad (Exposición a Internet):</p>
                <div className={`flex items-center gap-1.5 ${strength.minLength ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Mínimo 10 caracteres
                </div>
                <div className={`flex items-center gap-1.5 ${strength.hasUpper ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Al menos 1 letra mayúscula (A-Z)
                </div>
                <div className={`flex items-center gap-1.5 ${strength.hasLower ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Al menos 1 letra minúscula (a-z)
                </div>
                <div className={`flex items-center gap-1.5 ${strength.hasDigit ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Al menos 1 número (0-9)
                </div>
                <div className={`flex items-center gap-1.5 ${strength.hasSymbol ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Al menos 1 carácter especial (!@#$%^&*._-+=?)
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  required
                  value={confirmarPassword}
                  onChange={(e) => setConfirmarPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#016098]"
                  placeholder="Repita la nueva contraseña"
                />
              </div>

              <div className="flex gap-2 pt-2">
                {!user.debe_cambiar_clave && (
                  <button
                    type="button"
                    onClick={() => setShowPassModal(false)}
                    className="flex-1 py-2.5 rounded-lg border border-slate-300 text-xs font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  disabled={savingPass}
                  className="flex-1 py-2.5 rounded-lg bg-[#016098] hover:bg-[#024a8d] text-white text-xs font-bold shadow cursor-pointer"
                >
                  {savingPass ? 'Guardando...' : 'Actualizar Contraseña'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
