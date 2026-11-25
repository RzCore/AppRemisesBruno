'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Bell,
  Briefcase,
  AlertTriangle,
  UserPlus,
  DollarSign,
  FileWarning,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  X,
} from 'lucide-react';
import {
  artEmpresaService,
  choferService,
  vehiculoService,
  coordinadorDashboardService,
} from '@/lib/api';
import { evaluarDocumentacionClient } from '@/lib/documentacionUtils';

type NotificationSeverity = 'critical' | 'warning' | 'info';

interface OwnerNotification {
  id: string;
  title: string;
  description: string;
  href: string;
  severity: NotificationSeverity;
  category: 'ART' | 'PORTAL' | 'CHOFER' | 'CAJA' | 'DOCS';
  count?: number;
}

export default function DuenioNotifications() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notifications, setNotifications] = useState<OwnerNotification[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadNotifications = useCallback(async (silent = true) => {
    if (!silent) setLoading(true);
    try {
      const [
        artEmpresasRes,
        viajesArtRes,
        choferesRes,
        vehiculosRes,
        liquidacionesRes,
      ] = await Promise.allSettled([
        artEmpresaService.getAll(),
        artEmpresaService.getViajesProgramados({ estado: 'PENDIENTE' }),
        choferService.getAll(),
        vehiculoService.getAll(),
        coordinadorDashboardService.getHistorialDuenio(),
      ]);

      const items: OwnerNotification[] = [];

      // 1. Errores de clave o sincronización en portales externos de ART (ej. Feleval)
      if (artEmpresasRes.status === 'fulfilled' && artEmpresasRes.value.success) {
        const arts = artEmpresasRes.value.data || [];
        const artsConError = arts.filter(
          (a: any) =>
            a.portalExternoActivo &&
            (a.portalExternoUltimoEstado === 'ERROR_CLAVE' ||
              a.portalExternoUltimoEstado === 'ERROR')
        );
        artsConError.forEach((art: any) => {
          items.push({
            id: `portal-err-${art.id}`,
            title:
              art.portalExternoUltimoEstado === 'ERROR_CLAVE'
                ? `Clave vencida en ${art.nombre}`
                : `Error al sincronizar ${art.nombre}`,
            description:
              art.portalExternoUltimoMensaje ||
              'Revisá las credenciales del portal externo en el módulo ART.',
            href: '/duenio/art',
            severity: 'critical',
            category: 'PORTAL',
          });
        });
      }

      // 2. Viajes ART programados sin chofer asignado
      if (viajesArtRes.status === 'fulfilled' && viajesArtRes.value.success) {
        const viajes = viajesArtRes.value.data || [];
        const sinAsignar = viajes.filter(
          (v: any) => !v.choferId && v.estado === 'PENDIENTE'
        );
        if (sinAsignar.length > 0) {
          items.push({
            id: 'art-sin-asignar',
            title:
              sinAsignar.length === 1
                ? '1 viaje ART sin chofer asignado'
                : `${sinAsignar.length} viajes ART sin chofer asignado`,
            description: 'Entrá a ART para asignar chofer y confirmar hora de salida.',
            href: '/duenio/art',
            severity: 'warning',
            category: 'ART',
            count: sinAsignar.length,
          });
        }
      }

      // 3. Choferes pendientes de aprobación y vencimientos de licencias
      if (choferesRes.status === 'fulfilled' && choferesRes.value.success) {
        const choferes = choferesRes.value.data || [];
        const pendientes = choferes.filter(
          (c: any) => c.estado === 'PENDIENTE_APROBACION'
        );
        if (pendientes.length > 0) {
          items.push({
            id: 'choferes-pendientes',
            title:
              pendientes.length === 1
                ? '1 solicitud de chofer pendiente'
                : `${pendientes.length} solicitudes de choferes pendientes`,
            description: pendientes
              .slice(0, 2)
              .map((c: any) => `${c.nombre || ''} ${c.apellido || ''}`.trim())
              .join(', '),
            href: '/duenio/choferes',
            severity: 'info',
            category: 'CHOFER',
            count: pendientes.length,
          });
        }

        // Documentación de licencias vencidas o críticas (<= 7 días)
        let licenciasCriticas = 0;
        let licenciasPorVencer = 0;
        choferes
          .filter((c: any) => c.estado === 'ACTIVO')
          .forEach((c: any) => {
            if (!c.vtoLicencia) return;
            const doc = evaluarDocumentacionClient({ vtoLicencia: c.vtoLicencia }, null);
            const lic = doc.items.licencia;
            if (lic.estado === 'VENCIDO' || lic.estado === 'VENCE_HOY') {
              licenciasCriticas++;
            } else if (lic.estado === 'PROXIMO_A_VENCER') {
              licenciasPorVencer++;
            }
          });

        if (licenciasCriticas > 0) {
          items.push({
            id: 'licencias-vencidas',
            title:
              licenciasCriticas === 1
                ? '1 licencia de chofer vencida'
                : `${licenciasCriticas} licencias de choferes vencidas`,
            description: 'Revisá los carnets vencidos en el listado de choferes.',
            href: '/duenio/choferes',
            severity: 'critical',
            category: 'DOCS',
            count: licenciasCriticas,
          });
        } else if (licenciasPorVencer > 0) {
          items.push({
            id: 'licencias-proximas',
            title:
              licenciasPorVencer === 1
                ? '1 licencia próxima a vencer'
                : `${licenciasPorVencer} licencias próximas a vencer`,
            description: 'Vencen dentro de los próximos 30 días.',
            href: '/duenio/choferes',
            severity: 'warning',
            category: 'DOCS',
            count: licenciasPorVencer,
          });
        }
      }

      // 4. Documentación de vehículos (Seguro, VTV, Matafuego)
      if (vehiculosRes.status === 'fulfilled' && vehiculosRes.value.success) {
        const vehiculos = vehiculosRes.value.data || [];
        let docsVehiculosVencidos = 0;
        let docsVehiculosProximos = 0;

        vehiculos.forEach((v: any) => {
          const resumen = evaluarDocumentacionClient(null, {
            vtoSeguro: v.vtoSeguro,
            vtoVtv: v.vtoVtv,
            vtoMatafuego: v.vtoMatafuego,
          });
          resumen.alertas.forEach((a) => {
            if (a.tipo === 'LICENCIA') return;
            if (a.estado === 'VENCIDO' || a.estado === 'VENCE_HOY') {
              docsVehiculosVencidos++;
            } else if (a.estado === 'PROXIMO_A_VENCER') {
              docsVehiculosProximos++;
            }
          });
        });

        if (docsVehiculosVencidos > 0) {
          items.push({
            id: 'vehiculos-docs-vencidos',
            title:
              docsVehiculosVencidos === 1
                ? '1 documento de vehículo vencido'
                : `${docsVehiculosVencidos} documentos de vehículos vencidos`,
            description: 'Seguro, VTV o matafuego vencido en la flota.',
            href: '/duenio/vehiculos',
            severity: 'critical',
            category: 'DOCS',
            count: docsVehiculosVencidos,
          });
        } else if (docsVehiculosProximos > 0) {
          items.push({
            id: 'vehiculos-docs-proximos',
            title:
              docsVehiculosProximos === 1
                ? '1 documento de vehículo por vencer'
                : `${docsVehiculosProximos} documentos de vehículos por vencer`,
            description: 'Seguro, VTV o matafuego con vencimiento próximo.',
            href: '/duenio/vehiculos',
            severity: 'warning',
            category: 'DOCS',
            count: docsVehiculosProximos,
          });
        }
      }

      // 5. Liquidaciones pendientes de confirmación de dinero o saldos a favor por pagar
      if (liquidacionesRes.status === 'fulfilled' && liquidacionesRes.value.success) {
        const cierres = liquidacionesRes.value.data || [];
        const cierresPendientesRecibir = cierres.filter(
          (c: any) => c.dineroRecibido === false
        );
        const saldosPendientesDuenio = cierres.filter(
          (c: any) => c.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO'
        );

        if (saldosPendientesDuenio.length > 0) {
          items.push({
            id: 'saldos-chofer-duenio',
            title:
              saldosPendientesDuenio.length === 1
                ? '1 saldo a favor de chofer pendiente'
                : `${saldosPendientesDuenio.length} saldos a favor de choferes pendientes`,
            description: 'Pendientes de liquidar por el dueño en Liquidaciones.',
            href: '/duenio/liquidaciones',
            severity: 'warning',
            category: 'CAJA',
            count: saldosPendientesDuenio.length,
          });
        }

        if (cierresPendientesRecibir.length > 0) {
          items.push({
            id: 'cierres-por-recibir',
            title:
              cierresPendientesRecibir.length === 1
                ? '1 cierre de caja por confirmar'
                : `${cierresPendientesRecibir.length} cierres de caja por confirmar`,
            description: 'Cierres de coordinadores pendientes de confirmar recepción.',
            href: '/duenio/liquidaciones',
            severity: 'info',
            category: 'CAJA',
            count: cierresPendientesRecibir.length,
          });
        }
      }

      // Ordenar: críticas primero, luego advertencias, luego informativas
      const order: Record<NotificationSeverity, number> = {
        critical: 0,
        warning: 1,
        info: 2,
      };
      items.sort((a, b) => order[a.severity] - order[b.severity]);

      setNotifications(items);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error cargando notificaciones del dueño:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications(true);
    const interval = setInterval(() => loadNotifications(true), 90_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Cerrar al hacer click afuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);
    if (next) {
      loadNotifications(false);
    }
  };

  const totalCount = notifications.length;
  const hasCritical = notifications.some((n) => n.severity === 'critical');
  const hasWarning = notifications.some((n) => n.severity === 'warning');

  const getIcon = (n: OwnerNotification) => {
    switch (n.category) {
      case 'PORTAL':
        return AlertTriangle;
      case 'ART':
        return Briefcase;
      case 'CHOFER':
        return UserPlus;
      case 'CAJA':
        return DollarSign;
      case 'DOCS':
      default:
        return FileWarning;
    }
  };

  const getSeverityStyles = (severity: NotificationSeverity) => {
    switch (severity) {
      case 'critical':
        return {
          iconBg: 'bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400',
          dot: 'bg-red-500',
        };
      case 'warning':
        return {
          iconBg: 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400',
          dot: 'bg-amber-500',
        };
      case 'info':
      default:
        return {
          iconBg: 'bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400',
          dot: 'bg-primary-500',
        };
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="p-2 text-slate-500 dark:text-slate-300 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors relative flex items-center justify-center"
        title={
          totalCount > 0
            ? `${totalCount} alerta${totalCount === 1 ? '' : 's'} pendiente${totalCount === 1 ? '' : 's'}`
            : 'Sin notificaciones pendientes'
        }
        aria-label="Notificaciones"
      >
        <Bell className="w-5 h-5" />
        {totalCount > 0 && (
          <span
            className={`absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-white dark:ring-slate-900 ${
              hasCritical
                ? 'bg-red-500'
                : hasWarning
                ? 'bg-amber-500'
                : 'bg-primary-600'
            }`}
          >
            {totalCount > 9 ? '9+' : totalCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-96 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 z-50 overflow-hidden animate-scale-up">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/80 dark:bg-slate-800/50">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Notificaciones
              </h3>
              {totalCount > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300">
                  {totalCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => loadNotifications(false)}
                disabled={loading}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
                title="Actualizar notificaciones"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-700 transition-colors sm:hidden"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[65vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {loading && notifications.length === 0 ? (
              <div className="py-10 px-4 text-center text-sm text-slate-500 dark:text-slate-400">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary-500" />
                Buscando novedades...
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 px-6 text-center">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  Todo al día
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  No tenés alertas, vencimientos ni viajes ART sin asignar.
                </p>
              </div>
            ) : (
              notifications.map((item) => {
                const Icon = getIcon(item);
                const styles = getSeverityStyles(item.severity);
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="flex items-start gap-3 p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors group"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${styles.iconBg}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${styles.dot}`} />
                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                          {item.title}
                        </p>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 self-center group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                );
              })
            )}
          </div>

          {/* Footer */}
          {lastUpdated && (
            <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500">
              <span>
                Actualizado{' '}
                {lastUpdated.toLocaleTimeString('es-AR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
              <span className="font-medium">Panel de Dueño</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
