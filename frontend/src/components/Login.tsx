import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, User, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { api } from '../api';
import { VERSION_DISPLAY, VERSION_TOOLTIP } from '../version';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password.trim()) {
      setError('Por favor, ingrese su usuario/correo y contraseña.');
      return;
    }

    setLoading(true);
    try {
      const response = await api.post('/auth/login', {
        username: username.trim(),
        password
      });

      if (response.data.status === 'ok') {
        localStorage.setItem('cmds_m365_token', response.data.token);
        localStorage.setItem('cmds_m365_user', JSON.stringify(response.data.user));
        navigate('/dashboard');
      } else {
        setError(response.data.error || 'Error al iniciar sesión');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7f6] flex flex-col justify-center items-center p-4">
      <div className="max-w-4xl w-full bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col md:flex-row border border-gray-100">
        {/* Lado Izquierdo: Identidad Corporativa CMDS */}
        <div className="md:w-1/2 bg-[#016098] text-white p-10 flex flex-col justify-between items-center text-center relative overflow-hidden">
          <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full bg-white opacity-5"></div>
          <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-[#39BABD] opacity-20"></div>

          <div className="z-10 mt-4">
            <img
              src="/logo.png"
              alt="Logo CMDS"
              className="w-36 h-auto mx-auto mb-5 bg-white p-3 rounded-xl shadow-md"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <h1 className="text-3xl font-extrabold tracking-tight mb-1 text-white">CMDS</h1>
            <h2 className="text-base font-medium text-blue-100">
              Corporación Municipal de Desarrollo Social
            </h2>
          </div>

          <div className="z-10 my-6 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#39BABD]/25 border border-[#39BABD]/40 text-xs font-bold text-white">
              <ShieldCheck className="w-4 h-4 text-white" />
              Tenant Único Microsoft 365
            </div>
            <p className="text-xl text-white leading-snug font-extrabold tracking-wide">
              Sistema de Control de Licencias Microsoft 365
            </p>
            <div className="pt-2">
              <span
                title={VERSION_TOOLTIP}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white/15 text-blue-50 border border-white/20 shadow-sm tracking-wide"
              >
                Versión {VERSION_DISPLAY}
              </span>
            </div>
          </div>

          <div className="z-10 text-[11px] text-blue-200 space-y-1">
            <div>&copy; {new Date().getFullYear()} CMDS Antofagasta — Unidad de Tecnologías de la Información (TI).</div>
          </div>
        </div>

        {/* Lado Derecho: Formulario de Acceso Seguro */}
        <div className="md:w-1/2 p-8 md:p-11 flex flex-col justify-center bg-white">
          {error && (
            <div className="mb-5 bg-[#EB567F]/10 border-l-4 border-[#EB567F] p-3.5 rounded-md flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-[#EB567F] shrink-0 mt-0.5" />
              <p className="text-xs text-[#EB567F] font-semibold leading-relaxed">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase text-[#1e293b] mb-1.5" htmlFor="username">
                Usuario o Correo Institucional
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <User className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 w-full px-4 py-2.5 bg-[#f8fafc] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#016098] focus:bg-white transition-colors text-sm text-[#1e293b]"
                  placeholder="Correo institucional"
                  disabled={loading}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#1e293b] mb-1.5" htmlFor="password">
                Contraseña Segura
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                  <Lock className="h-4 w-4 text-gray-400" />
                </div>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 pr-10 w-full px-4 py-2.5 bg-[#f8fafc] border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#016098] focus:bg-white transition-colors text-sm text-[#1e293b]"
                  placeholder="••••••••••••"
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-[#016098]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-1">
              <button
                type="submit"
                disabled={loading}
                className={`w-full py-3 px-4 bg-[#016098] hover:bg-[#024a8d] text-white font-bold rounded-lg shadow-md hover:shadow-lg transition duration-200 flex justify-center items-center text-sm cursor-pointer ${
                  loading ? 'opacity-70 cursor-not-allowed' : ''
                }`}
              >
                {loading ? 'Verificando credenciales...' : 'Iniciar Sesión'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
