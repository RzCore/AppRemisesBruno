'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useDuenioData, DUENIO_CACHE_KEYS } from '@/contexts/DuenioDataContext';
import { choferService, remiseriaService, vehiculoService } from '@/lib/api';
import { Chofer, CreateChoferData, Remiseria, Vehiculo } from '@/types';
import { Truck, Car, Plus, Edit, Trash2, Eye, EyeOff, Search, Filter, ArrowLeft, User, Calendar, Phone, Mail, MapPin, FileText, CheckCircle, XCircle, Clock, ChevronRight, ChevronLeft, ChevronDown, Check, Sparkles, ShieldCheck, ShieldAlert, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import { evaluarDocumentacionClient, getDocumentoBadgeClasses } from '@/lib/documentacionUtils';

export default function ChoferesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { getCached, fetchResource, invalidate } = useDuenioData();

  const [choferes, setChoferes] = useState<Chofer[]>(() => {
    const c = getCached<any>(DUENIO_CACHE_KEYS.CHOFERES, 60_000);
    return c?.data?.success && c.data.data ? c.data.data : [];
  });
  const [remiserias, setRemiserias] = useState<Remiseria[]>(() => {
    const c = getCached<any>(DUENIO_CACHE_KEYS.REMISERIAS_LITE, 120_000);
    return c?.data?.success && c.data.data ? c.data.data : [];
  });
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>(() => {
    const c = getCached<any>(DUENIO_CACHE_KEYS.VEHICULOS, 60_000);
    return c?.data?.success && c.data.data ? c.data.data : [];
  });
  const [loading, setLoading] = useState<boolean>(() => {
    const c = getCached<any>(DUENIO_CACHE_KEYS.CHOFERES, 60_000);
    return !c?.data?.success;
  });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState<number>(1);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editStep, setEditStep] = useState<number>(1);
  const [selectedChofer, setSelectedChofer] = useState<Chofer | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEstado, setFilterEstado] = useState<'all' | 'PENDIENTE_APROBACION' | 'ACTIVO' | 'SUSPENDIDO' | 'RECHAZADO' | 'DADO_DE_BAJA'>('all');

  // Estado para modal de Aprobación y Rechazo
  const [choferParaAprobar, setChoferParaAprobar] = useState<Chofer | null>(null);
  const [choferParaRechazar, setChoferParaRechazar] = useState<Chofer | null>(null);
  const [aprobarComision, setAprobarComision] = useState<number>(30);
  const [aprobarVehiculoId, setAprobarVehiculoId] = useState<string>('');
  const [motivoRechazoInput, setMotivoRechazoInput] = useState<string>('');
  const [actionSubmitting, setActionSubmitting] = useState<boolean>(false);

  // Alta rápida de vehículo inline dentro del wizard de chofer (2-en-1)
  const [vehiculoMode, setVehiculoMode] = useState<'existente' | 'nuevo'>('existente');
  const [mostrarVtosVehiculo, setMostrarVtosVehiculo] = useState<boolean>(false);
  const [savingChofer, setSavingChofer] = useState<boolean>(false);
  const [nuevoVehiculo, setNuevoVehiculo] = useState({
    patente: '',
    marca: '',
    modelo: '',
    anio: String(new Date().getFullYear()),
    color: '',
    propietarioTipo: 'AGENCIA' as 'AGENCIA' | 'CHOFER' | 'TERCERO',
    propietarioNombre: '',
    vtoSeguro: '',
    vtoVtv: '',
    vtoMatafuego: '',
  });

  // Modal de asignación / cambio rápido de auto desde el listado
  const [choferParaAuto, setChoferParaAuto] = useState<Chofer | null>(null);
  const [quickAutoMode, setQuickAutoMode] = useState<'existente' | 'nuevo'>('existente');
  const [quickVehiculoId, setQuickVehiculoId] = useState<string>('');
  const [quickAutoForm, setQuickAutoForm] = useState({
    patente: '',
    marca: '',
    modelo: '',
    anio: String(new Date().getFullYear()),
    color: '',
    propietarioTipo: 'AGENCIA' as 'AGENCIA' | 'CHOFER' | 'TERCERO',
    propietarioNombre: '',
  });
  const [quickAutoSaving, setQuickAutoSaving] = useState<boolean>(false);

  // Formulario de creación/edición
  const [formData, setFormData] = useState<CreateChoferData>({
    numeroChofer: '',
    nombre: '',
    apellido: '',
    dni: '',
    sexo: 'MASCULINO',
    telefono: '',
    email: '',
    direccion: '',
    categoriaLicencia: '',
    vtoLicencia: '',
    remiseriaId: '',
    vehiculoId: '',
    esPropietario: false,
    esFranquero: false,
    aceptaMascotas: false,
    aceptaSillaRuedas: true,
    comisionPorcentaje: 30
  });

  const loadChoferes = useCallback(async (force = false) => {
    const cached = getCached<any>(DUENIO_CACHE_KEYS.CHOFERES, 60_000);
    const hasWarm = Boolean(cached?.data?.success);
    if (hasWarm && !force) {
      setChoferes(cached!.data.data || []);
      setLoading(false);
      if (!cached!.isStale) return;
    }

    try {
      if (!hasWarm && !force) setLoading(true);
      const response = await fetchResource(
        DUENIO_CACHE_KEYS.CHOFERES,
        () => choferService.getAll(),
        { staleTimeMs: 60_000, force }
      );
      if (response.success) {
        setChoferes(response.data || []);
      } else if (!hasWarm) {
        toast.error('Error al cargar choferes');
      }
    } catch (error) {
      console.error('Error loading choferes:', error);
      if (!hasWarm) toast.error('Error al cargar choferes');
    } finally {
      setLoading(false);
    }
  }, [getCached, fetchResource]);

  const loadRemiserias = useCallback(async () => {
    const cached = getCached<any>(DUENIO_CACHE_KEYS.REMISERIAS_LITE, 120_000);
    const hasWarm = Boolean(cached?.data?.success);
    if (hasWarm) {
      setRemiserias(cached!.data.data || []);
      if (!cached!.isStale) return;
    }

    try {
      const response = await fetchResource(
        DUENIO_CACHE_KEYS.REMISERIAS_LITE,
        () => remiseriaService.getAll({ lite: true }),
        { staleTimeMs: 120_000 }
      );
      if (response.success) {
        setRemiserias(response.data || []);
      } else if (!hasWarm) {
        toast.error('Error al cargar remiserías');
      }
    } catch (error) {
      console.error('Error loading remiserias:', error);
      if (!hasWarm) toast.error('Error al cargar remiserías');
    }
  }, [getCached, fetchResource]);

  const loadVehiculos = useCallback(async (force = false) => {
    const cached = getCached<any>(DUENIO_CACHE_KEYS.VEHICULOS, 60_000);
    const hasWarm = Boolean(cached?.data?.success);
    if (hasWarm && !force) {
      setVehiculos(cached!.data.data || []);
      if (!cached!.isStale) return;
    }

    try {
      const response = await fetchResource(
        DUENIO_CACHE_KEYS.VEHICULOS,
        () => vehiculoService.getAll(),
        { staleTimeMs: 60_000, force }
      );
      if (response.success) {
        setVehiculos(response.data || []);
      } else if (!hasWarm) {
        toast.error('Error al cargar vehículos');
      }
    } catch (error) {
      console.error('Error loading vehiculos:', error);
      if (!hasWarm) toast.error('Error al cargar vehículos');
    }
  }, [getCached, fetchResource]);

  useEffect(() => {
    if (!user) {
      router.push('/login');
      return;
    }
    loadChoferes(false);
    loadRemiserias();
    loadVehiculos(false);
  }, [user, router, loadChoferes, loadRemiserias, loadVehiculos]);

  const resetNuevoVehiculo = (esPropietario = false) => {
    setVehiculoMode('existente');
    setMostrarVtosVehiculo(false);
    setNuevoVehiculo({
      patente: '',
      marca: '',
      modelo: '',
      anio: String(new Date().getFullYear()),
      color: '',
      propietarioTipo: esPropietario ? 'CHOFER' : 'AGENCIA',
      propietarioNombre: '',
      vtoSeguro: '',
      vtoVtv: '',
      vtoMatafuego: '',
    });
  };

  const resolverPropietarioTexto = (tipo: 'AGENCIA' | 'CHOFER' | 'TERCERO', nombre: string) => {
    if (tipo === 'AGENCIA') return 'Agencia';
    if (tipo === 'CHOFER') return 'Chofer';
    return nombre.trim() || 'Tercero';
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingChofer) return;

    try {
      setSavingChofer(true);
      let vehiculoIdFinal = formData.vehiculoId || '';
      const remiseriaIdFinal = formData.remiseriaId || remiserias[0]?.id || '';

      // Si el dueño eligió cargar el auto nuevo en el mismo paso, lo creamos primero
      if (vehiculoMode === 'nuevo') {
        const patenteClean = nuevoVehiculo.patente.trim().toUpperCase();
        const marcaClean = nuevoVehiculo.marca.trim();
        const modeloClean = nuevoVehiculo.modelo.trim();
        const colorClean = nuevoVehiculo.color.trim() || 'No especificado';

        if (!patenteClean || !marcaClean || !modeloClean) {
          toast.error('Completá patente, marca y modelo del auto nuevo');
          setSavingChofer(false);
          return;
        }

        const vehRes = await vehiculoService.create({
          patente: patenteClean,
          marca: marcaClean,
          modelo: modeloClean,
          anio: Number(nuevoVehiculo.anio) || new Date().getFullYear(),
          color: colorClean,
          tipo: 'SEDAN',
          capacidad: 4,
          propietario: resolverPropietarioTexto(nuevoVehiculo.propietarioTipo, nuevoVehiculo.propietarioNombre),
          vtoSeguro: nuevoVehiculo.vtoSeguro || undefined,
          vtoVtv: nuevoVehiculo.vtoVtv || undefined,
          vtoMatafuego: nuevoVehiculo.vtoMatafuego || undefined,
          remiseriaId: remiseriaIdFinal,
        });

        if (!vehRes.success || !vehRes.data?.id) {
          toast.error(vehRes.message || 'No se pudo crear el vehículo');
          setSavingChofer(false);
          return;
        }
        vehiculoIdFinal = vehRes.data.id;
      }

      const payload: CreateChoferData = {
        ...formData,
        remiseriaId: remiseriaIdFinal,
        vehiculoId: vehiculoIdFinal || undefined,
      };

      const response = await choferService.create(payload);
      if (response.success) {
        const alertas = (response as any).alertasVencimiento || [];
        const autoMsg = vehiculoMode === 'nuevo' ? ` + Auto ${nuevoVehiculo.patente.trim().toUpperCase()} asignado.` : '';
        if (alertas.length > 0) {
          toast.success(
            `Chofer creado${autoMsg} (Ingresa en choferes.brunoremises.com.ar solo con DNI: ${formData.dni}). Se alertaron ${alertas.length} documento(s) por vencer.`,
            { duration: 6500 }
          );
        } else {
          toast.success(
            `Chofer dado de alta${autoMsg} Ingresa a la App solo con su DNI: ${formData.dni} (sin clave)`,
            { duration: 6000 }
          );
        }
        setShowCreateModal(false);
        resetNuevoVehiculo(false);
        setFormData({
          numeroChofer: '',
          nombre: '',
          apellido: '',
          dni: '',
          telefono: '',
          email: '',
          direccion: '',
          categoriaLicencia: '',
          vtoLicencia: '',
          remiseriaId: '',
          vehiculoId: '',
          esPropietario: false,
          esFranquero: false
        });
        invalidate(['choferes:', 'vehiculos:', 'remiserias:', 'reportes:choferes:']);
        loadChoferes(true);
        loadVehiculos(true);
      } else {
        toast.error(response.message || 'Error al crear chofer');
      }
    } catch (error) {
      console.error('Error creating chofer:', error);
      toast.error('Error al crear chofer');
    } finally {
      setSavingChofer(false);
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChofer || savingChofer) return;

    try {
      setSavingChofer(true);
      let vehiculoIdFinal = formData.vehiculoId || '';
      const remiseriaIdFinal = formData.remiseriaId || selectedChofer.remiseriaId || remiserias[0]?.id || '';

      if (vehiculoMode === 'nuevo') {
        const patenteClean = nuevoVehiculo.patente.trim().toUpperCase();
        const marcaClean = nuevoVehiculo.marca.trim();
        const modeloClean = nuevoVehiculo.modelo.trim();
        const colorClean = nuevoVehiculo.color.trim() || 'No especificado';

        if (!patenteClean || !marcaClean || !modeloClean) {
          toast.error('Completá patente, marca y modelo del auto nuevo');
          setSavingChofer(false);
          return;
        }

        const vehRes = await vehiculoService.create({
          patente: patenteClean,
          marca: marcaClean,
          modelo: modeloClean,
          anio: Number(nuevoVehiculo.anio) || new Date().getFullYear(),
          color: colorClean,
          tipo: 'SEDAN',
          capacidad: 4,
          propietario: resolverPropietarioTexto(nuevoVehiculo.propietarioTipo, nuevoVehiculo.propietarioNombre),
          vtoSeguro: nuevoVehiculo.vtoSeguro || undefined,
          vtoVtv: nuevoVehiculo.vtoVtv || undefined,
          vtoMatafuego: nuevoVehiculo.vtoMatafuego || undefined,
          remiseriaId: remiseriaIdFinal,
        });

        if (!vehRes.success || !vehRes.data?.id) {
          toast.error(vehRes.message || 'No se pudo crear el vehículo');
          setSavingChofer(false);
          return;
        }
        vehiculoIdFinal = vehRes.data.id;
      }

      const updateData = {
        numeroChofer: formData.numeroChofer,
        nombre: formData.nombre,
        apellido: formData.apellido,
        dni: formData.dni,
        sexo: formData.sexo || 'MASCULINO',
        telefono: formData.telefono,
        email: formData.email,
        direccion: formData.direccion,
        categoriaLicencia: formData.categoriaLicencia,
        vtoLicencia: formData.vtoLicencia,
        vehiculoId: vehiculoIdFinal,
        esPropietario: formData.esPropietario,
        esFranquero: Boolean(formData.esFranquero),
        aceptaMascotas: Boolean(formData.aceptaMascotas),
        aceptaSillaRuedas: formData.aceptaSillaRuedas !== false,
        comisionPorcentaje: formData.comisionPorcentaje
      };

      const response = await choferService.update(selectedChofer.id, updateData);
      if (response.success) {
        toast.success(
          vehiculoMode === 'nuevo'
            ? `Chofer actualizado y auto ${nuevoVehiculo.patente.trim().toUpperCase()} asignado`
            : 'Chofer actualizado exitosamente'
        );
        setShowEditModal(false);
        setSelectedChofer(null);
        resetNuevoVehiculo(false);
        setFormData({
          numeroChofer: '',
          nombre: '',
          apellido: '',
          dni: '',
          telefono: '',
          email: '',
          direccion: '',
          categoriaLicencia: '',
          vtoLicencia: '',
          remiseriaId: '',
          vehiculoId: '',
          esPropietario: false,
          esFranquero: false
        });
        invalidate(['choferes:', 'vehiculos:', 'remiserias:', 'reportes:choferes:']);
        loadChoferes(true);
        loadVehiculos(true);
      } else {
        toast.error(response.message || 'Error al actualizar chofer');
      }
    } catch (error) {
      console.error('Error updating chofer:', error);
      toast.error('Error al actualizar chofer');
    } finally {
      setSavingChofer(false);
    }
  };

  const openQuickAutoModal = (chofer: Chofer) => {
    setChoferParaAuto(chofer);
    setQuickVehiculoId(chofer.vehiculoId || '');
    setQuickAutoMode(vehiculos.length === 0 ? 'nuevo' : 'existente');
    setQuickAutoForm({
      patente: '',
      marca: '',
      modelo: '',
      anio: String(new Date().getFullYear()),
      color: '',
      propietarioTipo: chofer.esPropietario ? 'CHOFER' : 'AGENCIA',
      propietarioNombre: '',
    });
  };

  const handleQuickAutoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choferParaAuto || quickAutoSaving) return;

    try {
      setQuickAutoSaving(true);
      let vehiculoIdFinal = quickVehiculoId;

      if (quickAutoMode === 'nuevo') {
        const patenteClean = quickAutoForm.patente.trim().toUpperCase();
        const marcaClean = quickAutoForm.marca.trim();
        const modeloClean = quickAutoForm.modelo.trim();
        const colorClean = quickAutoForm.color.trim() || 'No especificado';

        if (!patenteClean || !marcaClean || !modeloClean) {
          toast.error('Completá patente, marca y modelo');
          setQuickAutoSaving(false);
          return;
        }

        const vehRes = await vehiculoService.create({
          patente: patenteClean,
          marca: marcaClean,
          modelo: modeloClean,
          anio: Number(quickAutoForm.anio) || new Date().getFullYear(),
          color: colorClean,
          tipo: 'SEDAN',
          capacidad: 4,
          propietario: resolverPropietarioTexto(quickAutoForm.propietarioTipo, quickAutoForm.propietarioNombre),
          remiseriaId: choferParaAuto.remiseriaId || remiserias[0]?.id || '',
        });

        if (!vehRes.success || !vehRes.data?.id) {
          toast.error(vehRes.message || 'No se pudo crear el vehículo');
          setQuickAutoSaving(false);
          return;
        }
        vehiculoIdFinal = vehRes.data.id;
      }

      const res = await choferService.update(choferParaAuto.id, {
        vehiculoId: vehiculoIdFinal || '',
      });

      if (res.success) {
        toast.success(
          quickAutoMode === 'nuevo'
            ? `Auto ${quickAutoForm.patente.trim().toUpperCase()} creado y asignado a ${choferParaAuto.nombre}`
            : vehiculoIdFinal
            ? `Auto asignado a ${choferParaAuto.nombre}`
            : `Auto quitado de ${choferParaAuto.nombre}`
        );
        setChoferParaAuto(null);
        invalidate(['choferes:', 'vehiculos:', 'remiserias:', 'reportes:choferes:']);
        loadChoferes(true);
        loadVehiculos(true);
      } else {
        toast.error(res.message || 'Error al asignar vehículo');
      }
    } catch (error) {
      console.error('Error en asignación rápida de auto:', error);
      toast.error('Error al asignar vehículo');
    } finally {
      setQuickAutoSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este chofer?')) return;

    try {
      const response = await choferService.delete(id);
      if (response.success) {
        invalidate(['choferes:', 'vehiculos:', 'remiserias:', 'reportes:choferes:']);
        toast.success('Chofer eliminado exitosamente');
        loadChoferes(true);
      } else {
        toast.error(response.message || 'Error al eliminar chofer');
      }
    } catch (error) {
      console.error('Error deleting chofer:', error);
      toast.error('Error al eliminar chofer');
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const response = await choferService.toggleStatus(id);
      if (response.success) {
        invalidate(['choferes:', 'remiserias:']);
        toast.success(response.message || 'Estado cambiado exitosamente');
        loadChoferes(true);
      } else {
        toast.error(response.message || 'Error al cambiar estado');
      }
    } catch (error) {
      console.error('Error toggling chofer status:', error);
      toast.error('Error al cambiar estado');
    }
  };

  const openEditModal = (chofer: Chofer) => {
    setSelectedChofer(chofer);
    setFormData({
      numeroChofer: chofer.numeroChofer,
      nombre: chofer.nombre,
      apellido: chofer.apellido,
      dni: chofer.dni,
      sexo: chofer.sexo || 'MASCULINO',
      telefono: chofer.telefono,
      email: chofer.email || '',
      direccion: chofer.direccion || '',
      categoriaLicencia: chofer.categoriaLicencia,
      vtoLicencia: chofer.vtoLicencia.split('T')[0], // format date for input type=date
      remiseriaId: chofer.remiseriaId,
      vehiculoId: chofer.vehiculoId || '',
      esPropietario: chofer.esPropietario || false,
      esFranquero: chofer.esFranquero || false,
      aceptaMascotas: Boolean(chofer.aceptaMascotas),
      aceptaSillaRuedas: chofer.aceptaSillaRuedas !== false,
      comisionPorcentaje: chofer.comisionPorcentaje !== undefined ? chofer.comisionPorcentaje : 30
    });
    resetNuevoVehiculo(chofer.esPropietario || false);
    setEditStep(1);
    setShowEditModal(true);
  };

  const openCreateModal = () => {
    const nextNum = (choferes.length + 1).toString().padStart(3, '0');
    setFormData({
      numeroChofer: `CH${nextNum}`,
      nombre: '',
      apellido: '',
      dni: '',
      telefono: '',
      email: '',
      direccion: '',
      categoriaLicencia: 'D1',
      vtoLicencia: '',
      remiseriaId: remiserias[0]?.id || '',
      vehiculoId: '',
      esPropietario: false,
      esFranquero: false,
      comisionPorcentaje: 30
    });
    resetNuevoVehiculo(false);
    setCreateStep(1);
    setShowCreateModal(true);
  };

  const validateChoferStep = (step: number): boolean => {
    if (step === 1) {
      if (!formData.nombre?.trim() || !formData.apellido?.trim() || !formData.dni?.trim() || !formData.numeroChofer?.trim() || !formData.telefono?.trim()) {
        toast.error('Completá nombre, apellido, DNI, número de chofer y teléfono');
        return false;
      }
    } else if (step === 2) {
      if (!formData.categoriaLicencia?.trim() || !formData.vtoLicencia?.trim()) {
        toast.error('Completá la categoría y el vencimiento de la licencia');
        return false;
      }
    } else if (step === 3 && vehiculoMode === 'nuevo') {
      if (!nuevoVehiculo.patente.trim() || !nuevoVehiculo.marca.trim() || !nuevoVehiculo.modelo.trim()) {
        toast.error('Para cargar el auto nuevo completá patente, marca y modelo');
        return false;
      }
      if (nuevoVehiculo.propietarioTipo === 'TERCERO' && !nuevoVehiculo.propietarioNombre.trim()) {
        toast.error('Indicá el nombre del dueño del vehículo');
        return false;
      }
    }
    return true;
  };

  const handleNextStep = () => {
    if (!validateChoferStep(createStep)) return;
    setCreateStep(prev => Math.min(prev + 1, 4));
  };

  const handlePrevStep = () => {
    setCreateStep(prev => Math.max(prev - 1, 1));
  };

  const handleEditNextStep = () => {
    if (!validateChoferStep(editStep)) return;
    setEditStep(prev => Math.min(prev + 1, 4));
  };

  const handleEditPrevStep = () => {
    setEditStep(prev => Math.max(prev - 1, 1));
  };

  // Filtrar choferes
  const filteredChoferes = choferes.filter(chofer => {
    const matchesSearch = 
      chofer.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chofer.apellido.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chofer.numeroChofer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      chofer.dni.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = filterEstado === 'all' || chofer.estado === filterEstado;
    
    return matchesSearch && matchesFilter;
  });

  const handleAprobarChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choferParaAprobar) return;
    setActionSubmitting(true);
    try {
      const res = await choferService.aprobar(choferParaAprobar.id, {
        comisionPorcentaje: Number(aprobarComision),
        vehiculoId: aprobarVehiculoId || undefined,
      });
      if (res.success) {
        const alertas = (res as any).alertasVencimiento || [];
        if (alertas.length > 0) {
          toast.success(
            `Chofer aprobado. Se le notificó en su app sobre ${alertas.length} documento(s) por vencer o vencido(s).`,
            { duration: 5500 }
          );
        } else {
          toast.success(res.message || 'Chofer aprobado exitosamente');
        }
        invalidate(['choferes:', 'vehiculos:', 'remiserias:']);
        setChoferParaAprobar(null);
        await loadChoferes(true);
      } else {
        toast.error(res.message || 'Error al aprobar chofer');
      }
    } catch {
      toast.error('Error al aprobar chofer');
    } finally {
      setActionSubmitting(false);
    }
  };

  const handleRechazarChofer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choferParaRechazar) return;
    setActionSubmitting(true);
    try {
      const res = await choferService.rechazar(choferParaRechazar.id, motivoRechazoInput);
      if (res.success) {
        toast.success('Solicitud rechazada');
        invalidate(['choferes:', 'remiserias:']);
        setChoferParaRechazar(null);
        setMotivoRechazoInput('');
        await loadChoferes(true);
      } else {
        toast.error(res.message || 'Error al rechazar chofer');
      }
    } catch {
      toast.error('Error al rechazar chofer');
    } finally {
      setActionSubmitting(false);
    }
  };

  const getEstadoColor = (estado: string) => {
    switch (estado) {
      case 'ACTIVO':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PENDIENTE_APROBACION':
        return 'bg-amber-50 text-amber-700 border-amber-300 ring-1 ring-amber-300';
      case 'SUSPENDIDO':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'RECHAZADO':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'DADO_DE_BAJA':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEstadoText = (estado: string) => {
    switch (estado) {
      case 'ACTIVO':
        return 'Activo';
      case 'PENDIENTE_APROBACION':
        return '⏳ Pendiente Aprobación';
      case 'SUSPENDIDO':
        return 'Suspendido';
      case 'RECHAZADO':
        return 'Rechazado';
      case 'DADO_DE_BAJA':
        return 'Dado de Baja';
      default:
        return estado;
    }
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Choferes</h2>
          <p className="text-sm text-slate-500">Administrá el alta, documentación y vehículos asignados de tus choferes.</p>
        </div>
        <button
          onClick={openCreateModal}
          className="btn btn-primary shadow-md shadow-primary-500/20"
        >
          <Plus className="w-5 h-5 mr-2" />
          Nuevo Chofer
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, apellido o DNI..."
              className="input pl-10 bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={filterEstado}
            onChange={(e) => setFilterEstado(e.target.value as any)}
            className="input w-full sm:max-w-[220px] bg-white cursor-pointer font-medium text-xs"
          >
            <option value="all">Todos los estados</option>
            <option value="ACTIVO">Activos</option>
            <option value="SUSPENDIDO">Suspendidos</option>
            <option value="DADO_DE_BAJA">Dados de Baja</option>
          </select>
        </div>

        {/* Lista de choferes */}
        {loading ? (
          <div className="text-center py-16">
            <div className="loading-spinner border-primary-500 mx-auto"></div>
            <p className="mt-4 text-slate-500">Cargando choferes...</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {filteredChoferes.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Truck className="w-10 h-10 text-slate-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {searchTerm || filterEstado !== 'all' ? 'No se encontraron choferes' : 'No hay choferes'}
                </h3>
                <p className="text-gray-600">
                  {searchTerm || filterEstado !== 'all' 
                    ? 'Intenta ajustar los filtros de búsqueda' 
                    : 'Comienza creando tu primer chofer'}
                </p>
              </div>
            ) : (
              <>
                {/* VISTA MÓVIL (CARDS TÁCTILES) */}
                <div className="block md:hidden divide-y divide-slate-100">
                  {filteredChoferes.map((chofer) => (
                    <div key={chofer.id} className="p-4 space-y-3 bg-white hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-2xl bg-primary-100 text-primary-700 font-bold text-base flex items-center justify-center shrink-0 shadow-xs">
                            {chofer.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h4 className="font-bold text-slate-900 text-base leading-tight truncate flex items-center gap-1.5">
                              <span className="truncate">{chofer.nombre} {chofer.apellido}</span>
                              {chofer.esFranquero && (
                                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                  Franquero
                                </span>
                              )}
                              <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded-md border shrink-0 ${
                                chofer.sexo === 'FEMENINO'
                                  ? 'bg-pink-50 text-pink-700 border-pink-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}>
                                {chofer.sexo === 'FEMENINO' ? '♀ Femenino' : '♂ Masculino'}
                              </span>
                              {chofer.aceptaMascotas && (
                                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0" title="Acepta traslado con mascotas">
                                  🐾 Mascotas
                                </span>
                              )}
                              {chofer.aceptaSillaRuedas !== false && (
                                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0" title="Acepta silla de ruedas">
                                  ♿ Silla ruedas
                                </span>
                              )}
                            </h4>
                            <p className="text-xs text-slate-500 mt-0.5">
                              #{chofer.numeroChofer} • DNI: {chofer.dni}
                            </p>
                          </div>
                        </div>
                        <span className={`inline-flex px-2.5 py-1 text-[11px] font-semibold rounded-full border shrink-0 ${getEstadoColor(chofer.estado)}`}>
                          {getEstadoText(chofer.estado)}
                        </span>
                      </div>

                      {/* Datos de contacto y auto */}
                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 font-medium block">Contacto</span>
                          <a href={`tel:${chofer.telefono}`} className="font-semibold text-primary-600 flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3" />
                            {chofer.telefono}
                          </a>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-medium block">Vehículo Asignado</span>
                          <div className="flex items-center justify-between gap-1 mt-0.5">
                            <span className="font-semibold text-slate-800 truncate">
                              {chofer.vehiculo ? `${chofer.vehiculo.patente} (${chofer.vehiculo.modelo})` : 'Sin asignar'}
                            </span>
                            {chofer.estado !== 'PENDIENTE_APROBACION' && (
                              <button
                                type="button"
                                onClick={() => openQuickAutoModal(chofer)}
                                className="text-[10px] font-bold text-primary-600 hover:text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded-md shrink-0"
                              >
                                {chofer.vehiculo ? 'Cambiar' : '+ Auto'}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="col-span-2 pt-1 border-t border-slate-200/50 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-medium">
                            Modalidad
                          </span>
                          {chofer.esPropietario ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 shrink-0">
                              Auto Propio (80%)
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-700 shrink-0" title={chofer.vehiculo?.propietario ? `Titular del coche: ${chofer.vehiculo.propietario}` : undefined}>
                              Auto Agencia ({chofer.comisionPorcentaje || 30}%)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Botones de acción táctiles */}
                      <div className="pt-1">
                        {chofer.estado === 'PENDIENTE_APROBACION' ? (
                          <div className="grid grid-cols-2 gap-2 w-full">
                            <button
                              onClick={() => {
                                setChoferParaAprobar(chofer);
                                setAprobarComision(chofer.comisionPorcentaje || 30);
                                setAprobarVehiculoId(chofer.vehiculoId || '');
                              }}
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-emerald-600 text-white rounded-xl text-xs font-bold shadow-xs active:scale-95 transition-all"
                            >
                              <CheckCircle className="w-4 h-4" />
                              Aprobar
                            </button>
                            <button
                              onClick={() => {
                                setChoferParaRechazar(chofer);
                                setMotivoRechazoInput('');
                              }}
                              className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold active:scale-95 transition-all"
                            >
                              <XCircle className="w-4 h-4" />
                              Rechazar
                            </button>
                          </div>
                        ) : (
                          <div className="grid grid-cols-3 gap-2 w-full">
                            <button
                              onClick={() => openEditModal(chofer)}
                              className="flex items-center justify-center gap-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all active:scale-95"
                            >
                              <Edit className="w-3.5 h-3.5" />
                              Editar
                            </button>
                            <button
                              onClick={() => handleToggleStatus(chofer.id)}
                              className="flex items-center justify-center gap-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-all active:scale-95"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Estado
                            </button>
                            <button
                              onClick={() => handleDelete(chofer.id)}
                              className="flex items-center justify-center gap-1 py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold transition-all active:scale-95"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              Borrar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* VISTA ESCRITORIO (TABLA) */}
                <div className="hidden md:block">
                  <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Chofer</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Contacto</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Vehículo Asignado</th>
                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {filteredChoferes.map((chofer) => (
                    <tr key={chofer.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                            {chofer.nombre.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{chofer.nombre} {chofer.apellido}</span>
                              {chofer.esFranquero && (
                                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-amber-100 text-amber-800 border border-amber-200">
                                  Franquero
                                </span>
                              )}
                              <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded-md border ${
                                chofer.sexo === 'FEMENINO'
                                  ? 'bg-pink-50 text-pink-700 border-pink-200'
                                  : 'bg-sky-50 text-sky-700 border-sky-200'
                              }`}>
                                {chofer.sexo === 'FEMENINO' ? '♀ Femenino' : '♂ Masculino'}
                              </span>
                              {chofer.aceptaMascotas && (
                                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200" title="Acepta mascotas">
                                  🐾
                                </span>
                              )}
                              {chofer.aceptaSillaRuedas !== false && (
                                <span className="inline-flex px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200" title="Acepta silla de ruedas">
                                  ♿
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              #{chofer.numeroChofer} • DNI: {chofer.dni}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-700">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Phone className="w-3.5 h-3.5 text-slate-400" />
                            {chofer.telefono}
                          </div>
                          {chofer.email && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              {chofer.email}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-slate-700">
                          {chofer.esPropietario ? (
                            <span className="inline-flex px-2.5 py-1 text-xs font-bold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Auto Propio (80%)
                            </span>
                          ) : (
                            <span className="inline-flex px-2.5 py-1 text-xs font-bold rounded-md bg-blue-50 text-blue-700 border border-blue-200" title={chofer.vehiculo?.propietario ? `Titular del coche: ${chofer.vehiculo.propietario}` : undefined}>
                              Auto Agencia ({chofer.comisionPorcentaje || 30}%)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-slate-700">
                          {chofer.vehiculo ? (
                            <div>
                              <div className="font-semibold">{chofer.vehiculo.patente}</div>
                              <div className="text-slate-500 text-xs">
                                {chofer.vehiculo.marca} {chofer.vehiculo.modelo}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Sin asignar</span>
                          )}
                          {chofer.estado !== 'PENDIENTE_APROBACION' && (
                            <button
                              type="button"
                              onClick={() => openQuickAutoModal(chofer)}
                              className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 bg-primary-50 hover:bg-primary-100 px-2 py-1 rounded-lg transition-colors"
                              title={chofer.vehiculo ? 'Cambiar o cargar auto' : 'Asignar o cargar auto'}
                            >
                              {chofer.vehiculo ? 'Cambiar' : '+ Asignar'}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full border ${getEstadoColor(chofer.estado)}`}>
                          {getEstadoText(chofer.estado)}
                        </span>
                      </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {chofer.estado === 'PENDIENTE_APROBACION' ? (
                            <div className="flex justify-end items-center space-x-2">
                              <button
                                onClick={() => {
                                  setChoferParaAprobar(chofer);
                                  setAprobarComision(chofer.comisionPorcentaje || 30);
                                  setAprobarVehiculoId(chofer.vehiculoId || '');
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                                title="Aprobar Solicitud"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Aprobar
                              </button>
                              <button
                                onClick={() => {
                                  setChoferParaRechazar(chofer);
                                  setMotivoRechazoInput('');
                                }}
                                className="inline-flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                                title="Rechazar Solicitud"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Rechazar
                              </button>
                            </div>
                          ) : (
                            <div className="flex justify-end space-x-2">
                              <button
                                onClick={() => handleToggleStatus(chofer.id)}
                                className="text-blue-600 hover:text-blue-900"
                                title="Cambiar estado"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => openEditModal(chofer)}
                                className="text-indigo-600 hover:text-indigo-900"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(chofer.id)}
                                className="text-red-600 hover:text-red-900"
                                title="Eliminar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          </div>
        )}
      </div>

      {/* Modal de Creación / Edición por Pasos (Wizard Stepper) */}
      {(() => {
        const isEdit = showEditModal && !!selectedChofer;
        const isOpen = showCreateModal || isEdit;
        if (!isOpen) return null;

        const currentStep = isEdit ? editStep : createStep;
        const closeModal = () => {
          if (isEdit) {
            setShowEditModal(false);
            setSelectedChofer(null);
          } else {
            setShowCreateModal(false);
          }
        };
        const onNext = isEdit ? handleEditNextStep : handleNextStep;
        const onPrev = isEdit ? handleEditPrevStep : handlePrevStep;
        const onSubmit = isEdit ? handleEdit : handleCreate;

        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs overflow-y-auto h-full w-full z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
            <div className="relative bg-white w-full max-w-xl rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">

              {/* Header del Modal */}
              <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-primary-600 bg-primary-50 px-2 py-0.5 rounded-md">
                      Paso {currentStep} de 4
                    </span>
                    <span className="text-xs font-semibold text-slate-400">
                      {currentStep === 1 && '• Identificación'}
                      {currentStep === 2 && '• Documentación'}
                      {currentStep === 3 && '• Modalidad y Auto'}
                      {currentStep === 4 && '• Confirmación'}
                    </span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-bold text-slate-900 mt-1">
                    {isEdit ? 'Editar Chofer' : 'Alta de Chofer'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="w-9 h-9 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors"
                >
                  ✕
                </button>
              </div>

              {/* Stepper visual interactivo */}
              <div className="px-4 sm:px-6 pt-3 pb-2 bg-slate-50/70 border-b border-slate-100">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 sm:gap-2">
                  {[
                    { step: 1, label: 'Personal', icon: User },
                    { step: 2, label: 'Licencia', icon: FileText },
                    { step: 3, label: 'Modalidad', icon: Truck },
                    { step: 4, label: 'Resumen', icon: CheckCircle }
                  ].map((s) => {
                    const isCompleted = currentStep > s.step;
                    const isCurrent = currentStep === s.step;
                    return (
                      <button
                        type="button"
                        key={s.step}
                        onClick={() => {
                          if (!isEdit) return;
                          if (s.step <= currentStep || validateChoferStep(currentStep)) {
                            setEditStep(s.step);
                          }
                        }}
                        className={`flex flex-col items-center text-center pb-1 border-b-2 transition-all ${
                          isEdit ? 'cursor-pointer hover:opacity-80' : 'cursor-default'
                        } ${
                          isCurrent
                            ? 'border-primary-600 text-primary-600 font-bold'
                            : isCompleted
                            ? 'border-emerald-500 text-emerald-600 font-semibold'
                            : 'border-transparent text-slate-400 font-medium'
                        }`}
                      >
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs mb-1 transition-all ${
                            isCurrent
                              ? 'bg-primary-600 text-white shadow-xs'
                              : isCompleted
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {isCompleted ? <Check className="w-3.5 h-3.5" /> : s.step}
                        </div>
                        <span className="text-[10px] hidden sm:inline">{s.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Cuerpo del Formulario según Paso Activo */}
              <form onSubmit={onSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">

                {/* PASO 1: DATOS PERSONALES */}
                {currentStep === 1 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          N° de Chofer *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.numeroChofer}
                          onChange={(e) => setFormData({ ...formData, numeroChofer: e.target.value.toUpperCase() })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold uppercase focus:ring-2 focus:ring-primary-500"
                          placeholder="ej. CH001"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          DNI *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.dni}
                          onChange={(e) => setFormData({ ...formData, dni: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary-500"
                          placeholder="Sin puntos"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Sexo del Chofer *
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, sexo: 'MASCULINO' })}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            (formData.sexo || 'MASCULINO') === 'MASCULINO'
                              ? 'bg-sky-50 border-sky-500 text-sky-800 ring-2 ring-sky-200'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>♂</span> Masculino
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, sexo: 'FEMENINO' })}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            formData.sexo === 'FEMENINO'
                              ? 'bg-pink-50 border-pink-500 text-pink-800 ring-2 ring-pink-200'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>♀</span> Femenino
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={Boolean(formData.aceptaMascotas)}
                          onChange={(e) => setFormData({ ...formData, aceptaMascotas: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-800 block">🐾 Acepta mascotas</span>
                          <span className="text-[10px] text-slate-500 block">Recibe viajes con animales</span>
                        </div>
                      </label>
                      <label className="flex items-center gap-2.5 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer hover:bg-slate-50 transition-colors">
                        <input
                          type="checkbox"
                          checked={formData.aceptaSillaRuedas !== false}
                          onChange={(e) => setFormData({ ...formData, aceptaSillaRuedas: e.target.checked })}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="text-xs">
                          <span className="font-bold text-slate-800 block">♿ Acepta silla de ruedas</span>
                          <span className="text-[10px] text-slate-500 block">Espacio / baúl apto</span>
                        </div>
                      </label>
                    </div>

                    <label className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 bg-amber-50/70 cursor-pointer hover:bg-amber-50 transition-colors">
                      <input
                        type="checkbox"
                        checked={Boolean(formData.esFranquero)}
                        onChange={(e) => setFormData({ ...formData, esFranquero: e.target.checked })}
                        className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600 focus:ring-amber-500"
                      />
                      <div className="text-xs">
                        <span className="font-bold text-amber-950 block">
                          Es chofer franquero / relevo
                        </span>
                        <span className="text-[11px] text-amber-800 block mt-0.5">
                          Puede compartir el mismo N° de móvil y vehículo con otro chofer. Al conectarse, si el otro chofer quedó online sin viaje activo se desconecta automáticamente.
                        </span>
                      </div>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Nombre *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.nombre}
                          onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm uppercase focus:ring-2 focus:ring-primary-500"
                          placeholder="Nombre completo"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Apellido *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.apellido}
                          onChange={(e) => setFormData({ ...formData, apellido: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm uppercase focus:ring-2 focus:ring-primary-500"
                          placeholder="Apellido"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Teléfono / WhatsApp *
                      </label>
                      <input
                        type="tel"
                        required
                        value={formData.telefono}
                        onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary-500"
                        placeholder="ej. 11 1234-5678"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Email (opcional)
                        </label>
                        <input
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary-500"
                          placeholder="chofer@email.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          Domicilio (opcional)
                        </label>
                        <input
                          type="text"
                          value={formData.direccion}
                          onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
                          className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm uppercase focus:ring-2 focus:ring-primary-500"
                          placeholder="Calle y N°"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* PASO 2: LICENCIA Y HABILITACIÓN */}
                {currentStep === 2 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
                    <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-2xl flex items-center gap-3">
                      <ShieldCheck className="w-6 h-6 text-blue-600 shrink-0" />
                      <p className="text-xs text-blue-800">
                        Verificá que la licencia profesional esté vigente antes de habilitar los viajes del chofer.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        Categoría de Licencia *
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {['D1', 'D2', 'B1', 'B2'].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setFormData({ ...formData, categoriaLicencia: cat })}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                              formData.categoriaLicencia === cat
                                ? 'bg-primary-600 text-white border-primary-600 shadow-xs'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            Cat. {cat}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.categoriaLicencia}
                        onChange={(e) => setFormData({ ...formData, categoriaLicencia: e.target.value.toUpperCase() })}
                        placeholder="O ingresá otra categoría (ej. D1)"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm uppercase font-semibold focus:ring-2 focus:ring-primary-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Fecha de Vencimiento de la Licencia *
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.vtoLicencia}
                        onChange={(e) => setFormData({ ...formData, vtoLicencia: e.target.value })}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                )}

                {/* PASO 3: MODALIDAD Y VEHÍCULO ASIGNADO */}
                {currentStep === 3 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Categoría del Chofer y Comisión
                      </label>
                      <div className="space-y-2.5">
                        <div
                          onClick={() => {
                            setFormData({ ...formData, esPropietario: false, comisionPorcentaje: 30 });
                            setNuevoVehiculo((prev) => ({
                              ...prev,
                              propietarioTipo: prev.propietarioTipo === 'CHOFER' ? 'AGENCIA' : prev.propietarioTipo,
                            }));
                          }}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            formData.esPropietario === false
                              ? 'bg-blue-50/50 border-blue-600 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">🚗</span>
                              <div>
                                <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                                  Chofer con Vehículo de la Remisería
                                </span>
                                <span className="text-[11px] text-slate-500 block mt-0.5">
                                  Conduce un coche asignado (de la remisería o de una persona externa).
                                </span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 text-[10px] font-black shrink-0">
                              Auto Agencia (30%)
                            </span>
                          </div>
                        </div>

                        <div
                          onClick={() => {
                            setFormData({ ...formData, esPropietario: true, comisionPorcentaje: 80 });
                            setNuevoVehiculo((prev) => ({
                              ...prev,
                              propietarioTipo: 'CHOFER',
                            }));
                          }}
                          className={`p-3.5 rounded-2xl border-2 cursor-pointer transition-all ${
                            formData.esPropietario === true
                              ? 'bg-emerald-50/50 border-emerald-600 shadow-xs'
                              : 'bg-white border-slate-200 hover:border-slate-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">👤</span>
                              <div>
                                <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                                  Chofer Propietario (Auto Propio)
                                </span>
                                <span className="text-[11px] text-slate-500 block mt-0.5">
                                  Es dueño de su vehículo. Paga el 20% a la remisería y retiene el 80%.
                                </span>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black shrink-0">
                              Auto Propio (80%)
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Selector de Vehículo: Existente o Cargar Nuevo en el Acto */}
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                          Vehículo del Chofer
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setVehiculoMode('existente')}
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            vehiculoMode === 'existente'
                              ? 'bg-white text-primary-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Car className="w-3.5 h-3.5" />
                          Auto existente ({vehiculos.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setVehiculoMode('nuevo')}
                          className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
                            vehiculoMode === 'nuevo'
                              ? 'bg-white text-emerald-700 shadow-xs'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Cargar auto nuevo
                        </button>
                      </div>

                      {vehiculoMode === 'existente' ? (
                        <div>
                          <select
                            value={formData.vehiculoId}
                            onChange={(e) => setFormData({ ...formData, vehiculoId: e.target.value })}
                            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="">Sin asignar por el momento</option>
                            {vehiculos.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.patente} • {v.marca} {v.modelo} ({v.propietario === 'Agencia' ? '🏢 Agencia' : v.propietario === 'Chofer' ? '👤 Chofer' : `🚗 Dueño: ${v.propietario}`})
                              </option>
                            ))}
                          </select>
                          {vehiculos.length === 0 && (
                            <p className="text-[11px] text-amber-600 mt-1.5">
                              Todavía no hay autos cargados. Tocá <strong>&quot;+ Cargar auto nuevo&quot;</strong> arriba para darlo de alta acá mismo.
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
                          <div className="grid grid-cols-2 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Patente *
                              </label>
                              <input
                                type="text"
                                value={nuevoVehiculo.patente}
                                onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, patente: e.target.value.toUpperCase() })}
                                placeholder="ej. AB123CD"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm font-bold uppercase focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Color
                              </label>
                              <input
                                type="text"
                                value={nuevoVehiculo.color}
                                onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, color: e.target.value })}
                                placeholder="ej. Blanco"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-2.5">
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Marca *
                              </label>
                              <input
                                type="text"
                                value={nuevoVehiculo.marca}
                                onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, marca: e.target.value })}
                                placeholder="ej. Fiat"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Modelo *
                              </label>
                              <input
                                type="text"
                                value={nuevoVehiculo.modelo}
                                onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, modelo: e.target.value })}
                                placeholder="ej. Cronos"
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                                Año
                              </label>
                              <input
                                type="tel"
                                inputMode="numeric"
                                maxLength={4}
                                value={nuevoVehiculo.anio}
                                onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, anio: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                                placeholder={String(new Date().getFullYear())}
                                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary-500"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Titular del Auto
                            </label>
                            <div className="grid grid-cols-3 gap-1.5">
                              {([
                                { id: 'AGENCIA', label: 'Agencia' },
                                { id: 'CHOFER', label: 'Chofer' },
                                { id: 'TERCERO', label: 'Otro dueño' },
                              ] as const).map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => setNuevoVehiculo({ ...nuevoVehiculo, propietarioTipo: opt.id })}
                                  className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border transition-all ${
                                    nuevoVehiculo.propietarioTipo === opt.id
                                      ? 'bg-primary-600 text-white border-primary-600'
                                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              ))}
                            </div>
                            {nuevoVehiculo.propietarioTipo === 'TERCERO' && (
                              <input
                                type="text"
                                value={nuevoVehiculo.propietarioNombre}
                                onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, propietarioNombre: e.target.value })}
                                placeholder="Nombre del dueño del auto"
                                className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-primary-500"
                              />
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setMostrarVtosVehiculo(!mostrarVtosVehiculo)}
                            className="w-full flex items-center justify-between text-[11px] font-semibold text-slate-500 hover:text-slate-700 pt-1"
                          >
                            <span>Cargar vencimientos ahora (Seguro / VTV / Matafuego) — opcional</span>
                            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${mostrarVtosVehiculo ? 'rotate-180' : ''}`} />
                          </button>

                          {mostrarVtosVehiculo && (
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Vto. Seguro</label>
                                <input
                                  type="date"
                                  value={nuevoVehiculo.vtoSeguro}
                                  onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, vtoSeguro: e.target.value })}
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Vto. VTV</label>
                                <input
                                  type="date"
                                  value={nuevoVehiculo.vtoVtv}
                                  onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, vtoVtv: e.target.value })}
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                                />
                              </div>
                              <div>
                                <label className="block text-[10px] font-semibold text-slate-500 mb-0.5">Vto. Matafuego</label>
                                <input
                                  type="date"
                                  value={nuevoVehiculo.vtoMatafuego}
                                  onChange={(e) => setNuevoVehiculo({ ...nuevoVehiculo, vtoMatafuego: e.target.value })}
                                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/60 flex items-center justify-between text-xs">
                      <span className="text-slate-500">Base Asignada:</span>
                      <strong className="text-slate-800 font-bold">{remiserias[0]?.nombreFantasia || 'Remises Bruno'}</strong>
                    </div>
                  </div>
                )}

                {/* PASO 4: REVISIÓN Y CONFIRMACIÓN */}
                {currentStep === 4 && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-right-3 duration-200">
                    <div className="p-4 bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-bold">Ficha del Chofer</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/20 text-white">
                          #{formData.numeroChofer}
                        </span>
                      </div>
                      <p className="text-lg font-black text-white">
                        {formData.nombre} {formData.apellido}
                      </p>
                      <p className="text-xs text-slate-300">
                        DNI: {formData.dni} • Cel: {formData.telefono}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Licencia</span>
                        <span className="font-bold text-slate-800 block mt-0.5">Cat. {formData.categoriaLicencia}</span>
                        <span className="text-[11px] text-slate-500">Vence: {formData.vtoLicencia}</span>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70">
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Modalidad</span>
                        <span className="font-bold text-slate-800 block mt-0.5">
                          {formData.esPropietario ? 'Auto Propio (80%)' : 'Auto Agencia (30%)'}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {formData.esPropietario ? 'Comisión base 20%' : 'Se lleva el 30% diario'}
                        </span>
                      </div>
                    </div>

                    {!isEdit && (
                      <div className="p-3 bg-emerald-50/80 rounded-xl border border-emerald-200 text-xs space-y-1">
                        <span className="text-[10px] text-emerald-700 font-bold uppercase block">
                          Acceso a la App del Chofer (choferes.brunoremises.com.ar)
                        </span>
                        <div className="text-slate-700">
                          Ingresá únicamente con su DNI:{' '}
                          <strong className="font-mono text-slate-900">{formData.dni || '—'}</strong>{' '}
                          <span className="text-emerald-700 font-semibold">(sin contraseña)</span>
                        </div>
                      </div>
                    )}

                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/70 text-xs">
                      <span className="text-[10px] text-slate-400 font-bold uppercase block">Vehículo Asignado</span>
                      <span className="font-semibold text-slate-800 block mt-0.5">
                        {vehiculoMode === 'nuevo'
                          ? `🆕 Auto nuevo a crear: ${nuevoVehiculo.patente.toUpperCase()} • ${nuevoVehiculo.marca} ${nuevoVehiculo.modelo} (${nuevoVehiculo.anio || new Date().getFullYear()}${nuevoVehiculo.color ? `, ${nuevoVehiculo.color}` : ''}) — Titular: ${resolverPropietarioTexto(nuevoVehiculo.propietarioTipo, nuevoVehiculo.propietarioNombre)}`
                          : formData.vehiculoId
                          ? (() => {
                              const veh = vehiculos.find((v) => v.id === formData.vehiculoId);
                              return veh ? `${veh.patente} • ${veh.marca} ${veh.modelo} (Titular: ${veh.propietario})` : 'Vehículo seleccionado';
                            })()
                          : 'Sin auto asignado (se puede asignar luego)'}
                      </span>
                    </div>

                    {/* Resumen de Documentación del Chofer + Vehículo */}
                    {formData.vehiculoId && (() => {
                      const veh = vehiculos.find((v) => v.id === formData.vehiculoId);
                      const evalDoc = evaluarDocumentacionClient(formData, veh);
                      return (
                        <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <ShieldAlert className={`w-4 h-4 ${evalDoc.tieneAlertas ? 'text-amber-500' : 'text-emerald-500'}`} />
                              <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                                Control de Vencimientos
                              </span>
                            </div>
                            {evalDoc.tieneAlertas && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                                {evalDoc.cantidadAlertas} por vencer/vencido(s)
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                            <div>🛡️ Seguro: <strong>{veh?.vtoSeguro ? new Date(veh.vtoSeguro).toLocaleDateString() : 'Sin cargar'}</strong></div>
                            <div>📋 VTV: <strong>{veh?.vtoVtv ? new Date(veh.vtoVtv).toLocaleDateString() : 'Sin cargar'}</strong></div>
                            <div>🧯 Matafuego: <strong>{veh?.vtoMatafuego ? new Date(veh.vtoMatafuego).toLocaleDateString() : 'Sin cargar'}</strong></div>
                            <div>🪪 Carnet: <strong>{formData.vtoLicencia || 'Sin cargar'}</strong></div>
                          </div>
                          {evalDoc.tieneAlertas && (
                            <p className="text-[10px] text-amber-700 pt-1 border-t border-slate-200">
                              🔔 Al {isEdit ? 'guardar los cambios' : 'crear el chofer'}, recibirá una alerta automática en su app sobre estos vencimientos.
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Botones de Navegación del Modal */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  {currentStep > 1 ? (
                    <button
                      type="button"
                      onClick={onPrev}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Atrás
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2.5 rounded-xl text-slate-500 hover:bg-slate-100 text-xs font-semibold transition-all"
                    >
                      Cancelar
                    </button>
                  )}

                  {currentStep < 4 ? (
                    <button
                      type="button"
                      onClick={onNext}
                      className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold shadow-md shadow-primary-500/20 active:scale-95 transition-all ml-auto"
                    >
                      Siguiente
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={savingChofer}
                      className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-600/20 active:scale-95 transition-all ml-auto disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      {savingChofer
                        ? 'Guardando...'
                        : isEdit
                        ? vehiculoMode === 'nuevo'
                          ? 'Crear Auto y Actualizar Chofer'
                          : 'Confirmar y Actualizar Chofer'
                        : vehiculoMode === 'nuevo'
                        ? 'Crear Chofer y Auto'
                        : 'Confirmar y Crear Chofer'}
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        );
      })()}
      {/* Modal de Aprobación de Chofer */}
      {choferParaAprobar && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative mx-auto p-6 border w-full max-w-lg shadow-xl rounded-2xl bg-white animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Aprobar Chofer</h3>
                  <p className="text-xs text-gray-500">
                    {choferParaAprobar.nombre} {choferParaAprobar.apellido} ({choferParaAprobar.numeroChofer})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChoferParaAprobar(null)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAprobarChofer} className="mt-4 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-xs space-y-1">
                <div className="text-slate-500"><span className="font-semibold text-slate-700">DNI:</span> {choferParaAprobar.dni}</div>
                <div className="text-slate-500"><span className="font-semibold text-slate-700">Teléfono:</span> {choferParaAprobar.telefono}</div>
                <div className="text-slate-500"><span className="font-semibold text-slate-700">Licencia:</span> {choferParaAprobar.categoriaLicencia} (Vence: {new Date(choferParaAprobar.vtoLicencia).toLocaleDateString()})</div>
                <div className="text-slate-500"><span className="font-semibold text-slate-700">Tipo:</span> {choferParaAprobar.esPropietario ? 'Propietario de auto propio' : 'Chofer de flota (Asignado)'}</div>
              </div>

              {!choferParaAprobar.esPropietario && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">
                    Comisión de Chofer Asignado (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      required
                      value={aprobarComision}
                      onChange={(e) => setAprobarComision(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                    />
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400 text-sm">
                      %
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Porcentaje que le corresponde al chofer por viaje.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Vehículo Asignado {choferParaAprobar.esPropietario ? '(Opcional o auto propio)' : '(Opcional, puede asignarse luego)'}
                </label>
                <select
                  value={aprobarVehiculoId}
                  onChange={(e) => setAprobarVehiculoId(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                >
                  <option value="">Sin asignar por ahora</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.patente} - {v.marca} {v.modelo} ({v.anio})
                    </option>
                  ))}
                </select>
              </div>

              {/* Control de Documentación del vehículo seleccionado al aprobar */}
              {aprobarVehiculoId && (() => {
                const veh = vehiculos.find((v) => v.id === aprobarVehiculoId);
                const evalDoc = evaluarDocumentacionClient(choferParaAprobar, veh);
                return (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800 text-[11px] uppercase tracking-wide">
                        Control de Documentación
                      </span>
                      {evalDoc.tieneAlertas ? (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                          {evalDoc.cantidadAlertas} por vencer/vencido(s)
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          Al día
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <div>🛡️ Seguro: <strong>{veh?.vtoSeguro ? new Date(veh.vtoSeguro).toLocaleDateString() : 'Sin cargar'}</strong></div>
                      <div>📋 VTV: <strong>{veh?.vtoVtv ? new Date(veh.vtoVtv).toLocaleDateString() : 'Sin cargar'}</strong></div>
                      <div>🧯 Matafuego: <strong>{veh?.vtoMatafuego ? new Date(veh.vtoMatafuego).toLocaleDateString() : 'Sin cargar'}</strong></div>
                      <div>🪪 Carnet: <strong>{choferParaAprobar?.vtoLicencia ? new Date(choferParaAprobar.vtoLicencia).toLocaleDateString() : 'Sin cargar'}</strong></div>
                    </div>
                    {evalDoc.tieneAlertas && (
                      <p className="text-[10px] text-amber-700 pt-1 border-t border-slate-200">
                        🔔 Al aprobar, el chofer recibirá una notificación automática en su aplicación informándole sobre los vencimientos.
                      </p>
                    )}
                  </div>
                );
              })()}

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setChoferParaAprobar(null)}
                  disabled={actionSubmitting}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionSubmitting}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                >
                  <CheckCircle className="w-4 h-4" />
                  {actionSubmitting ? 'Aprobando...' : 'Confirmar Aprobación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Rechazo de Chofer */}
      {choferParaRechazar && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs overflow-y-auto h-full w-full z-50 flex items-center justify-center p-4">
          <div className="relative mx-auto p-6 border w-full max-w-md shadow-xl rounded-2xl bg-white animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center">
                  <XCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Rechazar Solicitud</h3>
                  <p className="text-xs text-gray-500">
                    {choferParaRechazar.nombre} {choferParaRechazar.apellido}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setChoferParaRechazar(null)}
                className="text-gray-400 hover:text-gray-600 rounded-lg p-1 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRechazarChofer} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">
                  Motivo del Rechazo (Opcional)
                </label>
                <textarea
                  rows={3}
                  value={motivoRechazoInput}
                  onChange={(e) => setMotivoRechazoInput(e.target.value)}
                  placeholder="Ej: Licencia vencida, documentación ilegible, cupo completo..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-transparent text-sm resize-none"
                />
                <p className="text-xs text-gray-500 mt-1">El chofer podrá ver este motivo al intentar ingresar a la aplicación.</p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setChoferParaRechazar(null)}
                  disabled={actionSubmitting}
                  className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionSubmitting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
                >
                  <XCircle className="w-4 h-4" />
                  {actionSubmitting ? 'Rechazando...' : 'Confirmar Rechazo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Asignación / Carga Rápida de Auto */}
      {choferParaAuto && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs overflow-y-auto h-full w-full z-50 flex items-center justify-center p-3 sm:p-4 animate-in fade-in">
          <div className="relative bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-100 overflow-hidden">
            <div className="p-5 pb-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center shrink-0">
                  <Car className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-slate-900 truncate">
                    Vehículo para {choferParaAuto.nombre}
                  </h3>
                  <p className="text-xs text-slate-500 truncate">
                    #{choferParaAuto.numeroChofer} • {choferParaAuto.vehiculo ? `Actual: ${choferParaAuto.vehiculo.patente}` : 'Sin auto asignado'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setChoferParaAuto(null)}
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleQuickAutoSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                <button
                  type="button"
                  onClick={() => setQuickAutoMode('existente')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    quickAutoMode === 'existente'
                      ? 'bg-white text-primary-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Auto existente ({vehiculos.length})
                </button>
                <button
                  type="button"
                  onClick={() => setQuickAutoMode('nuevo')}
                  className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                    quickAutoMode === 'nuevo'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Cargar auto nuevo
                </button>
              </div>

              {quickAutoMode === 'existente' ? (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Seleccioná el vehículo
                  </label>
                  <select
                    value={quickVehiculoId}
                    onChange={(e) => setQuickVehiculoId(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Sin vehículo asignado</option>
                    {vehiculos.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.patente} • {v.marca} {v.modelo} ({v.propietario})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Patente *</label>
                      <input
                        type="text"
                        required
                        value={quickAutoForm.patente}
                        onChange={(e) => setQuickAutoForm({ ...quickAutoForm, patente: e.target.value.toUpperCase() })}
                        placeholder="ej. AB123CD"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-bold uppercase focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Color</label>
                      <input
                        type="text"
                        value={quickAutoForm.color}
                        onChange={(e) => setQuickAutoForm({ ...quickAutoForm, color: e.target.value })}
                        placeholder="ej. Blanco"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Marca *</label>
                      <input
                        type="text"
                        required
                        value={quickAutoForm.marca}
                        onChange={(e) => setQuickAutoForm({ ...quickAutoForm, marca: e.target.value })}
                        placeholder="Fiat"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Modelo *</label>
                      <input
                        type="text"
                        required
                        value={quickAutoForm.modelo}
                        onChange={(e) => setQuickAutoForm({ ...quickAutoForm, modelo: e.target.value })}
                        placeholder="Cronos"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Año</label>
                      <input
                        type="tel"
                        inputMode="numeric"
                        maxLength={4}
                        value={quickAutoForm.anio}
                        onChange={(e) => setQuickAutoForm({ ...quickAutoForm, anio: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                        placeholder={String(new Date().getFullYear())}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Titular</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { id: 'AGENCIA', label: 'Agencia' },
                        { id: 'CHOFER', label: 'Chofer' },
                        { id: 'TERCERO', label: 'Otro dueño' },
                      ] as const).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setQuickAutoForm({ ...quickAutoForm, propietarioTipo: opt.id })}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${
                            quickAutoForm.propietarioTipo === opt.id
                              ? 'bg-primary-600 text-white border-primary-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {quickAutoForm.propietarioTipo === 'TERCERO' && (
                      <input
                        type="text"
                        required
                        value={quickAutoForm.propietarioNombre}
                        onChange={(e) => setQuickAutoForm({ ...quickAutoForm, propietarioNombre: e.target.value })}
                        placeholder="Nombre del dueño del auto"
                        className="w-full mt-2 px-3 py-2 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-primary-500"
                      />
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setChoferParaAuto(null)}
                  disabled={quickAutoSaving}
                  className="px-4 py-2 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 text-xs font-semibold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={quickAutoSaving}
                  className="px-5 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-xl text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {quickAutoSaving
                    ? 'Guardando...'
                    : quickAutoMode === 'nuevo'
                    ? 'Crear Auto y Asignar'
                    : 'Guardar Asignación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
} 