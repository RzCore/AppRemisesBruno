'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from '@/types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  updateUser: (userData: User) => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Claves aisladas exclusivamente para la App de Clientes
const STORAGE_USER_KEY = 'cliente_user';
const STORAGE_TOKEN_KEY = 'cliente_accessToken';
const STORAGE_REFRESH_KEY = 'cliente_refreshToken';

const COOKIE_USER_KEY = 'bruno_cliente_user';
const COOKIE_TOKEN_KEY = 'bruno_cliente_access_token';
const COOKIE_REFRESH_KEY = 'bruno_cliente_refresh_token';

function setClientDomainCookie(name: string, value: string, days = 30) {
  if (typeof document === 'undefined') return;
  const hostname = window.location.hostname.toLowerCase();
  let domainPart = '';
  if (hostname.includes('brunoremises.com.ar')) {
    domainPart = '; domain=.brunoremises.com.ar';
  }
  const date = new Date();
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
  const expires = '; expires=' + date.toUTCString();
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}${expires}${domainPart}; path=/; SameSite=Lax${secure}`;
}

function getClientDomainCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const nameEQ = name + '=';
  const ca = document.cookie.split(';');
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i];
    while (c.charAt(0) === ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) === 0) return decodeURIComponent(c.substring(nameEQ.length, c.length));
  }
  return null;
}

function removeClientDomainCookie(name: string) {
  if (typeof document === 'undefined') return;
  const hostname = window.location.hostname.toLowerCase();
  let domainPart = '';
  if (hostname.includes('brunoremises.com.ar')) {
    domainPart = '; domain=.brunoremises.com.ar';
  }
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC${domainPart}; path=/; SameSite=Lax`;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    let savedUser =
      sessionStorage.getItem(STORAGE_USER_KEY) || localStorage.getItem(STORAGE_USER_KEY);
    let accessToken =
      sessionStorage.getItem(STORAGE_TOKEN_KEY) || localStorage.getItem(STORAGE_TOKEN_KEY);
    let refreshToken =
      sessionStorage.getItem(STORAGE_REFRESH_KEY) || localStorage.getItem(STORAGE_REFRESH_KEY);

    // Sincronizar entre www.brunoremises.com.ar y cliente(s).brunoremises.com.ar
    if (!savedUser || !accessToken) {
      const cookieUser = getClientDomainCookie(COOKIE_USER_KEY);
      const cookieToken = getClientDomainCookie(COOKIE_TOKEN_KEY);
      const cookieRefresh = getClientDomainCookie(COOKIE_REFRESH_KEY);
      if (cookieUser && cookieToken) {
        savedUser = cookieUser;
        accessToken = cookieToken;
        refreshToken = cookieRefresh;
      }
    }

    // Migración transparente por única vez si el cliente ya tenía sesión previa
    if (!savedUser || !accessToken) {
      const legacyUser = localStorage.getItem('user');
      const legacyToken = localStorage.getItem('accessToken');
      const legacyRefresh = localStorage.getItem('refreshToken');
      if (legacyUser && legacyToken) {
        try {
          const parsedLegacy = JSON.parse(legacyUser);
          if (parsedLegacy?.rol === 'CLIENTE') {
            savedUser = legacyUser;
            accessToken = legacyToken;
            refreshToken = legacyRefresh;
          }
        } catch {}
      }
    }

    if (savedUser && accessToken) {
      try {
        const userData = JSON.parse(savedUser);
        if (userData && userData.id && userData.rol === 'CLIENTE') {
          setUser(userData);
          sessionStorage.setItem(STORAGE_USER_KEY, savedUser);
          sessionStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
          localStorage.setItem(STORAGE_USER_KEY, savedUser);
          localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
          if (refreshToken) {
            sessionStorage.setItem(STORAGE_REFRESH_KEY, refreshToken);
            localStorage.setItem(STORAGE_REFRESH_KEY, refreshToken);
          }
        } else {
          throw new Error('Sesión no pertenece a un cliente');
        }
      } catch {
        sessionStorage.removeItem(STORAGE_USER_KEY);
        sessionStorage.removeItem(STORAGE_TOKEN_KEY);
        sessionStorage.removeItem(STORAGE_REFRESH_KEY);
        localStorage.removeItem(STORAGE_USER_KEY);
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        localStorage.removeItem(STORAGE_REFRESH_KEY);
      }
    }

    setLoading(false);
  }, []);

  const login = (userData: User, accessToken: string, refreshToken: string) => {
    if (!userData || !userData.id || userData.rol !== 'CLIENTE') {
      throw new Error('Datos de cliente inválidos');
    }

    setUser(userData);
    const serialized = JSON.stringify(userData);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_USER_KEY, serialized);
      sessionStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
      if (refreshToken) sessionStorage.setItem(STORAGE_REFRESH_KEY, refreshToken);
    }
    localStorage.setItem(STORAGE_USER_KEY, serialized);
    localStorage.setItem(STORAGE_TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(STORAGE_REFRESH_KEY, refreshToken);

    setClientDomainCookie(COOKIE_USER_KEY, serialized);
    setClientDomainCookie(COOKIE_TOKEN_KEY, accessToken);
    if (refreshToken) setClientDomainCookie(COOKIE_REFRESH_KEY, refreshToken);
  };

  const logout = () => {
    setUser(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_USER_KEY);
      sessionStorage.removeItem(STORAGE_TOKEN_KEY);
      sessionStorage.removeItem(STORAGE_REFRESH_KEY);
    }
    localStorage.removeItem(STORAGE_USER_KEY);
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_REFRESH_KEY);

    removeClientDomainCookie(COOKIE_USER_KEY);
    removeClientDomainCookie(COOKIE_TOKEN_KEY);
    removeClientDomainCookie(COOKIE_REFRESH_KEY);
  };

  const updateUser = (userData: User) => {
    setUser(userData);
    const serialized = JSON.stringify(userData);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_USER_KEY, serialized);
    }
    localStorage.setItem(STORAGE_USER_KEY, serialized);
    setClientDomainCookie(COOKIE_USER_KEY, serialized);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        updateUser,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
