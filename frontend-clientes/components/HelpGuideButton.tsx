'use client';

import { useState, useEffect } from 'react';
import {
  HelpCircle,
  X,
  MapPin,
  Navigation,
  Calendar,
  PhoneCall,
  UserCheck,
  BellRing,
  CheckCircle2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface HelpStep {
  title: string;
  summary: string;
  details: string[];
  icon: any;
  colorClass: string;
}

const CLIENTE_STEPS: HelpStep[] = [
  {
    title: '1. Cómo pedir un remís',
    summary: 'Cargá tu dirección o usá tu GPS y tocá Pedir Remís.',
    icon: MapPin,
    colorClass: 'bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400',
    details: [
      'En la pantalla principal ("Pedir"), escribí la dirección donde te buscamos o tocá el botón de ubicación GPS para detectarla automáticamente.',
      'Si querés, indicá el destino para ver el precio estimado antes de confirmar.',
      'Podés marcar preferencias especiales antes de pedir (viaje con mascota, silla de ruedas o preferencia de chofer).'
    ]
  },
  {
    title: '2. Seguimiento en vivo y llegada',
    summary: 'Mirá el auto en el mapa en tiempo real y recibí aviso en tu celular.',
    icon: Navigation,
    colorClass: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
    details: [
      'Apenas un chofer acepta tu pedido, ves su nombre, patente, modelo del auto y su recorrido en vivo en el mapa.',
      'Te avisamos cuando el móvil sale hacia tu dirección y cuando llega a la puerta.',
      'Activá las notificaciones desde el aviso superior para que tu teléfono suene aunque tengas la pantalla bloqueada.'
    ]
  },
  {
    title: '3. Reservas programadas',
    summary: 'Agendá viajes con anticipación para otro día u horario.',
    icon: Calendar,
    colorClass: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400',
    details: [
      'Desde la pestaña "Viajes" podés consultar tus traslados activos, historial y reservas programadas.',
      'Al crear una reserva elegís fecha y hora; el sistema despacha un móvil automáticamente minutos antes de tu horario.'
    ]
  },
  {
    title: '4. Chat, cancelación y teléfonos de la central',
    summary: 'Comunicate rápido con tu chofer o llamá directo a Remises Bruno.',
    icon: PhoneCall,
    colorClass: 'bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400',
    details: [
      'Durante un viaje asignado podés escribirle al chofer desde el chat integrado.',
      'Si necesitás cancelar, hacelo cuanto antes para evitar cargos cuando el móvil ya está llegando.',
      'En cualquier momento podés tocar "Teléfonos" arriba para llamar a la base (2346-427637 / 2346-433000).'
    ]
  },
  {
    title: '5. Perfil, direcciones frecuentes y modo oscuro',
    summary: 'Guardá tus direcciones habituales y elegí el tema visual.',
    icon: UserCheck,
    colorClass: 'bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400',
    details: [
      'Desde el ícono de perfil podés actualizar tus datos personales y direcciones frecuentes (Casa, Trabajo, etc.).',
      'Con el ícono de sol/luna en la barra superior cambiás entre modo claro, modo oscuro o automático según tu celular.'
    ]
  }
];

export default function HelpGuideButton({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-bold transition-colors ${className}`}
        title="Ayuda: cómo funciona la app"
        aria-label="Abrir guía de ayuda"
      >
        <HelpCircle className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Ayuda</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full max-h-[86vh] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
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
                    Cómo usar Remises Bruno
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Guía rápida para pedir y seguir tus viajes
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
              {CLIENTE_STEPS.map((step, idx) => {
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
                <BellRing className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <span>
                  ¿Necesitás asistencia inmediata? Llamá a la central de <strong>Remises Bruno</strong> al{' '}
                  <strong>2346-427637</strong> o <strong>2346-433000</strong>.
                </span>
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
