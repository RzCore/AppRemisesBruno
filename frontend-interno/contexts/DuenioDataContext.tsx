'use client';

import React, { createContext, useContext, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { duenioCache, CacheLookup } from '@/lib/duenioCache';
import {
  remiseriaService,
  artEmpresaService,
  choferService,
  vehiculoService,
  coordinadorService,
  coordinadorDashboardService,
  duenioReportesService,
} from '@/lib/api';

export const DUENIO_CACHE_KEYS = {
  REMISERIAS_LITE: 'remiserias:lite',
  REMISERIAS_FULL: 'remiserias:full',
  MIS_REMISERIAS: 'remiserias:mis',
  REMISERIA_BY_ID: (id: string) => `remiserias:id:${id}`,
  ART_EMPRESAS: 'art:empresas',
  ART_VIAJES_PROGRAMADOS: 'art:viajes-programados',
  ART_FACTURACION: (key: string) => `art:facturacion:${key}`,
  ART_CIERRES: (key: string) => `art:cierres:${key}`,
  CHOFERES: 'choferes:all',
  VEHICULOS: 'vehiculos:all',
  COORDINADORES: 'coordinadores:all',
  LIQUIDACIONES_HISTORIAL: 'liquidaciones:historial',
  LIQUIDACIONES_SUMMARY: 'liquidaciones:summary',
  CLIENTES: (key: string) => `clientes:${key}`,
  GASTOS: (key: string) => `gastos:${key}`,
  INFORME_DIARIO: (remId: string) => `reportes:diario:${remId}`,
  INFORME_SEMANAL: (remId: string) => `reportes:semanal:${remId}`,
  INFORME_MENSUAL: (remId: string) => `reportes:mensual:${remId}`,
  INFORME_CHOFERES: (remId: string) => `reportes:choferes:${remId}`,
} as const;

interface FetchOptions<T> {
  staleTimeMs?: number;
  force?: boolean;
  persist?: boolean;
  shouldCache?: (value: T) => boolean;
}

interface DuenioDataContextType {
  userId: string;
  getCached: <T = any>(key: string, staleTimeMs?: number) => CacheLookup<T> | null;
  setCached: <T = any>(key: string, data: T, persist?: boolean) => void;
  fetchResource: <T = any>(
    key: string,
    fetcher: () => Promise<T>,
    options?: FetchOptions<T>
  ) => Promise<T>;
  invalidate: (prefixes?: string[]) => void;
  subscribe: (key: string, cb: () => void) => () => void;
}

const DuenioDataContext = createContext<DuenioDataContextType | undefined>(undefined);

export const useDuenioData = () => {
  const ctx = useContext(DuenioDataContext);
  if (!ctx) {
    throw new Error('useDuenioData must be used within a DuenioDataProvider');
  }
  return ctx;
};

export const DuenioDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || '';
  const prewarmedUserRef = useRef<string | null>(null);

  useEffect(() => {
    duenioCache.ensureUser(userId || null);
  }, [userId]);

  // Pre-calentamiento silencioso de catálogos compartidos del Dueño tras montar el shell
  useEffect(() => {
    if (!userId || user?.rol !== 'DUENIO') return;
    if (prewarmedUserRef.current === userId) return;
    prewarmedUserRef.current = userId;

    const timer = setTimeout(() => {
      Promise.allSettled([
        duenioCache.fetchWithSWR(
          userId,
          DUENIO_CACHE_KEYS.REMISERIAS_LITE,
          () => remiseriaService.getAll({ lite: true }),
          { staleTimeMs: 120_000 }
        ),
        duenioCache.fetchWithSWR(
          userId,
          DUENIO_CACHE_KEYS.MIS_REMISERIAS,
          () => duenioReportesService.getMisRemiserias(),
          { staleTimeMs: 120_000 }
        ),
        duenioCache.fetchWithSWR(
          userId,
          DUENIO_CACHE_KEYS.CHOFERES,
          () => choferService.getAll(),
          { staleTimeMs: 60_000 }
        ),
        duenioCache.fetchWithSWR(
          userId,
          DUENIO_CACHE_KEYS.VEHICULOS,
          () => vehiculoService.getAll(),
          { staleTimeMs: 60_000 }
        ),
        duenioCache.fetchWithSWR(
          userId,
          DUENIO_CACHE_KEYS.COORDINADORES,
          () => coordinadorService.getAll(),
          { staleTimeMs: 90_000 }
        ),
        duenioCache.fetchWithSWR(
          userId,
          DUENIO_CACHE_KEYS.ART_EMPRESAS,
          () => artEmpresaService.getAll(),
          { staleTimeMs: 60_000 }
        ),
        duenioCache.fetchWithSWR(
          userId,
          DUENIO_CACHE_KEYS.ART_VIAJES_PROGRAMADOS,
          () => artEmpresaService.getViajesProgramados(),
          { staleTimeMs: 45_000 }
        ),
        duenioCache.fetchWithSWR(
          userId,
          DUENIO_CACHE_KEYS.LIQUIDACIONES_SUMMARY,
          () => coordinadorDashboardService.getHistorialDuenio({ summary: true }),
          { staleTimeMs: 45_000 }
        ),
      ]).catch(() => {});
    }, 80);

    return () => clearTimeout(timer);
  }, [userId, user?.rol]);

  const getCached = useCallback(
    <T = any,>(key: string, staleTimeMs?: number) => {
      return duenioCache.get<T>(userId, key, staleTimeMs);
    },
    [userId]
  );

  const setCached = useCallback(
    <T = any,>(key: string, data: T, persist = true) => {
      duenioCache.set<T>(userId, key, data, persist);
    },
    [userId]
  );

  const fetchResource = useCallback(
    <T = any,>(key: string, fetcher: () => Promise<T>, options?: FetchOptions<T>) => {
      return duenioCache.fetchWithSWR<T>(userId, key, fetcher, options);
    },
    [userId]
  );

  const invalidate = useCallback(
    (prefixes?: string[]) => {
      duenioCache.invalidate(userId, prefixes);
    },
    [userId]
  );

  const subscribe = useCallback(
    (key: string, cb: () => void) => {
      if (!userId) return () => {};
      return duenioCache.subscribe(userId, key, cb);
    },
    [userId]
  );

  return (
    <DuenioDataContext.Provider
      value={{
        userId,
        getCached,
        setCached,
        fetchResource,
        invalidate,
        subscribe,
      }}
    >
      {children}
    </DuenioDataContext.Provider>
  );
};
