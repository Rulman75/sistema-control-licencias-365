import axios from 'axios';

export const api = axios.create({
  baseURL: '/api'
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('cmds_m365_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response && err.response.status === 401 && !window.location.pathname.startsWith('/login')) {
      localStorage.removeItem('cmds_m365_token');
      localStorage.removeItem('cmds_m365_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export interface UserSession {
  id: number;
  username: string;
  nombre_completo: string;
  email: string;
  cargo?: string;
  rol_acceso: 'ADMIN_SISTEMA' | 'GESTOR' | 'VISUALIZADOR';
  ambito: 'GLOBAL' | 'ADMINISTRACION' | 'EDUCACION' | 'SALUD';
  debe_cambiar_clave: boolean;
}

export function getStoredUser(): UserSession | null {
  try {
    const raw = localStorage.getItem('cmds_m365_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function canUserWrite(user: UserSession | null, sectorDominio?: string): boolean {
  if (!user) return false;
  if (user.rol_acceso === 'VISUALIZADOR') return false;
  if (user.rol_acceso === 'ADMIN_SISTEMA') return true;
  if (!sectorDominio || user.ambito === 'GLOBAL') return true;
  return user.ambito === sectorDominio;
}

export function checkPasswordStrength(password: string) {
  return {
    minLength: password.length >= 10,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasDigit: /[0-9]/.test(password),
    hasSymbol: /[!@#$%^&*._\-+=?]/.test(password),
    isValid() {
      return this.minLength && this.hasUpper && this.hasLower && this.hasDigit && this.hasSymbol;
    }
  };
}
