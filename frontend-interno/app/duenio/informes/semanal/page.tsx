'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDuenioData, DUENIO_CACHE_KEYS } from '@/contexts/DuenioDataContext';
import { useAppTracking } from '@/hooks/useAppTracking';
import { duenioReportesService } from '@/lib/api';
import { 
  BarChart3, 
  ArrowLeft, 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  Calendar, 
  RefreshCw, 
  Printer, 
  Building,
  Activity,
  Award,
  AlertCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface DesgloseDia {
  dia: string;
  fecha: string;
  total: number;
  cantidad: number;
}

export default function InformeSemanalPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { getCached, fetchResource } = useDuenioData();
  useAppTracking('DUENIO_INFORME_SEMANAL');

  const initialRep = getCached<any>(DUENIO_CACHE_KEYS.INFORME_SEMANAL('todas'), 45_000);
  const initialData = initialRep?.data?.success ? initialRep.data.data : null;

  const [remiserias, setRemiserias] = useState<{ id: string; nombre: string }[]>(() => {
    const c = getCached<any>(DUENIO_CACHE_KEYS.MIS_REMISERIAS, 120_000);
    return c?.data?.success && c.data.data ? c.data.data : [];
  });
  const [selectedRemiseria, setSelectedRemiseria] = useState<string>('todas');
  
  const [totalSemana, setTotalSemana] = useState<number>(() => initialData?.totalSemana ?? 0);
  const [totalSemanaAnterior, setTotalSemanaAnterior] = useState<number>(() => initialData?.totalSemanaAnterior ?? 0);
  const [variacion, setVariacion] = useState<number>(() => initialData?.variacion ?? 0);
  const [viajesCompletados, setViajesCompletados] = useState<number>(() => initialData?.viajesCompletados ?? 0);
  const [promedioDiario, setPromedioDiario] = useState<number>(() => initialData?.promedioDiario ?? 0);
  const [desgloseGrafico, setDesgloseGrafico] = useState<DesgloseDia[]>(() => initialData?.desgloseGrafico ?? []);

  const [loading, setLoading] = useState<boolean>(() => !initialData);
  const [loadingReport, setLoadingReport] = useState(false);

  const applyData = useCallback((d: any) => {
    setTotalSemana(d.totalSemana);
    setTotalSemanaAnterior(d.totalSemanaAnterior);
    setVariacion(d.variacion);
    setViajesCompletados(d.viajesCompletados);
    setPromedioDiario(d.promedioDiario);
    setDesgloseGrafico(d.desgloseGrafico || []);
  }, []);

  const fetchReportData = useCallback(async (remId: string, force = false) => {
    const cacheKey = DUENIO_CACHE_KEYS.INFORME_SEMANAL(remId);
    const cached = getCached<any>(cacheKey, 45_000);
    const hasWarm = Boolean(cached?.data?.success && cached.data.data);
    if (hasWarm && !force) {
      applyData(cached!.data.data);
      if (!cached!.isStale) return;
    }

    try {
      setLoadingReport(true);
      const response = await fetchResource(
        cacheKey,
        () => duenioReportesService.getInformeSemanal(remId === 'todas' ? undefined : remId),
        { staleTimeMs: 45_000, force }
      );
      if (response.success && response.data) {
        applyData(response.data);
      } else if (!hasWarm) {
        toast.error(response.message || 'Error al obtener informe semanal');
      }
    } catch (error) {
      console.error('Error al obtener informe semanal:', error);
      if (!hasWarm) toast.error('Error al conectar con el servidor');
    } finally {
      setLoadingReport(false);
    }
  }, [getCached, fetchResource, applyData]);

  useEffect(() => {
    if (!user || user.rol !== 'DUENIO') {
      router.push('/login');
      return;
    }

    const initData = async () => {
      const cachedRems = getCached<any>(DUENIO_CACHE_KEYS.MIS_REMISERIAS, 120_000);
      const cachedRep = getCached<any>(DUENIO_CACHE_KEYS.INFORME_SEMANAL('todas'), 45_000);
      const hasWarmRep = Boolean(cachedRep?.data?.success && cachedRep.data.data);

      if (cachedRems?.data?.success && cachedRems.data.data) {
        setRemiserias(cachedRems.data.data);
      }
      if (hasWarmRep) {
        applyData(cachedRep!.data.data);
        setLoading(false);
        if (!cachedRep!.isStale && cachedRems && !cachedRems.isStale) return;
      }

      try {
        if (!hasWarmRep) setLoading(true);
        const [resRem] = await Promise.all([
          fetchResource(
            DUENIO_CACHE_KEYS.MIS_REMISERIAS,
            () => duenioReportesService.getMisRemiserias(),
            { staleTimeMs: 120_000 }
          ),
          fetchReportData('todas', false),
        ]);
        if (resRem.success && resRem.data) {
          setRemiserias(resRem.data);
        }
      } catch (error) {
        console.error('Error inicializando informe semanal:', error);
        if (!hasWarmRep) toast.error('Error al cargar datos iniciales');
      } finally {
        setLoading(false);
      }
    };

    initData();
  }, [user, router, getCached, fetchResource, fetchReportData, applyData]);

  const handleRemiseriaChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedRemiseria(value);
    fetchReportData(value, false);
  };

  const handleRefresh = () => {
    fetchReportData(selectedRemiseria, true);
    toast.success('Analíticas de la semana actualizadas');
  };

  const handlePrint = () => {
    window.print();
  };

  // Encontrar el día de mayor facturación para dar un "Insight"
  const diaMaxFacturacion = [...desgloseGrafico].sort((a, b) => b.total - a.total)[0];

  // Calcular la altura proporcional de las barras
  const maxFacturadoDia = Math.max(...desgloseGrafico.map(d => d.total), 1);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="loading-spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 print:bg-white">
      {/* Header */}
      <header className="bg-white shadow-sm border-b print:hidden">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex flex-wrap justify-between items-center gap-2 py-3 min-h-[56px]">
            <div className="flex items-center min-w-0">
              <button
                onClick={() => router.push('/duenio/dashboard')}
                className="flex items-center text-gray-600 hover:text-gray-900 mr-2 sm:mr-4 p-1.5 sm:p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
              >
                <ArrowLeft className="w-5 h-5 sm:mr-1" />
                <span className="hidden sm:inline">Volver</span>
              </button>
              <div className="hidden sm:block h-6 w-[1px] bg-gray-200 mr-4"></div>
              <div className="flex items-center min-w-0">
                <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 mr-2 shrink-0" />
                <h1 className="text-base sm:text-xl font-bold text-gray-900 truncate">Informe Semanal</h1>
              </div>
            </div>
            
            <div className="flex items-center space-x-2 shrink-0">
              <button
                onClick={handleRefresh}
                disabled={loadingReport}
                className="p-2 text-gray-600 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
                title="Actualizar datos"
              >
                <RefreshCw className={`w-5 h-5 ${loadingReport ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handlePrint}
                className="flex items-center space-x-1.5 px-3 sm:px-4 py-2 border border-gray-300 rounded-lg text-gray-700 bg-white hover:bg-gray-50 hover:text-gray-900 transition-all font-medium text-xs sm:text-sm"
              >
                <Printer className="w-4 h-4" />
                <span className="hidden sm:inline">Imprimir Reporte</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0">
        
        {/* Titulo en Impresión */}
        <div className="hidden print:block mb-8 border-b pb-4">
          <h1 className="text-3xl font-bold text-gray-900">App Remises</h1>
          <h2 className="text-xl text-gray-600">Informe Semanal de Recaudación y Picos de Demanda</h2>
          <p className="text-sm text-gray-500 mt-2">
            Generado: {new Date().toLocaleString('es-AR')} | Operador: {user?.duenio?.nombre}
          </p>
        </div>

        {/* Filtros superiores */}
        <div className="bg-white rounded-xl shadow-sm border p-5 mb-8 flex flex-col md:flex-row md:items-center md:justify-between space-y-4 md:space-y-0 print:hidden">
          <div className="flex items-center space-x-3">
            <Building className="w-5 h-5 text-gray-400" />
            <div>
              <label htmlFor="remiseria" className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Filtrar por Agencia
              </label>
              <select
                id="remiseria"
                value={selectedRemiseria}
                onChange={handleRemiseriaChange}
                className="mt-1 block w-64 pl-3 pr-10 py-1.5 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 rounded-lg sm:text-sm shadow-sm"
              >
                <option value="todas">Todas las Agencias (Consolidado)</option>
                {remiserias.map(r => (
                  <option key={r.id} value={r.id}>{r.nombre}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-right">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-800 border border-green-100">
              Rango: Distribución de los últimos 7 días
            </span>
          </div>
        </div>

        {loadingReport && !totalSemana && desgloseGrafico.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="loading-spinner mb-4"></div>
            <p className="text-sm text-gray-500">Consolidando facturación semanal...</p>
          </div>
        ) : (
          <>
            {/* Métricas clave */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 print:grid-cols-4 print:gap-4">
              <div className="bg-white rounded-xl border shadow-sm p-6 relative overflow-hidden">
                <div className="absolute right-4 top-4 p-2 bg-green-50 text-green-600 rounded-lg">
                  <DollarSign className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de la Semana</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-2">
                  ${totalSemana.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </h3>
                <div className="text-xs mt-1 font-semibold flex items-center">
                  {variacion >= 0 ? (
                    <span className="text-green-600 flex items-center">
                      <TrendingUp className="w-3.5 h-3.5 mr-0.5" />
                      +{variacion.toFixed(1)}% vs. sem. anterior
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center">
                      <TrendingDown className="w-3.5 h-3.5 mr-0.5" />
                      {variacion.toFixed(1)}% vs. sem. anterior
                    </span>
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm p-6 relative overflow-hidden">
                <div className="absolute right-4 top-4 p-2 bg-blue-50 text-blue-600 rounded-lg">
                  <Calendar className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Promedio Diario</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-2">
                  ${promedioDiario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                </h3>
                <p className="text-xs text-gray-500 mt-1">Facturación diaria media</p>
              </div>

              <div className="bg-white rounded-xl border shadow-sm p-6 relative overflow-hidden">
                <div className="absolute right-4 top-4 p-2 bg-purple-50 text-purple-600 rounded-lg">
                  <Activity className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total de Viajes</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-2">
                  {viajesCompletados}
                </h3>
                <p className="text-xs text-gray-500 mt-1">Viajes completados con éxito</p>
              </div>

              <div className="bg-white rounded-xl border shadow-sm p-6 relative overflow-hidden">
                <div className="absolute right-4 top-4 p-2 bg-yellow-50 text-yellow-600 rounded-lg">
                  <Award className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Día Más Fuerte</p>
                <h3 className="text-2xl font-bold text-gray-900 mt-2">
                  {diaMaxFacturacion && diaMaxFacturacion.total > 0 ? diaMaxFacturacion.dia : 'N/A'}
                </h3>
                <p className="text-xs text-green-600 mt-1 font-semibold">
                  {diaMaxFacturacion && diaMaxFacturacion.total > 0 ? `$${diaMaxFacturacion.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })} generados` : 'Sin datos'}
                </p>
              </div>
            </div>

            {/* Gráfico de facturación interactivo premium (Glassmorphism & HTML/Tailwind) */}
            <div className="bg-white rounded-xl border shadow-sm p-6 mb-8 print:border-none print:shadow-none">
              <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-green-600" />
                Facturación por Día (Últimos 7 Días)
              </h3>

              <div className="h-80 flex items-end justify-between px-4 border-b border-gray-100 pb-2 pt-8">
                {desgloseGrafico.map((dia, idx) => {
                  const percentHeight = (dia.total / maxFacturadoDia) * 100;
                  return (
                    <div key={idx} className="flex flex-col items-center flex-1 group relative">
                      
                      {/* Tooltip flotante al pasar el mouse */}
                      <div className="absolute bottom-full mb-3 hidden group-hover:flex flex-col items-center z-10 animate-fade-in pointer-events-none">
                        <div className="bg-gray-900 text-white rounded-lg shadow-xl text-xs py-1.5 px-3 whitespace-nowrap">
                          <p className="font-bold">${dia.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</p>
                          <p className="text-[10px] text-gray-300 text-center mt-0.5">{dia.cantidad} viajes realizados</p>
                        </div>
                        <div className="w-2 h-2 bg-gray-900 rotate-45 -mt-1 shadow-lg"></div>
                      </div>

                      {/* Barra interactiva */}
                      <div className="w-12 bg-gray-100 rounded-t-lg relative overflow-hidden transition-all duration-500 hover:shadow-lg flex items-end cursor-pointer" style={{ height: '220px' }}>
                        <div 
                          className="w-full bg-gradient-to-t from-green-500 to-emerald-400 rounded-t-lg transition-all duration-1000 shadow-[0_-4px_12px_rgba(16,185,129,0.15)]"
                          style={{ height: `${percentHeight}%` }}
                        >
                          <div className="absolute inset-0 bg-white bg-opacity-10 opacity-0 hover:opacity-100 transition-opacity"></div>
                        </div>
                      </div>

                      {/* Textos del eje X */}
                      <span className="text-xs font-semibold text-gray-900 mt-3">{dia.dia}</span>
                      <span className="text-[10px] text-gray-500 mt-0.5">{dia.fecha}</span>
                    </div>
                  );
                })}
              </div>

              {desgloseGrafico.length === 0 && (
                <div className="flex flex-col items-center justify-center h-60 text-gray-400">
                  <AlertCircle className="w-12 h-12 text-gray-300 mb-2" />
                  <span>Sin datos operativos para mostrar</span>
                </div>
              )}
            </div>

            {/* Executive insights / Resumen Ejecutivo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 print:grid-cols-2">
              <div className="bg-white rounded-xl border shadow-sm p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Métricas Comparativas</h3>
                <div className="space-y-4 text-sm">
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-gray-600 font-medium">Facturación de esta Semana:</span>
                    <strong className="text-gray-900">${totalSemana.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-gray-600 font-medium">Facturación de la Semana Anterior:</span>
                    <span className="text-gray-700">${totalSemanaAnterior.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between items-center pb-3 border-b">
                    <span className="text-gray-600 font-medium">Variación de Facturación:</span>
                    {variacion >= 0 ? (
                      <span className="font-semibold text-green-600">+{variacion.toFixed(1)}% de crecimiento</span>
                    ) : (
                      <span className="font-semibold text-red-600">{variacion.toFixed(1)}% de descenso</span>
                    )}
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-600 font-medium">Estimado del Mes (Proyectado):</span>
                    <strong className="text-blue-600">${(totalSemana * 4).toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border shadow-sm p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 mb-3">Insights de Rendimiento</h3>
                  <div className="text-sm text-gray-600 space-y-3">
                    <p className="flex items-start">
                      <span className="inline-block p-1 bg-green-50 text-green-600 rounded mr-2 mt-0.5">💡</span>
                      <span>
                        El día de mayor facturación en tu flota fue el <strong>{diaMaxFacturacion?.dia} ({diaMaxFacturacion?.fecha})</strong> con un ingreso total acumulado de <strong>${diaMaxFacturacion?.total.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>.
                      </span>
                    </p>
                    <p className="flex items-start">
                      <span className="inline-block p-1 bg-blue-50 text-blue-600 rounded mr-2 mt-0.5">💡</span>
                      <span>
                        El promedio diario consolidado se sitúa en <strong>${promedioDiario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</strong>, lo que proyecta un crecimiento saludable para tus agencias.
                      </span>
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t mt-4 text-xs text-gray-500 italic">
                  * Las comparativas de analíticas semanales ayudan a planificar la disponibilidad de vehículos en días de alta demanda.
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}