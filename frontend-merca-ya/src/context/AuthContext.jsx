/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react';
import { api, refreshSession, setToken } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  function showToast(message) {
    setToast(message);
    window.setTimeout(() => setToast(''), 3400);
  }

  useEffect(() => {
    refreshSession()
      .then((session) => setUser(session?.user || null))
      .finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const result = await api('/auth/ingreso', { method: 'POST', auth: false, body: { email, password } });
    setToken(result.data.accessToken);
    setUser(result.data.user);
    return result.data.user;
  }

  async function register(body) {
    const result = await api('/auth/registro', { method: 'POST', auth: false, body });
    setToken(result.data.accessToken);
    setUser(result.data.user);
    return result.data.user;
  }

  async function logout() {
    await api('/auth/salir', { method: 'POST', auth: false }).catch(() => {});
    setToken('');
    setUser(null);
  }

  async function refreshUser() {
    const result = await api('/auth/yo');
    setUser(result.data);
    return result.data;
  }

  return (
    <AuthContext.Provider value={{ user, loading, toast, showToast, login, register, logout, refreshUser, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return value;
}
