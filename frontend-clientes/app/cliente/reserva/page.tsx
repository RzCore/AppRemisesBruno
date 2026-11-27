'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTracking } from '@/hooks/useAppTracking';
import { clienteService, coordinadorDashboardService, remiseriaService } from '@/lib/api';
import { 
  Calendar, 
  MapPin, 
  Clock, 
  User, 
  ArrowLeft, 
  Loader2, 
  Navigation, 
  Repeat,
  AlertTriangle
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';

interface ReservaForm {
  origen: string;
  destino: string;
  fechaInicio: string;
  horaInicio: string;
  tipoReserva: 'unica' | 'periodica';
  fechaFin?: string;
  diasSemana: string[];
  horaFin?: string;
  observaciones: string;
  preferenciaSexoChofer: 'INDISTINTO' | 'FEMENINO' | 'MASCULINO';
  conMascota: boolean;
  conSillaRuedas: boolean;
  cantidadPasajeros: number;
}

export default function NuevaReserva() {
  const { user } = useAuth();
  const router = useRouter();
  useAppTracking('CLIENTE_NUEVA_RESERVA');
  
  const [isLoading, setIsLoading] = useState(false);
  const [ubicacionActual, setUbicacionActual] = useState<{ lat: number; lng: number; direccion: string } | null>(null);
  const [origenSuggestions, setOrigenSuggestions] = useState<any[]>([]);
  const [destinoSuggestions, setDestinoSuggestions] = useState<any[]>([]);
  const [isOrigenSelected, setIsOrigenSelected] = useState(false);
  const [isDestinoSelected, setIsDestinoSelected] = useState(false);
  const [origenCoords, setOrigenCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [destinoCoords, setDestinoCoords] = useState<{ lat: number; lon: number } | null>(null);
  
  const [formData, setFormData] = useState<ReservaForm>({
    origen: '',
    destino: '',
    fechaInicio: '',
    horaInicio: '',
    tipoReserva: 'unica',
    diasSemana: [],
    observaciones: '',
    preferenciaSexoChofer: (user?.cliente?.preferenciaSexoChofer as 'INDISTINTO' | 'FEMENINO' | 'MASCULINO') || 'INDISTINTO',
    conMascota: false,
    conSillaRuedas: false,
    cantidadPasajeros: 1
  });

  useEffect(() => {
    if (user?.cliente?.preferenciaSexoChofer) {
      setFormData((prev) => ({
        ...prev,
        preferenciaSexoChofer: user.cliente!.preferenciaSexoChofer as 'INDISTINTO' | 'FEMENINO' | 'MASCULINO',
      }));
    }
  }, [user?.cliente?.preferenciaSexoChofer]);

  const [estadoAgencia, setEstadoAgencia] = useState<{
    abierta: boolean;
    motivo?: string;
    mensaje?: string;
    reaperturaEstimada?: string;
  }>({ abierta: true });

  useEffect(() => {
    remiseriaService.getActiva().then((res) => {
      if (res.success && res.data) {
        if (res.data.estadoOperativo) {
          setEstadoAgencia(res.data.estadoOperativo);
        } else if (res.data.agenciaAbierta !== undefined) {
          setEstadoAgencia({
            abierta: res.data.agenciaAbierta,
            mensaje: res.data.mensajeCierre || undefined
          });
        }
      }
    }).catch(err => console.warn('Error obteniendo estado de remiseria:', err));
  }, []);

  useEffect(() => {
    if (isOrigenSelected || !formData.origen || formData.origen.length < 3) {
      setOrigenSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await coordinadorDashboardService.geocode(formData.origen);
        if (res.success && res.data) {
          setOrigenSuggestions(res.data);
        }
      } catch (err) {
        console.error(err);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.origen, isOrigenSelected]);

  useEffect(() => {
    if (isDestinoSelected || !formData.destino || formData.destino.length < 3) {
      setDestinoSuggestions([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await coordinadorDashboardService.geocode(formData.destino);
        if (res.success && res.data) {
          setDestinoSuggestions(res.data);
        }
      } catch (err) {
        console.error(err);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [formData.destino, isDestinoSelected]);

  const handleSelectOrigen = (item: any) => {
    setFormData(prev => ({ ...prev, origen: item.display_name }));
    setOrigenCoords({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
    setIsOrigenSelected(true);
    setOrigenSuggestions([]);
  };

  const handleSelectDestino = (item: any) => {
    setFormData(prev => ({ ...prev, destino: item.display_name }));
    setDestinoCoords({ lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
    setIsDestinoSelected(true);
    setDestinoSuggestions([]);
  };

  const diasSemana = [
    { value: 'LUNES', label: 'Lunes' },
    { value: 'MARTES', label: 'Martes' },
    { value: 'MIERCOLES', label: 'Miércoles' },
    { value: 'JUEVES', label: 'Jueves' },
    { value: 'VIERNES', label: 'Viernes' },
    { value: 'SABADO', label: 'Sábado' },
    { value: 'DOMINGO', label: 'Domingo' }
  ];

  const handleDiaSemanaChange = (dia: string) => {
    setFormData(prev => ({
      ...prev,
      diasSemana: prev.diasSemana.includes(dia)
        ? prev.diasSemana.filter(d => d !== dia)
        : [...prev.diasSemana, dia]
    }));
  };

  const evaluarCierreEnFecha = (dateToCheck: Date): { cerrada: boolean; mensaje: string; reapertura?: string } => {
    const month = dateToCheck.getMonth() + 1;
    const day = dateToCheck.getDate();
    const timeDec = dateToCheck.getHours() + dateToCheck.getMinutes() / 60;

    // NAVIDAD: 24/12 desde las 18:00 hs hasta el 25/12 a las 19:00 hs
    const isNavidadEve = (month === 12 && day === 24 && timeDec >= 18);
    const isNavidadDay = (month === 12 && day === 25 && timeDec < 19);
    if (isNavidadEve || isNavidadDay) {
      return {
        cerrada: true,
        mensaje: '🎄 Por vísperas y celebración de Navidad, la central permanecerá cerrada desde el 24/12 a las 18:00 hs hasta el 25/12 a las 19:00 hs.',
        reapertura: '25/12 a las 19:00 hs'
      };
    }

    // AÑO NUEVO: 31/12 desde las 18:00 hs hasta el 01/01 a las 19:00 hs
    const isNewYearEve = (month === 12 && day === 31 && timeDec >= 18);
    const isNewYearDay = (month === 1 && day === 1 && timeDec < 19);
    if (isNewYearEve || isNewYearDay) {
      return {
        cerrada: true,
        mensaje: '🎆 Por vísperas y celebración de Fin de Año, la central permanecerá cerrada desde el 31/12 a las 18:00 hs hasta el 01/01 a las 19:00 hs.',
        reapertura: '01/01 a las 19:00 hs'
      };
    }

    // Cierre manual vigente
    if (!estadoAgencia.abierta) {
      return {
        cerrada: true,
        mensaje: estadoAgencia.mensaje || 'La agencia se encuentra momentáneamente en pausa.',
        reapertura: estadoAgencia.reaperturaEstimada
      };
    }

    return { cerrada: false, mensaje: '' };
  };

  const obtenerUbicacionActual = () => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      toast.error('Geolocalización no soportada por el dispositivo o navegador');
      return;
    }

    const toastId = toast.loading('📍 Obteniendo tu ubicación GPS real...');

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
            { headers: { 'Accept': 'application/json' } }
          );
          const data = await res.json();
          let direccionFormateada = '';

          if (data?.address) {
            const road = data.address.road || data.address.pedestrian || data.address.street;
            const houseNumber = data.address.house_number || '';
            const city = data.address.city || data.address.town || data.address.village || 'Chivilcoy';
            if (road) {
              direccionFormateada = `${road} ${houseNumber}`.trim() + `, ${city}`;
            } else if (data.display_name) {
              direccionFormateada = data.display_name.split(',').slice(0, 3).join(',').trim();
            }
          }

          if (!direccionFormateada) {
            try {
              const bRes = await clienteService.getUbicacionActual(latitude, longitude);
              if (bRes.success && bRes.data?.direccion) {
                direccionFormateada = bRes.data.direccion;
              }
            } catch (bErr) {
              console.warn('Backend reverse geocode fallback:', bErr);
            }
          }

          if (!direccionFormateada) {
            direccionFormateada = `Ubicación GPS (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
          }

          setUbicacionActual({ lat: latitude, lng: longitude, direccion: direccionFormateada });
          setFormData(prev => ({ ...prev, origen: direccionFormateada }));
          setOrigenCoords({ lat: latitude, lon: longitude });
          setIsOrigenSelected(true);
          setOrigenSuggestions([]);
          toast.success(`📍 Ubicación real obtenida: ${direccionFormateada}`, { id: toastId, duration: 4000 });
        } catch (error) {
          console.error('Error al obtener dirección:', error);
          const fallbackDir = `Ubicación GPS (${latitude.toFixed(5)}, ${longitude.toFixed(5)})`;
          setUbicacionActual({ lat: latitude, lng: longitude, direccion: fallbackDir });
          setFormData(prev => ({ ...prev, origen: fallbackDir }));
          setOrigenCoords({ lat: latitude, lon: longitude });
          setIsOrigenSelected(true);
          setOrigenSuggestions([]);
          toast.success('📍 Ubicación GPS obtenida', { id: toastId });
        }
      },
      (error) => {
        console.error('Error de geolocalización:', error);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error('Permiso de GPS denegado. Habilitá la ubicación en tu navegador o celular.', { id: toastId });
        } else {
          toast.error('No se pudo obtener tu ubicación actual', { id: toastId });
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  };

  const validarFormulario = () => {
    if (!formData.origen.trim()) {
      toast.error('El origen es requerido');
      return false;
    }
    if (!formData.destino.trim()) {
      toast.error('El destino es requerido');
      return false;
    }
    if (!formData.fechaInicio) {
      toast.error('La fecha de inicio es requerida');
      return false;
    }
    if (!formData.horaInicio) {
      toast.error('La hora de inicio es requerida');
      return false;
    }

    const fechaHora = new Date(`${formData.fechaInicio}T${formData.horaInicio}`);
    if (fechaHora <= new Date()) {
      toast.error('La fecha y hora deben ser futuras');
      return false;
    }

    // Validar si cae en horario de fiestas o cierre de la agencia
    const checkCierre = evaluarCierreEnFecha(fechaHora);
    if (checkCierre.cerrada) {
      toast.error(`⚠️ La agencia permanecerá cerrada en el horario solicitado: ${checkCierre.mensaje}`, { duration: 6000 });
      return false;
    }

    if (formData.tipoReserva === 'periodica') {
      if (formData.diasSemana.length === 0) {
        toast.error('Debes seleccionar al menos un día de la semana');
        return false;
      }
      if (formData.fechaFin && new Date(formData.fechaFin) <= new Date(formData.fechaInicio)) {
        toast.error('La fecha de fin debe ser posterior a la fecha de inicio');
        return false;
      }
    }

    return true;
  };

  const crearReserva = async () => {
    if (!validarFormulario()) return;

    setIsLoading(true);
    try {
      const datosReserva = {
        origen: formData.origen,
        destino: formData.destino,
        fechaInicio: formData.fechaInicio,
        horaInicio: formData.horaInicio,
        tipoReserva: formData.tipoReserva,
        fechaFin: formData.fechaFin || undefined,
        diasSemana: formData.tipoReserva === 'periodica' ? formData.diasSemana : undefined,
        horaFin: formData.horaFin || undefined,
        observaciones: formData.observaciones || undefined,
        preferenciaSexoChofer: formData.preferenciaSexoChofer,
        conMascota: formData.conMascota,
        conSillaRuedas: formData.conSillaRuedas,
        cantidadPasajeros: formData.cantidadPasajeros
      };

      const res = await clienteService.crearReserva(datosReserva);

      if (res.success) {
        toast.success('Reserva creada exitosamente');
        router.push('/cliente/viajes');
      } else {
        toast.error(res.message || 'Error al crear reserva');
      }
    } catch (error) {
      toast.error('Error al crear reserva');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-950 text-gray-900 dark:text-slate-100 transition-colors">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 shadow-sm border-b border-gray-200 dark:border-slate-800 transition-colors">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-3">
              <Link 
                href="/cliente/app"
                className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Nueva Reserva</h1>
                <p className="text-sm text-gray-600 dark:text-slate-400">Programa tu viaje</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <Link 
                href="/cliente/perfil"
                className="p-2 text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-white rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
              >
                <User className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Contenido principal */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Banner de Aviso de Horario Especial o Pausa */}
        {!estadoAgencia.abierta && (
          <div className="mb-6 bg-gradient-to-r from-amber-500/15 via-rose-500/15 to-amber-500/15 border-2 border-amber-500/40 rounded-2xl p-4 text-amber-900 dark:text-amber-200 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-amber-500 text-white rounded-xl shrink-0 mt-0.5">
                <Clock className="w-5 h-5" />
              </div>
              <div className="space-y-1 flex-1">
                <h4 className="text-sm font-bold flex items-center gap-2">
                  <span>ATENCIÓN: HORARIO ESPECIAL / CENTRAL EN PAUSA</span>
                </h4>
                <p className="text-xs leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
                  {estadoAgencia.mensaje || 'La agencia permanecerá cerrada por festividades o receso programado.'}
                </p>
                {estadoAgencia.reaperturaEstimada && (
                  <p className="text-[11px] font-bold text-amber-800 dark:text-amber-300">
                    🚗 Reapertura estimada: {estadoAgencia.reaperturaEstimada}
                  </p>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Podés programar reservas únicamente para fechas y horarios en los que la agencia ya se encuentre operativa.
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-gray-200 dark:border-slate-800 transition-colors">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Crear Nueva Reserva</h2>
            <p className="text-gray-600 dark:text-slate-400">Programa tu viaje para una fecha y hora específica</p>
          </div>

          <div className="space-y-6">
            {/* Origen y Destino */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Origen *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="¿Desde dónde?"
                    value={formData.origen}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, origen: e.target.value }));
                      setIsOrigenSelected(false);
                      setOrigenCoords(null);
                    }}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
                  />
                  <MapPin className="absolute left-3 top-3.5 h-5 w-5 text-gray-400 dark:text-slate-500" />
                  {origenSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                      {origenSuggestions.map((s, idx) => (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => handleSelectOrigen(s)}
                          className="w-full text-left p-3 text-xs hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-slate-800 last:border-0 text-gray-800 dark:text-slate-200 font-medium truncate block"
                        >
                          {s.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={obtenerUbicacionActual}
                  className="mt-2 text-sm text-blue-600 dark:text-primary-400 hover:text-blue-800 dark:hover:text-primary-300 flex items-center space-x-1"
                >
                  <MapPin className="h-4 w-4" />
                  <span>Usar ubicación actual</span>
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Destino *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="¿A dónde?"
                    value={formData.destino}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, destino: e.target.value }));
                      setIsDestinoSelected(false);
                      setDestinoCoords(null);
                    }}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500"
                  />
                  <Navigation className="absolute left-3 top-3.5 h-5 w-5 text-gray-400 dark:text-slate-500" />
                  {destinoSuggestions.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-xl z-50 max-h-48 overflow-y-auto">
                      {destinoSuggestions.map((s, idx) => (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => handleSelectDestino(s)}
                          className="w-full text-left p-3 text-xs hover:bg-gray-50 dark:hover:bg-slate-800 border-b border-gray-100 dark:border-slate-800 last:border-0 text-gray-800 dark:text-slate-200 font-medium truncate block"
                        >
                          {s.display_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Fecha y Hora */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Fecha de Inicio *
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={formData.fechaInicio}
                    onChange={(e) => setFormData(prev => ({ ...prev, fechaInicio: e.target.value }))}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Calendar className="absolute left-3 top-3.5 h-5 w-5 text-gray-400 dark:text-slate-500" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                  Hora de Inicio *
                </label>
                <div className="relative">
                  <input
                    type="time"
                    value={formData.horaInicio}
                    onChange={(e) => setFormData(prev => ({ ...prev, horaInicio: e.target.value }))}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <Clock className="absolute left-3 top-3.5 h-5 w-5 text-gray-400 dark:text-slate-500" />
                </div>
              </div>
            </div>

            {/* Tipo de Reserva */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Tipo de Reserva *
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, tipoReserva: 'unica' }))}
                  className={`p-4 border-2 rounded-xl text-left transition-colors ${
                    formData.tipoReserva === 'unica'
                      ? 'border-blue-500 dark:border-primary-500 bg-blue-50 dark:bg-primary-950/40 text-blue-900 dark:text-primary-200'
                      : 'border-gray-300 dark:border-slate-700 hover:border-gray-400 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60 text-gray-700 dark:text-slate-300'
                  }`}
                >
                  <Calendar className="h-6 w-6 text-blue-600 dark:text-primary-400 mb-2" />
                  <h3 className="font-medium text-gray-900 dark:text-white">Reserva Única</h3>
                  <p className="text-sm text-gray-600 dark:text-slate-400">Para una fecha y hora específica</p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, tipoReserva: 'periodica' }))}
                  className={`p-4 border-2 rounded-xl text-left transition-colors ${
                    formData.tipoReserva === 'periodica'
                      ? 'border-blue-500 dark:border-primary-500 bg-blue-50 dark:bg-primary-950/40 text-blue-900 dark:text-primary-200'
                      : 'border-gray-300 dark:border-slate-700 hover:border-gray-400 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60 text-gray-700 dark:text-slate-300'
                  }`}
                >
                  <Repeat className="h-6 w-6 text-blue-600 dark:text-primary-400 mb-2" />
                  <h3 className="font-medium text-gray-900 dark:text-white">Reserva Periódica</h3>
                  <p className="text-sm text-gray-600 dark:text-slate-400">Se repite en días específicos</p>
                </button>
              </div>
            </div>

            {/* Campos adicionales para reserva periódica */}
            {formData.tipoReserva === 'periodica' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Fecha de Fin
                    </label>
                    <div className="relative">
                      <input
                        type="date"
                        value={formData.fechaFin || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, fechaFin: e.target.value }))}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <Calendar className="absolute left-3 top-3.5 h-5 w-5 text-gray-400 dark:text-slate-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                      Hora de Fin
                    </label>
                    <div className="relative">
                      <input
                        type="time"
                        value={formData.horaFin || ''}
                        onChange={(e) => setFormData(prev => ({ ...prev, horaFin: e.target.value }))}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                      <Clock className="absolute left-3 top-3.5 h-5 w-5 text-gray-400 dark:text-slate-500" />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                    Días de la Semana *
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {diasSemana.map((dia) => (
                      <label key={dia.value} className="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.diasSemana.includes(dia.value)}
                          onChange={() => handleDiaSemanaChange(dia.value)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-700"
                        />
                        <span className="text-sm text-gray-700 dark:text-slate-300">{dia.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Cantidad de Pasajeros */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  ¿Cuántas personas viajan?
                </label>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-blue-100 dark:bg-primary-950/60 text-blue-800 dark:text-primary-200">
                  {Math.ceil(formData.cantidadPasajeros / 4)}{' '}
                  {Math.ceil(formData.cantidadPasajeros / 4) === 1 ? 'vehículo' : 'vehículos'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 p-3 rounded-xl border-2 border-gray-200 dark:border-slate-700 bg-gray-50/70 dark:bg-slate-800/60">
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      cantidadPasajeros: Math.max(1, prev.cantidadPasajeros - 1),
                    }))
                  }
                  disabled={formData.cantidadPasajeros <= 1}
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-lg font-black text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  −
                </button>
                <div className="text-center">
                  <div className="text-xl font-black text-gray-900 dark:text-white leading-none">
                    {formData.cantidadPasajeros}{' '}
                    <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">
                      {formData.cantidadPasajeros === 1 ? 'persona' : 'personas'}
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-1">
                    {formData.cantidadPasajeros <= 4
                      ? 'Hasta 4 personas viajan en 1 vehículo'
                      : formData.cantidadPasajeros <= 8
                      ? 'De 5 a 8 personas: se enviarán 2 vehículos'
                      : 'De 9 a 12 personas: se enviarán 3 vehículos (máx.)'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setFormData((prev) => ({
                      ...prev,
                      cantidadPasajeros: Math.min(12, prev.cantidadPasajeros + 1),
                    }))
                  }
                  disabled={formData.cantidadPasajeros >= 12}
                  className="w-10 h-10 rounded-xl bg-white dark:bg-slate-900 border border-gray-300 dark:border-slate-600 text-lg font-black text-gray-700 dark:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
                >
                  +
                </button>
              </div>
            </div>

            {/* Preferencia de Chofer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Preferencia de Chofer
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { value: 'INDISTINTO' as const, label: 'Indistinto', icon: '🚕' },
                  { value: 'FEMENINO' as const, label: 'Chofer mujer', icon: '♀' },
                  { value: 'MASCULINO' as const, label: 'Chofer hombre', icon: '♂' },
                ].map((opt) => {
                  const active = formData.preferenciaSexoChofer === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, preferenciaSexoChofer: opt.value }))}
                      className={`py-2.5 px-3 rounded-xl border-2 text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                        active
                          ? opt.value === 'FEMENINO'
                            ? 'border-pink-500 bg-pink-50 dark:bg-pink-950/40 text-pink-800 dark:text-pink-200'
                            : opt.value === 'MASCULINO'
                            ? 'border-sky-500 bg-sky-50 dark:bg-sky-950/40 text-sky-800 dark:text-sky-200'
                            : 'border-blue-500 bg-blue-50 dark:bg-primary-950/40 text-blue-900 dark:text-primary-200'
                          : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mascota y Silla de ruedas */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                ¿Necesitás avisar algo especial?
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, conMascota: !prev.conMascota }))}
                  className={`py-3 px-4 rounded-xl border-2 text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    formData.conMascota
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200'
                      : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                  }`}
                >
                  <span>🐾</span>
                  <span>Viajo con mascota</span>
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, conSillaRuedas: !prev.conSillaRuedas }))}
                  className={`py-3 px-4 rounded-xl border-2 text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                    formData.conSillaRuedas
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200'
                      : 'border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800/60 text-gray-700 dark:text-slate-300 hover:border-gray-400'
                  }`}
                >
                  <span>♿</span>
                  <span>Viajo con silla de ruedas</span>
                </button>
              </div>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
                Observaciones
              </label>
              <textarea
                rows={4}
                placeholder="Información adicional (opcional)"
                value={formData.observaciones}
                onChange={(e) => setFormData(prev => ({ ...prev, observaciones: e.target.value }))}
                className="w-full px-4 py-3 border border-gray-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-slate-500 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Botones */}
            <div className="flex space-x-4 pt-6">
              <Link
                href="/cliente/app"
                className="flex-1 bg-gray-600 dark:bg-slate-800 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-700 dark:hover:bg-slate-700 transition-colors text-center"
              >
                Cancelar
              </Link>
              <button
                onClick={crearReserva}
                disabled={isLoading}
                className="flex-1 bg-blue-600 dark:bg-primary-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 dark:hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Calendar className="h-5 w-5" />
                )}
                <span>{isLoading ? 'Creando...' : 'Crear Reserva'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
