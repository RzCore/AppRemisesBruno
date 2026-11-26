'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTracking } from '@/hooks/useAppTracking';
import { choferService, coordinadorDashboardService } from '@/lib/api';
import { Chofer, Viaje, LiquidacionPendienteResumen } from '@/types';
import {
  ArrowLeft,
  DollarSign,
  Calendar,
  Fuel,
  FileText,
  User,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Coins,
  RefreshCw,
  Clock,
  Banknote,
  CreditCard,
  Wallet
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function CierreCajaPage() {
  const { user } = useAuth();
  const router = useRouter();
  useAppTracking('COORDINADOR_CIERRE_CAJA');

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [selectedChoferId, setSelectedChoferId] = useState<string>('');
  const [loadingChoferes, setLoadingChoferes] = useState(true);

  const [pendingData, setPendingData] = useState<LiquidacionPendienteResumen | null>(null);
  const [loadingPending, setLoadingPending] = useState(false);

  // Resumen del turno del coordinador (hoy)
  const [resumenTurno, setResumenTurno] = useState<any>(null);
  const [loadingResumen, setLoadingResumen] = useState(false);

  // Form Inputs
  const [combustible, setCombustible] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');
  const [metodoPagoChofer, setMetodoPagoChofer] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'AMBOS'>('EFECTIVO');
  const [montoEfectivoInput, setMontoEfectivoInput] = useState<string>('');
  const [montoTransferenciaInput, setMontoTransferenciaInput] = useState<string>('');
  const [quienPagaSaldoAFavor, setQuienPagaSaldoAFavor] = useState<'COORDINADOR' | 'PENDIENTE_DUENIO'>('COORDINADOR');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    loadChoferes();
    loadResumenTurno();
  }, [user]);

  const loadResumenTurno = async () => {
    try {
      setLoadingResumen(true);
      const response = await coordinadorDashboardService.getResumenCoordinador();
      if (response.success && response.data) {
        setResumenTurno(response.data);
      } else {
        toast.error('Error al cargar el resumen del turno');
      }
    } catch (error) {
      console.error('Error loading shift summary:', error);
    } finally {
      setLoadingResumen(false);
    }
  };

  const loadChoferes = async () => {
    try {
      setLoadingChoferes(true);
      const response = await choferService.getAll();
      if (response.success && response.data) {
        const activos = response.data.filter(c => c.estado !== 'DADO_DE_BAJA');
        setChoferes(activos);
      } else {
        toast.error('Error al cargar la lista de choferes');
      }
    } catch (error) {
      console.error('Error loading choferes:', error);
      toast.error('Error al cargar choferes');
    } finally {
      setLoadingChoferes(false);
    }
  };

  const resetFormInputs = () => {
    setCombustible('');
    setObservaciones('');
    setMetodoPagoChofer('EFECTIVO');
    setMontoEfectivoInput('');
    setMontoTransferenciaInput('');
    setQuienPagaSaldoAFavor('COORDINADOR');
  };

  const handleChoferChange = async (choferId: string) => {
    setSelectedChoferId(choferId);
    setPendingData(null);
    resetFormInputs();

    if (!choferId) return;

    try {
      setLoadingPending(true);
      const response = await coordinadorDashboardService.getLiquidacionesPendientes(choferId);
      if (response.success && response.data) {
        setPendingData(response.data);
        const combAuto = Number(
          response.data.resumen?.combustible ?? response.data.gastos?.totalCombustible ?? 0
        );
        if (!response.data.chofer.esPropietario && combAuto > 0) {
          setCombustible(String(combAuto));
        }
      } else {
        toast.error(response.message || 'Error al obtener viajes pendientes');
      }
    } catch (error) {
      console.error('Error fetching pending box closure:', error);
      toast.error('Error al obtener viajes pendientes');
    } finally {
      setLoadingPending(false);
    }
  };

  // Cálculos dinámicos en frontend basados en la comisión diferenciada por distancia del backend y combustible ingresado
  const getCalculos = () => {
    if (!pendingData) {
      return {
        totalRecaudado: 0,
        totalEfectivo: 0,
        totalTransferencia: 0,
        totalTransferenciaAgencia: 0,
        totalTransferenciaPropia: 0,
        totalCuentaCorriente: 0,
        totalCortaDistancia: 0,
        totalLargaDistancia: 0,
        cantidadCortaDistancia: 0,
        cantidadLargaDistancia: 0,
        comisionChofer: 0,
        comisionAgencia: 0,
        gananciaPropietario: 0,
        saldoNeto: 0,
        montoARendirChofer: 0,
        saldoAFavorChofer: 0
      };
    }

    const { chofer, resumen } = pendingData;
    const totalRecaudado = resumen.totalRecaudado || 0;
    const totalEfectivo = resumen.totalEfectivo ?? 0;
    const totalTransferencia = resumen.totalTransferencia ?? 0;
    const totalTransferenciaAgencia = resumen.totalTransferenciaAgencia ?? totalTransferencia;
    const totalTransferenciaPropia = resumen.totalTransferenciaPropia ?? 0;
    const totalCuentaCorriente = resumen.totalCuentaCorriente ?? 0;
    const comisionChofer = resumen.comisionChofer || 0;
    const comisionAgencia = resumen.comisionAgencia || 0;
    const combustibleVal = chofer.esPropietario ? 0 : Math.max(0, parseFloat(combustible) || 0);

    const gananciaPropietarioBruta =
      resumen.gananciaPropietarioBruta ??
      ((resumen.gananciaPropietario || 0) + (resumen.combustible || 0));
    const gananciaPropietario = chofer.esPropietario
      ? 0
      : Math.max(0, gananciaPropietarioBruta - combustibleVal);

    const saldoNeto = Math.round((totalEfectivo + totalTransferenciaPropia - comisionChofer - combustibleVal) * 100) / 100;
    const montoARendirChofer = saldoNeto > 0 ? saldoNeto : 0;
    const saldoAFavorChofer = saldoNeto < 0 ? Math.round(Math.abs(saldoNeto) * 100) / 100 : 0;

    return {
      totalRecaudado,
      totalEfectivo,
      totalTransferencia,
      totalTransferenciaAgencia,
      totalTransferenciaPropia,
      totalCuentaCorriente,
      totalCortaDistancia: resumen.totalCortaDistancia ?? 0,
      totalLargaDistancia: resumen.totalLargaDistancia ?? 0,
      cantidadCortaDistancia: resumen.cantidadCortaDistancia ?? 0,
      cantidadLargaDistancia: resumen.cantidadLargaDistancia ?? 0,
      comisionChofer,
      comisionAgencia,
      gananciaPropietario,
      saldoNeto,
      montoARendirChofer,
      saldoAFavorChofer
    };
  };

  const calculos = getCalculos();
  const montoOperacionActual =
    calculos.montoARendirChofer > 0
      ? calculos.montoARendirChofer
      : calculos.saldoAFavorChofer > 0 && quienPagaSaldoAFavor === 'COORDINADOR'
      ? calculos.saldoAFavorChofer
      : 0;

  const handleMontoEfectivoChange = (val: string) => {
    setMontoEfectivoInput(val);
    const efec = parseFloat(val);
    if (!isNaN(efec) && montoOperacionActual > 0) {
      const restante = Math.max(0, Math.round((montoOperacionActual - efec) * 100) / 100);
      setMontoTransferenciaInput(restante.toString());
    }
  };

  const handleMontoTransferenciaChange = (val: string) => {
    setMontoTransferenciaInput(val);
    const transf = parseFloat(val);
    if (!isNaN(transf) && montoOperacionActual > 0) {
      const restante = Math.max(0, Math.round((montoOperacionActual - transf) * 100) / 100);
      setMontoEfectivoInput(restante.toString());
    }
  };

  const handleSubmitCierre = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChoferId || !pendingData) return;

    if (pendingData.viajes.length === 0) {
      toast.error('No hay viajes completados para liquidar.');
      return;
    }

    const necesitaMedioPago =
      calculos.montoARendirChofer > 0 ||
      (calculos.saldoAFavorChofer > 0 && quienPagaSaldoAFavor === 'COORDINADOR');

    let montoEfectivoVal = 0;
    let montoTransferenciaVal = 0;

    if (necesitaMedioPago) {
      if (metodoPagoChofer === 'EFECTIVO') {
        montoEfectivoVal = montoOperacionActual;
      } else if (metodoPagoChofer === 'TRANSFERENCIA') {
        montoTransferenciaVal = montoOperacionActual;
      } else {
        montoEfectivoVal = parseFloat(montoEfectivoInput) || 0;
        montoTransferenciaVal = parseFloat(montoTransferenciaInput) || 0;
        if (montoEfectivoVal < 0 || montoTransferenciaVal < 0) {
          toast.error('Los montos no pueden ser negativos.');
          return;
        }
        if (Math.abs((montoEfectivoVal + montoTransferenciaVal) - montoOperacionActual) > 1) {
          toast.error(
            `Efectivo ($${montoEfectivoVal.toLocaleString('es-AR')}) + Transferencia ($${montoTransferenciaVal.toLocaleString('es-AR')}) debe sumar $${montoOperacionActual.toLocaleString('es-AR')}.`
          );
          return;
        }
      }
    }

    let confirmDetalle = '';
    if (calculos.montoARendirChofer > 0) {
      const medioTxt =
        metodoPagoChofer === 'AMBOS'
          ? `Efectivo $${montoEfectivoVal.toLocaleString('es-AR')} + Transf. $${montoTransferenciaVal.toLocaleString('es-AR')}`
          : metodoPagoChofer;
      confirmDetalle = `Chofer entrega: $${calculos.montoARendirChofer.toLocaleString('es-AR')} (${medioTxt})`;
    } else if (calculos.saldoAFavorChofer > 0) {
      confirmDetalle =
        quienPagaSaldoAFavor === 'COORDINADOR'
          ? `SALDO A FAVOR del chofer: $${calculos.saldoAFavorChofer.toLocaleString('es-AR')} (Paga Coordinador - ${metodoPagoChofer})`
          : `SALDO A FAVOR del chofer: $${calculos.saldoAFavorChofer.toLocaleString('es-AR')} (Queda pendiente para el Dueño)`;
    } else {
      confirmDetalle = 'Saldo en $0 (sin movimiento de efectivo)';
    }

    const confirmMessage = `¿Confirmas el cierre de caja de ${pendingData.chofer.nombre} ${pendingData.chofer.apellido}?\nComisión Agencia: $${calculos.comisionAgencia.toLocaleString('es-AR')}\n${confirmDetalle}`;

    if (!confirm(confirmMessage)) return;

    try {
      setIsSubmitting(true);
      const payload: any = {
        choferId: selectedChoferId,
        combustible: pendingData.chofer.esPropietario ? 0 : parseFloat(combustible) || 0,
        observaciones: observaciones.trim()
      };

      if (calculos.montoARendirChofer > 0) {
        payload.metodoPagoChofer = metodoPagoChofer;
        payload.montoEfectivo = montoEfectivoVal;
        payload.montoTransferencia = montoTransferenciaVal;
      } else if (calculos.saldoAFavorChofer > 0) {
        payload.quienPagaSaldoAFavor = quienPagaSaldoAFavor;
        if (quienPagaSaldoAFavor === 'COORDINADOR') {
          payload.metodoPagoChofer = metodoPagoChofer;
          payload.montoEfectivo = montoEfectivoVal;
          payload.montoTransferencia = montoTransferenciaVal;
        }
      }

      const response = await coordinadorDashboardService.crearLiquidacion(payload);
      if (response.success) {
        toast.success('Cierre de caja y liquidación registrados exitosamente');
        setPendingData(null);
        setSelectedChoferId('');
        resetFormInputs();
        loadChoferes();
        loadResumenTurno();
      } else {
        toast.error(response.message || 'Error al guardar liquidación');
      }
    } catch (error) {
      console.error('Error saving box closure:', error);
      toast.error('Error al registrar cierre de caja');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12 overflow-x-hidden w-full">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link
                href="/coordinador/dashboard"
                className="flex items-center text-slate-600 hover:text-slate-900 mr-4 font-medium transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Dashboard
              </Link>
              <span className="h-6 w-px bg-slate-200 mr-4" />
              <div className="flex items-center space-x-2">
                <div className="p-1.5 bg-emerald-100 rounded-lg text-emerald-700">
                  <DollarSign className="w-5 h-5" />
                </div>
                <h1 className="text-xl font-bold text-slate-800">Cierre de Caja Chofer</h1>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  loadChoferes();
                  loadResumenTurno();
                }}
                disabled={loadingChoferes || loadingResumen}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                title="Recargar datos"
              >
                <RefreshCw className={`w-4 h-4 ${loadingChoferes || loadingResumen ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full min-w-0">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 min-w-0">
          {/* Columna Izquierda: Selector de Chofer y Parámetros */}
          <div className="lg:col-span-1 space-y-6 min-w-0">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-blue-500" />
                Seleccionar Chofer
              </h2>

              <div className="space-y-4">
                <div>
                  <label htmlFor="choferSelect" className="block text-sm font-medium text-slate-700 mb-2">
                    Chofer Activo
                  </label>
                  {loadingChoferes ? (
                    <div className="h-10 bg-slate-100 rounded-lg animate-pulse" />
                  ) : (
                    <select
                      id="choferSelect"
                      value={selectedChoferId}
                      onChange={(e) => handleChoferChange(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800 font-medium"
                    >
                      <option value="">-- Elegir un chofer --</option>
                      {choferes.map((chofer) => (
                        <option key={chofer.id} value={chofer.id}>
                          {chofer.nombre} {chofer.apellido} (#{chofer.numeroChofer}) {chofer.esFranquero ? '[Franquero] ' : ''}{chofer.esPropietario ? '[Dueño]' : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {pendingData && (
                  <div className="pt-4 border-t border-slate-100">
                    <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
                      <h3 className="text-sm font-bold text-blue-800 mb-2">Detalles del Chofer</h3>
                      <div className="space-y-1.5 text-xs text-blue-900">
                        <p className="flex justify-between">
                          <span>Condición:</span>
                          <span className="font-semibold">
                            {pendingData.chofer.esPropietario ? 'Propietario de auto' : 'Chofer comisionista'}
                          </span>
                        </p>
                        {!pendingData.chofer.esPropietario && (
                          <p className="flex justify-between">
                            <span>Comisión Chofer:</span>
                            <span className="font-semibold">30% de recaudación</span>
                          </p>
                        )}
                        <p className="flex justify-between">
                          <span>Comisión Agencia:</span>
                          <span className="font-semibold">20% (&lt;20km) / 15% (≥20km)</span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {pendingData && (
              <form onSubmit={handleSubmitCierre} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                  <Coins className="w-5 h-5 text-emerald-500" />
                  Parámetros de Liquidación
                </h2>

                {!pendingData.chofer.esPropietario ? (
                  <div>
                    <label htmlFor="combustibleInput" className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                      <Fuel className="w-4 h-4 text-orange-500" />
                      Gasto en Combustible (Nafta/GNC)
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 font-medium">$</span>
                      <input
                        type="number"
                        id="combustibleInput"
                        min="0"
                        step="0.01"
                        value={combustible}
                        onChange={(e) => setCombustible(e.target.value)}
                        className="w-full pl-7 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800 font-bold text-lg"
                        placeholder="0.00"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Se descuenta del saldo del dueño del vehículo y del efectivo a rendir.</p>
                    {pendingData.gastos && pendingData.gastos.items.length > 0 && (
                      <div className="mt-3 p-3 rounded-xl bg-orange-50/70 border border-orange-200 space-y-1.5">
                        <p className="text-[11px] font-bold text-orange-800 uppercase tracking-wide flex items-center justify-between">
                          <span>Gastos cargados por el chofer</span>
                          <span>${pendingData.gastos.total.toLocaleString('es-AR')}</span>
                        </p>
                        <div className="space-y-1 max-h-28 overflow-y-auto">
                          {pendingData.gastos.items.map((g) => (
                            <div key={g.id} className="flex items-center justify-between text-[11px] text-orange-900">
                              <span className="truncate pr-2">
                                {g.tipo === 'COMBUSTIBLE'
                                  ? `⛽ ${g.subtipoCombustible === 'GNC' ? 'GNC' : 'Nafta/Gasoil'}`
                                  : `🧾 ${g.tipo}`}
                                {g.descripcion ? ` · ${g.descripcion}` : ''}
                              </span>
                              <span className="font-bold shrink-0">${Number(g.monto).toLocaleString('es-AR')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 flex items-start gap-2.5">
                    <Shield className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-slate-800">Chofer Propietario</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        La agencia retiene 20% en viajes locales (&lt;20 km) y 15% en larga distancia (≥20 km). El combustible no se deduce en caja.
                      </p>
                    </div>
                  </div>
                )}

                {/* Si el chofer tiene SALDO A FAVOR */}
                {pendingData.viajes.length > 0 && calculos.saldoAFavorChofer > 0 && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-amber-800 uppercase">Saldo a Favor del Chofer</span>
                      <span className="text-lg font-black text-amber-900">
                        ${calculos.saldoAFavorChofer.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Los viajes en Cuenta Corriente / Transferencia superan el efectivo cobrado por el chofer. Indicá quién le abona este saldo:
                    </p>
                    <div className="grid grid-cols-1 gap-2">
                      <button
                        type="button"
                        onClick={() => setQuienPagaSaldoAFavor('COORDINADOR')}
                        className={`p-2.5 rounded-xl border-2 text-left text-xs font-bold transition-all ${
                          quienPagaSaldoAFavor === 'COORDINADOR'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-700 border-amber-200 hover:border-amber-400'
                        }`}
                      >
                        Paga Coordinador desde caja ahora
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuienPagaSaldoAFavor('PENDIENTE_DUENIO')}
                        className={`p-2.5 rounded-xl border-2 text-left text-xs font-bold transition-all ${
                          quienPagaSaldoAFavor === 'PENDIENTE_DUENIO'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-700 border-amber-200 hover:border-amber-400'
                        }`}
                      >
                        Queda pendiente para que pague el Dueño
                      </button>
                    </div>
                  </div>
                )}

                {/* Selector de Medio de Pago (Efectivo / Transferencia / Ambos) */}
                {pendingData.viajes.length > 0 && montoOperacionActual > 0 && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <label className="block text-sm font-bold text-slate-700">
                      {calculos.montoARendirChofer > 0
                        ? 'Medio de pago del chofer'
                        : 'Medio de pago al chofer (desde caja)'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: 'EFECTIVO', label: 'Efectivo', icon: Banknote },
                        { id: 'TRANSFERENCIA', label: 'Transf.', icon: CreditCard },
                        { id: 'AMBOS', label: 'Ambos', icon: Wallet }
                      ] as const).map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => {
                            setMetodoPagoChofer(id);
                            if (id === 'AMBOS') {
                              const mitad = Math.round((montoOperacionActual / 2) * 100) / 100;
                              const resto = Math.round((montoOperacionActual - mitad) * 100) / 100;
                              setMontoEfectivoInput(mitad.toString());
                              setMontoTransferenciaInput(resto.toString());
                            }
                          }}
                          className={`py-2.5 px-2 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                            metodoPagoChofer === id
                              ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                          {label}
                        </button>
                      ))}
                    </div>

                    {metodoPagoChofer === 'AMBOS' && (
                      <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Efectivo ($)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={montoEfectivoInput}
                            onChange={(e) => handleMontoEfectivoChange(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 bg-white"
                            placeholder="0.00"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">Transferencia ($)</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={montoTransferenciaInput}
                            onChange={(e) => handleMontoTransferenciaChange(e.target.value)}
                            className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 bg-white"
                            placeholder="0.00"
                          />
                        </div>
                        <div className="col-span-2 flex justify-between text-[11px] font-semibold text-slate-600 pt-1 border-t border-slate-200">
                          <span>Total a cubrir:</span>
                          <span className="text-slate-900 font-bold">
                            ${montoOperacionActual.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label htmlFor="observacionesInput" className="block text-sm font-medium text-slate-700 mb-2 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-slate-400" />
                    Observaciones
                  </label>
                  <textarea
                    id="observacionesInput"
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-800 text-sm"
                    placeholder="Detalles sobre el cierre, transferencia, combustible, etc."
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting || pendingData.viajes.length === 0}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow-md shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:shadow-none"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  {isSubmitting ? 'Registrando...' : 'Realizar Cierre de Caja'}
                </button>
              </form>
            )}
          </div>

          {/* Columna Derecha: Viajes Pendientes y Cuadro de Resultados */}
          <div className="lg:col-span-2 space-y-6 min-w-0">
            {!selectedChoferId ? (
              <div className="space-y-6">
                {/* Resumen del Turno */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-500" />
                      Resumen Financiero de Mi Turno (Hoy)
                    </h2>
                    <span className="text-xs text-slate-400 font-medium">Auto-rendición al dueño</span>
                  </div>

                  {loadingResumen ? (
                    <div className="py-8 text-center">
                      <div className="loading-spinner border-primary-500 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">Cargando resumen de caja...</p>
                    </div>
                  ) : resumenTurno ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 shadow-sm">
                        <span className="text-slate-500 font-bold block uppercase tracking-wider text-[10px]">Total Recaudado</span>
                        <span className="text-2xl font-black text-slate-800 block mt-1">
                          ${(resumenTurno.resumen?.totalRecaudado || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-slate-400 mt-1 block">Bruto en viajes liquidados</span>
                      </div>

                      <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100 shadow-sm">
                        <span className="text-emerald-700 font-bold block uppercase tracking-wider text-[10px]">Efectivo en Caja (Neto)</span>
                        <span className="text-2xl font-black text-emerald-800 block mt-1">
                          ${(resumenTurno.resumen?.netoEfectivoEnCaja ?? resumenTurno.resumen?.totalEfectivoCobrado ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-emerald-600 mt-1 block">
                          Cobrado: ${(resumenTurno.resumen?.totalEfectivoCobrado || 0).toLocaleString('es-AR')}
                        </span>
                      </div>

                      <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100 shadow-sm">
                        <span className="text-blue-700 font-bold block uppercase tracking-wider text-[10px]">Transferencias</span>
                        <span className="text-2xl font-black text-blue-800 block mt-1">
                          ${(resumenTurno.resumen?.totalTransferenciaCobrada || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-blue-600 mt-1 block">Rendidas por choferes</span>
                      </div>

                      <div className="bg-amber-50/50 rounded-xl p-4 border border-amber-100 shadow-sm">
                        <span className="text-amber-700 font-bold block uppercase tracking-wider text-[10px]">Saldos a Favor</span>
                        <span className="text-2xl font-black text-amber-800 block mt-1">
                          ${((resumenTurno.resumen?.totalPagadoSaldoAFavorCaja || 0) + (resumenTurno.resumen?.totalSaldoAFavorPendienteDuenio || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                        </span>
                        <span className="text-[10px] text-amber-700 mt-1 block">
                          Caja: ${(resumenTurno.resumen?.totalPagadoSaldoAFavorCaja || 0).toLocaleString('es-AR')} | Dueño: ${(resumenTurno.resumen?.totalSaldoAFavorPendienteDuenio || 0).toLocaleString('es-AR')}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">No se pudo cargar el resumen del turno.</p>
                  )}
                </div>

                {/* Historial de Cierres Hoy */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <h3 className="text-md font-bold text-slate-800 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-slate-400" />
                      Cierres de Caja Procesados Hoy ({resumenTurno?.liquidaciones?.length || 0})
                    </h3>
                  </div>

                  {loadingResumen ? (
                    <div className="p-8 text-center">
                      <div className="loading-spinner border-primary-500 mx-auto" />
                    </div>
                  ) : resumenTurno?.liquidaciones?.length === 0 ? (
                    <div className="p-12 text-center">
                      <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <h4 className="text-sm font-bold text-slate-700">Sin cierres hoy</h4>
                      <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                        Aún no has registrado ningún cierre de caja chofer en tu turno de hoy. Selecciona un chofer a la izquierda para empezar.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-auto w-full max-h-[65vh]">
                      <table className="w-full divide-y divide-slate-200 text-left text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-[inset_0_-1px_0_0_rgba(226,232,240,1)]">
                          <tr>
                            <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Hora</th>
                            <th className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Chofer</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Recaudado</th>
                            <th className="px-3 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Agencia</th>
                            <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Rendición / Pago</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {resumenTurno?.liquidaciones?.map((liq: any) => (
                            <tr key={liq.id} className="hover:bg-slate-50/30 transition-colors text-slate-700 text-xs">
                              <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-500">
                                {new Date(liq.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap font-bold text-slate-800">
                                {liq.chofer?.nombre} {liq.chofer?.apellido}
                                <div className="text-[10px] text-slate-400 font-normal">
                                  #{liq.chofer?.numeroChofer}{liq.chofer?.esFranquero ? ' (Franquero)' : ''} • {liq.chofer?.esPropietario ? 'Dueño Auto' : 'Comisionista'}
                                </div>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right font-bold text-slate-800">
                                ${liq.totalRecaudado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right text-emerald-700 font-bold bg-emerald-50/20">
                                ${liq.comisionAgencia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                {liq.saldoAFavorChofer > 0 ? (
                                  <div className="flex flex-col">
                                    <span className="inline-flex w-fit px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                      Saldo a favor: ${liq.saldoAFavorChofer.toLocaleString('es-AR')}
                                    </span>
                                    <span className="text-[10px] text-slate-500 mt-0.5">
                                      {liq.quienPagaSaldoAFavor === 'COORDINADOR'
                                        ? `Pagado caja (${liq.metodoPagoChofer || 'EFECTIVO'})`
                                        : 'Pendiente Dueño'}
                                    </span>
                                  </div>
                                ) : liq.metodoPagoChofer === 'AMBOS' ? (
                                  <div className="text-[11px]">
                                    <span className="font-bold text-indigo-700">Ambos</span>
                                    <div className="text-[10px] text-slate-500">
                                      Efec: ${(liq.montoEfectivo || 0).toLocaleString('es-AR')} | Transf: ${(liq.montoTransferencia || 0).toLocaleString('es-AR')}
                                    </div>
                                  </div>
                                ) : liq.metodoPagoChofer === 'TRANSFERENCIA' ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                    Transferencia ${(liq.montoTransferencia || liq.saldoNeto || 0).toLocaleString('es-AR')}
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                    Efectivo ${(liq.montoEfectivo || liq.saldoNeto || liq.comisionAgencia || 0).toLocaleString('es-AR')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : loadingPending ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                <div className="loading-spinner border-primary-500 mx-auto mb-4" />
                <p className="text-slate-500">Buscando viajes pendientes de liquidar...</p>
              </div>
            ) : pendingData ? (
              <div className="space-y-6">
                {/* Cuadro Resumen Financiero */}
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">Cálculo de Liquidación</h3>

                  {/* Banner de Balance Real del Cierre */}
                  {pendingData.viajes.length > 0 && (
                    <div
                      className={`mb-5 p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                        calculos.saldoAFavorChofer > 0
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : calculos.montoARendirChofer > 0
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                          : 'bg-slate-50 border-slate-200 text-slate-800'
                      }`}
                    >
                      <div>
                        <span className="text-[11px] font-bold uppercase tracking-wider block opacity-80">
                          {calculos.saldoAFavorChofer > 0
                            ? 'Saldo a Favor del Chofer (a pagar por agencia)'
                            : calculos.montoARendirChofer > 0
                            ? 'Monto Neto a Entregar por el Chofer'
                            : 'Balance en Cero'}
                        </span>
                        <p className="text-xs opacity-75 mt-0.5">
                          Efectivo (${calculos.totalEfectivo.toLocaleString('es-AR')})
                          {calculos.totalTransferenciaPropia > 0
                            ? ` + Transf. Propia ($${calculos.totalTransferenciaPropia.toLocaleString('es-AR')})`
                            : ''}
                          {' '}− Parte chofer (${calculos.comisionChofer.toLocaleString('es-AR')})
                          {!pendingData.chofer.esPropietario && (parseFloat(combustible) || 0) > 0
                            ? ` − Combustible ($${(parseFloat(combustible) || 0).toLocaleString('es-AR')})`
                            : ''}
                        </p>
                      </div>
                      <span className="text-2xl sm:text-3xl font-black">
                        $
                        {(calculos.saldoAFavorChofer > 0
                          ? calculos.saldoAFavorChofer
                          : calculos.montoARendirChofer
                        ).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <span className="text-xs text-slate-500 font-semibold block uppercase">Total Recaudado</span>
                      <span className="text-2xl font-black text-slate-800 block mt-1">
                        ${calculos.totalRecaudado.toLocaleString('es-AR')}
                      </span>
                      <div className="text-[10px] text-slate-500 mt-1.5 space-y-0.5 font-semibold">
                        <div className="text-emerald-700">Efec: ${calculos.totalEfectivo.toLocaleString('es-AR')}</div>
                        <div className="text-blue-700">Transf. Agencia: ${calculos.totalTransferenciaAgencia.toLocaleString('es-AR')}</div>
                        <div className="text-indigo-700">Transf. Propia: ${calculos.totalTransferenciaPropia.toLocaleString('es-AR')}</div>
                        <div className="text-purple-700">Cta Cte: ${calculos.totalCuentaCorriente.toLocaleString('es-AR')}</div>
                      </div>
                    </div>

                    <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100">
                      <span className="text-xs text-emerald-700 font-semibold block uppercase">Comisión Agencia</span>
                      <span className="text-2xl font-black text-emerald-800 block mt-1">
                        ${calculos.comisionAgencia.toLocaleString('es-AR')}
                      </span>
                      <div className="text-[10px] text-emerald-700 mt-1.5 space-y-0.5 font-medium">
                        <div>&lt;20km (20%): {calculos.cantidadCortaDistancia} viaje{calculos.cantidadCortaDistancia !== 1 ? 's' : ''}</div>
                        <div>≥20km (15%): {calculos.cantidadLargaDistancia} viaje{calculos.cantidadLargaDistancia !== 1 ? 's' : ''}</div>
                      </div>
                    </div>

                    <div className="bg-blue-50/50 rounded-xl p-4 border border-blue-100">
                      <span className="text-xs text-blue-700 font-semibold block uppercase">Comisión Chofer</span>
                      <span className="text-2xl font-black text-blue-800 block mt-1">
                        ${calculos.comisionChofer.toLocaleString('es-AR')}
                      </span>
                      <span className="text-[10px] text-blue-600 mt-1 block font-medium">
                        {pendingData.chofer.esPropietario
                          ? '80% corta / 85% larga'
                          : 'Salario chofer (30%)'}
                      </span>
                    </div>

                    {!pendingData.chofer.esPropietario && (
                      <div className="bg-purple-50/50 rounded-xl p-4 border border-purple-100">
                        <span className="text-xs text-purple-700 font-semibold block uppercase">Ganancia Propietario</span>
                        <span className="text-2xl font-black text-purple-800 block mt-1">
                          ${calculos.gananciaPropietario.toLocaleString('es-AR')}
                        </span>
                        <span className="text-[10px] text-purple-600 mt-1 block font-medium">
                          50% corta / 55% larga (− comb.)
                        </span>
                      </div>
                    )}
                  </div>

                  {pendingData.viajes.length === 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3 text-sm text-yellow-800">
                      <AlertTriangle className="w-5 h-5 shrink-0 text-yellow-500" />
                      <div>
                        <p className="font-semibold">Sin viajes pendientes</p>
                        <p className="text-xs mt-0.5 text-yellow-700">
                          Este chofer no tiene viajes completados que no hayan sido liquidados previamente. No se puede realizar el cierre.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Tabla de Viajes */}
                {pendingData.viajes.length > 0 && (
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                      <h3 className="text-md font-bold text-slate-800">Viajes a Liquidar</h3>
                      <span className="px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold">
                        {pendingData.viajes.length} viajes
                      </span>
                    </div>

                    <div className="overflow-auto w-full max-h-[65vh]">
                      <table className="w-full divide-y divide-slate-200 text-sm">
                        <thead className="bg-slate-50 sticky top-0 z-10 shadow-[inset_0_-1px_0_0_rgba(226,232,240,1)]">
                          <tr>
                            <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Fecha/Hora</th>
                            <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Cliente</th>
                            <th className="px-3 sm:px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Origen / Destino</th>
                            <th className="px-3 sm:px-4 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase">Dist. / Com.</th>
                            <th className="px-3 sm:px-4 py-2.5 text-center text-xs font-semibold text-slate-500 uppercase">Pago</th>
                            <th className="px-3 sm:px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Importe</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {pendingData.viajes.map((viaje: Viaje) => {
                            const km = Number((viaje as any).distanciaKmConPasajero) || 0;
                            const esLarga = km >= 20;
                            return (
                              <tr key={viaje.id} className="hover:bg-slate-50/30 transition-colors">
                                <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                  <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                    <div>
                                      <div className="font-semibold text-slate-800 text-xs sm:text-sm">
                                        {new Date(viaje.fecha).toLocaleDateString('es-AR')}
                                      </div>
                                      <div className="text-[11px] text-slate-400">
                                        {new Date(viaje.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 sm:px-4 py-3 text-sm text-slate-800 font-medium">
                                  <div className="truncate max-w-[130px] sm:max-w-none" title={viaje.clienteNombre || 'S/N'}>
                                    {viaje.clienteNombre || 'S/N'}
                                  </div>
                                </td>
                                <td className="px-3 sm:px-4 py-3 text-xs sm:text-sm text-slate-600">
                                  <div className="line-clamp-1" title={viaje.origen}>
                                    <span className="font-semibold text-slate-700">Orig:</span> {viaje.origen}
                                  </div>
                                  <div className="mt-0.5 line-clamp-1" title={viaje.destino}>
                                    <span className="font-semibold text-slate-700">Dest:</span> {viaje.destino}
                                  </div>
                                </td>
                                <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-center">
                                  <div className="text-[11px] font-semibold text-slate-700">{km.toFixed(1)} km</div>
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                      esLarga
                                        ? 'bg-indigo-100 text-indigo-800'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {esLarga ? '15% Larga' : '20% Local'}
                                  </span>
                                </td>
                                <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-center">
                                  {viaje.metodoPago === 'TRANSFERENCIA' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                                      Transferencia
                                    </span>
                                  ) : viaje.metodoPago === 'CUENTA_CORRIENTE' ? (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                                      Cta. Cte.
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                      Efectivo
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs sm:text-sm text-right font-bold text-slate-900">
                                  ${Number(viaje.precio).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
