'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { coordinadorDashboardService, vehiculoService } from '@/lib/api';
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
  Edit2
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function HistorialLiquidacionesPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Pestaña activa: 'choferes' | 'propietarios'
  const [activeTab, setActiveTab] = useState<'choferes' | 'propietarios'>('choferes');

  // Datos generales
  const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros Tab 1: Choferes
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTipo, setFilterTipo] = useState<'all' | 'propietario' | 'comisionista'>('all');
  const [filterRecepcion, setFilterRecepcion] = useState<'all' | 'pendiente' | 'recibido'>('all');
  const [generandoPdf, setGenerandoPdf] = useState(false);

  // Modal de Confirmación de Recepción de Dinero / Pago de Saldo a Favor
  const [recepcionModalLiq, setRecepcionModalLiq] = useState<any | null>(null);
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
      const [liqRes, vehRes] = await Promise.all([
        coordinadorDashboardService.getHistorialDuenio(),
        vehiculoService.getAll()
      ]);

      if (liqRes.success && liqRes.data) {
        setLiquidaciones(liqRes.data);
      } else {
        toast.error('Error al cargar historial de liquidaciones');
      }

      if (vehRes.success && vehRes.data) {
        setVehiculos(vehRes.data);
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
  const totalGananciaPropietarioChoferes = filteredLiquidaciones.reduce(
    (sum, l) => sum + (l.gananciaPropietario || 0),
    0
  );

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

  // Generación de PDF directo con jsPDF + autoTable (respeta filtros aplicados)
  const handleDescargarPdfCierres = async () => {
    if (filteredLiquidaciones.length === 0) {
      toast.error('No hay cierres para exportar con los filtros actuales.');
      return;
    }

    try {
      setGenerandoPdf(true);
      const { jsPDF } = await import('jspdf');
      const autoTableModule = await import('jspdf-autotable');
      const autoTable = autoTableModule.default;

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const fechaHoy = new Date().toLocaleDateString('es-AR');

      // Encabezado
      doc.setFontSize(16);
      doc.setFont('helvetica', 'bold');
      doc.text('REMISES BRUNO — REPORTE DE CIERRES DE CAJA', 14, 16);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const filtroTipoLabel =
        filterTipo === 'all' ? 'Todos' : filterTipo === 'propietario' ? 'Auto Propio' : 'Auto Asignado';
      const filtroRecLabel =
        filterRecepcion === 'all' ? 'Todos' : filterRecepcion === 'recibido' ? 'Recibidos' : 'Pendientes';
      doc.text(
        `Fecha de emisión: ${fechaHoy}  |  Registros: ${filteredLiquidaciones.length}  |  Condición: ${filtroTipoLabel}  |  Estado: ${filtroRecLabel}${
          searchTerm ? `  |  Búsqueda: "${searchTerm}"` : ''
        }`,
        14,
        22
      );

      // Totales de viajes y rendiciones por medio de pago
      const totViajesEfec = filteredLiquidaciones.reduce((s, l) => s + (l.totalEfectivoViajes || 0), 0);
      const totViajesTransf = filteredLiquidaciones.reduce((s, l) => s + (l.totalTransferenciaViajes || 0), 0);
      const totViajesCC = filteredLiquidaciones.reduce((s, l) => s + (l.totalCuentaCorrienteViajes || 0), 0);
      const totCobradoEfec = filteredLiquidaciones
        .filter((l) => (l.saldoNeto ?? 0) > 0)
        .reduce((s, l) => s + (l.montoEfectivo || 0), 0);
      const totCobradoTransf = filteredLiquidaciones
        .filter((l) => (l.saldoNeto ?? 0) > 0)
        .reduce((s, l) => s + (l.montoTransferencia || 0), 0);

      const fmt = (n: number) => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`;

      // Resumen Ejecutivo
      autoTable(doc, {
        startY: 26,
        head: [[
          'Total Recaudado',
          'Comisión Agencia',
          'Viajes Efectivo',
          'Viajes Transf.',
          'Viajes Cta. Cte.',
          'Cobrado Efec.',
          'Cobrado Transf.',
          'Saldos a Favor'
        ]],
        body: [[
          fmt(totalRecaudadoChoferes),
          fmt(totalAgenciaChoferes),
          fmt(totViajesEfec),
          fmt(totViajesTransf),
          fmt(totViajesCC),
          fmt(totCobradoEfec),
          fmt(totCobradoTransf),
          fmt(totalSaldoAFavorChoferes)
        ]],
        theme: 'grid',
        headStyles: { fillColor: [15, 23, 42], fontSize: 8, halign: 'center' },
        bodyStyles: { fontSize: 8, fontStyle: 'bold', halign: 'right' }
      });

      const formatPagoPdf = (liq: any) => {
        if ((liq.saldoAFavorChofer || 0) > 0) {
          const estado =
            liq.quienPagaSaldoAFavor === 'COORDINADOR'
              ? 'Pagó Coord.'
              : liq.quienPagaSaldoAFavor === 'PAGADO_DUENIO'
              ? 'Pagó Dueño'
              : 'Pend. Dueño';
          return `A favor ${fmt(liq.saldoAFavorChofer)} (${estado})`;
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
        return '—';
      };

      const rows = filteredLiquidaciones.map((liq) => {
        const operador =
          liq.coordinador?.coordinador?.nombre ||
          liq.coordinador?.duenio?.nombre ||
          liq.coordinador?.email ||
          'N/A';
        const fechaStr = `${new Date(liq.fecha).toLocaleDateString('es-AR')} ${new Date(liq.fecha).toLocaleTimeString('es-AR', {
          hour: '2-digit',
          minute: '2-digit'
        })}`;
        const viajesDesglose = `Ef: ${fmt(liq.totalEfectivoViajes || 0)} | Tr: ${fmt(
          liq.totalTransferenciaViajes || 0
        )} | CC: ${fmt(liq.totalCuentaCorrienteViajes || 0)}`;

        return [
          fechaStr,
          `${liq.chofer?.nombre || ''} ${liq.chofer?.apellido || ''}`.trim(),
          operador,
          fmt(liq.totalRecaudado),
          fmt(liq.comisionAgencia),
          viajesDesglose,
          formatPagoPdf(liq),
          liq.dineroRecibido ? getMetodoEntregaLabel(liq.metodoEntregaDuenio) : 'Pendiente'
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
          'Viajes (Ef / Tr / CC)',
          'Rendición / Saldo a Favor',
          'Control Dueño'
        ]],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59], fontSize: 7.5 },
        bodyStyles: { fontSize: 7.5 },
        columnStyles: {
          3: { halign: 'right' },
          4: { halign: 'right' }
        }
      });

      const fileDate = new Date().toISOString().slice(0, 10);
      doc.save(`cierre_cajas_${fileDate}.pdf`);
      toast.success('PDF descargado correctamente');
    } catch (error) {
      console.error('Error generando PDF:', error);
      toast.error('Error al generar el PDF');
    } finally {
      setGenerandoPdf(false);
    }
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
      const estadoLabel =
        liq.quienPagaSaldoAFavor === 'COORDINADOR'
          ? 'Pagó Coordinador'
          : liq.quienPagaSaldoAFavor === 'PAGADO_DUENIO'
          ? 'Pagado por Dueño'
          : 'Pendiente Dueño';
      const badgeColor =
        liq.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO'
          ? 'bg-amber-100 text-amber-800 border-amber-200'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200';
      return (
        <div className="flex flex-col gap-0.5">
          <span className={`inline-flex w-fit px-2 py-0.5 rounded-md border text-[10px] font-bold ${badgeColor}`}>
            A favor: ${liq.saldoAFavorChofer.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] text-slate-500 font-medium">{estadoLabel}</span>
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
      <div className="bg-slate-200/70 p-1.5 rounded-2xl flex max-w-xl mx-auto shadow-inner print:hidden">
        <button
          onClick={() => setActiveTab('choferes')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'choferes'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <User className="w-4 h-4" />
          Rendiciones de Choferes
        </button>
        <button
          onClick={() => setActiveTab('propietarios')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'propietarios'
              ? 'bg-white text-primary-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Car className="w-4 h-4" />
          Liquidación a Propietarios de Autos
        </button>
      </div>

      {/* ========================================================= */}
      {/* PESTAÑA 1: HISTORIAL DE RENDICIÓN DE CHOFERES */}
      {/* ========================================================= */}
      {activeTab === 'choferes' && (
        <div className="space-y-6 animate-in fade-in duration-200 print:hidden">
          {/* Tarjetas Informativas Choferes (sin Combustible) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-xs">
              <span className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider block">
                Saldos a Favor Choferes
              </span>
              <span className="text-xl sm:text-2xl font-black text-amber-800 block mt-1">
                ${totalSaldoAFavorChoferes.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-amber-600 mt-1 block">
                Pend. Dueño: ${totalSaldoAFavorPendienteDuenio.toLocaleString('es-AR')}
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
                      <div key={liq.id} className="p-4 space-y-3 bg-white hover:bg-slate-50/50">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-slate-900 text-sm">
                              {liq.chofer?.nombre} {liq.chofer?.apellido}
                            </h4>
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
                          <button
                            type="button"
                            onClick={() => openRecepcionModal(liq)}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
                              liq.dineroRecibido
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
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
                        return (
                          <tr key={liq.id} className="hover:bg-slate-50/50 transition-colors text-slate-700">
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
                              <span
                                className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-bold mt-0.5 ${
                                  liq.chofer?.esPropietario
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                                }`}
                              >
                                {liq.chofer?.esPropietario ? 'Auto Propio' : 'Auto Agencia'}
                              </span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap">
                              <span className="font-medium text-slate-800 block">{creadorNombre}</span>
                              <span className="text-[10px] text-slate-400">{liq.coordinador?.email}</span>
                            </td>
                            <td className="px-4 py-3.5 whitespace-nowrap text-right">
                              <span className="font-black text-slate-900 block">
                                ${liq.totalRecaudado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                              </span>
                              {((liq.totalTransferenciaViajes || 0) > 0 || (liq.totalCuentaCorrienteViajes || 0) > 0) && (
                                <span className="text-[10px] text-slate-400 block">
                                  {(liq.totalTransferenciaViajes || 0) > 0 ? `Tr: $${liq.totalTransferenciaViajes.toLocaleString('es-AR')} ` : ''}
                                  {(liq.totalCuentaCorrienteViajes || 0) > 0 ? `CC: $${liq.totalCuentaCorrienteViajes.toLocaleString('es-AR')}` : ''}
                                </span>
                              )}
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
                              {liq.dineroRecibido ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span
                                    title={liq.notasRecepcion || undefined}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold"
                                  >
                                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                                    {getMetodoEntregaLabel(liq.metodoEntregaDuenio)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openRecepcionModal(liq)}
                                    title="Editar"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openRecepcionModal(liq)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold shadow-xs active:scale-95 transition-all"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  {liq.saldoAFavorChofer > 0 && liq.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO'
                                    ? 'Marcar Pagado'
                                    : 'Marcar Recibido'}
                                </button>
                              )}
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
                <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl border border-slate-200 bg-white">
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
