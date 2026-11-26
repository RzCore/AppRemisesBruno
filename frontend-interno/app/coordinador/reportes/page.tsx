'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTracking } from '@/hooks/useAppTracking';
import { coordinadorDashboardService } from '@/lib/api';
import {
  ArrowLeft,
  Car,
  DollarSign,
  Clock,
  RefreshCw,
  BarChart3,
  Flame,
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

interface AutoMetrica {
  id: string;
  numeroMovil: string;
  patente: string;
  vehiculo: string;
  choferNombre: string;
  cantidadViajes: number;
  totalFacturado: number;
}

interface HoraMetrica {
  hora: string;
  horaNum: number;
  cantidad: number;
}

interface ReporteMetricasData {
  periodo: string;
  totalViajes: number;
  totalFacturado: number;
  autosActivos: number;
  horaPico: string | null;
  maxViajesHora: number;
  autos: AutoMetrica[];
  viajesPorHora: HoraMetrica[];
}

export default function Reportes() {
  const { user } = useAuth();
  useAppTracking('COORDINADOR_REPORTES');

  const [periodo, setPeriodo] = useState<'hoy' | 'ayer' | 'semana' | 'mes'>('hoy');
  const [data, setData] = useState<ReporteMetricasData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const cargarMetricas = useCallback(async (p: 'hoy' | 'ayer' | 'semana' | 'mes') => {
    setIsLoading(true);
    try {
      const res = await coordinadorDashboardService.getReportesMetricas(p);
      if (res.success && res.data) {
        setData(res.data);
      } else {
        toast.error(res.message || 'No se pudieron cargar las métricas');
      }
    } catch {
      toast.error('Error de conexión al cargar métricas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      cargarMetricas(periodo);
    }
  }, [user, periodo, cargarMetricas]);

  const periodos: Array<{ value: 'hoy' | 'ayer' | 'semana' | 'mes'; label: string }> = [
    { value: 'hoy', label: 'Hoy' },
    { value: 'ayer', label: 'Ayer' },
    { value: 'semana', label: 'Esta Semana' },
    { value: 'mes', label: 'Este Mes' },
  ];

  const maxViajesHora = data
    ? Math.max(1, ...data.viajesPorHora.map((h) => h.cantidad))
    : 1;

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden w-full pb-12">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 py-4">
            <div className="flex items-center">
              <Link
                href="/coordinador/dashboard"
                className="mr-3 p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="h-6 w-6 text-indigo-600" />
                  <span>Reportes y Métricas</span>
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Facturación y viajes realizados por auto · Picos por hora
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="inline-flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                {periodos.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPeriodo(p.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      periodo === p.value
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => cargarMetricas(periodo)}
                disabled={isLoading}
                className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                title="Actualizar datos"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 w-full min-w-0">
        {isLoading && !data ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto" />
            <p className="mt-3 text-sm text-slate-500">Cargando métricas reales...</p>
          </div>
        ) : data ? (
          <>
            {/* Resumen rápido */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Facturación Total
                  </p>
                  <p className="text-2xl font-black text-slate-900 mt-0.5">
                    ${data.totalFacturado.toLocaleString('es-AR')}
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                  <Car className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Viajes Realizados
                  </p>
                  <p className="text-2xl font-black text-slate-900 mt-0.5">
                    {data.totalViajes}
                    <span className="text-xs font-semibold text-slate-400 ml-2">
                      ({data.autosActivos} {data.autosActivos === 1 ? 'auto' : 'autos'})
                    </span>
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-amber-100 text-amber-700 rounded-xl">
                  <Flame className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Hora Pico
                  </p>
                  <p className="text-2xl font-black text-slate-900 mt-0.5">
                    {data.horaPico ? `${data.horaPico} hs` : 'Sin datos'}
                    {data.maxViajesHora > 0 && (
                      <span className="text-xs font-semibold text-amber-700 ml-2">
                        ({data.maxViajesHora} {data.maxViajesHora === 1 ? 'viaje' : 'viajes'})
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Facturación y Cantidad de Viajes por Auto */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Car className="h-5 w-5 text-indigo-600" />
                  <span>Facturación y Viajes por Auto</span>
                </h2>
                <span className="text-xs font-semibold text-slate-500">
                  {data.autos.length} {data.autos.length === 1 ? 'móvil' : 'móviles'}
                </span>
              </div>

              {data.autos.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No hay viajes completados en este período.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-200">
                        <th className="py-3 px-4">Móvil</th>
                        <th className="py-3 px-4">Auto / Patente</th>
                        <th className="py-3 px-4">Chofer</th>
                        <th className="py-3 px-4 text-center">Viajes Realizados</th>
                        <th className="py-3 px-4 text-right">Facturado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {data.autos.map((auto) => (
                        <tr key={auto.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3.5 px-4">
                            <span className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-800 font-extrabold text-xs border border-indigo-100">
                              #{auto.numeroMovil}
                            </span>
                          </td>
                          <td className="py-3.5 px-4">
                            <p className="font-bold text-slate-900">{auto.vehiculo}</p>
                            <p className="text-xs font-mono text-slate-500 uppercase">{auto.patente}</p>
                          </td>
                          <td className="py-3.5 px-4 text-slate-700 font-medium">
                            {auto.choferNombre}
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-blue-50 text-blue-800 font-extrabold text-xs">
                              {auto.cantidadViajes} {auto.cantidadViajes === 1 ? 'viaje' : 'viajes'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right font-black text-emerald-700 text-base">
                            ${auto.totalFacturado.toLocaleString('es-AR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Gráfico por Hora — Picos de Viajes */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-600" />
                  <span>Picos de Viajes por Hora</span>
                </h2>
                {data.horaPico && (
                  <span className="text-xs font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                    🔥 Pico: {data.horaPico} hs ({data.maxViajesHora}{' '}
                    {data.maxViajesHora === 1 ? 'viaje' : 'viajes'})
                  </span>
                )}
              </div>

              <div className="p-6 overflow-x-auto">
                <div className="min-w-[640px] flex items-end gap-1.5 h-52 pt-6">
                  {data.viajesPorHora.map((item) => {
                    const alturaPct =
                      item.cantidad > 0 ? Math.max(8, Math.round((item.cantidad / maxViajesHora) * 100)) : 2;
                    const esPico = data.maxViajesHora > 0 && item.cantidad === data.maxViajesHora;

                    return (
                      <div
                        key={item.horaNum}
                        className="flex-1 flex flex-col items-center h-full justify-end group"
                        title={`${item.hora} hs: ${item.cantidad} viajes`}
                      >
                        <span
                          className={`text-[10px] font-bold mb-1 ${
                            esPico
                              ? 'text-amber-600'
                              : item.cantidad > 0
                              ? 'text-slate-700'
                              : 'text-slate-300'
                          }`}
                        >
                          {item.cantidad > 0 ? item.cantidad : ''}
                        </span>
                        <div className="w-full flex-1 flex items-end">
                          <div
                            className={`w-full rounded-t-md transition-all ${
                              esPico
                                ? 'bg-gradient-to-t from-amber-500 to-orange-400 shadow-sm'
                                : item.cantidad > 0
                                ? 'bg-indigo-500 group-hover:bg-indigo-600'
                                : 'bg-slate-100'
                            }`}
                            style={{ height: `${alturaPct}%` }}
                          />
                        </div>
                        <span
                          className={`text-[10px] mt-1.5 font-medium ${
                            esPico ? 'text-amber-700 font-bold' : 'text-slate-500'
                          }`}
                        >
                          {String(item.horaNum).padStart(2, '0')}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
