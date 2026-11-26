'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useAppTracking } from '@/hooks/useAppTracking';
import { choferService, vehiculoService } from '@/lib/api';
import { Chofer, Vehiculo } from '@/types';
import {
  ArrowLeft,
  Users,
  Car,
  Phone,
  Search,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  X,
  ArrowRightLeft,
  PowerOff
} from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';

export default function GestionarChoferes() {
  const { user } = useAuth();
  useAppTracking('COORDINADOR_GESTIONAR_CHOFERES');

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [vehiculos, setVehiculos] = useState<Vehiculo[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<string>('todos');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modal de asignación / cambio de vehículo
  const [choferParaAuto, setChoferParaAuto] = useState<Chofer | null>(null);
  const [selectedVehiculoId, setSelectedVehiculoId] = useState<string>('');
  const [savingAuto, setSavingAuto] = useState(false);
  const [desconectandoId, setDesconectandoId] = useState<string | null>(null);

  const handleDesconectarChofer = async (chofer: Chofer) => {
    const motivo = window.prompt(
      `¿Desconectar a ${chofer.nombre} ${chofer.apellido} (#${chofer.numeroChofer})?\nPodés escribir un motivo (opcional):`,
      'Fuera de turno'
    );
    if (motivo === null) return;
    try {
      setDesconectandoId(chofer.id);
      const res = await choferService.desconectarChofer(chofer.id, motivo);
      if (res.success) {
        toast.success(res.message || 'Chofer desconectado exitosamente');
        await loadData();
      } else {
        toast.error(res.message || 'No se pudo desconectar al chofer');
      }
    } catch {
      toast.error('Error al desconectar al chofer');
    } finally {
      setDesconectandoId(null);
    }
  };

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [chofRes, vehRes] = await Promise.all([
        choferService.getAll(),
        vehiculoService.getAll()
      ]);
      if (chofRes.success && chofRes.data) {
        setChoferes(chofRes.data.filter((c) => c.estado !== 'DADO_DE_BAJA'));
      } else {
        toast.error(chofRes.message || 'Error al cargar choferes');
      }
      if (vehRes.success && vehRes.data) {
        setVehiculos(vehRes.data.filter((v) => v.estado !== 'INACTIVO'));
      }
    } catch (error) {
      console.error('Error cargando choferes y vehículos:', error);
      toast.error('Error al sincronizar flota');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadData();
  }, [user]);

  const openAsignarAutoModal = (chofer: Chofer) => {
    setChoferParaAuto(chofer);
    setSelectedVehiculoId(chofer.vehiculoId || chofer.vehiculo?.id || '');
  };

  const handleGuardarVehiculo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choferParaAuto || savingAuto) return;
    try {
      setSavingAuto(true);
      const res = await choferService.asignarVehiculo(
        choferParaAuto.id,
        selectedVehiculoId || null
      );
      if (res.success) {
        toast.success(res.message || 'Vehículo actualizado correctamente');
        setChoferParaAuto(null);
        await loadData();
      } else {
        toast.error(res.message || 'No se pudo asignar el vehículo');
      }
    } catch (error) {
      console.error('Error asignando vehículo:', error);
      toast.error('Error al asignar vehículo');
    } finally {
      setSavingAuto(false);
    }
  };

  const choferesFiltrados = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return choferes.filter((chofer) => {
      const cumpleEstado =
        filtroEstado === 'todos' ||
        (filtroEstado === 'online' && Boolean(chofer.isOnline)) ||
        (filtroEstado === 'offline' && !chofer.isOnline) ||
        (filtroEstado === 'sin_auto' && !chofer.vehiculoId && !chofer.vehiculo?.id);

      const nombreCompleto = `${chofer.nombre} ${chofer.apellido}`.toLowerCase();
      const cumpleBusqueda =
        !q ||
        nombreCompleto.includes(q) ||
        String(chofer.numeroChofer || '').toLowerCase().includes(q) ||
        String(chofer.telefono || '').toLowerCase().includes(q) ||
        String(chofer.vehiculo?.patente || '').toLowerCase().includes(q) ||
        String(chofer.vehiculo?.modelo || '').toLowerCase().includes(q);

      return cumpleEstado && cumpleBusqueda;
    });
  }, [choferes, filtroEstado, searchTerm]);

  const totalOnline = choferes.filter((c) => c.isOnline).length;
  const totalConAuto = choferes.filter((c) => Boolean(c.vehiculoId || c.vehiculo?.id)).length;
  const totalSinAuto = choferes.length - totalConAuto;

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden w-full">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4 gap-3">
            <div className="flex items-center min-w-0">
              <Link
                href="/coordinador/dashboard"
                className="mr-3 p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 shrink-0"
              >
                <ArrowLeft className="h-5 w-5" />
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
                  Choferes y Asignación de Autos
                </h1>
                <p className="text-xs sm:text-sm text-slate-500">
                  Monitoreo operativo y cambio de vehículo asignado a cada chofer
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold shrink-0"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full min-w-0 space-y-6">
        {/* Estadísticas rápidas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
            <p className="text-xs font-semibold text-slate-500 uppercase">Total Choferes</p>
            <p className="text-2xl font-black text-slate-900 mt-1">{choferes.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-xs">
            <p className="text-xs font-semibold text-emerald-700 uppercase">Conectados</p>
            <p className="text-2xl font-black text-emerald-700 mt-1">{totalOnline}</p>
          </div>
          <div className="bg-white rounded-2xl border border-blue-200 p-4 shadow-xs">
            <p className="text-xs font-semibold text-blue-700 uppercase">Con Auto Asignado</p>
            <p className="text-2xl font-black text-blue-700 mt-1">{totalConAuto}</p>
          </div>
          <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-xs">
            <p className="text-xs font-semibold text-amber-700 uppercase">Sin Auto</p>
            <p className="text-2xl font-black text-amber-700 mt-1">{totalSinAuto}</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
              <input
                type="text"
                placeholder="Buscar por nombre, móvil #, teléfono o patente..."
                className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 bg-white"
            >
              <option value="todos">Todos los choferes</option>
              <option value="online">Conectados (Online)</option>
              <option value="offline">Desconectados (Offline)</option>
              <option value="sin_auto">Sin auto asignado</option>
            </select>
          </div>
        </div>

        {/* Listado */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              Choferes ({choferesFiltrados.length})
            </h3>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-sm text-slate-500">Cargando choferes...</div>
          ) : choferesFiltrados.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              <Users className="h-10 w-10 mx-auto mb-3 text-slate-300" />
              <p className="text-sm">No hay choferes que coincidan con los filtros.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {choferesFiltrados.map((chofer) => (
                <div
                  key={chofer.id}
                  className="p-4 sm:p-5 hover:bg-slate-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div
                      className={`w-3 h-3 rounded-full mt-1.5 sm:mt-0 shrink-0 ${
                        chofer.isOnline ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300'
                      }`}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                          {chofer.nombre} {chofer.apellido}
                        </h4>
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-xs font-bold">
                          #{chofer.numeroChofer}
                        </span>
                        {chofer.esPropietario && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                            Propietario
                          </span>
                        )}
                        {chofer.esFranquero && (
                          <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                            Franquero
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            chofer.isOnline
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {chofer.isOnline ? 'En línea' : 'Desconectado'}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5" />
                          {chofer.telefono}
                        </span>
                        {chofer.vehiculo ? (
                          <span className="flex items-center gap-1 font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                            <Car className="w-3.5 h-3.5" />
                            {chofer.vehiculo.patente} — {chofer.vehiculo.marca} {chofer.vehiculo.modelo}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-100">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Sin vehículo asignado
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {chofer.isOnline && (
                      <button
                        type="button"
                        onClick={() => handleDesconectarChofer(chofer)}
                        disabled={desconectandoId === chofer.id}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs active:scale-95 transition-all"
                        title="Desconectar chofer del turno"
                      >
                        <PowerOff className="w-3.5 h-3.5" />
                        {desconectandoId === chofer.id ? 'Desconectando...' : 'Desconectar'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => openAsignarAutoModal(chofer)}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs active:scale-95 transition-all"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      {chofer.vehiculo ? 'Cambiar Auto' : 'Asignar Auto'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Modal Asignar / Cambiar Vehículo */}
      {choferParaAuto && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Car className="w-5 h-5 text-blue-600" />
                  Vehículo para {choferParaAuto.nombre} {choferParaAuto.apellido}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Móvil #{choferParaAuto.numeroChofer} •{' '}
                  {choferParaAuto.vehiculo
                    ? `Actual: ${choferParaAuto.vehiculo.patente} (${choferParaAuto.vehiculo.marca} ${choferParaAuto.vehiculo.modelo})`
                    : 'Sin vehículo asignado'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChoferParaAuto(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGuardarVehiculo} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Seleccionar Vehículo de la Flota
                </label>
                <select
                  value={selectedVehiculoId}
                  onChange={(e) => setSelectedVehiculoId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm font-medium text-slate-800 bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Sin vehículo asignado --</option>
                  {vehiculos.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.patente} — {v.marca} {v.modelo} ({v.color}) [{v.estado}]
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  El cambio se aplica de inmediato en la app del chofer y en el despacho.
                </p>
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setChoferParaAuto(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAuto}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  {savingAuto ? 'Guardando...' : 'Guardar Asignación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
