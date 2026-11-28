'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Loader2, MapPin, Car, User, Phone, Calculator, Send, Building2, CreditCard } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { coordinadorDashboardService } from '@/lib/api';

interface Coords {
  lat: number;
  lon: number;
}

interface RemiseriaLite {
  id: string;
  nombreFantasia?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
  choferes: any[];
  remiserias?: RemiseriaLite[];
  remiseriaId?: string;
}

const soloNumeros = (val: string) => val.replace(/\D/g, '');

function useGeocodeSuggestions(query: string, enabled: boolean) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  useEffect(() => {
    if (!enabled || query.trim().length < 4) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await coordinadorDashboardService.geocode(query.trim());
      if (!cancelled && res.success && Array.isArray(res.data)) {
        setSuggestions(res.data.slice(0, 5));
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, enabled]);
  return [suggestions, setSuggestions] as const;
}

export default function DuenioNuevoViajeModal({
  open,
  onClose,
  onCreated,
  choferes,
  remiserias = [],
  remiseriaId,
}: Props) {
  const [selectedRemiseriaId, setSelectedRemiseriaId] = useState(remiseriaId || remiserias[0]?.id || '');
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteTelefono, setClienteTelefono] = useState('');
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [clienteSug, setClienteSug] = useState<any[]>([]);
  const [clienteFocus, setClienteFocus] = useState<'nombre' | 'telefono' | null>(null);
  const [metodoPago, setMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE'>('EFECTIVO');
  const [origen, setOrigen] = useState('');
  const [destino, setDestino] = useState('');
  const [origenCoords, setOrigenCoords] = useState<Coords | null>(null);
  const [destinoCoords, setDestinoCoords] = useState<Coords | null>(null);
  const [origenSel, setOrigenSel] = useState(false);
  const [destinoSel, setDestinoSel] = useState(false);
  const [focus, setFocus] = useState<'origen' | 'destino' | null>(null);
  const [precio, setPrecio] = useState('');
  const [distanciaKm, setDistanciaKm] = useState<number | null>(null);
  const [calculando, setCalculando] = useState(false);
  const [tipoViaje, setTipoViaje] = useState<'inmediato' | 'programado'>('inmediato');
  const [fecha, setFecha] = useState(() => new Date().toISOString().split('T')[0]);
  const [hora, setHora] = useState(() => new Date().toTimeString().slice(0, 5));
  const [choferId, setChoferId] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [enviando, setEnviando] = useState(false);
  const precioEditadoManualRef = useRef(false);

  const activeRemiseriaId = selectedRemiseriaId || remiseriaId || remiserias[0]?.id || undefined;

  useEffect(() => {
    if (open) {
      setSelectedRemiseriaId(remiseriaId || remiserias[0]?.id || '');
    }
  }, [open, remiseriaId, remiserias]);

  const [origenSug, setOrigenSug] = useGeocodeSuggestions(origen, focus === 'origen' && !origenSel);
  const [destinoSug, setDestinoSug] = useGeocodeSuggestions(destino, focus === 'destino' && !destinoSel);

  // Búsqueda predictiva de clientes frecuentes / cuenta corriente
  useEffect(() => {
    if (!open || !clienteFocus) {
      setClienteSug([]);
      return;
    }
    const query = clienteFocus === 'nombre' ? clienteNombre.trim() : clienteTelefono.trim();
    if (query.length < 2) {
      setClienteSug([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await coordinadorDashboardService.searchClientesPredictivo(query);
      if (!cancelled && res.success && Array.isArray(res.data)) {
        setClienteSug(res.data.slice(0, 5));
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, clienteFocus, clienteNombre, clienteTelefono]);

  // Choferes activos de la remisería seleccionada: primero los conectados, luego el resto
  const choferesOrdenados = useMemo(() => {
    return [...(choferes || [])]
      .filter((c) => c.estado === 'ACTIVO')
      .filter((c) => !activeRemiseriaId || !c.remiseriaId || c.remiseriaId === activeRemiseriaId)
      .sort((a, b) => Number(Boolean(b.isOnline)) - Number(Boolean(a.isOnline)) ||
        `${a.nombre} ${a.apellido}`.localeCompare(`${b.nombre} ${b.apellido}`));
  }, [choferes, activeRemiseriaId]);

  useEffect(() => {
    if (choferId && !choferesOrdenados.some((c) => c.id === choferId)) {
      setChoferId('');
    }
  }, [choferId, choferesOrdenados]);

  const resetForm = () => {
    setClienteNombre('');
    setClienteTelefono('');
    setClienteId(null);
    setClienteSug([]);
    setMetodoPago('EFECTIVO');
    setOrigen('');
    setDestino('');
    setOrigenCoords(null);
    setDestinoCoords(null);
    setOrigenSel(false);
    setDestinoSel(false);
    setPrecio('');
    setDistanciaKm(null);
    setTipoViaje('inmediato');
    setFecha(new Date().toISOString().split('T')[0]);
    setHora(new Date().toTimeString().slice(0, 5));
    setChoferId('');
    setObservaciones('');
    precioEditadoManualRef.current = false;
  };

  const calcularPrecio = async (silencioso = false) => {
    if (!origen.trim() || !destino.trim()) {
      if (!silencioso) toast.error('Completá origen y destino para calcular la tarifa');
      return;
    }
    setCalculando(true);
    try {
      const res = await coordinadorDashboardService.calcularPrecio(origen.trim(), destino.trim(), {
        latOrigen: origenCoords?.lat,
        lonOrigen: origenCoords?.lon,
        latDestino: destinoCoords?.lat,
        lonDestino: destinoCoords?.lon,
        clienteId: clienteId || undefined,
        remiseriaId: activeRemiseriaId,
      });
      if (res.success && res.data) {
        const nuevo = res.data.precio ?? res.data.precioEstimado ?? res.data.precioSugerido;
        if (nuevo !== undefined && nuevo !== null) setPrecio(String(nuevo));
        if (res.data.distanciaKm !== undefined) setDistanciaKm(Number(res.data.distanciaKm));
      } else if (!silencioso) {
        toast.error(res.message || 'No se pudo calcular la tarifa');
      }
    } finally {
      setCalculando(false);
    }
  };

  // Recalcular automáticamente cuando se seleccionan ambas direcciones
  useEffect(() => {
    if (open && origenSel && destinoSel && !precioEditadoManualRef.current) {
      calcularPrecio(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origenSel, destinoSel, origenCoords, destinoCoords, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clienteNombre.trim()) {
      toast.error('Ingresá el nombre del pasajero');
      return;
    }
    if (soloNumeros(clienteTelefono).length < 8) {
      toast.error('Ingresá un teléfono válido (al menos 8 dígitos)');
      return;
    }
    if (!origen.trim() || !destino.trim()) {
      toast.error('Completá origen y destino');
      return;
    }

    let fechaIso = new Date().toISOString();
    if (tipoViaje === 'programado') {
      if (!fecha || !hora) {
        toast.error('Completá fecha y hora para el viaje programado');
        return;
      }
      const parsedDate = new Date(`${fecha}T${hora}:00`);
      if (Number.isNaN(parsedDate.getTime())) {
        toast.error('La fecha u hora ingresada no es válida');
        return;
      }
      fechaIso = parsedDate.toISOString();
    }

    setEnviando(true);
    try {
      const res = await coordinadorDashboardService.createViaje({
        origen: origen.trim(),
        destino: destino.trim(),
        precio: precio || '0',
        fecha: fechaIso,
        clienteNombre: clienteNombre.trim(),
        clienteTelefono: soloNumeros(clienteTelefono),
        clienteId: clienteId || undefined,
        metodoPago,
        prioridad: 'NORMAL',
        observaciones: observaciones.trim() || undefined,
        choferId: choferId || undefined,
        remiseriaId: activeRemiseriaId,
        origenDetallado: origenCoords ? `${origenCoords.lat},${origenCoords.lon}` : undefined,
        destinoDetallado: destinoCoords ? `${destinoCoords.lat},${destinoCoords.lon}` : undefined,
      });

      if (res.success) {
        toast.success(
          choferId
            ? '🚖 Viaje creado y enviado al chofer seleccionado'
            : '✅ Viaje creado — el sistema lo asignará automáticamente',
          { duration: 5000 }
        );
        resetForm();
        onCreated?.();
        onClose();
      } else {
        toast.error(res.message || 'No se pudo crear el viaje');
      }
    } catch {
      toast.error('Error de conexión al crear el viaje');
    } finally {
      setEnviando(false);
    }
  };

  const renderSugerencias = (
    lista: any[],
    onPick: (s: any) => void
  ) =>
    lista.length > 0 && (
      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
        {lista.map((s, idx) => (
          <button
            key={idx}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(s);
            }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700"
          >
            {s.display_name || s.nombre || s.label}
          </button>
        ))}
      </div>
    );

  const renderClienteSugerencias = () =>
    clienteSug.length > 0 && (
      <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100">
        {clienteSug.map((cl: any) => (
          <button
            key={cl.id}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              const nombre = [cl.nombre, cl.apellido].filter(Boolean).join(' ').trim();
              setClienteNombre(nombre || cl.razonSocial || '');
              setClienteTelefono(soloNumeros(cl.telefono || '').slice(0, 15));
              setClienteId(cl.id);
              if (cl.cuentaCorrienteHabilitada) {
                setMetodoPago('CUENTA_CORRIENTE');
              }
              setClienteSug([]);
              setClienteFocus(null);
            }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700 flex items-center justify-between gap-2"
          >
            <span className="truncate font-semibold">
              {[cl.nombre, cl.apellido].filter(Boolean).join(' ') || cl.razonSocial}
              {cl.telefono ? ` · ${cl.telefono}` : ''}
            </span>
            {cl.cuentaCorrienteHabilitada && (
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">
                Cta. Cte.
              </span>
            )}
          </button>
        ))}
      </div>
    );

  return (
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white z-10 flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
              <Car className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-900">Nuevo Viaje</h3>
              <p className="text-[11px] text-slate-500">Cargá un viaje y asignalo a un chofer (opcional)</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-500"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {remiserias.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Remisería</label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={activeRemiseriaId || ''}
                  onChange={(e) => setSelectedRemiseriaId(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                >
                  {remiserias.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombreFantasia || r.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Pasajero */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Pasajero *</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={clienteNombre}
                  onFocus={() => setClienteFocus('nombre')}
                  onBlur={() => setTimeout(() => setClienteFocus((f) => (f === 'nombre' ? null : f)), 150)}
                  onChange={(e) => {
                    setClienteNombre(e.target.value);
                    setClienteId(null);
                  }}
                  maxLength={80}
                  placeholder="Nombre y apellido"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
                {clienteFocus === 'nombre' && renderClienteSugerencias()}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Teléfono *</label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="tel"
                  inputMode="numeric"
                  value={clienteTelefono}
                  onFocus={() => setClienteFocus('telefono')}
                  onBlur={() => setTimeout(() => setClienteFocus((f) => (f === 'telefono' ? null : f)), 150)}
                  onChange={(e) => {
                    setClienteTelefono(soloNumeros(e.target.value).slice(0, 15));
                    setClienteId(null);
                  }}
                  placeholder="2346551234"
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm"
                />
                {clienteFocus === 'telefono' && renderClienteSugerencias()}
              </div>
            </div>
          </div>

          {/* Origen */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Origen *</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
              <input
                type="text"
                value={origen}
                onFocus={() => setFocus('origen')}
                onBlur={() => setTimeout(() => setFocus((f) => (f === 'origen' ? null : f)), 150)}
                onChange={(e) => {
                  setOrigen(e.target.value);
                  setOrigenSel(false);
                  setOrigenCoords(null);
                }}
                placeholder="Calle y número, localidad"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
              {focus === 'origen' && !origenSel &&
                renderSugerencias(origenSug, (s) => {
                  setOrigen(s.display_name || origen);
                  if (s.lat && s.lon) setOrigenCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
                  setOrigenSel(true);
                  setOrigenSug([]);
                  setFocus(null);
                })}
            </div>
          </div>

          {/* Destino */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Destino *</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-500" />
              <input
                type="text"
                value={destino}
                onFocus={() => setFocus('destino')}
                onBlur={() => setTimeout(() => setFocus((f) => (f === 'destino' ? null : f)), 150)}
                onChange={(e) => {
                  setDestino(e.target.value);
                  setDestinoSel(false);
                  setDestinoCoords(null);
                }}
                placeholder="Calle y número, localidad"
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
              {focus === 'destino' && !destinoSel &&
                renderSugerencias(destinoSug, (s) => {
                  setDestino(s.display_name || destino);
                  if (s.lat && s.lon) setDestinoCoords({ lat: parseFloat(s.lat), lon: parseFloat(s.lon) });
                  setDestinoSel(true);
                  setDestinoSug([]);
                  setFocus(null);
                })}
            </div>
          </div>

          {/* Tipo y horario */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setTipoViaje('inmediato')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                tipoViaje === 'inmediato'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              ⚡ Inmediato
            </button>
            <button
              type="button"
              onClick={() => setTipoViaje('programado')}
              className={`py-2 rounded-xl text-xs font-bold border transition-colors ${
                tipoViaje === 'programado'
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              🗓️ Programado
            </button>
          </div>
          {tipoViaje === 'programado' && (
            <div className="grid grid-cols-2 gap-3">
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
              <input
                type="time"
                value={hora}
                onChange={(e) => setHora(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
              />
            </div>
          )}

          {/* Tarifa y Método de Pago */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700">Tarifa estimada ($)</label>
                <button
                  type="button"
                  onClick={() => {
                    precioEditadoManualRef.current = false;
                    calcularPrecio(false);
                  }}
                  disabled={calculando || !origen.trim() || !destino.trim()}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-800 disabled:opacity-40"
                >
                  {calculando ? <Loader2 className="w-3 h-3 animate-spin" /> : <Calculator className="w-3 h-3" />}
                  {calculando ? 'Calculando...' : 'Calcular'}
                </button>
              </div>
              <input
                type="number"
                min="0"
                value={precio}
                onChange={(e) => {
                  precioEditadoManualRef.current = true;
                  setPrecio(e.target.value);
                }}
                placeholder="Se calcula automáticamente"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-base font-bold text-emerald-700"
              />
              {distanciaKm !== null && (
                <p className="text-[11px] text-emerald-700 mt-1">🛣️ Distancia estimada: {distanciaKm} km</p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Método de pago</label>
              <div className="relative">
                <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <select
                  value={metodoPago}
                  onChange={(e) => setMetodoPago(e.target.value as 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE')}
                  className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm bg-white"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia</option>
                  <option value="CUENTA_CORRIENTE">Cuenta Corriente</option>
                </select>
              </div>
            </div>
          </div>

          {/* Chofer */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">🚖 Asignar Chofer (Opcional)</label>
            <select
              value={choferId}
              onChange={(e) => setChoferId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
            >
              <option value="">Asignación automática del sistema</option>
              {choferesOrdenados.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.isOnline ? '🟢' : '⚪'} {c.nombre} {c.apellido}
                  {c.numeroChofer ? ` (#${c.numeroChofer})` : ''} — {c.vehiculo?.patente || 'Sin móvil'}
                  {c.isOnline ? '' : ' · desconectado'}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 mt-1">
              Si no elegís ningún chofer, el sistema lo asigna automáticamente al móvil óptimo (Tabla / Cercanía).
            </p>
            {choferId && !choferesOrdenados.find((c) => c.id === choferId)?.isOnline && (
              <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1.5">
                ⚠️ Este chofer no está conectado ahora: verá el viaje recién cuando abra la app.
              </p>
            )}
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Observaciones</label>
            <textarea
              rows={2}
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder="Indicaciones para el chofer..."
              className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={enviando}
              className="flex-1 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {enviando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {enviando ? 'Creando...' : choferId ? 'Crear y Asignar' : 'Crear Viaje'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
