'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useAuth } from '@/contexts/AuthContext';
import { useDuenioData, DUENIO_CACHE_KEYS } from '@/contexts/DuenioDataContext';
import { remiseriaService } from '@/lib/api';
import { Remiseria, UpdateRemiseriaData } from '@/types';
import { 
  Settings, Building, DollarSign, Phone, MapPin, 
  ShieldCheck, Save, Loader2, Calculator, Info,
  CheckCircle2, Sparkles, Clock, AlertTriangle, Power,
  Calendar, MessageCircle
} from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function ConfiguracionPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { getCached, fetchResource, invalidate } = useDuenioData();

  const pickMiRemiseria = useCallback((list: Remiseria[] | undefined | null): Remiseria | null => {
    if (!list || list.length === 0) return null;
    return (
      list.find((r) => r.duenios?.some((d) => d.duenioId === user?.duenio?.id)) || list[0]
    );
  }, [user?.duenio?.id]);

  const [remiseria, setRemiseria] = useState<Remiseria | null>(() => {
    const cached = getCached<any>(DUENIO_CACHE_KEYS.REMISERIAS_LITE, 120_000);
    return cached?.data?.success ? pickMiRemiseria(cached.data.data) : null;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const cached = getCached<any>(DUENIO_CACHE_KEYS.REMISERIAS_LITE, 120_000);
    return !(cached?.data?.success && cached.data.data?.length > 0);
  });
  const [saving, setSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateRemiseriaData>();

  // Watch tariff values for live trip cost simulator
  const watchedBajada = watch('bajadaBandera', 3500);
  const watchedKm = watch('valorKm', 1200);
  const watchedKmRuta = watch('valorKmRuta', 900);
  const watchedAnillo2Pct = watch('anillo2RecargoPorcentaje', 30);
  const watchedAnillo3Pct = watch('anillo3RecargoPorcentaje', 85);
  const watchedComision = watch('comisionPorcentaje', 30);
  const watchedAgenciaAbierta = watch('agenciaAbierta', true);

  const applyConfigForm = useCallback((miRemiseria: Remiseria) => {
    setRemiseria(miRemiseria);
    reset({
      nombreFantasia: miRemiseria.nombreFantasia || 'Remises Bruno',
      razonSocial: miRemiseria.razonSocial || 'Remises Bruno S.R.L.',
      cuit: miRemiseria.cuit || '',
      direccion: miRemiseria.direccion || '',
      telefono: miRemiseria.telefono || '',
      bajadaBandera: miRemiseria.bajadaBandera || 3500,
      valorKm: miRemiseria.valorKm || 1200,
      valorKmRuta: miRemiseria.valorKmRuta || 900,
      anillo2RadioKm: miRemiseria.anillo2RadioKm ?? 2.5,
      anillo2RecargoPorcentaje: miRemiseria.anillo2RecargoPorcentaje ?? 30,
      anillo3RadioKm: miRemiseria.anillo3RadioKm ?? 5.0,
      anillo3RecargoPorcentaje: miRemiseria.anillo3RecargoPorcentaje ?? 85,
      valorHoraEspera: miRemiseria.valorHoraEspera || 10000,
      comisionPorcentaje: miRemiseria.comisionPorcentaje || 30.0,
      comisionDuenioAuto: miRemiseria.comisionDuenioAuto || 20.0,
      agenciaAbierta: miRemiseria.agenciaAbierta !== false,
      mensajeCierre: miRemiseria.mensajeCierre || 'La agencia permanecerá cerrada por festividades desde el 24/12 a las 18:00 hs hasta el 25/12 a las 19:00 hs. ¡Felices Fiestas!',
      cierreAutomaticoFiestas: miRemiseria.cierreAutomaticoFiestas !== false,
    });
  }, [reset]);

  const loadConfig = useCallback(async () => {
    const cached = getCached<any>(DUENIO_CACHE_KEYS.REMISERIAS_LITE, 120_000);
    const warmRem = cached?.data?.success ? pickMiRemiseria(cached.data.data) : null;
    if (warmRem) {
      applyConfigForm(warmRem);
      setLoading(false);
      if (!cached!.isStale) return;
    }

    try {
      if (!warmRem) setLoading(true);
      const response = await fetchResource(
        DUENIO_CACHE_KEYS.REMISERIAS_LITE,
        () => remiseriaService.getAll({ lite: true }),
        { staleTimeMs: 120_000 }
      );
      if (response.success && response.data && response.data.length > 0) {
        const miRemiseria = pickMiRemiseria(response.data);
        if (miRemiseria) applyConfigForm(miRemiseria);
      } else if (!warmRem) {
        toast.error('No se encontró una remisería asociada a tu cuenta');
      }
    } catch (error) {
      console.error('Error loading config:', error);
      if (!warmRem) toast.error('Error al cargar la configuración');
    } finally {
      setLoading(false);
    }
  }, [getCached, fetchResource, pickMiRemiseria, applyConfigForm]);

  useEffect(() => {
    if (!user || user.rol !== 'DUENIO') {
      router.push('/login');
      return;
    }
    loadConfig();
  }, [user, router, loadConfig]);

  const onSubmit = async (data: UpdateRemiseriaData) => {
    if (!remiseria) return;

    setSaving(true);
    try {
      const payload: UpdateRemiseriaData = {
        nombreFantasia: data.nombreFantasia?.trim(),
        razonSocial: data.razonSocial?.trim(),
        cuit: data.cuit?.trim(),
        direccion: data.direccion?.trim(),
        telefono: data.telefono?.trim(),
        bajadaBandera: Number(data.bajadaBandera),
        valorKm: Number(data.valorKm),
        valorKmRuta: Number(data.valorKmRuta),
        anillo2RadioKm: Number(data.anillo2RadioKm),
        anillo2RecargoPorcentaje: Number(data.anillo2RecargoPorcentaje),
        anillo3RadioKm: Number(data.anillo3RadioKm),
        anillo3RecargoPorcentaje: Number(data.anillo3RecargoPorcentaje),
        valorHoraEspera: Number(data.valorHoraEspera),
        comisionPorcentaje: Number(data.comisionPorcentaje),
        comisionDuenioAuto: Number(data.comisionDuenioAuto),
        agenciaAbierta: data.agenciaAbierta,
        mensajeCierre: data.mensajeCierre?.trim(),
        cierreAutomaticoFiestas: data.cierreAutomaticoFiestas,
      };

      const response = await remiseriaService.update(remiseria.id, payload);
      if (response.success && response.data) {
        invalidate(['remiserias:']);
        setRemiseria(response.data);
        reset(payload);
        toast.success('¡Configuración y precios actualizados exitosamente!', {
          icon: '🚀',
          duration: 4000
        });
      } else {
        toast.error(response.message || 'Error al guardar los cambios');
      }
    } catch (error: any) {
      console.error('Error saving config:', error);
      toast.error(error.response?.data?.error || 'Error al comunicarse con el servidor');
    } finally {
      setSaving(false);
    }
  };

  // Cálculo para el simulador de viaje de 5 km
  const bajadaNum = Number(watchedBajada) || 0;
  const kmNum = Number(watchedKm) || 0;
  const comisionPct = Number(watchedComision) || 0;
  // Ejemplo: 5 km (1 km cubierto con bajada + 4 km adicionales)
  const ejemploViaje5km = bajadaNum + Math.max(0, (5 - 1) * kmNum);
  const gananciaAgencia5km = Math.round((ejemploViaje5km * comisionPct) / 100);
  const gananciaChofer5km = ejemploViaje5km - gananciaAgencia5km;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="loading-spinner border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center text-primary-600 shadow-sm">
            <Building className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">
                {remiseria?.nombreFantasia || 'Remises Bruno'}
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                1 Remisería por Cuenta
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Personalizá el nombre de la remisería, datos comerciales y el esquema de tarifas y comisiones.
            </p>
          </div>
        </div>
      </div>

      {/* Banner de sistema adaptable / White-label */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 border border-indigo-100/80 p-5 rounded-2xl flex items-start gap-3.5 shadow-sm">
        <Sparkles className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 space-y-1">
          <p className="font-bold text-slate-900 text-sm">
            Sistema Modular y Reconfigurable
          </p>
          <p>
            Al modificar el nombre y los precios en este panel, todos los cálculos de tarifas para clientes, 
            pantallas de coordinadores, postulaciones de choferes y balances de liquidación se adaptarán 
            inmediatamente a los nuevos valores configurados.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Formulario Principal (2 columnas) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* SECCIÓN 1: Identidad y Contacto */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Building className="w-5 h-5 text-indigo-600" />
                Identidad de la Remisería
              </h3>
              <p className="text-xs text-slate-500">
                El nombre comercial que verán los clientes y choferes en la aplicación.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nombre de Fantasía (Nombre de la Remisería) *
                </label>
                <input
                  type="text"
                  {...register('nombreFantasia', { required: 'El nombre de fantasía es requerido' })}
                  placeholder="Ej: Remises Bruno"
                  className="input text-sm"
                />
                {errors.nombreFantasia && (
                  <p className="mt-1 text-xs text-red-600">{errors.nombreFantasia.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Razón Social *
                </label>
                <input
                  type="text"
                  {...register('razonSocial', { required: 'La razón social es requerida' })}
                  placeholder="Ej: Remises Bruno S.R.L."
                  className="input text-sm"
                />
                {errors.razonSocial && (
                  <p className="mt-1 text-xs text-red-600">{errors.razonSocial.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  CUIT / CUIL de la Remisería *
                </label>
                <input
                  type="text"
                  {...register('cuit', { required: 'El CUIT es requerido' })}
                  placeholder="Ej: 20-11111111-9"
                  className="input text-sm"
                />
                {errors.cuit && (
                  <p className="mt-1 text-xs text-red-600">{errors.cuit.message}</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Teléfono / WhatsApp de la Base *
                </label>
                <input
                  type="text"
                  {...register('telefono', { required: 'El teléfono es requerido' })}
                  placeholder="Ej: 011-1234-5678"
                  className="input text-sm"
                />
                {errors.telefono && (
                  <p className="mt-1 text-xs text-red-600">{errors.telefono.message}</p>
                )}
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Dirección de la Base Central *
                </label>
                <input
                  type="text"
                  {...register('direccion', { required: 'La dirección es requerida' })}
                  placeholder="Ej: Av. San Martín 123, Buenos Aires"
                  className="input text-sm"
                />
                {errors.direccion && (
                  <p className="mt-1 text-xs text-red-600">{errors.direccion.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* SECCIÓN 2: Tarifario y Precios */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                Tarifas de Viaje y Precios Oficiales
              </h3>
              <p className="text-xs text-slate-500">
                Valores con los que se cotizan automáticamente los viajes para los pasajeros.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Bajada de Bandera ($) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">$</span>
                  <input
                    type="number"
                    step="any"
                    {...register('bajadaBandera', { 
                      required: 'Requerido',
                      min: { value: 0, message: 'Debe ser mayor o igual a 0' } 
                    })}
                    className="input pl-8 text-sm font-semibold"
                    placeholder="3500"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Precio inicial urbano</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Km en Ciudad ($/km) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">$</span>
                  <input
                    type="number"
                    step="any"
                    {...register('valorKm', { 
                      required: 'Requerido',
                      min: { value: 0, message: 'Debe ser mayor o igual a 0' } 
                    })}
                    className="input pl-8 text-sm font-semibold"
                    placeholder="1200"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Viajes menores a 15 km</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700">
                    Km en Ruta ($/km) *
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setValue('valorKmRuta', Math.round((Number(watchedKm) || 1200) * 0.75), {
                        shouldDirty: true,
                      })
                    }
                    className="text-[10px] font-bold text-primary-600 hover:underline"
                    title="Calcular 75% del valor de km en ciudad"
                  >
                    75% ciudad
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">$</span>
                  <input
                    type="number"
                    step="any"
                    {...register('valorKmRuta', { 
                      required: 'Requerido',
                      min: { value: 0, message: 'Debe ser mayor o igual a 0' } 
                    })}
                    className="input pl-8 text-sm font-semibold"
                    placeholder="900"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  ≥ 15 km sin bajada ({Number(watchedKmRuta || 900) * 54 > 0 ? `ej. 54 km: $${(Math.round((Number(watchedKmRuta || 900) * 54) / 100) * 100).toLocaleString('es-AR')}` : 'larga distancia'})
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Hora de Espera ($/h) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-bold">$</span>
                  <input
                    type="number"
                    step="any"
                    {...register('valorHoraEspera', { 
                      required: 'Requerido',
                      min: { value: 0, message: 'Debe ser mayor o igual a 0' } 
                    })}
                    className="input pl-8 text-sm font-semibold"
                    placeholder="10000"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Por demora del pasajero</p>
              </div>
            </div>

            {/* Mínimos por Anillos (Zonas alejadas de la base) */}
            <div className="border-t border-slate-100 pt-4 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Mínimos por Anillos (Viajes cortos en zonas alejadas)
                </h4>
                <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  Se actualizan solos al cambiar la Bajada de Bandera
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Solo aplica cuando un viaje corto desde una zona alejada de la base da menos que el mínimo del anillo. Si el viaje ya supera ese importe (ej. desde Parque Industrial al centro), no suma nada extra. Poné 0% para desactivar un anillo.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Anillo 2 — Periferia</span>
                    <span className="text-xs font-black text-primary-700 bg-primary-50 px-2 py-0.5 rounded-lg border border-primary-200">
                      Mínimo hoy: $
                      {(
                        Math.round(
                          ((Number(watchedBajada) || 3500) * (1 + (Number(watchedAnillo2Pct) || 0) / 100)) / 100
                        ) * 100
                      ).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Desde (km de base)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        {...register('anillo2RadioKm', { min: { value: 0.5, message: 'Mín. 0.5 km' } })}
                        className="input text-xs font-semibold py-2"
                        placeholder="2.5"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Recargo s/ bajada (%)
                      </label>
                      <input
                        type="number"
                        step="5"
                        {...register('anillo2RecargoPorcentaje', { min: { value: 0, message: 'Mín. 0%' } })}
                        className="input text-xs font-semibold py-2"
                        placeholder="30"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">Anillo 3 — Parque Ind. / Accesos</span>
                    <span className="text-xs font-black text-amber-800 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
                      Mínimo hoy: $
                      {(
                        Math.round(
                          ((Number(watchedBajada) || 3500) * (1 + (Number(watchedAnillo3Pct) || 0) / 100)) / 100
                        ) * 100
                      ).toLocaleString('es-AR')}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Desde (km de base)
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        {...register('anillo3RadioKm', { min: { value: 1, message: 'Mín. 1 km' } })}
                        className="input text-xs font-semibold py-2"
                        placeholder="5"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Recargo s/ bajada (%)
                      </label>
                      <input
                        type="number"
                        step="5"
                        {...register('anillo3RecargoPorcentaje', { min: { value: 0, message: 'Mín. 0%' } })}
                        className="input text-xs font-semibold py-2"
                        placeholder="85"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Comisiones */}
            <div className="border-t border-slate-100 pt-4">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-3">
                Esquema de Comisiones y Liquidación
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Comisión de la Agencia (%) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      {...register('comisionPorcentaje', { 
                        required: 'Requerido',
                        min: { value: 0, message: 'Mínimo 0%' },
                        max: { value: 100, message: 'Máximo 100%' }
                      })}
                      className="input pr-8 text-sm font-semibold"
                      placeholder="30"
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 text-sm font-bold">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Porcentaje retenido por viaje</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Comisión por Dueño de Auto (%) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      {...register('comisionDuenioAuto', { 
                        required: 'Requerido',
                        min: { value: 0, message: 'Mínimo 0%' },
                        max: { value: 100, message: 'Máximo 100%' }
                      })}
                      className="input pr-8 text-sm font-semibold"
                      placeholder="20"
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 text-sm font-bold">%</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">Si el chofer no es propietario</p>
                </div>
              </div>
            </div>
          </div>

          {/* SECCIÓN 3: Estado Operativo y Horarios Especiales / Fiestas */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
            <div className="border-b border-slate-100 pb-3 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-indigo-600" />
                  Horarios de Atención y Estado de la Central
                </h3>
                <p className="text-xs text-slate-500">
                  Controlá si la remisería está abierta para recibir viajes o marcá el cierre temporal y el mensaje que responderá el Bot de WhatsApp y mostrará la App de Clientes.
                </p>
              </div>

              {/* Badge en vivo */}
              <div className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs ${
                watchedAgenciaAbierta
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border border-rose-200'
              }`}>
                <span className={`w-2 h-2 rounded-full ${watchedAgenciaAbierta ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                {watchedAgenciaAbierta ? 'Agencia Abierta' : 'Agencia Cerrada'}
              </div>
            </div>

            {/* Toggle de Apertura / Cierre Manual */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Power className={`w-4 h-4 ${watchedAgenciaAbierta ? 'text-emerald-600' : 'text-rose-600'}`} />
                    Apertura Operativa de la Central
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {watchedAgenciaAbierta
                      ? 'La agencia está recibiendo viajes normalmente por la Web y por WhatsApp.'
                      : 'La agencia está en pausa. Se bloquearán nuevos pedidos y se notificará el motivo a los pasajeros.'}
                  </p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    {...register('agenciaAbierta')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            {/* Mensaje de Cierre Personalizado */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  Mensaje de Cierre (para la App y el Bot de WhatsApp)
                </label>
                <span className="text-[11px] text-slate-400">Se enviará automáticamente a los clientes</span>
              </div>
              <textarea
                rows={3}
                {...register('mensajeCierre')}
                placeholder="Ej: La agencia permanecerá cerrada por festividades desde el 24/12 a las 18:00 hs hasta el 25/12 a las 19:00 hs. ¡Felices Fiestas!"
                className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white font-medium text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 leading-relaxed"
              />
              {/* Plantillas Rápidas */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] font-semibold text-slate-400 mr-1">Plantillas rápidas:</span>
                <button
                  type="button"
                  onClick={() => setValue('mensajeCierre', '🎄 Por vísperas y celebración de Navidad, la agencia permanecerá cerrada desde el 24/12 a las 18:00 hs hasta el 25/12 a las 19:00 hs. ¡Felices Fiestas!')}
                  className="px-2 py-1 text-[11px] font-semibold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg border border-indigo-200 transition-colors"
                >
                  🎄 Navidad (24/12 18hs a 25/12 19hs)
                </button>
                <button
                  type="button"
                  onClick={() => setValue('mensajeCierre', '🎆 Por vísperas y celebración de Fin de Año, la agencia permanecerá cerrada desde el 31/12 a las 18:00 hs hasta el 01/01 a las 19:00 hs. ¡Feliz Año Nuevo!')}
                  className="px-2 py-1 text-[11px] font-semibold bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg border border-purple-200 transition-colors"
                >
                  🎆 Fin de Año (31/12 18hs a 01/01 19hs)
                </button>
                <button
                  type="button"
                  onClick={() => setValue('mensajeCierre', '🌧️ Por razones climáticas adversas y anegamiento en calles, el servicio se encuentra momentáneamente pausado. Retomamos a la brevedad.')}
                  className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-colors"
                >
                  🌧️ Temporal
                </button>
              </div>
            </div>

            {/* Regla de Fiestas de Fin de Año (24/12 y 31/12) */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-4.5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5 shadow-sm">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900">
                      Régimen Automático de Fiestas (24/12 y 31/12)
                    </h4>
                    <p className="text-xs text-slate-600 mt-0.5">
                      El sistema cerrará y reabrirá automáticamente la atención según el horario festivo acordado:
                    </p>
                  </div>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                  <input
                    type="checkbox"
                    {...register('cierreAutomaticoFiestas')}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 text-xs">
                <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60 shadow-xs">
                  <span className="font-bold text-slate-900 block mb-1">🎄 Navidad:</span>
                  <p className="text-slate-600">Cierra el <strong>24/12 a las 18:00 hs</strong></p>
                  <p className="text-slate-600">Reabre el <strong>25/12 a las 19:00 hs</strong></p>
                </div>
                <div className="bg-white/80 p-3 rounded-xl border border-amber-200/60 shadow-xs">
                  <span className="font-bold text-slate-900 block mb-1">🎆 Año Nuevo:</span>
                  <p className="text-slate-600">Cierra el <strong>31/12 a las 18:00 hs</strong></p>
                  <p className="text-slate-600">Reabre el <strong>01/01 a las 19:00 hs</strong></p>
                </div>
              </div>
            </div>
          </div>

          {/* Botón Guardar */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary px-8 py-3 text-base shadow-lg shadow-primary-500/25 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando cambios...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar Configuración y Tarifas
                </>
              )}
            </button>
          </div>
        </div>

        {/* Panel Lateral: Simulador en tiempo real */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center gap-2 mb-4">
              <Calculator className="w-5 h-5 text-primary-600" />
              <h3 className="font-bold text-slate-900 text-sm">
                Simulador de Tarifas en Vivo
              </h3>
            </div>

            <p className="text-xs text-slate-500 mb-4">
              Así se calculará un viaje promedio de <strong>5 kilómetros</strong> según tus valores actuales:
            </p>

            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
              <div className="flex justify-between text-xs text-slate-600">
                <span>Bajada de bandera (primer km):</span>
                <span className="font-bold text-slate-900">${bajadaNum.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>4 km adicionales (× ${kmNum.toLocaleString('es-AR')}):</span>
                <span className="font-bold text-slate-900">${(4 * kmNum).toLocaleString('es-AR')}</span>
              </div>
              <div className="border-t border-slate-200 pt-2.5 flex justify-between items-baseline">
                <span className="font-bold text-slate-900 text-sm">Total Pasajero:</span>
                <span className="font-extrabold text-primary-700 text-xl">
                  ${ejemploViaje5km.toLocaleString('es-AR')}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between text-slate-500">
                <span>Comisión Remisería ({comisionPct}%):</span>
                <span className="font-bold text-emerald-600">+${gananciaAgencia5km.toLocaleString('es-AR')}</span>
              </div>
              <div className="flex justify-between text-slate-500">
                <span>Ingreso Chofer:</span>
                <span className="font-bold text-slate-700">${gananciaChofer5km.toLocaleString('es-AR')}</span>
              </div>
            </div>
          </div>

          {/* Tarjeta Informativa de Cuenta Única */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              Política de Remisería Única
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Cada cuenta de dueño administra exclusivamente una única remisería. Todos los choferes, 
              vehículos, viajes y clientes registrados en esta plataforma corresponden a 
              <strong> {remiseria?.nombreFantasia || 'Remises Bruno'}</strong>.
            </p>
          </div>
        </div>
      </form>
    </div>
  );
}
