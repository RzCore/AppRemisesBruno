'use client';

import { useState, useEffect } from 'react';
import {
  HelpCircle,
  X,
  Power,
  Car,
  ListOrdered,
  Briefcase,
  Receipt,
  Plus,
  MapPin,
  Bell,
  DollarSign,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';

interface HelpStep {
  title: string;
  summary: string;
  details: string[];
  icon: any;
  colorClass: string;
}

const GUIDE_CONTENT: Record<
  'CHOFER' | 'COORDINADOR',
  {
    headerTitle: string;
    headerSubtitle: string;
    tip: string;
    steps: HelpStep[];
  }
> = {
  CHOFER: {
    headerTitle: 'Guía rápida para Choferes',
    headerSubtitle: 'Cómo operar tu turno, viajes y cierre de caja',
    tip: 'Mantené el GPS activado mientras estés en línea para que la central y el pasajero vean tu posición en tiempo real.',
    steps: [
      {
        title: '1. Conectarse, pausar y finalizar turno',
        summary: 'Abrí turno con EN LÍNEA o pausalo sin perder tu jornada.',
        icon: Power,
        colorClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
        details: [
          'Tocá "EN LÍNEA" para iniciar tu turno y comenzar a recibir solicitudes de viaje.',
          'Si necesitás frenar a comer, cargar combustible o descansar sin cerrar el turno, usá "Pausar". Mientras estés pausado no recibirás viajes.',
          'Al terminar tu jornada, tocá "Finalizar Turno" para cerrar el día y generar tu arqueo de caja.'
        ]
      },
      {
        title: '2. Aceptar y completar un viaje',
        summary: 'Seguí los pasos desde la oferta hasta el cobro final.',
        icon: Car,
        colorClass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
        details: [
          'Cuando llega un viaje verás origen, destino y observaciones. Tocá "Aceptar" antes de que venza el contador.',
          'Al llegar al domicilio tocá "Llegué / Esperando" para avisar automáticamente al pasajero.',
          'Al subir el pasajero iniciá el viaje; si te pide esperar en una parada usá el botón de Espera. Al finalizar confirmá el importe y medio de pago.'
        ]
      },
      {
        title: '3. Parada Virtual (Tabla de turnos)',
        summary: 'El sistema ordena automáticamente la cola de móviles libres.',
        icon: ListOrdered,
        colorClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
        details: [
          'Cuando estás libre y en línea ingresás automáticamente a la Tabla de turnos.',
          'Al pausar tu turno o tomar un viaje salís de la fila; al reanudar o finalizar volvés a ingresar al final.',
          'Evitá rechazar viajes consecutivos para mantener activa tu prioridad en el despacho.'
        ]
      },
      {
        title: '4. Viajes ART y Cuenta Corriente',
        summary: 'No se cobran en efectivo al pasajero: se liquidan aparte.',
        icon: Briefcase,
        colorClass: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400',
        details: [
          'Los viajes marcados como ART o Cuenta Corriente se facturan a la aseguradora o empresa.',
          'En viajes ART verificá la hora de salida y el número de siniestro; si abonaste peajes, informalo al finalizar el viaje.'
        ]
      },
      {
        title: '5. Gastos e Historial',
        summary: 'Registrá combustible, GNC y reparaciones en el momento.',
        icon: Receipt,
        colorClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
        details: [
          'Desde la pestaña "Gastos" podés anotar cargas de nafta/GNC, lavadero, peajes o reparaciones.',
          'En "Historial" consultás todos tus viajes realizados, tus ingresos del día y el detalle de cada turno.'
        ]
      }
    ]
  },
  COORDINADOR: {
    headerTitle: 'Guía rápida de Coordinación',
    headerSubtitle: 'Despacho de viajes, mapa en vivo y cierre de caja',
    tip: 'Atajo rápido: presioná la tecla F2 en cualquier momento para abrir el formulario de Nuevo Viaje.',
    steps: [
      {
        title: '1. Cargar un viaje rápido (Tecla F2)',
        summary: 'Creá viajes particulares, de cuenta corriente o ART en segundos.',
        icon: Plus,
        colorClass: 'bg-emerald-50 text-emerald-600',
        details: [
          'Hacé clic en "Nuevo Viaje (F2)" o presioná F2 en tu teclado.',
          'Al escribir el nombre o teléfono del cliente, el buscador autocompleta sus direcciones frecuentes.',
          'Podés asignar el móvil manualmente o dejarlo en despacho automático para el siguiente chofer libre en tabla.'
        ]
      },
      {
        title: '2. Control de viajes y reservas',
        summary: 'Gestioná viajes pendientes, en curso, reservas y alertas.',
        icon: ListOrdered,
        colorClass: 'bg-blue-50 text-blue-600',
        details: [
          'Desde el panel principal visualizás todos los viajes en tiempo real: pendientes, aceptados, en camino y en curso.',
          'Podés reasignar chofer, editar observaciones, cancelar con motivo o avisar al cliente desde las acciones de cada fila.',
          'Las reservas programadas se disparan automáticamente minutos antes del horario acordado.'
        ]
      },
      {
        title: '3. Mapa de Flota en Vivo',
        summary: 'Ubicación GPS en tiempo real de móviles activos y en pausa.',
        icon: MapPin,
        colorClass: 'bg-indigo-50 text-indigo-600',
        details: [
          'Tocá "Ver Mapa" para ver dónde está cada móvil en tiempo real respecto a la base.',
          'Solo aparecen choferes con turno activo (Disponibles / En Viaje) o En Pausa; los desconectados se ocultan automáticamente.',
          'Podés filtrar por zona (Urbano / En Ruta), por estado o hacer clic en un vehículo para enfocarlo.'
        ]
      },
      {
        title: '4. Estado de la Central y Alarma Sonora',
        summary: 'Pausá la atención ante emergencias o silenciá las alertas.',
        icon: Bell,
        colorClass: 'bg-rose-50 text-rose-600',
        details: [
          'Con "Central Abierta / En Pausa" podés informar cierres temporales (tormenta, calles anegadas) tanto a la app de clientes como al bot de WhatsApp.',
          'El botón de parlante activa o silencia la alarma acústica cuando entra un pedido nuevo.'
        ]
      },
      {
        title: '5. Cierre de Caja de Choferes',
        summary: 'Liquidá efectivo, transferencias, cuenta corriente y ART.',
        icon: DollarSign,
        colorClass: 'bg-amber-50 text-amber-600',
        details: [
          'Entrá en "Cierre de Caja Chofer" al finalizar cada turno para revisar los viajes realizados por el chofer.',
          'El sistema calcula comisiones, efectivo a rendir, transferencias y viajes ART/Cuenta Corriente automáticamente.'
        ]
      }
    ]
  }
};

interface HelpGuideButtonProps {
  role: 'CHOFER' | 'COORDINADOR';
  variant?: 'header-dark' | 'header-light';
  className?: string;
}

export default function HelpGuideButton({
  role,
  variant = 'header-light',
  className = ''
}: HelpGuideButtonProps) {
  const [open, setOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const content = GUIDE_CONTENT[role];

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const buttonStyles =
    variant === 'header-dark'
      ? 'p-2 rounded-xl text-white/90 hover:text-white hover:bg-white/15 transition-colors flex items-center gap-1'
      : 'px-3 py-1.5 sm:py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs sm:text-sm font-semibold transition-colors flex items-center gap-1.5';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${buttonStyles} ${className}`}
        title="Ayuda: cómo funciona el sistema"
        aria-label="Abrir guía de ayuda"
      >
        <HelpCircle className={variant === 'header-dark' ? 'w-5 h-5' : 'w-4 h-4'} />
        {variant === 'header-light' && <span className="hidden sm:inline">Ayuda</span>}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full max-h-[86vh] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col text-left animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                    {content.headerTitle}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {content.headerSubtitle}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Cerrar ayuda"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5">
              {content.steps.map((step, idx) => {
                const Icon = step.icon;
                const isExpanded = expandedIndex === idx;
                return (
                  <div
                    key={step.title}
                    className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                      className="w-full p-3.5 flex items-center justify-between gap-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${step.colorClass}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                            {step.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {step.summary}
                          </p>
                        </div>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3.5 pt-1 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2">
                        {step.details.map((line, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="p-3.5 rounded-2xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/70 dark:border-blue-900 flex items-start gap-2.5 text-xs text-blue-900 dark:text-blue-200">
                <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>{content.tip}</span>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex justify-end bg-slate-50/50 dark:bg-slate-800/40">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white text-xs font-bold transition-colors"
              >
                ¡Entendido!
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
