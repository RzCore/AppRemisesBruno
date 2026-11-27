'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { gastoRemiseriaService, coordinadorService } from '@/lib/api';
import {
  GastoRemiseria,
  GastoRemiseriaResumen,
  CreateGastoRemiseriaData,
  CategoriaGastoRemiseria,
  MetodoPagoGasto,
  EstadoGastoRemiseria,
  Coordinador
} from '@/types';
import {
  Receipt,
  Plus,
  RefreshCw,
  Download,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Repeat,
  Edit,
  Trash2,
  Copy,
  Users,
  Home,
  Zap,
  Droplets,
  Flame,
  Wifi,
  Phone,
  MessageSquare,
  Monitor,
  Landmark,
  FileSpreadsheet,
  Shield,
  Wrench,
  Megaphone,
  CreditCard,
  Package,
  Car,
  MoreHorizontal,
  X,
  Calendar,
  DollarSign,
  Filter
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface CategoriaMeta {
  value: CategoriaGastoRemiseria;
  label: string;
  shortLabel: string;
  placeholderConcepto: string;
  placeholderProveedor: string;
  icon: any;
  badgeClass: string;
  barClass: string;
  defaultRecurrente?: boolean;
}

const CATEGORIAS: CategoriaMeta[] = [
  {
    value: 'SUELDO_COORDINADOR',
    label: 'Pago a Coordinadores',
    shortLabel: 'Coordinadores',
    placeholderConcepto: 'Ej. Sueldo Coordinador Turno Mañana',
    placeholderProveedor: 'Nombre del coordinador',
    icon: Users,
    badgeClass: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800',
    barClass: 'bg-indigo-500',
    defaultRecurrente: true
  },
  {
    value: 'SUELDO_OTRO',
    label: 'Otros Sueldos / Personal',
    shortLabel: 'Personal',
    placeholderConcepto: 'Ej. Personal de limpieza / Administrativo',
    placeholderProveedor: 'Nombre del empleado',
    icon: Users,
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800',
    barClass: 'bg-violet-500',
    defaultRecurrente: true
  },
  {
    value: 'ALQUILER',
    label: 'Alquiler de Local / Base',
    shortLabel: 'Alquiler',
    placeholderConcepto: 'Ej. Alquiler Base Remisería',
    placeholderProveedor: 'Inmobiliaria / Propietario',
    icon: Home,
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    barClass: 'bg-amber-500',
    defaultRecurrente: true
  },
  {
    value: 'LUZ',
    label: 'Luz / Energía Eléctrica',
    shortLabel: 'Luz',
    placeholderConcepto: 'Ej. Factura de Luz Base',
    placeholderProveedor: 'EDEN / Cooperativa Eléctrica',
    icon: Zap,
    badgeClass: 'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-800',
    barClass: 'bg-yellow-500',
    defaultRecurrente: true
  },
  {
    value: 'AGUA',
    label: 'Agua',
    shortLabel: 'Agua',
    placeholderConcepto: 'Ej. Servicio de Agua',
    placeholderProveedor: 'ABSA / Cooperativa',
    icon: Droplets,
    badgeClass: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/50 dark:text-sky-300 dark:border-sky-800',
    barClass: 'bg-sky-500',
    defaultRecurrente: true
  },
  {
    value: 'GAS',
    label: 'Gas',
    shortLabel: 'Gas',
    placeholderConcepto: 'Ej. Factura de Gas',
    placeholderProveedor: 'Camuzzi / Metrogas',
    icon: Flame,
    badgeClass: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800',
    barClass: 'bg-orange-500',
    defaultRecurrente: true
  },
  {
    value: 'INTERNET',
    label: 'Internet / Fibra',
    shortLabel: 'Internet',
    placeholderConcepto: 'Ej. Internet Fibra Óptica Base',
    placeholderProveedor: 'Personal / Fibertel / Movistar',
    icon: Wifi,
    badgeClass: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/50 dark:text-cyan-300 dark:border-cyan-800',
    barClass: 'bg-cyan-500',
    defaultRecurrente: true
  },
  {
    value: 'TELEFONO',
    label: 'Teléfono Fijo / Líneas',
    shortLabel: 'Teléfono',
    placeholderConcepto: 'Ej. Líneas fijas 427637 / 433000',
    placeholderProveedor: 'Telecom / Claro / Movistar',
    icon: Phone,
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
    barClass: 'bg-blue-500',
    defaultRecurrente: true
  },
  {
    value: 'WHATSAPP',
    label: 'WhatsApp / Bot / API',
    shortLabel: 'WhatsApp',
    placeholderConcepto: 'Ej. WhatsApp Business API / Conversaciones',
    placeholderProveedor: 'Meta / Twilio / Proveedor Bot',
    icon: MessageSquare,
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    barClass: 'bg-emerald-500',
    defaultRecurrente: true
  },
  {
    value: 'SISTEMA',
    label: 'Sistema / Software / Hosting',
    shortLabel: 'Sistema',
    placeholderConcepto: 'Ej. Abono Sistema / Servidor / Dominio',
    placeholderProveedor: 'Proveedor de Sistema / Hosting',
    icon: Monitor,
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/50 dark:text-purple-300 dark:border-purple-800',
    barClass: 'bg-purple-500',
    defaultRecurrente: true
  },
  {
    value: 'IMPUESTOS',
    label: 'Impuestos / AFIP / Tasas',
    shortLabel: 'Impuestos',
    placeholderConcepto: 'Ej. Monotributo / IIBB / Tasa Municipal',
    placeholderProveedor: 'AFIP / ARBA / Municipalidad',
    icon: Landmark,
    badgeClass: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
    barClass: 'bg-rose-500',
    defaultRecurrente: true
  },
  {
    value: 'CONTADOR',
    label: 'Contador / Estudio Jurídico',
    shortLabel: 'Contador',
    placeholderConcepto: 'Ej. Honorarios Estudio Contable',
    placeholderProveedor: 'Estudio Contable',
    icon: FileSpreadsheet,
    badgeClass: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800',
    barClass: 'bg-teal-500',
    defaultRecurrente: true
  },
  {
    value: 'SEGURO',
    label: 'Seguros (Local / ART / Flota)',
    shortLabel: 'Seguros',
    placeholderConcepto: 'Ej. Seguro Integral de Comercio / ART',
    placeholderProveedor: 'Aseguradora',
    icon: Shield,
    badgeClass: 'bg-lime-50 text-lime-800 border-lime-200 dark:bg-lime-950/50 dark:text-lime-300 dark:border-lime-800',
    barClass: 'bg-lime-500',
    defaultRecurrente: true
  },
  {
    value: 'MANTENIMIENTO_LOCAL',
    label: 'Mantenimiento y Limpieza',
    shortLabel: 'Mantenimiento',
    placeholderConcepto: 'Ej. Reparación aire / Artículos de limpieza',
    placeholderProveedor: 'Técnico / Ferretería',
    icon: Wrench,
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-900 dark:text-stone-300 dark:border-stone-700',
    barClass: 'bg-stone-500'
  },
  {
    value: 'PUBLICIDAD',
    label: 'Publicidad / Marketing',
    shortLabel: 'Publicidad',
    placeholderConcepto: 'Ej. Publicidad Instagram / Folletos / Radio',
    placeholderProveedor: 'Meta Ads / Imprenta / Radio',
    icon: Megaphone,
    badgeClass: 'bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-950/50 dark:text-pink-300 dark:border-pink-800',
    barClass: 'bg-pink-500'
  },
  {
    value: 'COMISIONES_BANCARIAS',
    label: 'Comisiones Bancarias / MP',
    shortLabel: 'Banco / MP',
    placeholderConcepto: 'Ej. Mantenimiento cuenta / Comisiones',
    placeholderProveedor: 'Banco / MercadoPago',
    icon: CreditCard,
    badgeClass: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-950/50 dark:text-fuchsia-300 dark:border-fuchsia-800',
    barClass: 'bg-fuchsia-500'
  },
  {
    value: 'INSUMOS_OFICINA',
    label: 'Insumos de Oficina / Café',
    shortLabel: 'Oficina',
    placeholderConcepto: 'Ej. Resmas, toner, café, yerba',
    placeholderProveedor: 'Librería / Supermercado',
    icon: Package,
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
    barClass: 'bg-slate-500'
  },
  {
    value: 'FLOTA_PROPIA',
    label: 'Gastos de Vehículos Propios',
    shortLabel: 'Flota Propia',
    placeholderConcepto: 'Ej. Patente / Taller / Cubiertas móvil propio',
    placeholderProveedor: 'Taller / Municipio',
    icon: Car,
    badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
    barClass: 'bg-zinc-500'
  },
  {
    value: 'OTRO',
    label: 'Otros Gastos',
    shortLabel: 'Otros',
    placeholderConcepto: 'Ej. Gasto vario de la agencia',
    placeholderProveedor: 'Proveedor',
    icon: MoreHorizontal,
    badgeClass: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700',
    barClass: 'bg-gray-500'
  }
];

const CATEGORIAS_MAP = new Map(CATEGORIAS.map((c) => [c.value, c]));

const METODOS_PAGO: Array<{ value: MetodoPagoGasto; label: string }> = [
  { value: 'EFECTIVO', label: 'Efectivo' },
  { value: 'TRANSFERENCIA', label: 'Transferencia Bancaria' },
  { value: 'MERCADOPAGO', label: 'MercadoPago' },
  { value: 'DEBITO', label: 'Tarjeta de Débito' },
  { value: 'CREDITO', label: 'Tarjeta de Crédito' },
  { value: 'CHEQUE', label: 'Cheque / E-Cheq' },
  { value: 'OTRO', label: 'Otro' }
];

const METODOS_MAP = new Map(METODOS_PAGO.map((m) => [m.value, m.label]));

const QUICK_CATEGORIES: CategoriaGastoRemiseria[] = [
  'SUELDO_COORDINADOR',
  'ALQUILER',
  'LUZ',
  'TELEFONO',
  'INTERNET',
  'WHATSAPP',
  'SISTEMA',
  'IMPUESTOS'
];

function getMesActualStr(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
}

function getHoyStr(): string {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

function formatDateInput(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().split('T')[0];
}

function formatMoney(n: number): string {
  return `$${Math.round(n || 0).toLocaleString('es-AR')}`;
}

export default function GastosRemiseriaPage() {
  const { user } = useAuth();
  const router = useRouter();

  // Datos
  const [loading, setLoading] = useState(true);
  const [gastos, setGastos] = useState<GastoRemiseria[]>([]);
  const [resumen, setResumen] = useState<GastoRemiseriaResumen | null>(null);
  const [coordinadores, setCoordinadores] = useState<Coordinador[]>([]);

  // Filtros
  const [modoPeriodo, setModoPeriodo] = useState<'mes' | 'rango'>('mes');
  const [periodoMes, setPeriodoMes] = useState<string>(getMesActualStr());
  const [fechaDesde, setFechaDesde] = useState<string>('');
  const [fechaHasta, setFechaHasta] = useState<string>('');
  const [filtroCategoria, setFiltroCategoria] = useState<string>('TODAS');
  const [filtroEstado, setFiltroEstado] = useState<string>('TODOS');
  const [filtroMetodo, setFiltroMetodo] = useState<string>('TODOS');
  const [filtroRecurrente, setFiltroRecurrente] = useState<string>('TODOS');
  const [busqueda, setBusqueda] = useState<string>('');

  // Acciones en curso
  const [generandoRecurrentes, setGenerandoRecurrentes] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Modal Crear / Editar
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingGasto, setEditingGasto] = useState<GastoRemiseria | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<CreateGastoRemiseriaData>({
    categoria: 'ALQUILER',
    concepto: '',
    proveedor: '',
    monto: 0,
    fecha: getHoyStr(),
    fechaVencimiento: '',
    estado: 'PAGADO',
    metodoPago: 'EFECTIVO',
    numeroComprobante: '',
    esRecurrente: true,
    diaVencimientoMensual: 10,
    periodoMes: getMesActualStr(),
    coordinadorId: '',
    observaciones: ''
  });

  const cargarGastos = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (modoPeriodo === 'mes' && periodoMes) {
        params.periodoMes = periodoMes;
      } else {
        if (fechaDesde) params.desde = fechaDesde;
        if (fechaHasta) params.hasta = fechaHasta;
      }
      if (filtroCategoria !== 'TODAS') params.categoria = filtroCategoria;
      if (filtroEstado !== 'TODOS') params.estado = filtroEstado;
      if (filtroMetodo !== 'TODOS') params.metodoPago = filtroMetodo;
      if (filtroRecurrente === 'FIJOS') params.esRecurrente = 'true';
      if (filtroRecurrente === 'EVENTUALES') params.esRecurrente = 'false';

      const res = await gastoRemiseriaService.getAll(params);
      if (res.success && res.data) {
        setGastos(res.data.gastos || []);
        setResumen(res.data.resumen || null);
      } else {
        toast.error(res.message || 'No se pudieron cargar los gastos');
      }
    } catch {
      toast.error('Error de red al cargar los gastos');
    } finally {
      setLoading(false);
    }
  }, [modoPeriodo, periodoMes, fechaDesde, fechaHasta, filtroCategoria, filtroEstado, filtroMetodo, filtroRecurrente]);

  useEffect(() => {
    if (!user) return;
    if (user.rol !== 'DUENIO' && user.rol !== 'ADMIN') {
      router.push('/login');
      return;
    }
    coordinadorService
      .getAll()
      .then((res) => {
        if (res.success && res.data) setCoordinadores(res.data);
      })
      .catch(() => {});
  }, [user, router]);

  useEffect(() => {
    if (!user || (user.rol !== 'DUENIO' && user.rol !== 'ADMIN')) return;
    cargarGastos();
  }, [user, cargarGastos]);

  // Filtro de búsqueda en cliente (instantáneo)
  const gastosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return gastos;
    return gastos.filter((g) => {
      const catLabel = CATEGORIAS_MAP.get(g.categoria as CategoriaGastoRemiseria)?.label.toLowerCase() || '';
      const coordNom = g.coordinador?.nombre?.toLowerCase() || '';
      return (
        g.concepto.toLowerCase().includes(q) ||
        (g.proveedor || '').toLowerCase().includes(q) ||
        (g.numeroComprobante || '').toLowerCase().includes(q) ||
        (g.observaciones || '').toLowerCase().includes(q) ||
        catLabel.includes(q) ||
        coordNom.includes(q)
      );
    });
  }, [gastos, busqueda]);

  const abrirModalNuevo = (categoriaPre?: CategoriaGastoRemiseria) => {
    const cat = categoriaPre || 'ALQUILER';
    const meta = CATEGORIAS_MAP.get(cat);
    const hoy = getHoyStr();
    setEditingGasto(null);
    setFormData({
      categoria: cat,
      concepto: '',
      proveedor: '',
      monto: 0,
      fecha: hoy,
      fechaVencimiento: '',
      estado: 'PAGADO',
      metodoPago: 'EFECTIVO',
      numeroComprobante: '',
      esRecurrente: Boolean(meta?.defaultRecurrente),
      diaVencimientoMensual: 10,
      periodoMes: modoPeriodo === 'mes' && periodoMes ? periodoMes : getMesActualStr(),
      coordinadorId: '',
      observaciones: ''
    });
    setIsModalOpen(true);
  };

  const abrirModalEditar = (g: GastoRemiseria) => {
    setEditingGasto(g);
    setFormData({
      categoria: g.categoria,
      concepto: g.concepto,
      proveedor: g.proveedor || '',
      monto: g.monto,
      fecha: formatDateInput(g.fecha) || getHoyStr(),
      fechaVencimiento: formatDateInput(g.fechaVencimiento),
      estado: g.estado,
      metodoPago: g.metodoPago,
      numeroComprobante: g.numeroComprobante || '',
      esRecurrente: g.esRecurrente,
      diaVencimientoMensual: g.diaVencimientoMensual ?? 10,
      periodoMes: g.periodoMes || getMesActualStr(),
      coordinadorId: g.coordinadorId || '',
      observaciones: g.observaciones || ''
    });
    setIsModalOpen(true);
  };

  const abrirModalDuplicar = (g: GastoRemiseria) => {
    setEditingGasto(null);
    setFormData({
      categoria: g.categoria,
      concepto: g.concepto,
      proveedor: g.proveedor || '',
      monto: g.monto,
      fecha: getHoyStr(),
      fechaVencimiento: '',
      estado: 'PENDIENTE',
      metodoPago: g.metodoPago,
      numeroComprobante: '',
      esRecurrente: g.esRecurrente,
      diaVencimientoMensual: g.diaVencimientoMensual ?? 10,
      periodoMes: modoPeriodo === 'mes' && periodoMes ? periodoMes : getMesActualStr(),
      coordinadorId: g.coordinadorId || '',
      observaciones: g.observaciones || ''
    });
    setIsModalOpen(true);
  };

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.concepto.trim()) {
      toast.error('Ingresá el concepto del gasto');
      return;
    }
    if (!formData.monto || Number(formData.monto) <= 0) {
      toast.error('Ingresá un monto mayor a 0');
      return;
    }

    try {
      setSaving(true);
      const payload: CreateGastoRemiseriaData = {
        ...formData,
        concepto: formData.concepto.trim(),
        proveedor: formData.proveedor?.trim() || undefined,
        numeroComprobante: formData.numeroComprobante?.trim() || undefined,
        observaciones: formData.observaciones?.trim() || undefined,
        monto: Number(formData.monto),
        fechaVencimiento: formData.fechaVencimiento || null,
        coordinadorId:
          formData.categoria === 'SUELDO_COORDINADOR' && formData.coordinadorId
            ? formData.coordinadorId
            : null,
        diaVencimientoMensual: formData.esRecurrente ? Number(formData.diaVencimientoMensual || 10) : null
      };

      const res = editingGasto
        ? await gastoRemiseriaService.update(editingGasto.id, payload)
        : await gastoRemiseriaService.create(payload);

      if (res.success) {
        toast.success(editingGasto ? 'Gasto actualizado' : 'Gasto registrado correctamente');
        setIsModalOpen(false);
        cargarGastos();
      } else {
        toast.error(res.message || 'No se pudo guardar el gasto');
      }
    } catch {
      toast.error('Error de red al guardar el gasto');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleEstado = async (g: GastoRemiseria) => {
    try {
      setTogglingId(g.id);
      const nuevoEstado: EstadoGastoRemiseria = g.estado === 'PAGADO' ? 'PENDIENTE' : 'PAGADO';
      const res = await gastoRemiseriaService.cambiarEstado(g.id, { estado: nuevoEstado });
      if (res.success) {
        toast.success(nuevoEstado === 'PAGADO' ? 'Marcado como pagado' : 'Marcado como pendiente');
        cargarGastos();
      } else {
        toast.error(res.message || 'No se pudo actualizar el estado');
      }
    } catch {
      toast.error('Error al actualizar estado');
    } finally {
      setTogglingId(null);
    }
  };

  const handleEliminar = async (g: GastoRemiseria) => {
    if (!window.confirm(`¿Eliminar el gasto "${g.concepto}" por ${formatMoney(g.monto)}?`)) return;
    try {
      setDeletingId(g.id);
      const res = await gastoRemiseriaService.delete(g.id);
      if (res.success) {
        toast.success('Gasto eliminado');
        cargarGastos();
      } else {
        toast.error(res.message || 'No se pudo eliminar el gasto');
      }
    } catch {
      toast.error('Error al eliminar gasto');
    } finally {
      setDeletingId(null);
    }
  };

  const handleGenerarFijosDelMes = async () => {
    const mesObj = modoPeriodo === 'mes' && periodoMes ? periodoMes : getMesActualStr();
    try {
      setGenerandoRecurrentes(true);
      const res = await gastoRemiseriaService.generarRecurrentes(mesObj);
      if (res.success) {
        toast.success(res.message || 'Gastos fijos generados');
        setModoPeriodo('mes');
        setPeriodoMes(mesObj);
        cargarGastos();
      } else {
        toast.error(res.message || 'No se pudieron generar los gastos fijos');
      }
    } catch {
      toast.error('Error al generar gastos fijos');
    } finally {
      setGenerandoRecurrentes(false);
    }
  };

  const aplicarRangoRapido = (tipo: 'este_mes' | 'mes_anterior' | 'trimestre' | 'anio') => {
    const hoy = new Date();
    if (tipo === 'este_mes') {
      setModoPeriodo('mes');
      setPeriodoMes(getMesActualStr());
    } else if (tipo === 'mes_anterior') {
      const ant = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
      setModoPeriodo('mes');
      setPeriodoMes(`${ant.getFullYear()}-${String(ant.getMonth() + 1).padStart(2, '0')}`);
    } else if (tipo === 'trimestre') {
      const hace3 = new Date(hoy.getFullYear(), hoy.getMonth() - 2, 1);
      setModoPeriodo('rango');
      setFechaDesde(`${hace3.getFullYear()}-${String(hace3.getMonth() + 1).padStart(2, '0')}-01`);
      setFechaHasta(getHoyStr());
    } else if (tipo === 'anio') {
      setModoPeriodo('rango');
      setFechaDesde(`${hoy.getFullYear()}-01-01`);
      setFechaHasta(`${hoy.getFullYear()}-12-31`);
    }
  };

  const handleExportarCSV = () => {
    if (gastosFiltrados.length === 0) {
      toast.error('No hay gastos para exportar');
      return;
    }

    const headers = [
      'Fecha',
      'Vencimiento',
      'Período',
      'Categoría',
      'Concepto',
      'Proveedor / Coordinador',
      'Estado',
      'Medio de Pago',
      'N° Comprobante',
      'Fijo Mensual',
      'Monto ($)',
      'Observaciones'
    ];

    const rows = gastosFiltrados.map((g) => {
      const catLabel = CATEGORIAS_MAP.get(g.categoria as CategoriaGastoRemiseria)?.label || g.categoria;
      const metLabel = METODOS_MAP.get(g.metodoPago as MetodoPagoGasto) || g.metodoPago;
      const prov = g.coordinador?.nombre || g.proveedor || '-';
      const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;

      return [
        new Date(g.fecha).toLocaleDateString('es-AR'),
        g.fechaVencimiento ? new Date(g.fechaVencimiento).toLocaleDateString('es-AR') : '-',
        g.periodoMes || '-',
        esc(catLabel),
        esc(g.concepto),
        esc(prov),
        g.estado,
        esc(metLabel),
        esc(g.numeroComprobante || '-'),
        g.esRecurrente ? 'SI' : 'NO',
        Number(g.monto || 0).toFixed(2),
        esc(g.observaciones || '')
      ].join(';');
    });

    const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Gastos_Remiseria_${modoPeriodo === 'mes' ? periodoMes : `${fechaDesde}_a_${fechaHasta}`}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('CSV de gastos descargado');
  };

  const hoyInicio = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const metaCategoriaForm = CATEGORIAS_MAP.get(formData.categoria as CategoriaGastoRemiseria);

  return (
    <div className="space-y-6">
      {/* Header Principal */}
      <div className="bg-white dark:bg-slate-900 p-5 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border border-rose-100 dark:border-rose-900 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
            <Receipt className="w-7 h-7" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                Gastos de la Remisería
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                Costos Operativos
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              Registrá pagos a coordinadores, alquiler, luz, teléfono, WhatsApp, sistema, impuestos y gastos fijos mensuales.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={cargarGastos}
            className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
            title="Refrescar"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            disabled={generandoRecurrentes}
            onClick={handleGenerarFijosDelMes}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-semibold text-xs sm:text-sm transition-colors disabled:opacity-50"
            title="Duplica automáticamente los gastos fijos mensuales como pendientes para el mes seleccionado"
          >
            <Repeat className={`w-4 h-4 ${generandoRecurrentes ? 'animate-spin' : ''}`} />
            {generandoRecurrentes ? 'Cargando...' : 'Cargar Fijos del Mes'}
          </button>
          <button
            type="button"
            onClick={handleExportarCSV}
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs sm:text-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Excel (CSV)
          </button>
          <button
            type="button"
            onClick={() => abrirModalNuevo()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white font-semibold text-xs sm:text-sm shadow-sm transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Nuevo Gasto
          </button>
        </div>
      </div>

      {/* Carga Rápida por Categoría */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Carga rápida de gasto
          </span>
          <span className="text-[11px] text-slate-400">Tocá un rubro para cargar al instante</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {QUICK_CATEGORIES.map((catVal) => {
            const meta = CATEGORIAS_MAP.get(catVal)!;
            const Icon = meta.icon;
            return (
              <button
                key={catVal}
                type="button"
                onClick={() => abrirModalNuevo(catVal)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all hover:scale-[1.02] active:scale-95 ${meta.badgeClass}`}
              >
                <Icon className="w-3.5 h-3.5" />
                + {meta.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
            Total del Período
          </span>
          <div className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-1.5">
            {formatMoney(resumen?.totalGeneral || 0)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {resumen?.cantidadGastos || 0} gastos registrados
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
            Pagados
          </span>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1.5">
            {formatMoney(resumen?.totalPagado || 0)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {(resumen?.cantidadGastos || 0) - (resumen?.cantidadPendientes || 0)} abonados
          </span>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-amber-200/80 dark:border-amber-900/60 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
            Pendientes
          </span>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 mt-1.5">
            {formatMoney(resumen?.totalPendiente || 0)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {resumen?.cantidadPendientes || 0} por pagar
          </span>
        </div>

        <div className={`bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border shadow-sm ${
          (resumen?.cantidadVencidos || 0) > 0
            ? 'border-red-300 dark:border-red-800 bg-red-50/40 dark:bg-red-950/20'
            : 'border-slate-200 dark:border-slate-800'
        }`}>
          <span className={`text-[11px] font-bold uppercase tracking-wider block ${
            (resumen?.cantidadVencidos || 0) > 0 ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
          }`}>
            Vencidos
          </span>
          <div className={`text-xl sm:text-2xl font-black mt-1.5 ${
            (resumen?.cantidadVencidos || 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'
          }`}>
            {formatMoney(resumen?.totalVencido || 0)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {(resumen?.cantidadVencidos || 0) > 0
              ? `${resumen?.cantidadVencidos} facturas vencidas`
              : 'Sin vencimientos atrasados'}
          </span>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 block">
            Gastos Fijos
          </span>
          <div className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1.5">
            {formatMoney(resumen?.totalRecurrente || 0)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Estructura fija mensual
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
              <Calendar className="w-3.5 h-3.5" />
              Período:
            </span>
            <button
              type="button"
              onClick={() => aplicarRangoRapido('este_mes')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                modoPeriodo === 'mes' && periodoMes === getMesActualStr()
                  ? 'bg-primary-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              Este Mes
            </button>
            <button
              type="button"
              onClick={() => aplicarRangoRapido('mes_anterior')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Mes Anterior
            </button>
            <button
              type="button"
              onClick={() => aplicarRangoRapido('trimestre')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Últimos 3 Meses
            </button>
            <button
              type="button"
              onClick={() => aplicarRangoRapido('anio')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Año Actual
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {modoPeriodo === 'mes' ? (
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={periodoMes}
                  onChange={(e) => setPeriodoMes(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => {
                    setModoPeriodo('rango');
                    if (!fechaDesde) setFechaDesde(`${periodoMes}-01`);
                    if (!fechaHasta) setFechaHasta(getHoyStr());
                  }}
                  className="text-xs font-semibold text-primary-600 hover:underline"
                >
                  Rango de fechas
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  value={fechaDesde}
                  onChange={(e) => setFechaDesde(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400">a</span>
                <input
                  type="date"
                  value={fechaHasta}
                  onChange={(e) => setFechaHasta(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100"
                />
                <button
                  type="button"
                  onClick={() => setModoPeriodo('mes')}
                  className="text-xs font-semibold text-primary-600 hover:underline"
                >
                  Por mes
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar concepto, proveedor..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>

          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="TODAS">Todas las categorías</option>
            {CATEGORIAS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="TODOS">Todos los estados</option>
            <option value="PAGADO">Pagados</option>
            <option value="PENDIENTE">Pendientes</option>
          </select>

          <select
            value={filtroMetodo}
            onChange={(e) => setFiltroMetodo(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="TODOS">Todos los medios de pago</option>
            {METODOS_PAGO.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>

          <select
            value={filtroRecurrente}
            onChange={(e) => setFiltroRecurrente(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200"
          >
            <option value="TODOS">Fijos y Eventuales</option>
            <option value="FIJOS">Solo Gastos Fijos</option>
            <option value="EVENTUALES">Solo Eventuales</option>
          </select>
        </div>
      </div>

      {/* Distribución por Categoría + Coordinadores / Medios de Pago */}
      {resumen && resumen.porCategoria.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Filter className="w-4 h-4 text-primary-600" />
                Distribución por Rubro
              </h3>
              {filtroCategoria !== 'TODAS' && (
                <button
                  type="button"
                  onClick={() => setFiltroCategoria('TODAS')}
                  className="text-xs font-semibold text-primary-600 hover:underline"
                >
                  Ver todos
                </button>
              )}
            </div>
            <div className="space-y-2.5">
              {resumen.porCategoria.map((item) => {
                const meta = CATEGORIAS_MAP.get(item.categoria as CategoriaGastoRemiseria);
                const Icon = meta?.icon || MoreHorizontal;
                return (
                  <button
                    key={item.categoria}
                    type="button"
                    onClick={() =>
                      setFiltroCategoria(filtroCategoria === item.categoria ? 'TODAS' : item.categoria)
                    }
                    className="w-full text-left group"
                  >
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 group-hover:text-primary-600">
                        <Icon className="w-3.5 h-3.5 text-slate-400" />
                        {meta?.label || item.categoria}
                        <span className="text-[11px] text-slate-400 font-normal">({item.cantidad})</span>
                      </span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {formatMoney(item.total)}{' '}
                        <span className="text-[11px] font-medium text-slate-400">({item.porcentaje}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${meta?.barClass || 'bg-slate-500'}`}
                        style={{ width: `${Math.max(3, Math.min(100, item.porcentaje))}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            {/* Por Medio de Pago */}
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                Por Medio de Pago
              </h3>
              <div className="space-y-2">
                {resumen.porMetodoPago.map((m) => (
                  <div key={m.metodoPago} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                    <span className="text-slate-600 dark:text-slate-300 font-medium">
                      {METODOS_MAP.get(m.metodoPago as MetodoPagoGasto) || m.metodoPago}
                      <span className="text-slate-400 ml-1">({m.cantidad})</span>
                    </span>
                    <span className="font-bold text-slate-900 dark:text-slate-100">{formatMoney(m.total)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pagos a Coordinadores */}
            {resumen.porCoordinador.length > 0 && (
              <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-indigo-200/70 dark:border-indigo-900/60 shadow-sm space-y-2.5">
                <h3 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Pagos a Coordinadores
                </h3>
                <div className="space-y-2">
                  {resumen.porCoordinador.map((c) => (
                    <div key={c.coordinadorId} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <span className="text-slate-700 dark:text-slate-200 font-semibold">
                        {c.nombre}
                        <span className="text-slate-400 font-normal ml-1">({c.cantidad})</span>
                      </span>
                      <span className="font-bold text-indigo-700 dark:text-indigo-300">{formatMoney(c.total)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Listado de Gastos */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-primary-600 mx-auto" />
          <p className="text-sm text-slate-500 mt-3">Cargando gastos de la remisería...</p>
        </div>
      ) : gastosFiltrados.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-12 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
          <div className="w-14 h-14 rounded-full bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center mx-auto">
            <Receipt className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              No hay gastos registrados en este período
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Cargá pagos a coordinadores, alquiler, luz, teléfono, WhatsApp o sistema para llevar el control exacto de tus costos mensuales.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={() => abrirModalNuevo()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Registrar Primer Gasto
            </button>
            <button
              type="button"
              onClick={handleGenerarFijosDelMes}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold border border-indigo-200"
            >
              <Repeat className="w-4 h-4" />
              Cargar Fijos del Mes
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          {/* Vista Móvil */}
          <div className="block md:hidden divide-y divide-slate-100 dark:divide-slate-800">
            {gastosFiltrados.map((g) => {
              const meta = CATEGORIAS_MAP.get(g.categoria as CategoriaGastoRemiseria);
              const Icon = meta?.icon || MoreHorizontal;
              const vencido =
                g.estado === 'PENDIENTE' && g.fechaVencimiento && new Date(g.fechaVencimiento) < hoyInicio;

              return (
                <div key={g.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${meta?.badgeClass || ''}`}>
                          <Icon className="w-3 h-3" />
                          {meta?.shortLabel || g.categoria}
                        </span>
                        {g.esRecurrente && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-semibold">
                            <Repeat className="w-2.5 h-2.5" /> Fijo
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-1">
                        {g.concepto}
                      </h4>
                      {(g.coordinador?.nombre || g.proveedor) && (
                        <p className="text-xs text-slate-500">
                          {g.coordinador ? `Coordinador: ${g.coordinador.nombre}` : g.proveedor}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-base font-black text-slate-900 dark:text-white">
                        {formatMoney(g.monto)}
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mt-1 ${
                          g.estado === 'PAGADO'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : vencido
                            ? 'bg-red-50 text-red-700 border border-red-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {g.estado === 'PAGADO' ? 'Pagado' : vencido ? 'Vencido' : 'Pendiente'}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span>
                      {new Date(g.fecha).toLocaleDateString('es-AR')} · {METODOS_MAP.get(g.metodoPago as MetodoPagoGasto) || g.metodoPago}
                      {g.fechaVencimiento && ` · Vto: ${new Date(g.fechaVencimiento).toLocaleDateString('es-AR')}`}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={togglingId === g.id}
                        onClick={() => handleToggleEstado(g)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                          g.estado === 'PAGADO'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {g.estado === 'PAGADO' ? 'Pasar a Pendiente' : 'Marcar Pagado'}
                      </button>
                      <button
                        type="button"
                        onClick={() => abrirModalEditar(g)}
                        className="p-1.5 rounded-lg bg-slate-100 text-slate-600"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === g.id}
                        onClick={() => handleEliminar(g)}
                        className="p-1.5 rounded-lg bg-red-50 text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Vista Escritorio */}
          <div className="hidden md:block overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/70">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Fecha / Vto</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Rubro</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Concepto / Proveedor</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Medio / Comp.</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase">Estado</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Monto</th>
                  <th className="px-4 py-3 text-right font-bold text-slate-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {gastosFiltrados.map((g) => {
                  const meta = CATEGORIAS_MAP.get(g.categoria as CategoriaGastoRemiseria);
                  const Icon = meta?.icon || MoreHorizontal;
                  const vencido =
                    g.estado === 'PENDIENTE' && g.fechaVencimiento && new Date(g.fechaVencimiento) < hoyInicio;

                  return (
                    <tr key={g.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-bold text-slate-900 dark:text-slate-100">
                          {new Date(g.fecha).toLocaleDateString('es-AR')}
                        </div>
                        {g.fechaVencimiento && (
                          <div className={`text-[11px] ${vencido ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
                            Vto: {new Date(g.fechaVencimiento).toLocaleDateString('es-AR')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border font-bold text-[11px] ${meta?.badgeClass || ''}`}>
                            <Icon className="w-3.5 h-3.5" />
                            {meta?.shortLabel || g.categoria}
                          </span>
                          {g.esRecurrente && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                              <Repeat className="w-3 h-3" />
                              Fijo mensual {g.diaVencimientoMensual ? `(día ${g.diaVencimientoMensual})` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-bold text-slate-900 dark:text-slate-100">{g.concepto}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {g.coordinador
                            ? `Coordinador: ${g.coordinador.nombre}`
                            : g.proveedor || 'Sin proveedor especificado'}
                        </div>
                        {g.observaciones && (
                          <div className="text-[11px] text-slate-400 truncate mt-0.5" title={g.observaciones}>
                            {g.observaciones}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-semibold text-slate-700 dark:text-slate-200">
                          {METODOS_MAP.get(g.metodoPago as MetodoPagoGasto) || g.metodoPago}
                        </div>
                        {g.numeroComprobante && (
                          <div className="text-[11px] font-mono text-slate-400">#{g.numeroComprobante}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                            g.estado === 'PAGADO'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800'
                              : vencido
                              ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800'
                              : 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800'
                          }`}
                        >
                          {g.estado === 'PAGADO' ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : vencido ? (
                            <AlertTriangle className="w-3.5 h-3.5" />
                          ) : (
                            <Clock className="w-3.5 h-3.5" />
                          )}
                          {g.estado === 'PAGADO' ? 'Pagado' : vencido ? 'Vencido' : 'Pendiente'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span className="text-sm font-black text-slate-900 dark:text-white">
                          {formatMoney(g.monto)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            disabled={togglingId === g.id}
                            onClick={() => handleToggleEstado(g)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors ${
                              g.estado === 'PAGADO'
                                ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            }`}
                            title={g.estado === 'PAGADO' ? 'Marcar como pendiente' : 'Marcar como pagado'}
                          >
                            {g.estado === 'PAGADO' ? 'Pendiente' : 'Pagar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirModalDuplicar(g)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                            title="Duplicar gasto"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => abrirModalEditar(g)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Editar gasto"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === g.id}
                            onClick={() => handleEliminar(g)}
                            className="p-1.5 rounded-lg text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                            title="Eliminar gasto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL CREAR / EDITAR GASTO */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {editingGasto ? 'Editar Gasto' : 'Registrar Nuevo Gasto'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Completá los datos del gasto operativo o fijo de la remisería.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardar} className="p-6 space-y-4 max-h-[82vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Rubro / Categoría *
                  </label>
                  <select
                    value={formData.categoria}
                    onChange={(e) => {
                      const cat = e.target.value as CategoriaGastoRemiseria;
                      const meta = CATEGORIAS_MAP.get(cat);
                      setFormData((prev) => ({
                        ...prev,
                        categoria: cat,
                        esRecurrente: editingGasto ? prev.esRecurrente : Boolean(meta?.defaultRecurrente)
                      }));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {CATEGORIAS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {formData.categoria === 'SUELDO_COORDINADOR' && (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider mb-1">
                      Coordinador (Opcional)
                    </label>
                    <select
                      value={formData.coordinadorId || ''}
                      onChange={(e) => {
                        const coordId = e.target.value;
                        const coord = coordinadores.find((c) => c.id === coordId);
                        setFormData((prev) => ({
                          ...prev,
                          coordinadorId: coordId,
                          concepto:
                            !prev.concepto && coord ? `Pago Coordinador ${coord.nombre}` : prev.concepto,
                          proveedor: coord ? coord.nombre : prev.proveedor
                        }));
                      }}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/30 text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="">-- Seleccionar coordinador --</option>
                      {coordinadores.map((c) => (
                        <option key={c.id} value={c.id}>{c.nombre} ({c.email})</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Concepto / Descripción *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={metaCategoriaForm?.placeholderConcepto || 'Ej. Pago de servicio'}
                    value={formData.concepto}
                    onChange={(e) => setFormData({ ...formData, concepto: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-medium text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Monto ($) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      placeholder="0"
                      value={formData.monto || ''}
                      onChange={(e) => setFormData({ ...formData, monto: parseFloat(e.target.value) || 0 })}
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Proveedor / Destinatario
                  </label>
                  <input
                    type="text"
                    placeholder={metaCategoriaForm?.placeholderProveedor || 'Proveedor'}
                    value={formData.proveedor || ''}
                    onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Estado
                  </label>
                  <select
                    value={formData.estado || 'PAGADO'}
                    onChange={(e) => setFormData({ ...formData, estado: e.target.value as EstadoGastoRemiseria })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    <option value="PAGADO">Pagado</option>
                    <option value="PENDIENTE">Pendiente de pago</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Medio de Pago
                  </label>
                  <select
                    value={formData.metodoPago || 'EFECTIVO'}
                    onChange={(e) => setFormData({ ...formData, metodoPago: e.target.value as MetodoPagoGasto })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-semibold text-slate-900 dark:text-white"
                  >
                    {METODOS_PAGO.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Fecha del Gasto / Pago *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.fecha || ''}
                    onChange={(e) => {
                      const f = e.target.value;
                      setFormData((prev) => ({
                        ...prev,
                        fecha: f,
                        periodoMes: f ? f.slice(0, 7) : prev.periodoMes
                      }));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Fecha de Vencimiento
                  </label>
                  <input
                    type="date"
                    value={formData.fechaVencimiento || ''}
                    onChange={(e) => setFormData({ ...formData, fechaVencimiento: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    Mes de Imputación
                  </label>
                  <input
                    type="month"
                    value={formData.periodoMes || ''}
                    onChange={(e) => setFormData({ ...formData, periodoMes: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                    N° Factura / Comprobante
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. FC-0001-004512"
                    value={formData.numeroComprobante || ''}
                    onChange={(e) => setFormData({ ...formData, numeroComprobante: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Gasto Fijo Mensual */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900 space-y-2.5">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 block">
                      Gasto fijo mensual (recurrente)
                    </span>
                    <span className="text-[11px] text-indigo-700 dark:text-indigo-400">
                      Te permite generar automáticamente este gasto cada mes con el botón &quot;Cargar Fijos del Mes&quot;.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(formData.esRecurrente)}
                    onChange={(e) => setFormData({ ...formData, esRecurrente: e.target.checked })}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                </label>

                {formData.esRecurrente && (
                  <div className="flex items-center gap-3 pt-1">
                    <label className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                      Día habitual de vencimiento (1-31):
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={formData.diaVencimientoMensual ?? 10}
                      onChange={(e) =>
                        setFormData({ ...formData, diaVencimientoMensual: parseInt(e.target.value, 10) || 10 })
                      }
                      className="w-20 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                  Observaciones
                </label>
                <textarea
                  rows={2}
                  placeholder="Notas adicionales, datos de transferencia, periodo facturado, etc."
                  value={formData.observaciones || ''}
                  onChange={(e) => setFormData({ ...formData, observaciones: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : editingGasto ? 'Guardar Cambios' : 'Registrar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
