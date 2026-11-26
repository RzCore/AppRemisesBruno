'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { coordinadorDashboardService, vehiculoService, choferService } from '@/lib/api';
import { Chofer, LiquidacionPendienteResumen } from '@/types';
import {
  FileText,
  User,
  Clock,
  Search,
  RefreshCw,
  Car,
  Printer,
  Download,
  CheckSquare,
  Square,
  CheckCircle,
  X,
  Banknote,
  CreditCard,
  UserCheck,
  Edit2,
  Eye
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function HistorialLiquidacionesPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Pestaña activa: 'choferes' | 'propietarios' | 'cierre'
  const [activeTab, setActiveTab] = useState<'choferes' | 'propietarios' | 'cierre'>('choferes');

  // Datos generales
  const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [choferesList, setChoferesList] = useState<Chofer[]>([]);
  const [loading, setLoading] = useState(true);

  // Estado para pestaña "Realizar Cierre de Caja" (Dueño)
  const [cierreChoferId, setCierreChoferId] = useState<string>('');
  const [cierrePendingData, setCierrePendingData] = useState<LiquidacionPendienteResumen | null>(null);
  const [cierreLoadingPending, setCierreLoadingPending] = useState(false);
  const [cierreCombustible, setCierreCombustible] = useState<string>('');
  const [cierreObservaciones, setCierreObservaciones] = useState<string>('');
  const [cierreMetodoPago, setCierreMetodoPago] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'AMBOS'>('EFECTIVO');
  const [cierreMontoEfectivo, setCierreMontoEfectivo] = useState<string>('');
  const [cierreMontoTransferencia, setCierreMontoTransferencia] = useState<string>('');
  const [cierreQuienPaga, setCierreQuienPaga] = useState<'PAGADO_DUENIO' | 'PENDIENTE_DUENIO'>('PAGADO_DUENIO');
  const [cierreSubmitting, setCierreSubmitting] = useState(false);

  // Filtros Tab 1: Choferes
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<'all' | 'propietario' | 'comisionista'>('all');
  const [filterRecepcion, setFilterRecepcion] = useState<'all' | 'pendiente' | 'recibido'>('all');
  const [generandoPdf, setGenerandoPdf] = useState(false);

  // Modal de Confirmación de Recepción de Dinero / Pago de Saldo a Favor
  const [recepcionModalLiq, setRecepcionModalLiq] = useState<any | null>(null);
  const [detalleViajesModalLiq, setDetalleViajesModalLiq] = useState<any | null>(null);
  const [metodoEntrega, setMetodoEntrega] = useState<'COORDINADOR' | 'CHOFER_MANO' | 'TRANSFERENCIA'>('COORDINADOR');
  const [notasRecepcion, setNotasRecepcion] = useState('');
  const [submittingRecepcion, setSubmittingRecepcion] = useState(false);

  // Filtros Tab 2: Liquidación a Propietarios de Autos
  const [selectedPropietario, setSelectedPropietario] = useState<string>('');
  const [selectedVehiculoIds, setSelectedVehiculoIds] = useState<string[]>([]);
  const [periodoPropietario, setPeriodoPropietario] = useState<'hoy' | 'semana' | 'mes' | 'todos'>('mes');
  const [showPdfModal, setShowPdfModal] = useState(false);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    loadData();
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [liqRes, vehRes, chofRes] = await Promise.all([
        coordinadorDashboardService.getHistorialDuenio(),
        vehiculoService.getAll(),
        choferService.getAll()
      ]);

      if (liqRes.success && liqRes.data) {
        setLiquidaciones(liqRes.data);
      } else {
        toast.error('Error al cargar historial de liquidaciones');
      }

      if (vehRes.success && vehRes.data) {
        setVehiculos(vehRes.data);
      }

      if (chofRes.success && chofRes.data) {
        setChoferesList(chofRes.data.filter((c) => c.estado !== 'DADO_DE_BAJA'));
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al sincronizar datos');
    } finally {
      setLoading(false);
    }
  };

  // Propietarios únicos de vehículos cargados
  const listaPropietarios = useMemo(() => {
    const map = new Map<string, number>();
    vehiculos.forEach((v) => {
      const prop = v.propietario?.trim();
      if (prop && prop.toLowerCase() !== 'chofer') {
        map.set(prop, (map.get(prop) || 0) + 1);
      }
    });
    return Array.from(map.entries()).map(([nombre, cantidad]) => ({
      nombre,
      cantidad
    }));
  }, [vehiculos]);

  useEffect(() => {
    if (listaPropietarios.length > 0 && !selectedPropietario) {
      setSelectedPropietario(listaPropietarios[0].nombre);
    }
  }, [listaPropietarios, selectedPropietario]);

  const vehiculosDelPropietario = useMemo(() => {
    if (!selectedPropietario) return [];
    return vehiculos.filter(
      (v) => v.propietario?.trim().toLowerCase() === selectedPropietario.trim().toLowerCase()
    );
  }, [vehiculos, selectedPropietario]);

  useEffect(() => {
    if (vehiculosDelPropietario.length > 0) {
      setSelectedVehiculoIds(vehiculosDelPropietario.map((v) => v.id));
    } else {
      setSelectedVehiculoIds([]);
    }
  }, [vehiculosDelPropietario]);

  const toggleVehiculoSelection = (id: string) => {
    setSelectedVehiculoIds((prev) =>
      prev.includes(id) ? prev.filter((vId) => vId !== id) : [...prev, id]
    );
  };

  const selectAllVehiculos = () => {
    setSelectedVehiculoIds(vehiculosDelPropietario.map((v) => v.id));
  };

  const deselectAllVehiculos = () => {
    setSelectedVehiculoIds([]);
  };

  // Filtrado de liquidaciones Tab 1 (Choferes)
  const filteredLiquidaciones = useMemo(() => {
    return liquidaciones.filter((liq) => {
      const choferNombre = `${liq.chofer?.nombre || ''} ${liq.chofer?.apellido || ''}`.toLowerCase();
      const coordinadorNombre = `${liq.coordinador?.coordinador?.nombre || ''} ${liq.coordinador?.duenio?.nombre || ''} ${liq.coordinador?.email || ''}`.toLowerCase();

      const matchesSearch =
        choferNombre.includes(searchTerm.toLowerCase()) ||
        coordinadorNombre.includes(searchTerm.toLowerCase());

      const matchesTipo =
        filterTipo === 'all' ||
        (filterTipo === 'propietario' && liq.chofer?.esPropietario) ||
        (filterTipo === 'comisionista' && !liq.chofer?.esPropietario);

      const matchesRecepcion =
        filterRecepcion === 'all' ||
        (filterRecepcion === 'recibido' && Boolean(liq.dineroRecibido)) ||
        (filterRecepcion === 'pendiente' && !liq.dineroRecibido);

      return matchesSearch && matchesTipo && matchesRecepcion;
    });
  }, [liquidaciones, searchTerm, filterTipo, filterRecepcion]);

  // Totales Tab 1 (Choferes) — sin combustible en pantalla del dueño
  const totalRecaudadoChoferes = filteredLiquidaciones.reduce((sum, l) => sum + (l.totalRecaudado || 0), 0);
  const totalAgenciaChoferes = filteredLiquidaciones.reduce((sum, l) => sum + (l.comisionAgencia || 0), 0);
  const totalSaldoAFavorChoferes = filteredLiquidaciones.reduce((sum, l) => sum + (l.saldoAFavorChofer || 0), 0);
  const totalSaldoAFavorPendienteDuenio = filteredLiquidaciones
    .filter((l) => l.saldoAFavorChofer > 0 && l.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO')
    .reduce((sum, l) => sum + (l.saldoAFavorChofer || 0), 0);
  const getTransferenciasLiq = (liq: any) => {
    const trAgGuardada = Number(liq?.totalTransferenciaAgencia || 0);
    const trPrGuardada = Number(liq?.totalTransferenciaPropia || 0);
    if (trAgGuardada > 0 || trPrGuardada > 0) {
      return { agencia: trAgGuardada, propia: trPrGuardada };
    }
    const viajesLiq = Array.isArray(liq?.viajes) ? liq.viajes : [];
    if (viajesLiq.length > 0) {
      let agencia = 0;
      let propia = 0;
      for (const v of viajesLiq) {
        if (v.metodoPago === 'TRANSFERENCIA') {
          const p = Number(v.precio || 0);
          if (v.destinoTransferencia === 'CUENTA_PROPIA') {
            propia += p;
          } else {
            agencia += p;
          }
        }
      }
      if (agencia > 0 || propia > 0) {
        return { agencia, propia };
      }
    }
    return { agencia: Number(liq?.totalTransferenciaViajes || 0), propia: 0 };
  };

  const totalGananciaPropietarioChoferes = filteredLiquidaciones.reduce(
    (sum, l) => sum + (l.gananciaPropietario || 0),
    0
  );
  const totalTransferenciaAgenciaChoferes = filteredLiquidaciones.reduce(
    (sum, l) => sum + getTransferenciasLiq(l).agencia,
    0
  );
  const totalTransferenciaPropiaChoferes = filteredLiquidaciones.reduce(
    (sum, l) => sum + getTransferenciasLiq(l).propia,
    0
  );

  // Handlers de Cierre de Caja desde panel del Dueño
  const resetCierreForm = () => {
    setCierreCombustible('');
    setCierreObservaciones('');
    setCierreMetodoPago('EFECTIVO');
    setCierreMontoEfectivo('');
    setCierreMontoTransferencia('');
    setCierreQuienPaga('PAGADO_DUENIO');
  };

  const handleSelectChoferCierre = async (choferId: string) => {
    setCierreChoferId(choferId);
    setCierrePendingData(null);
    resetCierreForm();
    if (!choferId) return;
    try {
      setCierreLoadingPending(true);
      const res = await coordinadorDashboardService.getLiquidacionesPendientes(choferId);
      if (res.success && res.data) {
        setCierrePendingData(res.data);
      } else {
        toast.error(res.message || 'Error al obtener viajes pendientes');
      }
    } catch {
      toast.error('Error al obtener viajes pendientes');
    } finally {
      setCierreLoadingPending(false);
    }
  };

  const cierreCalculos = useMemo(() => {
    if (!cierrePendingData) {
      return {
        totalRecaudado: 0,
        totalEfectivo: 0,
        totalTransferencia: 0,
        totalTransferenciaAgencia: 0,
        totalTransferenciaPropia: 0,
        totalCuentaCorriente: 0,
        comisionChofer: 0,
        comisionAgencia: 0,
        comisionAgencia20: 0,
        comisionAgencia15: 0,
        gananciaPropietario: 0,
        saldoNeto: 0,
        montoARendirChofer: 0,
        saldoAFavorChofer: 0,
      };
    }
    const { chofer, resumen } = cierrePendingData;
    const totalRecaudado = resumen.totalRecaudado || 0;
    const totalEfectivo = resumen.totalEfectivo ?? 0;
    const totalTransferencia = resumen.totalTransferencia ?? 0;
    const totalTransferenciaAgencia = resumen.totalTransferenciaAgencia ?? totalTransferencia;
    const totalTransferenciaPropia = resumen.totalTransferenciaPropia ?? 0;
    const totalCuentaCorriente = resumen.totalCuentaCorriente ?? 0;
    const comisionChofer = resumen.comisionChofer || 0;
    const comisionAgencia = resumen.comisionAgencia || 0;
    const comisionAgencia20 = resumen.comisionAgencia20 ?? 0;
    const comisionAgencia15 = resumen.comisionAgencia15 ?? 0;
    const combustibleVal = chofer.esPropietario ? 0 : Math.max(0, parseFloat(cierreCombustible) || 0);
    const gananciaPropietario = chofer.esPropietario
      ? 0
      : Math.max(0, (resumen.gananciaPropietario || 0) - combustibleVal);
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
      comisionChofer,
      comisionAgencia,
      comisionAgencia20,
      comisionAgencia15,
      gananciaPropietario,
      saldoNeto,
      montoARendirChofer,
      saldoAFavorChofer,
    };
  }, [cierrePendingData, cierreCombustible]);

  const cierreMontoOperacion =
    cierreCalculos.montoARendirChofer > 0
      ? cierreCalculos.montoARendirChofer
      : cierreCalculos.saldoAFavorChofer > 0 && cierreQuienPaga === 'PAGADO_DUENIO'
      ? cierreCalculos.saldoAFavorChofer
      : 0;

  const handleSubmitCierreDuenio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cierreChoferId || !cierrePendingData || cierreSubmitting) return;
    if (cierrePendingData.viajes.length === 0) {
      toast.error('No hay viajes completados pendientes de liquidación para este chofer.');
      return;
    }

    const necesitaMedio =
      cierreCalculos.montoARendirChofer > 0 ||
      (cierreCalculos.saldoAFavorChofer > 0 && cierreQuienPaga === 'PAGADO_DUENIO');
    let montoEfec = 0;
    let montoTransf = 0;
    if (necesitaMedio) {
      if (cierreMetodoPago === 'EFECTIVO') {
        montoEfec = cierreMontoOperacion;
      } else if (cierreMetodoPago === 'TRANSFERENCIA') {
        montoTransf = cierreMontoOperacion;
      } else {
        montoEfec = parseFloat(cierreMontoEfectivo) || 0;
        montoTransf = parseFloat(cierreMontoTransferencia) || 0;
        if (Math.abs(montoEfec + montoTransf - cierreMontoOperacion) > 1) {
          toast.error(`Efectivo + Transferencia debe sumar $${cierreMontoOperacion.toLocaleString('es-AR')}`);
          return;
        }
      }
    }

    if (
      !confirm(
        `¿Confirmás el cierre de caja de ${cierrePendingData.chofer.nombre} ${cierrePendingData.chofer.apellido}?\nRecaudado: $${cierreCalculos.totalRecaudado.toLocaleString('es-AR')} • Comisión Agencia: $${cierreCalculos.comisionAgencia.toLocaleString('es-AR')}`
      )
    ) {
      return;
    }

    try {
      setCierreSubmitting(true);
      const payload: any = {
        choferId: cierreChoferId,
        combustible: cierrePendingData.chofer.esPropietario ? 0 : parseFloat(cierreCombustible) || 0,
        observaciones: cierreObservaciones.trim(),
      };
      if (cierreCalculos.montoARendirChofer > 0) {
        payload.metodoPagoChofer = cierreMetodoPago;
        payload.montoEfectivo = montoEfec;
        payload.montoTransferencia = montoTransf;
      } else if (cierreCalculos.saldoAFavorChofer > 0) {
        payload.quienPagaSaldoAFavor = cierreQuienPaga;
        if (cierreQuienPaga === 'PAGADO_DUENIO') {
          payload.metodoPagoChofer = cierreMetodoPago;
          payload.montoEfectivo = montoEfec;
          payload.montoTransferencia = montoTransf;
        }
      }

      const res = await coordinadorDashboardService.crearLiquidacion(payload);
      if (res.success) {
        toast.success('¡Cierre de caja registrado correctamente!');
        setCierreChoferId('');
        setCierrePendingData(null);
        resetCierreForm();
        await loadData();
        setActiveTab('choferes');
      } else {
        toast.error(res.message || 'Error al registrar cierre de caja');
      }
    } catch {
      toast.error('Error al registrar cierre de caja');
    } finally {
      setCierreSubmitting(false);
    }
  };

  // Filtrado de liquidaciones para Tab 2 (Propietarios de Autos)
  const liquidacionesPropietario = useMemo(() => {
    if (selectedVehiculoIds.length === 0) return [];

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return liquidaciones.filter((liq) => {
      const liqVehiculoId = liq.chofer?.vehiculo?.id;
      const tieneViajeDeVehiculo = liq.viajes?.some((v: any) =>
        selectedVehiculoIds.includes(v.vehiculo?.id)
      );

      const perteneceAlAuto =
        (liqVehiculoId && selectedVehiculoIds.includes(liqVehiculoId)) || tieneViajeDeVehiculo;

      if (!perteneceAlAuto) return false;

      const fechaLiq = new Date(liq.fecha);
      if (periodoPropietario === 'hoy') return fechaLiq >= startOfDay;
      if (periodoPropietario === 'semana') return fechaLiq >= startOfWeek;
      if (periodoPropietario === 'mes') return fechaLiq >= startOfMonth;
      return true;
    });
  }, [liquidaciones, selectedVehiculoIds, periodoPropietario]);

  // Cálculos financieros de la liquidación al Propietario usando los montos reales (15%/20% agencia, 30% chofer, 55%/50% propietario)
  const propFinanzas = useMemo(() => {
    const totalBruto = liquidacionesPropietario.reduce((sum, l) => sum + (l.totalRecaudado || 0), 0);
    const comisionAgencia = liquidacionesPropietario.reduce((sum, l) => sum + (l.comisionAgencia || 0), 0);
    const pagoChofer = liquidacionesPropietario.reduce((sum, l) => sum + (l.comisionChofer || 0), 0);
    const totalNetoPropietario = liquidacionesPropietario.reduce(
      (sum, l) => sum + (l.gananciaPropietario || 0),
      0
    );

    return {
      totalBruto,
      comisionAgencia,
      pagoChofer,
      totalNetoPropietario: Math.max(0, totalNetoPropietario)
    };
  }, [liquidacionesPropietario]);

  const handlePrint = () => {
    window.print();
  };

  // Semáforo financiero de cada liquidación:
  // ROJO = El dueño le debe pagar al chofer (ej. viajes Cta. Cte. no pagados por coordinador)
  // ÁMBAR = El chofer le debe entregar dinero al dueño/agencia (pendiente de cobro)
  // VERDE = OK / Saldado (ya recibido, pagado por coordinador o saldo en $0)
  const getEstadoFinancieroLiq = (liq: any) => {
    const saldoAFavor = Number(liq.saldoAFavorChofer || 0);
    const saldoNeto = Number(liq.saldoNeto || 0);
    const recibido = Boolean(liq.dineroRecibido);

    if (saldoAFavor > 0 && liq.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO' && !recibido) {
      return {
        tipo: 'PAGAR_CHOFER' as const,
        label: 'DEBE PAGAR AL CHOFER',
        sublabel: 'Cta. Cte. / Transf. no abonado por coord.',
        rowClass: 'bg-red-50/80 hover:bg-red-100/70 border-l-4 border-l-red-600',
        cardClass: 'bg-red-50/70 border-l-4 border-l-red-600',
        badgeClass: 'bg-red-100 text-red-800 border-red-300',
        pdfFill: [254, 226, 226] as [number, number, number],
        pdfText: [185, 28, 28] as [number, number, number],
      };
    }

    if (saldoNeto > 0 && !recibido) {
      return {
        tipo: 'COBRAR_CHOFER' as const,
        label: 'CHOFER DEBE AL DUEÑO',
        sublabel: 'Pendiente de cobro / entrega',
        rowClass: 'bg-amber-50/70 hover:bg-amber-100/60 border-l-4 border-l-amber-500',
        cardClass: 'bg-amber-50/60 border-l-4 border-l-amber-500',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        pdfFill: [254, 243, 199] as [number, number, number],
        pdfText: [180, 83, 9] as [number, number, number],
      };
    }

    return {
      tipo: 'OK' as const,
      label: 'OK / SALDADO',
      sublabel:
        saldoAFavor > 0 && liq.quienPagaSaldoAFavor === 'COORDINADOR'
          ? 'Pagó Coordinador'
          : saldoAFavor > 0 && (liq.quienPagaSaldoAFavor === 'PAGADO_DUENIO' || recibido)
          ? 'Pagado por Dueño'
          : recibido
          ? getMetodoEntregaLabel(liq.metodoEntregaDuenio)
          : 'Balance en $0',
      rowClass: 'bg-emerald-50/35 hover:bg-emerald-50/70 border-l-4 border-l-emerald-500',
      cardClass: 'bg-emerald-50/35 border-l-4 border-l-emerald-500',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      pdfFill: [209, 250, 229] as [number, number, number],
      pdfText: [4, 120, 87] as [number, number, number],
    };
  };

  const getTitularViaje = (v: any): string => {
    if (v?.artEmpresa?.nombre) return `ART: ${v.artEmpresa.nombre}`;
    if (v?.cliente) {
      const full = `${v.cliente.nombre || ''} ${v.cliente.apellido || ''}`.trim();
      if (full) return full;
    }
    if (v?.clienteNombre) return v.clienteNombre;
    return '—';
  };

  const getMedioPagoViajeInfo = (v: any) => {
    if (v?.metodoPago === 'CUENTA_CORRIENTE') {
      return {
        label: 'Cuenta Corriente',
        short: 'Cta. Cte.',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
      };
    }
    if (v?.metodoPago === 'TRANSFERENCIA') {
      if (v?.destinoTransferencia === 'CUENTA_PROPIA') {
        return {
          label: 'Transf. Cuenta Propia',
          short: 'Tr. Propia',
          badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        };
      }
      return {
        label: 'Transf. Cuenta Agencia',
        short: 'Tr. Agencia',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
      };
    }
    return {
      label: 'Efectivo',
      short: 'Efectivo',
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    };
  };

  // Generación de PDF directo con jsPDF + autoTable (con semáforo de colores y detalle completo de viajes)
  const generarPdfLiquidaciones = async (lista: any[], tituloArchivo: string) => {
    if (lista.length === 0) {
      toast.error('No hay cierres para exportar.');
      return;
    }

    try {
      setGenerandoPdf(true);
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const fechaHoy = new Date().toLocaleDateString('es-AR');
      const fmt = (n: number) => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

      // Encabezado
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('REMISES BRUNO — INFORME DE LIQUIDACIONES Y VIAJES', 14, 15);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const cantPagarChofer = lista.filter((l) => getEstadoFinancieroLiq(l).tipo === 'PAGAR_CHOFER').length;
      const cantCobrarChofer = lista.filter((l) => getEstadoFinancieroLiq(l).tipo === 'COBRAR_CHOFER').length;
      const cantOk = lista.filter((l) => getEstadoFinancieroLiq(l).tipo === 'OK').length;

      doc.text(
        `Fecha de emisión: ${fechaHoy}  |  Cierres: ${lista.length}  |  ROJO (Pagar a chofer): ${cantPagarChofer}  |  NARANJA (Chofer debe): ${cantCobrarChofer}  |  VERDE (OK/Saldado): ${cantOk}`,
        14,
        21
      );

      // Totales ejecutivos
      const totRec = lista.reduce((s, l) => s + (l.totalRecaudado || 0), 0);
      const totAgencia = lista.reduce((s, l) => s + (l.comisionAgencia || 0), 0);
      const totViajesEfec = lista.reduce((s, l) => s + (l.totalEfectivoViajes || 0), 0);
      const totViajesTrAg = lista.reduce((s, l) => s + getTransferenciasLiq(l).agencia, 0);
      const totViajesTrProp = lista.reduce((s, l) => s + getTransferenciasLiq(l).propia, 0);
      const totViajesCC = lista.reduce((s, l) => s + (l.totalCuentaCorrienteViajes || 0), 0);
      const totPagarChofer = lista
        .filter((l) => getEstadoFinancieroLiq(l).tipo === 'PAGAR_CHOFER')
        .reduce((s, l) => s + (l.saldoAFavorChofer || 0), 0);
      const totCobrarChofer = lista
        .filter((l) => getEstadoFinancieroLiq(l).tipo === 'COBRAR_CHOFER')
        .reduce((s, l) => s + (l.saldoNeto || 0), 0);

      autoTable(doc, {
        startY: 25,
        head: [[
          'Total Bruto',
          'Comisión Agencia',
          'Efectivo',
          'Transf. Agencia',
          'Transf. Propia',
          'Cta. Cte.',
          'A Pagar Choferes',
          'A Cobrar Choferes'
        ]],
        body: [[
          fmt(totRec),
          fmt(totAgencia),
          fmt(totViajesEfec),
          fmt(totViajesTrAg),
          fmt(totViajesTrProp),
          fmt(totViajesCC),
          fmt(totPagarChofer),
          fmt(totCobrarChofer)
        ]],
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], fontSize: 7.5, halign: 'center' },
        bodyStyles: { fontSize: 8, fontStyle: 'bold', halign: 'right' },
        didParseCell: (hookData: any) => {
          if (hookData.section === 'body') {
            if (hookData.column.index === 6 && totPagarChofer > 0) {
              hookData.cell.styles.fillColor = [254, 226, 226];
              hookData.cell.styles.textColor = [185, 28, 28];
            } else if (hookData.column.index === 7 && totCobrarChofer > 0) {
              hookData.cell.styles.fillColor = [254, 243, 199];
              hookData.cell.styles.textColor = [180, 83, 9];
            } else if (hookData.column.index === 3) {
              hookData.cell.styles.fillColor = [219, 234, 254];
              hookData.cell.styles.textColor = [29, 78, 216];
            }
          }
        }
      });

      const formatPagoPdf = (liq: any) => {
        if ((liq.saldoAFavorChofer || 0) > 0) {
          const estaPagado =
            liq.quienPagaSaldoAFavor === 'COORDINADOR' ||
            liq.quienPagaSaldoAFavor === 'PAGADO_DUENIO' ||
            Boolean(liq.dineroRecibido);
          const estado =
            liq.quienPagaSaldoAFavor === 'COORDINADOR'
              ? 'Pagó Coord.'
              : liq.quienPagaSaldoAFavor === 'PAGADO_DUENIO' || liq.dineroRecibido
              ? 'Pagó Dueño'
              : 'Debe pagar Agencia';
          return `${estaPagado ? 'Pagado a chofer' : 'Pagar a chofer'} ${fmt(liq.saldoAFavorChofer)} (${estado})`;
        }
        if (liq.metodoPagoChofer === 'AMBOS') {
          return `Ambos (Ef: ${fmt(liq.montoEfectivo)} / Tr: ${fmt(liq.montoTransferencia)})`;
        }
        if (liq.metodoPagoChofer === 'TRANSFERENCIA') {
          return `Transf. ${fmt(liq.montoTransferencia || liq.saldoNeto || 0)}`;
        }
        if (liq.metodoPagoChofer === 'EFECTIVO') {
          return `Efectivo ${fmt(liq.montoEfectivo || liq.saldoNeto || 0)}`;
        }
        return 'Saldo $0';
      };

      const estadosPorFila = lista.map((liq) => getEstadoFinancieroLiq(liq));

      const rows = lista.map((liq, idx) => {
        const operador =
          liq.coordinador?.coordinador?.nombre ||
          liq.coordinador?.duenio?.nombre ||
          liq.coordinador?.email ||
          'N/A';
        const fechaStr = `${new Date(liq.fecha).toLocaleDateString('es-AR')} ${new Date(liq.fecha).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit'
        })}`;
        const { agencia: trAg, propia: trProp } = getTransferenciasLiq(liq);
        const viajesDesglose = `Ef: ${fmt(liq.totalEfectivoViajes || 0)} | TrAg: ${fmt(trAg)} | TrPr: ${fmt(trProp)} | CC: ${fmt(liq.totalCuentaCorrienteViajes || 0)}`;
        const est = estadosPorFila[idx];

        return [
          fechaStr,
          `${liq.chofer?.nombre || ''} ${liq.chofer?.apellido || ''}`.trim(),
          operador,
          fmt(liq.totalRecaudado),
          fmt(liq.comisionAgencia),
          viajesDesglose,
          formatPagoPdf(liq),
          `${est.label}\n(${est.sublabel})`
        ];
      });

      const finalY = (doc as any).lastAutoTable?.finalY || 44;
      autoTable(doc, {
        startY: finalY + 5,
        head: [[
          'Fecha / Hora',
          'Chofer',
          'Operador',
          'Recaudado',
          'Agencia',
          'Viajes (Ef / TrAg / TrPr / CC)',
          'Rendición / Saldo a Favor',
          'Estado Financiero'
        ]],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7.5 },
        bodyStyles: { fontSize: 7 },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' },
          7: { halign: 'center', fontStyle: 'bold' }
        },
        didParseCell: (hookData: any) => {
          if (hookData.section === 'body') {
            const est = estadosPorFila[hookData.row.index];
            if (est && (hookData.column.index === 7 || hookData.column.index === 6)) {
              hookData.cell.styles.fillColor = est.pdfFill;
              hookData.cell.styles.textColor = est.pdfText;
            }
          }
        }
      });

      // Sección 2: Control específico de Transferencias a Cuenta de la Agencia (para conciliar Banco / MP)
      const viajesTransfAgenciaRows: any[][] = [];
      let totalTransfAgenciaDetalle = 0;

      // Sección 3: Detalle completo de todos los viajes incluidos en los cierres (con Titular de Cuenta Corriente)
      const todosLosViajesRows: any[][] = [];
      const tipoFilaViaje: Array<'CC' | 'TR_AG' | 'TR_PR' | 'EF'> = [];

      for (const liq of lista) {
        const choferLabel = `${liq.chofer?.nombre || ''} ${liq.chofer?.apellido || ''}`.trim();
        const viajesLiq = Array.isArray(liq.viajes) ? liq.viajes : [];
        for (const v of viajesLiq) {
          const fStr = `${new Date(v.fecha).toLocaleDateString('es-AR')} ${new Date(v.fecha).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit'
          })}`;
          const medio = getMedioPagoViajeInfo(v);
          const titular = getTitularViaje(v);
          const importe = Number(v.precio || 0);

          todosLosViajesRows.push([
            fStr,
            choferLabel,
            `${v.origen || ''} → ${v.destino || ''}`,
            medio.label,
            titular,
            `${Number(v.distanciaKmConPasajero || 0).toFixed(1)} km`,
            fmt(importe)
          ]);

          if (v.metodoPago === 'CUENTA_CORRIENTE') {
            tipoFilaViaje.push('CC');
          } else if (v.metodoPago === 'TRANSFERENCIA' && v.destinoTransferencia === 'CUENTA_PROPIA') {
            tipoFilaViaje.push('TR_PR');
          } else if (v.metodoPago === 'TRANSFERENCIA') {
            tipoFilaViaje.push('TR_AG');
            totalTransfAgenciaDetalle += importe;
            viajesTransfAgenciaRows.push([
              fStr,
              choferLabel,
              titular,
              `${v.origen || ''} → ${v.destino || ''}`,
              fmt(importe)
            ]);
          } else {
            tipoFilaViaje.push('EF');
          }
        }
      }

      if (viajesTransfAgenciaRows.length > 0) {
        const afterResumenY = (doc as any).lastAutoTable?.finalY || 90;
        const startTransfY = afterResumenY + 10 > 175 ? 20 : afterResumenY + 10;
        if (startTransfY === 20) {
          doc.addPage();
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(29, 78, 216);
        doc.text(
          `TRANSFERENCIAS A CUENTA DE LA AGENCIA (${viajesTransfAgenciaRows.length} viajes — Total a verificar en cuenta: ${fmt(totalTransfAgenciaDetalle)})`,
          14,
          startTransfY
        );

        autoTable(doc, {
          startY: startTransfY + 4,
          head: [[
            'Fecha / Hora',
            'Chofer',
            'Pasajero / Cliente',
            'Recorrido (Origen → Destino)',
            'Importe Acreditado'
          ]],
          body: [
            ...viajesTransfAgenciaRows,
            ['', '', '', 'TOTAL EN CUENTA AGENCIA', fmt(totalTransfAgenciaDetalle)]
          ],
          theme: 'grid',
          headStyles: { fillColor: [29, 78, 216], fontSize: 7.5 },
          bodyStyles: { fontSize: 7.5 },
          columnStyles: {
            4: { halign: 'right', fontStyle: 'bold' }
          },
          didParseCell: (hookData: any) => {
            if (hookData.section === 'body' && hookData.row.index === viajesTransfAgenciaRows.length) {
              hookData.cell.styles.fillColor = [219, 234, 254];
              hookData.cell.styles.textColor = [30, 64, 175];
              hookData.cell.styles.fontStyle = 'bold';
            }
          }
        });
      }

      if (todosLosViajesRows.length > 0) {
        const afterPrevY = (doc as any).lastAutoTable?.finalY || 90;
        const startDetalleY = afterPrevY + 10 > 175 ? 20 : afterPrevY + 10;
        if (startDetalleY === 20) {
          doc.addPage();
        }
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`DETALLE COMPLETO DE TODOS LOS VIAJES (${todosLosViajesRows.length} viajes)`, 14, startDetalleY);

        autoTable(doc, {
          startY: startDetalleY + 4,
          head: [[
            'Fecha / Hora',
            'Chofer',
            'Recorrido (Origen → Destino)',
            'Medio de Pago',
            'Titular Cta. Cte. / Cliente',
            'Km',
            'Importe'
          ]],
          body: todosLosViajesRows,
          theme: 'striped',
          headStyles: { fillColor: [30, 41, 59], fontSize: 7.5 },
          bodyStyles: { fontSize: 7 },
          columnStyles: {
            5: { halign: 'right' },
            6: { halign: 'right', fontStyle: 'bold' }
          },
          didParseCell: (hookData: any) => {
            if (hookData.section === 'body') {
              const tipo = tipoFilaViaje[hookData.row.index];
              if (tipo === 'CC') {
                hookData.cell.styles.fillColor = [243, 232, 255];
                if (hookData.column.index === 3 || hookData.column.index === 4) {
                  hookData.cell.styles.textColor = [107, 33, 168];
                  hookData.cell.styles.fontStyle = 'bold';
                }
              } else if (tipo === 'TR_AG') {
                hookData.cell.styles.fillColor = [219, 234, 254];
                if (hookData.column.index === 3 || hookData.column.index === 6) {
                  hookData.cell.styles.textColor = [29, 78, 216];
                  hookData.cell.styles.fontStyle = 'bold';
                }
              } else if (tipo === 'TR_PR') {
                hookData.cell.styles.fillColor = [238, 242, 255];
                if (hookData.column.index === 3) {
                  hookData.cell.styles.textColor = [67, 56, 202];
                  hookData.cell.styles.fontStyle = 'bold';
                }
              }
            }
          }
        });
      }

      doc.save(tituloArchivo);
      toast.success('PDF descargado correctamente');
    } catch (error) {
      console.error('Error generando PDF:', error);
      toast.error('Error al generar el PDF');
    } finally {
      setGenerandoPdf(false);
    }
  };

  const handleDescargarPdfCierres = async () => {
    const fileDate = new Date().toISOString().slice(0, 10);
    await generarPdfLiquidaciones(filteredLiquidaciones, `liquidaciones_detalle_${fileDate}.pdf`);
  };

  const handleDescargarPdfIndividual = async (liq: any) => {
    const slug = `${liq.chofer?.nombre || 'chofer'}_${liq.chofer?.apellido || ''}`.replace(/\s+/g, '_').toLowerCase();
    const fileDate = new Date(liq.fecha).toISOString().slice(0, 10);
    await generarPdfLiquidaciones([liq], `cierre_${slug}_${fileDate}.pdf`);
  };

  const openRecepcionModal = (liq: any) => {
    setRecepcionModalLiq(liq);
    setMetodoEntrega(liq.metodoEntregaDuenio || 'COORDINADOR');
    setNotasRecepcion(liq.notasRecepcion || '');
  };

  const handleConfirmarRecepcion = async (recibido: boolean) => {
    if (!recepcionModalLiq) return;
    try {
      setSubmittingRecepcion(true);
      const res = await coordinadorDashboardService.marcarRecepcionLiquidacion(recepcionModalLiq.id, {
        dineroRecibido: recibido,
        metodoEntregaDuenio: recibido ? metodoEntrega : undefined,
        notasRecepcion: recibido ? notasRecepcion : undefined
      });
      if (res.success) {
        toast.success(recibido ? 'Operación confirmada' : 'Liquidación marcada como pendiente');
        setLiquidaciones((prev) =>
          prev.map((item) =>
            item.id === recepcionModalLiq.id
              ? {
                  ...item,
                  dineroRecibido: recibido,
                  metodoEntregaDuenio: recibido ? metodoEntrega : null,
                  fechaRecepcionDuenio: recibido ? new Date().toISOString() : null,
                  notasRecepcion: recibido ? notasRecepcion.trim() || null : null,
                  quienPagaSaldoAFavor:
                    res.data?.quienPagaSaldoAFavor !== undefined
                      ? res.data.quienPagaSaldoAFavor
                      : item.quienPagaSaldoAFavor
                }
              : item
          )
        );
        setRecepcionModalLiq(null);
      } else {
        toast.error(res.message || 'No se pudo actualizar la recepción');
      }
    } catch (error) {
      toast.error('Error al actualizar recepción');
    } finally {
      setSubmittingRecepcion(false);
    }
  };

  const getMetodoEntregaLabel = (metodo?: string) => {
    switch (metodo) {
      case 'COORDINADOR':
        return 'Por Coordinador';
      case 'CHOFER_MANO':
        return 'Chofer en mano';
      case 'TRANSFERENCIA':
        return 'Transferencia';
      default:
        return 'Recibido';
    }
  };

  const renderPagoBadge = (liq: any) => {
    if ((liq.saldoAFavorChofer || 0) > 0) {
      const pendienteDePago = liq.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO' && !liq.dineroRecibido;
      const estadoLabel =
        liq.quienPagaSaldoAFavor === 'COORDINADOR'
          ? 'Pagó Coordinador'
          : liq.quienPagaSaldoAFavor === 'PAGADO_DUENIO' || liq.dineroRecibido
          ? 'Pagado por Dueño'
          : 'Debe pagar Agencia (Dueño)';
      const badgeColor = pendienteDePago
        ? 'bg-red-100 text-red-800 border-red-300'
        : 'bg-emerald-50 text-emerald-700 border-emerald-200';
      return (
        <div className="flex flex-col gap-0.5">
          <span className={`inline-flex w-fit px-2 py-0.5 rounded-md border text-[10px] font-bold ${badgeColor}`}>
            {pendienteDePago ? 'Pagar a chofer:' : 'Pagado a chofer:'} ${liq.saldoAFavorChofer.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
          <span className={`text-[10px] font-medium ${pendienteDePago ? 'text-red-700 font-bold' : 'text-slate-500'}`}>
            {estadoLabel}
          </span>
        </div>
      );
    }

    if (liq.metodoPagoChofer === 'AMBOS') {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="inline-flex w-fit px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
            Ambos
          </span>
          <span className="text-[10px] text-slate-500">
            Ef: ${(liq.montoEfectivo || 0).toLocaleString('es-AR')} • Tr: ${(liq.montoTransferencia || 0).toLocaleString('es-AR')}
          </span>
        </div>
      );
    }

    if (liq.metodoPagoChofer === 'TRANSFERENCIA') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 text-[10px] font-bold">
          Transferencia ${(liq.montoTransferencia || liq.saldoNeto || 0).toLocaleString('es-AR')}
        </span>
      );
    }

    if (liq.metodoPagoChofer === 'EFECTIVO') {
      return (
        <span className="inline-flex px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
          Efectivo ${(liq.montoEfectivo || liq.saldoNeto || 0).toLocaleString('es-AR')}
        </span>
      );
    }

    return <span className="text-slate-400 text-[11px]">—</span>;
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      {/* Header General */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md">
              Módulo Financiero
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">Liquidaciones y Rendiciones</h2>
          <p className="text-sm text-slate-500">
            Control de cierres diarios de choferes y liquidaciones a propietarios de vehículos.
          </p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="btn btn-outline border-slate-200 hover:bg-slate-50 text-slate-700 flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-xl active:scale-95 transition-all"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Sincronizar
        </button>
      </div>

      {/* Selector de Pestañas */}
      <div className="bg-slate-200/70 p-1.5 rounded-2xl flex flex-wrap sm:flex-nowrap max-w-3xl mx-auto shadow-inner print:hidden gap-1">
        <button
          onClick={() => setActiveTab('choferes')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'choferes'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="w-4 h-4" />
          Rendiciones
        </button>
        <button
          onClick={() => setActiveTab('cierre')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'cierre'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-emerald-700 hover:bg-white/60'
          }`}
        >
          <Banknote className="w-4 h-4" />
          Hacer Cierre de Caja
        </button>
        <button
          onClick={() => setActiveTab('propietarios')}
          className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'propietarios'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Car className="w-4 h-4" />
          Propietarios
        </button>
      </div>

      {/* ========================================================= */}
      {/* PESTAÑA 1: HISTORIAL DE RENDICIÓN DE CHOFERES */}
      {/* ========================================================= */}
      {activeTab === 'choferes' && (
        <div className="space-y-6 animate-in fade-in duration-200 print:hidden">
          {/* Tarjetas Informativas Choferes (incluye Transferencias a Cuenta Agencia) */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Recaudado
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 block mt-1">
                ${totalRecaudadoChoferes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-400 mt-1 block">Bruto en viajes cerrados</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
                Comisión Agencia (15%/20%)
              </span>
              <span className="text-xl sm:text-2xl font-black text-emerald-700 block mt-1">
                ${totalAgenciaChoferes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-600 mt-1 block">20% local • 15% ≥20km</span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-blue-200 shadow-xs bg-blue-50/30">
              <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">
                🏦 Transf. Cuenta Agencia
              </span>
              <span className="text-xl sm:text-2xl font-black text-blue-800 block mt-1">
                ${totalTransferenciaAgenciaChoferes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-indigo-600 mt-1 block">
                Propia chofer: ${totalTransferenciaPropiaChoferes.toLocaleString('es-AR')}
              </span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-red-200 bg-red-50/30 shadow-xs">
              <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wider block">
                Pagar a Choferes
              </span>
              <span className="text-xl sm:text-2xl font-black text-red-700 block mt-1">
                ${totalSaldoAFavorPendienteDuenio.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-500 mt-1 block">
                Total histórico: ${totalSaldoAFavorChoferes.toLocaleString('es-AR')}
              </span>
            </div>

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider block">
                Ganancia Autos
              </span>
              <span className="text-xl sm:text-2xl font-black text-purple-800 block mt-1">
                ${totalGananciaPropietarioChoferes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-purple-600 mt-1 block">Remanente propietarios</span>
            </div>
          </div>

          {/* Buscador, Filtros y Botón PDF */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por chofer o coordinador..."
                  className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 focus:border-transparent text-xs sm:text-sm bg-white"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                value={filterTipo}
                onChange={(e) => setFilterTipo(e.target.value as any)}
                className="w-full sm:max-w-[200px] px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm bg-white cursor-pointer text-slate-700"
              >
                <option value="all">Todas las condiciones</option>
                <option value="propietario">Chofer Propietario (Auto Propio)</option>
                <option value="comisionista">Chofer con Auto Asignado</option>
              </select>
              <select
                value={filterRecepcion}
                onChange={(e) => setFilterRecepcion(e.target.value as any)}
                className="w-full sm:max-w-[190px] px-3 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary-500 text-xs sm:text-sm bg-white cursor-pointer text-slate-700"
              >
                <option value="all">Todos los cobros</option>
                <option value="pendiente">Pendiente de recibir</option>
                <option value="recibido">Dinero recibido</option>
              </select>
              <button
                type="button"
                onClick={handleDescargarPdfCierres}
                disabled={generandoPdf || filteredLiquidaciones.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs shadow-xs active:scale-95 transition-all shrink-0"
              >
                <Download className="w-4 h-4" />
                {generandoPdf ? 'Generando...' : 'Descargar PDF'}
              </button>
            </div>

            {/* Leyenda de semáforo de estados */}
            <div className="px-4 py-2.5 border-b border-slate-100 bg-white flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className="text-slate-500 uppercase tracking-wider text-[10px] mr-1">Semáforo:</span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 text-red-800 border border-red-300">
                <span className="w-2 h-2 rounded-full bg-red-600" />
                Debe pagar al chofer ({filteredLiquidaciones.filter((l) => getEstadoFinancieroLiq(l).tipo === 'PAGAR_CHOFER').length})
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Chofer debe al dueño ({filteredLiquidaciones.filter((l) => getEstadoFinancieroLiq(l).tipo === 'COBRAR_CHOFER').length})
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                <span className="w-2 h-2 rounded-full bg-emerald-600" />
                OK / Saldado ({filteredLiquidaciones.filter((l) => getEstadoFinancieroLiq(l).tipo === 'OK').length})
              </span>
            </div>

            {loading ? (
              <div className="text-center py-16">
                <div className="loading-spinner border-primary-500 mx-auto"></div>
                <p className="mt-4 text-slate-500 text-xs">Cargando rendiciones...</p>
              </div>
            ) : filteredLiquidaciones.length === 0 ? (
              <div className="text-center py-16">
                <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-base font-semibold text-slate-800 mb-1">Sin registros</h3>
                <p className="text-xs text-slate-500">No se encontraron liquidaciones para el filtro actual.</p>
              </div>
            ) : (
              <>
                {/* VISTA MÓVIL (CARDS) */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {filteredLiquidaciones.map((liq) => {
                    const creadorNombre =
                      liq.coordinador?.coordinador?.nombre ||
                      liq.coordinador?.duenio?.nombre ||
                      liq.coordinador?.email ||
                      'N/A';
                    return (
                      <div key={liq.id} className={`p-4 space-y-3 ${getEstadoFinancieroLiq(liq).cardClass}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">
                              {liq.chofer?.nombre} {liq.chofer?.apellido}
                            </h4>
                            <span
                              className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${getEstadoFinancieroLiq(liq).badgeClass}`}
                            >
                              {getEstadoFinancieroLiq(liq).label}
                            </span>
                            <p className="text-[11px] text-slate-400">
                              {new Date(liq.fecha).toLocaleDateString('es-AR')} •{' '}
                              {new Date(liq.fecha).toLocaleTimeString('es-AR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}{' '}
                              hs
                            </p>
                          </div>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                              liq.chofer?.esPropietario
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {liq.chofer?.esPropietario ? 'Auto Propio' : 'Auto Agencia'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 font-medium block">Recaudado</span>
                            <span className="text-sm font-black text-slate-900 block">
                              ${liq.totalRecaudado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-emerald-600 font-medium block">Agencia</span>
                            <span className="text-sm font-black text-emerald-700 block">
                              ${liq.comisionAgencia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-slate-200/50">
                            <span className="text-[10px] text-slate-400 block">Rendición / Pago</span>
                            <div className="mt-0.5">{renderPagoBadge(liq)}</div>
                          </div>
                          <div className="pt-1 border-t border-slate-200/50">
                            <span className="text-[10px] text-slate-400 block">Ganancia Auto</span>
                            <span className="font-semibold text-purple-700">
                              ${liq.gananciaPropietario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-slate-400">
                          <span>
                            Operador: <strong className="text-slate-600 font-medium">{creadorNombre}</strong>
                          </span>
                          {liq.observaciones && (
                            <span className="truncate max-w-[140px] italic">&quot;{liq.observaciones}&quot;</span>
                          )}
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                          {liq.dineroRecibido ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold">
                              <CheckCircle className="w-3.5 h-3.5" />
                              {liq.saldoAFavorChofer > 0 ? 'Pagado' : 'Recibido'} • {getMetodoEntregaLabel(liq.metodoEntregaDuenio)}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-bold">
                              <Clock className="w-3.5 h-3.5" />
                              {liq.saldoAFavorChofer > 0 && liq.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO'
                                ? 'Pendiente de pago'
                                : 'Pendiente de entrega'}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetalleViajesModalLiq(liq)}
                              className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 flex items-center gap-1"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Viajes ({liq.viajes?.length || 0})
                            </button>
                            <button
                              type="button"
                              onClick={() => openRecepcionModal(liq)}
                              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                                liq.dineroRecibido
                                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                                  : getEstadoFinancieroLiq(liq).tipo === 'PAGAR_CHOFER'
                                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-xs'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                              }`}
                            >
                              {liq.dineroRecibido
                                ? 'Editar'
                                : liq.saldoAFavorChofer > 0 && liq.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO'
                                ? 'Marcar Pagado'
                                : 'Marcar Recibido'}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* VISTA ESCRITORIO (TABLA — sin columna de Combustible) */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-xs">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-4 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">
                          Fecha / Hora
                        </th>
                        <th className="px-4 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">
                          Chofer
                        </th>
                        <th className="px-4 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">
                          Operador
                        </th>
                        <th className="px-4 py-3.5 text-right font-semibold text-slate-500 uppercase tracking-wider">
                          Recaudado
                        </th>
                        <th className="px-4 py-3.5 text-right font-semibold text-slate-500 uppercase tracking-wider">
                          Agencia
                        </th>
                        <th className="px-4 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">
                          Rendición / Pago
                        </th>
                        <th className="px-4 py-3.5 text-right font-semibold text-slate-500 uppercase tracking-wider">
                          Ganancia Auto
                        </th>
                        <th className="px-4 py-3.5 text-left font-semibold text-slate-500 uppercase tracking-wider">
                          Notas
                        </th>
                        <th className="px-4 py-3.5 text-center font-semibold text-slate-500 uppercase tracking-wider">
                          Control Dueño
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {filteredLiquidaciones.map((liq) => {
                        const creadorNombre =
                          liq.coordinador?.coordinador?.nombre ||
                          liq.coordinador?.duenio?.nombre ||
                          liq.coordinador?.email ||
                          'N/A';
                        const estFin = getEstadoFinancieroLiq(liq);
                        return (
                          <tr key={liq.id} className={`${estFin.rowClass} transition-colors text-slate-700`}>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="font-semibold text-slate-900 block">
                                {new Date(liq.fecha).toLocaleDateString('es-AR')}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                {new Date(liq.fecha).toLocaleTimeString('es-AR', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}{' '}
                                hs
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <div className="font-bold text-slate-900">
                                {liq.chofer?.nombre} {liq.chofer?.apellido}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span
                                  className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                    liq.chofer?.esPropietario
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : 'bg-blue-50 text-blue-700 border border-blue-200'
                                  }`}
                                >
                                  {liq.chofer?.esPropietario ? 'Auto Propio' : 'Auto Agencia'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setDetalleViajesModalLiq(liq)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 hover:bg-blue-100 text-blue-700 border border-slate-200 cursor-pointer"
                                  title="Ver listado completo de viajes"
                                >
                                  <Eye className="w-3 h-3" />
                                  {liq.viajes?.length || 0} viajes
                                </button>
                              </div>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="font-medium text-slate-800 block">{creadorNombre}</span>
                              <span className="text-[10px] text-slate-400">{liq.coordinador?.email}</span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              <span className="font-black text-slate-900 block">
                                ${liq.totalRecaudado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                {getTransferenciasLiq(liq).agencia > 0
                                  ? `TrAg: $${getTransferenciasLiq(liq).agencia.toLocaleString('es-AR')} `
                                  : ''}
                                {getTransferenciasLiq(liq).propia > 0
                                  ? `TrPr: $${getTransferenciasLiq(liq).propia.toLocaleString('es-AR')} `
                                  : ''}
                                {(liq.totalCuentaCorrienteViajes || 0) > 0
                                  ? `CC: $${liq.totalCuentaCorrienteViajes.toLocaleString('es-AR')}`
                                  : ''}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right font-bold text-emerald-700 bg-emerald-50/20">
                              ${liq.comisionAgencia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              {renderPagoBadge(liq)}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right font-bold text-purple-700">
                              ${liq.gananciaPropietario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-4 py-3.5 text-[11px] text-slate-500 max-w-[160px] truncate">
                              {liq.observaciones || <span className="text-slate-300 italic">-</span>}
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-center">
                              <div className="flex flex-col items-center gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-extrabold ${estFin.badgeClass}`}
                                >
                                  {estFin.label}
                                </span>
                                {liq.dineroRecibido ? (
                                  <div className="inline-flex items-center gap-1">
                                    <span
                                      title={liq.notasRecepcion || undefined}
                                      className="text-[10px] font-semibold text-emerald-700"
                                    >
                                      {getMetodoEntregaLabel(liq.metodoEntregaDuenio)}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => openRecepcionModal(liq)}
                                      title="Editar"
                                      className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                    >
                                      <Edit2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => openRecepcionModal(liq)}
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-white text-[10px] font-bold shadow-xs active:scale-95 transition-all ${
                                      estFin.tipo === 'PAGAR_CHOFER'
                                        ? 'bg-red-600 hover:bg-red-700'
                                        : estFin.tipo === 'COBRAR_CHOFER'
                                        ? 'bg-amber-600 hover:bg-amber-700'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                                  >
                                    <CheckCircle className="w-3 h-3" />
                                    {estFin.tipo === 'PAGAR_CHOFER' ? 'Marcar Pagado' : 'Marcar Recibido'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 2: LIQUIDACIÓN A PROPIETARIOS DE VEHÍCULOS */}
      {/* ========================================================= */}
      {activeTab === 'propietarios' && (
        <div className="space-y-6 animate-in fade-in duration-200 print:hidden">
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-100 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Car className="w-5 h-5 text-primary-600" />
                  Liquidación por Propietario de Flota
                </h3>
                <p className="text-xs text-slate-500">
                  Seleccioná al titular y marcá los vehículos que querés incluir para liquidar su ganancia (50% local / 55% larga distancia).
                </p>
              </div>

              <button
                onClick={() => setShowPdfModal(true)}
                disabled={liquidacionesPropietario.length === 0}
                className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-xs shadow-md shadow-primary-500/20 active:scale-95 transition-all shrink-0"
              >
                <Printer className="w-4 h-4" />
                Generar Liquidación en PDF
              </button>
            </div>

            {/* Selector de Propietario y Período */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Seleccionar Dueño / Propietario
                </label>
                {listaPropietarios.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No hay propietarios cargados en vehículos.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {listaPropietarios.map((prop) => (
                      <button
                        key={prop.nombre}
                        type="button"
                        onClick={() => setSelectedPropietario(prop.nombre)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 ${
                          selectedPropietario === prop.nombre
                            ? 'bg-primary-600 text-white border-primary-600 shadow-sm'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <span>{prop.nombre}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                            selectedPropietario === prop.nombre
                              ? 'bg-white/20 text-white'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {prop.cantidad} {prop.cantidad === 1 ? 'auto' : 'autos'}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. Período a Liquidar
                </label>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  {(['hoy', 'semana', 'mes', 'todos'] as const).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPeriodoPropietario(p)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                        periodoPropietario === p
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {p === 'hoy'
                        ? 'Hoy'
                        : p === 'semana'
                        ? 'Esta Semana'
                        : p === 'mes'
                        ? 'Este Mes'
                        : 'Historial'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Selector de Vehículos del Propietario */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  3. Vehículos a Incluir ({selectedVehiculoIds.length} de {vehiculosDelPropietario.length} seleccionados)
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllVehiculos}
                    className="text-[11px] font-bold text-primary-600 hover:text-primary-700"
                  >
                    Seleccionar todos
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={deselectAllVehiculos}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700"
                  >
                    Desmarcar
                  </button>
                </div>
              </div>

              {vehiculosDelPropietario.length === 0 ? (
                <div className="p-4 bg-slate-50 rounded-xl text-center text-xs text-slate-500">
                  El propietario seleccionado no tiene vehículos asociados.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {vehiculosDelPropietario.map((v) => {
                    const isSelected = selectedVehiculoIds.includes(v.id);
                    return (
                      <div
                        key={v.id}
                        onClick={() => toggleVehiculoSelection(v.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                          isSelected
                            ? 'bg-primary-50/50 border-primary-300 shadow-xs'
                            : 'bg-white border-slate-200 opacity-60 hover:opacity-100'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-primary-600 shrink-0" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400 shrink-0" />
                          )}
                          <div>
                            <span className="font-bold text-slate-900 text-xs block">{v.patente}</span>
                            <span className="text-[11px] text-slate-500 block">
                              {v.marca} {v.modelo} ({v.anio})
                            </span>
                          </div>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            v.estado === 'ACTIVO'
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {v.estado}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* TARJETAS DE LIQUIDACIÓN FINANCIERA (sin Combustible) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                Total Bruto (100%)
              </span>
              <span className="text-xl font-black text-slate-900 block mt-1">
                ${propFinanzas.totalBruto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-400 block mt-0.5">Recaudación flota</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider block">
                Remisería (15%/20%)
              </span>
              <span className="text-xl font-black text-emerald-700 block mt-1">
                ${propFinanzas.comisionAgencia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-600 block mt-0.5">Comisión de base</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[11px] font-semibold text-blue-700 uppercase tracking-wider block">
                Choferes (30%)
              </span>
              <span className="text-xl font-black text-blue-700 block mt-1">
                ${propFinanzas.pagoChofer.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-blue-600 block mt-0.5">Recaudación diaria</span>
            </div>

            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-4 rounded-2xl shadow-md border border-indigo-800">
              <span className="text-[11px] font-bold text-indigo-300 uppercase tracking-wider block">
                Neto Dueño (50%/55%)
              </span>
              <span className="text-2xl font-black text-white block mt-1">
                ${propFinanzas.totalNetoPropietario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-indigo-200 block mt-0.5">A pagar al propietario</span>
            </div>
          </div>

          {/* Listado de Liquidaciones de los autos seleccionados (sin Combustible) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <div>
                <h4 className="font-bold text-slate-900 text-sm">
                  Detalle de Rendiciones Asociadas ({liquidacionesPropietario.length})
                </h4>
                <p className="text-xs text-slate-500">
                  Viajes y jornadas computadas para los vehículos seleccionados.
                </p>
              </div>
            </div>

            {liquidacionesPropietario.length === 0 ? (
              <div className="text-center py-12">
                <Car className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">
                  No hay viajes registrados para estos vehículos en el período seleccionado.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50/80">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold text-slate-500 uppercase">Fecha</th>
                      <th className="px-5 py-3 text-left font-semibold text-slate-500 uppercase">Vehículo</th>
                      <th className="px-5 py-3 text-left font-semibold text-slate-500 uppercase">Chofer</th>
                      <th className="px-5 py-3 text-right font-semibold text-slate-500 uppercase">Bruto (100%)</th>
                      <th className="px-5 py-3 text-right font-semibold text-slate-500 uppercase">Agencia</th>
                      <th className="px-5 py-3 text-right font-semibold text-slate-500 uppercase">Chofer (30%)</th>
                      <th className="px-5 py-3 text-right font-semibold text-slate-500 uppercase">Neto Dueño</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {liquidacionesPropietario.map((liq) => {
                      const veh = liq.chofer?.vehiculo || liq.viajes?.[0]?.vehiculo;
                      const bruto = liq.totalRecaudado || 0;
                      const ag = liq.comisionAgencia || 0;
                      const ch = liq.comisionChofer || 0;
                      const neto = liq.gananciaPropietario || 0;

                      return (
                        <tr key={liq.id} className="hover:bg-slate-50/50 text-slate-700">
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className="font-semibold text-slate-900 block">
                              {new Date(liq.fecha).toLocaleDateString('es-AR')}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {new Date(liq.fecha).toLocaleTimeString('es-AR', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className="font-bold text-slate-900 block">{veh?.patente || 'S/D'}</span>
                            <span className="text-[10px] text-slate-400">
                              {veh?.marca} {veh?.modelo}
                            </span>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap">
                            <span className="font-medium text-slate-800 block">
                              {liq.chofer?.nombre} {liq.chofer?.apellido}
                            </span>
                            <span className="text-[10px] text-slate-400">#{liq.chofer?.numeroChofer}</span>
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-right font-bold text-slate-900">
                            ${bruto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-right text-emerald-700 font-semibold">
                            ${ag.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-right text-blue-700 font-semibold">
                            ${ch.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-5 py-3 whitespace-nowrap text-right font-black text-indigo-700 bg-indigo-50/30">
                            ${neto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL / VISTA OFICIAL MEMBRETADA PARA PROPIETARIOS */}
      {/* ========================================================= */}
      {showPdfModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 overflow-y-auto flex items-center justify-center p-2 sm:p-4 print:p-0 print:bg-white print:static">
          <div className="relative bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden print:border-none print:shadow-none print:max-w-none">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-primary-400" />
                <span className="text-sm font-bold">Vista Previa de Liquidación Oficial</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold shadow-xs active:scale-95 transition-all"
                >
                  <Printer className="w-4 h-4" />
                  Imprimir / Descargar PDF
                </button>
                <button
                  onClick={() => setShowPdfModal(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-8 sm:p-12 space-y-8 bg-white text-slate-900 print:p-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-6 border-b-2 border-slate-900 gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight">
                    Remises Bruno
                  </h1>
                  <p className="text-xs text-slate-600 font-semibold mt-0.5">
                    Servicio Integral de Traslados de Pasajeros y Flota Comercial
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Base Central • WhatsApp / Tel: 24 hs • Argentina
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="inline-block px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">
                    Liquidación a Propietario
                  </span>
                  <p className="text-xs text-slate-500">
                    Fecha de Emisión: <strong>{new Date().toLocaleDateString('es-AR')}</strong>
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Período:{' '}
                    <strong className="capitalize text-slate-700">
                      {periodoPropietario === 'hoy'
                        ? 'Día de Hoy'
                        : periodoPropietario === 'semana'
                        ? 'Semana en Curso'
                        : periodoPropietario === 'mes'
                        ? 'Mes en Curso'
                        : 'Histórico Completo'}
                    </strong>
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Titular / Propietario
                  </span>
                  <span className="text-base font-black text-slate-900 block mt-0.5">
                    {selectedPropietario}
                  </span>
                  <span className="text-[11px] text-slate-600 mt-0.5 block">
                    Condición: Dueño de Vehículo / Inversor de Flota
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                    Vehículos Computados ({selectedVehiculoIds.length})
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {vehiculosDelPropietario
                      .filter((v) => selectedVehiculoIds.includes(v.id))
                      .map((v) => (
                        <span
                          key={v.id}
                          className="px-2 py-0.5 bg-white border border-slate-300 rounded font-bold text-slate-800 text-[11px]"
                        >
                          {v.patente} ({v.marca} {v.modelo})
                        </span>
                      ))}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Esquema de Distribución y Liquidación
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center p-3 rounded-xl border border-slate-200 bg-white">
                  <div className="p-2 border-r border-slate-100">
                    <span className="text-[10px] text-slate-400 block font-semibold">Bruto Total</span>
                    <span className="text-sm font-bold text-slate-900 block mt-0.5">
                      ${propFinanzas.totalBruto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-slate-400 font-medium">100% Recaudado</span>
                  </div>
                  <div className="p-2 border-r border-slate-100">
                    <span className="text-[10px] text-emerald-700 block font-semibold">Comisión Agencia</span>
                    <span className="text-sm font-bold text-emerald-700 block mt-0.5">
                      -${propFinanzas.comisionAgencia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-emerald-600 font-medium">20% local / 15% ≥20km</span>
                  </div>
                  <div className="p-2">
                    <span className="text-[10px] text-blue-700 block font-semibold">Paga Choferes</span>
                    <span className="text-sm font-bold text-blue-700 block mt-0.5">
                      -${propFinanzas.pagoChofer.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-[9px] text-blue-600 font-medium">30% Honorarios</span>
                  </div>
                </div>

                <div className="mt-3 p-4 rounded-xl bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Total Neto a Percibir por el Propietario (50% / 55%)
                    </span>
                    <span className="text-xs text-slate-300">
                      Correspondiente a los {selectedVehiculoIds.length} vehículos seleccionados
                    </span>
                  </div>
                  <span className="text-2xl sm:text-3xl font-black text-emerald-400">
                    ${propFinanzas.totalNetoPropietario.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Detalle de Jornadas y Cierres Computados
                </h4>
                <table className="w-full text-left text-xs border border-slate-200 rounded-lg overflow-hidden">
                  <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold">
                    <tr>
                      <th className="p-2.5">Fecha</th>
                      <th className="p-2.5">Vehículo</th>
                      <th className="p-2.5">Chofer</th>
                      <th className="p-2.5 text-right">Bruto</th>
                      <th className="p-2.5 text-right">Agencia</th>
                      <th className="p-2.5 text-right">Chofer</th>
                      <th className="p-2.5 text-right">Neto Dueño</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[11px]">
                    {liquidacionesPropietario.map((liq) => {
                      const veh = liq.chofer?.vehiculo || liq.viajes?.[0]?.vehiculo;
                      const bruto = liq.totalRecaudado || 0;
                      const ag = liq.comisionAgencia || 0;
                      const ch = liq.comisionChofer || 0;
                      const neto = liq.gananciaPropietario || 0;

                      return (
                        <tr key={liq.id}>
                          <td className="p-2.5 whitespace-nowrap">
                            {new Date(liq.fecha).toLocaleDateString('es-AR')}
                          </td>
                          <td className="p-2.5 whitespace-nowrap font-bold">
                            {veh?.patente} <span className="font-normal text-slate-500">({veh?.modelo})</span>
                          </td>
                          <td className="p-2.5 whitespace-nowrap">
                            {liq.chofer?.nombre} {liq.chofer?.apellido}
                          </td>
                          <td className="p-2.5 text-right font-semibold">
                            ${bruto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-right text-slate-500">
                            ${ag.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-right text-slate-500">
                            ${ch.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="p-2.5 text-right font-bold text-slate-900">
                            ${neto.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs text-slate-600">
                <div className="border-t border-slate-400 pt-2">
                  <p className="font-bold text-slate-900">Firma del Propietario</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Aclaración / DNI</p>
                </div>
                <div className="border-t border-slate-400 pt-2">
                  <p className="font-bold text-slate-900">Remises Bruno</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Firma y Sello de Administración</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* PESTAÑA 3: REALIZAR CIERRE DE CAJA A UN CHOFER (DUEÑO) */}
      {/* ========================================================= */}
      {activeTab === 'cierre' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200 print:hidden">
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <User className="w-5 h-5 text-emerald-600" />
                Seleccionar Chofer
              </h3>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1.5">Chofer Activo</label>
                <select
                  value={cierreChoferId}
                  onChange={(e) => handleSelectChoferCierre(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 bg-white focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">-- Elegir un chofer --</option>
                  {choferesList.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.nombre} {ch.apellido} (#{ch.numeroChofer}) {ch.esFranquero ? '[Franquero] ' : ''}
                      {ch.esPropietario ? '[Propietario]' : '[Comisionista]'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {cierrePendingData && (
              <form
                onSubmit={handleSubmitCierreDuenio}
                className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4"
              >
                <h3 className="text-base font-bold text-slate-900">Parámetros del Cierre</h3>

                {!cierrePendingData.chofer.esPropietario && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Combustible / GNC ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={cierreCombustible}
                      onChange={(e) => setCierreCombustible(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-bold text-slate-800"
                    />
                  </div>
                )}

                {cierrePendingData.viajes.length > 0 && cierreCalculos.saldoAFavorChofer > 0 && (
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-amber-900">
                      <span>Saldo a favor del chofer</span>
                      <span>${cierreCalculos.saldoAFavorChofer.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCierreQuienPaga('PAGADO_DUENIO')}
                        className={`p-2 rounded-lg text-xs font-bold border ${
                          cierreQuienPaga === 'PAGADO_DUENIO'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-700 border-amber-200'
                        }`}
                      >
                        Pago ahora al chofer (Dueño)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCierreQuienPaga('PENDIENTE_DUENIO')}
                        className={`p-2 rounded-lg text-xs font-bold border ${
                          cierreQuienPaga === 'PENDIENTE_DUENIO'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-slate-700 border-amber-200'
                        }`}
                      >
                        Dejar pendiente de pago
                      </button>
                    </div>
                  </div>
                )}

                {cierrePendingData.viajes.length > 0 && cierreMontoOperacion > 0 && (
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-700">
                      {cierreCalculos.montoARendirChofer > 0 ? 'Medio de pago del chofer' : 'Medio de pago al chofer'}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['EFECTIVO', 'TRANSFERENCIA', 'AMBOS'] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setCierreMetodoPago(m);
                            if (m === 'AMBOS') {
                              const mitad = Math.round((cierreMontoOperacion / 2) * 100) / 100;
                              setCierreMontoEfectivo(String(mitad));
                              setCierreMontoTransferencia(String(Math.round((cierreMontoOperacion - mitad) * 100) / 100));
                            }
                          }}
                          className={`py-2 px-2 rounded-xl border text-xs font-bold ${
                            cierreMetodoPago === m
                              ? 'bg-emerald-50 border-emerald-600 text-emerald-800'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          {m === 'TRANSFERENCIA' ? 'Transf.' : m === 'EFECTIVO' ? 'Efectivo' : 'Ambos'}
                        </button>
                      ))}
                    </div>
                    {cierreMetodoPago === 'AMBOS' && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={cierreMontoEfectivo}
                          onChange={(e) => setCierreMontoEfectivo(e.target.value)}
                          placeholder="Efectivo ($)"
                          className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold"
                        />
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={cierreMontoTransferencia}
                          onChange={(e) => setCierreMontoTransferencia(e.target.value)}
                          placeholder="Transf. ($)"
                          className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-bold"
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Observaciones</label>
                  <textarea
                    rows={2}
                    value={cierreObservaciones}
                    onChange={(e) => setCierreObservaciones(e.target.value)}
                    placeholder="Notas del cierre..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs"
                  />
                </div>

                <button
                  type="submit"
                  disabled={cierreSubmitting || cierrePendingData.viajes.length === 0}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm disabled:opacity-50"
                >
                  {cierreSubmitting ? 'Registrando cierre...' : 'Confirmar Cierre de Caja'}
                </button>
              </form>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            {!cierreChoferId ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
                <Banknote className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="text-sm font-bold text-slate-700">Seleccioná un chofer a la izquierda</p>
                <p className="text-xs mt-1">
                  Podrás ver sus viajes completados pendientes y realizar el cierre de caja directamente desde tu panel de dueño.
                </p>
              </div>
            ) : cierreLoadingPending ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm text-slate-500">
                Cargando viajes pendientes...
              </div>
            ) : cierrePendingData ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      {cierrePendingData.chofer.nombre} {cierrePendingData.chofer.apellido} (#{cierrePendingData.chofer.numeroChofer})
                    </h3>
                    <p className="text-xs text-slate-500">
                      {cierrePendingData.viajes.length} viajes completados pendientes de liquidar
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700">
                    {cierrePendingData.chofer.esPropietario ? 'Propietario' : 'Comisionista (30%)'}
                  </span>
                </div>

                {cierrePendingData.viajes.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6 text-center">
                    Este chofer no tiene viajes completados pendientes de cierre.
                  </p>
                ) : (
                  <>
                    <div
                      className={`p-4 rounded-2xl border flex items-center justify-between ${
                        cierreCalculos.saldoAFavorChofer > 0
                          ? 'bg-amber-50 border-amber-200 text-amber-900'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      }`}
                    >
                      <div>
                        <span className="text-[11px] font-bold uppercase block opacity-80">
                          {cierreCalculos.saldoAFavorChofer > 0
                            ? 'Saldo a Favor del Chofer'
                            : 'Monto Neto a Entregar por el Chofer'}
                        </span>
                        <span className="text-xs opacity-75">
                          Efec (${cierreCalculos.totalEfectivo.toLocaleString('es-AR')})
                          {cierreCalculos.totalTransferenciaPropia > 0
                            ? ` + Transf. Propia ($${cierreCalculos.totalTransferenciaPropia.toLocaleString('es-AR')})`
                            : ''}{' '}
                          − Chofer (${cierreCalculos.comisionChofer.toLocaleString('es-AR')})
                        </span>
                      </div>
                      <span className="text-2xl font-black">
                        $
                        {(cierreCalculos.saldoAFavorChofer > 0
                          ? cierreCalculos.saldoAFavorChofer
                          : cierreCalculos.montoARendirChofer
                        ).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-slate-500 block font-semibold">Bruto</span>
                        <span className="text-lg font-black text-slate-900">${cierreCalculos.totalRecaudado.toLocaleString('es-AR')}</span>
                      </div>
                      <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100">
                        <span className="text-emerald-700 block font-semibold">Efectivo</span>
                        <span className="text-lg font-black text-emerald-800">${cierreCalculos.totalEfectivo.toLocaleString('es-AR')}</span>
                      </div>
                      <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                        <span className="text-blue-700 block font-semibold">🏦 Transf. Agencia</span>
                        <span className="text-lg font-black text-blue-800">${cierreCalculos.totalTransferenciaAgencia.toLocaleString('es-AR')}</span>
                      </div>
                      <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100">
                        <span className="text-indigo-700 block font-semibold">📱 Transf. Propia</span>
                        <span className="text-lg font-black text-indigo-800">${cierreCalculos.totalTransferenciaPropia.toLocaleString('es-AR')}</span>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-slate-100 rounded-2xl p-4 font-mono text-xs space-y-1.5">
                      <div className="flex justify-between"><span>Bruto</span><span className="font-bold">= ${cierreCalculos.totalRecaudado.toLocaleString('es-AR')}</span></div>
                      {!cierrePendingData.chofer.esPropietario && (
                        <div className="flex justify-between text-emerald-300"><span>30 % chofer</span><span>= ${cierreCalculos.comisionChofer.toLocaleString('es-AR')}</span></div>
                      )}
                      <div className="flex justify-between text-amber-300"><span>20 % agencia</span><span>= ${cierreCalculos.comisionAgencia20.toLocaleString('es-AR')}</span></div>
                      <div className="flex justify-between text-amber-300"><span>15 % agencia</span><span>= ${cierreCalculos.comisionAgencia15.toLocaleString('es-AR')}</span></div>
                      {!cierrePendingData.chofer.esPropietario && (
                        <div className="flex justify-between text-rose-300"><span>Combustible</span><span>= ${(parseFloat(cierreCombustible) || 0).toLocaleString('es-AR')}</span></div>
                      )}
                      <div className="border-t border-dashed border-slate-600 pt-2 mt-1 flex justify-between text-sm font-black text-emerald-400">
                        <span>{cierrePendingData.chofer.esPropietario ? 'Neto Chofer Propietario' : 'Auto'}</span>
                        <span>= ${(cierrePendingData.chofer.esPropietario ? cierreCalculos.comisionChofer : cierreCalculos.gananciaPropietario).toLocaleString('es-AR')}</span>
                      </div>
                    </div>

                    {/* Listado completo de viajes pendientes del chofer */}
                    <div className="border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                          Listado Completo de Viajes ({cierrePendingData.viajes.length})
                        </h4>
                        <span className="text-[11px] text-slate-500">Incluye titular de Cuenta Corriente</span>
                      </div>
                      <div className="overflow-x-auto max-h-[340px]">
                        <table className="min-w-full divide-y divide-slate-200 text-xs">
                          <thead className="bg-slate-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Fecha</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Recorrido</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Medio de Pago</th>
                              <th className="px-3 py-2 text-left font-semibold text-slate-500">Titular / Cta. Cte.</th>
                              <th className="px-3 py-2 text-right font-semibold text-slate-500">Km</th>
                              <th className="px-3 py-2 text-right font-semibold text-slate-500">Importe</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 bg-white">
                            {cierrePendingData.viajes.map((v: any) => {
                              const medio = getMedioPagoViajeInfo(v);
                              const titular = getTitularViaje(v);
                              return (
                                <tr key={v.id} className={v.metodoPago === 'CUENTA_CORRIENTE' ? 'bg-purple-50/50' : ''}>
                                  <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                                    {new Date(v.fecha).toLocaleDateString('es-AR')}{' '}
                                    {new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="px-3 py-2 text-slate-800 max-w-[220px] truncate" title={`${v.origen} → ${v.destino}`}>
                                    <span className="font-semibold">{v.origen}</span> → {v.destino}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${medio.badgeClass}`}>
                                      {medio.label}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap">
                                    <span className={v.metodoPago === 'CUENTA_CORRIENTE' ? 'font-bold text-purple-900' : 'text-slate-600'}>
                                      {titular}
                                    </span>
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-right text-slate-500">
                                    {Number(v.distanciaKmConPasajero || 0).toFixed(1)}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-right font-black text-slate-900">
                                    ${Number(v.precio || 0).toLocaleString('es-AR')}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* MODAL DE DETALLE COMPLETO DE VIAJES DE UNA LIQUIDACIÓN */}
      {detalleViajesModalLiq && (() => {
        const est = getEstadoFinancieroLiq(detalleViajesModalLiq);
        const viajesLista = Array.isArray(detalleViajesModalLiq.viajes) ? detalleViajesModalLiq.viajes : [];
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 print:hidden">
            <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3 bg-slate-50/70">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base sm:text-lg font-bold text-slate-900">
                      Viajes de {detalleViajesModalLiq.chofer?.nombre} {detalleViajesModalLiq.chofer?.apellido}
                    </h3>
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-extrabold ${est.badgeClass}`}>
                      {est.label}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Cierre del {new Date(detalleViajesModalLiq.fecha).toLocaleDateString('es-AR')} a las{' '}
                    {new Date(detalleViajesModalLiq.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs • {est.sublabel}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleDescargarPdfIndividual(detalleViajesModalLiq)}
                    disabled={generandoPdf}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF Cierre
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetalleViajesModalLiq(null)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-5 overflow-y-auto space-y-4">
                {/* Resumen rápido */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <span className="text-slate-500 block font-semibold">Bruto</span>
                    <span className="text-base font-black text-slate-900">${Number(detalleViajesModalLiq.totalRecaudado || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                    <span className="text-emerald-700 block font-semibold">Efectivo</span>
                    <span className="text-base font-black text-emerald-800">${Number(detalleViajesModalLiq.totalEfectivoViajes || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                    <span className="text-blue-700 block font-semibold">🏦 Tr. Agencia</span>
                    <span className="text-base font-black text-blue-800">${getTransferenciasLiq(detalleViajesModalLiq).agencia.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                    <span className="text-indigo-700 block font-semibold">📱 Tr. Propia</span>
                    <span className="text-base font-black text-indigo-800">${getTransferenciasLiq(detalleViajesModalLiq).propia.toLocaleString('es-AR')}</span>
                  </div>
                  <div className="p-3 rounded-xl bg-purple-50 border border-purple-200">
                    <span className="text-purple-700 block font-semibold">🏛️ Cta. Cte.</span>
                    <span className="text-base font-black text-purple-800">${Number(detalleViajesModalLiq.totalCuentaCorrienteViajes || 0).toLocaleString('es-AR')}</span>
                  </div>
                </div>

                {/* Tabla de viajes */}
                {viajesLista.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-8">No hay viajes asociados a esta liquidación.</p>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Fecha / Hora</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Origen → Destino</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Medio de Pago</th>
                          <th className="px-3 py-2.5 text-left font-semibold text-slate-500">Titular Cta. Cte. / Cliente</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500">Km</th>
                          <th className="px-3 py-2.5 text-right font-semibold text-slate-500">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {viajesLista.map((v: any) => {
                          const medio = getMedioPagoViajeInfo(v);
                          const titular = getTitularViaje(v);
                          return (
                            <tr key={v.id} className={v.metodoPago === 'CUENTA_CORRIENTE' ? 'bg-purple-50/50' : ''}>
                              <td className="px-3 py-2.5 whitespace-nowrap text-slate-500">
                                {new Date(v.fecha).toLocaleDateString('es-AR')}{' '}
                                {new Date(v.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="px-3 py-2.5 text-slate-800">
                                <span className="font-semibold">{v.origen}</span> → {v.destino}
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-0.5 rounded-md border text-[10px] font-bold ${medio.badgeClass}`}>
                                  {medio.label}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className={v.metodoPago === 'CUENTA_CORRIENTE' ? 'font-bold text-purple-900' : 'text-slate-600'}>
                                  {titular}
                                </span>
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right text-slate-500">
                                {Number(v.distanciaKmConPasajero || 0).toFixed(1)} km
                              </td>
                              <td className="px-3 py-2.5 whitespace-nowrap text-right font-black text-slate-900">
                                ${Number(v.precio || 0).toLocaleString('es-AR')}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MODAL PARA CONFIRMAR RECEPCIÓN DE DINERO / PAGO SALDO A FAVOR */}
      {recepcionModalLiq && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in print:hidden">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Control de Caja
                </span>
                <h3 className="text-lg font-bold text-slate-900 mt-1">
                  {recepcionModalLiq.saldoAFavorChofer > 0 && recepcionModalLiq.quienPagaSaldoAFavor !== 'COORDINADOR'
                    ? recepcionModalLiq.dineroRecibido
                      ? 'Editar Pago de Saldo a Favor'
                      : 'Confirmar Pago al Chofer'
                    : recepcionModalLiq.dineroRecibido
                    ? 'Editar Recepción de Dinero'
                    : 'Confirmar Dinero Recibido'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRecepcionModalLiq(null)}
                className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/70 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-slate-900 text-sm">
                    {recepcionModalLiq.chofer?.nombre} {recepcionModalLiq.chofer?.apellido}
                  </p>
                  <p className="text-slate-500 mt-0.5">
                    {new Date(recepcionModalLiq.fecha).toLocaleDateString('es-AR')} • Comisión Agencia: $
                    {recepcionModalLiq.comisionAgencia.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">
                    {recepcionModalLiq.saldoAFavorChofer > 0 ? 'Saldo a Favor' : 'Recaudado'}
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    $
                    {(recepcionModalLiq.saldoAFavorChofer > 0
                      ? recepcionModalLiq.saldoAFavorChofer
                      : recepcionModalLiq.totalRecaudado
                    ).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {recepcionModalLiq.saldoAFavorChofer > 0 && recepcionModalLiq.quienPagaSaldoAFavor !== 'COORDINADOR'
                    ? '¿Cómo le pagaste al chofer?'
                    : '¿Cómo recibiste el dinero?'}
                </label>

                <button
                  type="button"
                  onClick={() => setMetodoEntrega('COORDINADOR')}
                  className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                    metodoEntrega === 'COORDINADOR'
                      ? 'bg-emerald-50/70 border-emerald-600 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      metodoEntrega === 'COORDINADOR' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                      A través del Coordinador
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Gestionado por el coordinador de turno.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMetodoEntrega('CHOFER_MANO')}
                  className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                    metodoEntrega === 'CHOFER_MANO'
                      ? 'bg-emerald-50/70 border-emerald-600 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      metodoEntrega === 'CHOFER_MANO' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <Banknote className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                      En mano (Efectivo)
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Operación directa en efectivo con el chofer.
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setMetodoEntrega('TRANSFERENCIA')}
                  className={`w-full text-left p-3.5 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                    metodoEntrega === 'TRANSFERENCIA'
                      ? 'bg-emerald-50/70 border-emerald-600 shadow-xs'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      metodoEntrega === 'TRANSFERENCIA' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                      Transferencia
                    </span>
                    <span className="text-[11px] text-slate-500 block">
                      Transferencia bancaria o billetera virtual.
                    </span>
                  </div>
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nota / Comprobante (opcional)
                </label>
                <input
                  type="text"
                  value={notasRecepcion}
                  onChange={(e) => setNotasRecepcion(e.target.value)}
                  placeholder="Ej: Recibido en base, alias MercadoPago..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-2">
                {recepcionModalLiq.dineroRecibido && (
                  <button
                    type="button"
                    disabled={submittingRecepcion}
                    onClick={() => handleConfirmarRecepcion(false)}
                    className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-bold transition-all disabled:opacity-50"
                  >
                    Marcar Pendiente
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    disabled={submittingRecepcion}
                    onClick={() => setRecepcionModalLiq(null)}
                    className="px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-semibold transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={submittingRecepcion}
                    onClick={() => handleConfirmarRecepcion(true)}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all disabled:opacity-50"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {submittingRecepcion ? 'Guardando...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
