'use client';

import { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function InstallAppButton({ className = '' }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      Boolean((window.navigator as any).standalone);
    if (standalone) {
      setIsInstalled(true);
      return;
    }

    const ua = window.navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOS(ios);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
      }
      setDeferredPrompt(null);
      return;
    }
    setShowInstructions(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100/80 hover:bg-slate-200/70 border border-slate-200/80 transition-all active:scale-95 ${className}`}
      >
        <Download className="w-3.5 h-3.5" />
        Descargar / Instalar App
      </button>

      {showInstructions && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setShowInstructions(false)}
        >
          <div
            className="bg-white w-full max-w-sm rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 pb-3 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
                  <Smartphone className="w-4 h-4" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Instalar App</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="w-8 h-8 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-600">
              {isIOS ? (
                <>
                  <p className="text-slate-700 font-medium">
                    En iPhone / iPad, Apple requiere instalar la app manualmente desde <strong>Safari</strong>:
                  </p>
                  <div className="space-y-2.5">
                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="w-5 h-5 rounded-full bg-primary-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                        1
                      </span>
                      <p>
                        Si abriste el link desde WhatsApp o Instagram, primero tocá <strong>Abrir en Safari</strong>.
                      </p>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="w-5 h-5 rounded-full bg-primary-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                        2
                      </span>
                      <p className="flex items-center gap-1 flex-wrap">
                        Tocá el botón <strong>Compartir</strong> <Share className="w-3.5 h-3.5 inline text-primary-600" /> en la barra inferior de Safari.
                      </p>
                    </div>
                    <div className="flex items-start gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                      <span className="w-5 h-5 rounded-full bg-primary-600 text-white font-bold text-[11px] flex items-center justify-center shrink-0">
                        3
                      </span>
                      <p className="flex items-center gap-1 flex-wrap">
                        Elegí <strong>Agregar a inicio</strong> <PlusSquare className="w-3.5 h-3.5 inline text-primary-600" /> y confirmá arriba a la derecha.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-slate-700 font-medium">
                    Para instalar la aplicación en tu dispositivo:
                  </p>
                  <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100 space-y-1.5">
                    <p>
                      1. Abrí el menú del navegador (los tres puntos <strong>⋮</strong> arriba a la derecha en Chrome).
                    </p>
                    <p>
                      2. Seleccioná <strong>&quot;Instalar aplicación&quot;</strong> o <strong>&quot;Agregar a la pantalla principal&quot;</strong>.
                    </p>
                  </div>
                </>
              )}

              <button
                type="button"
                onClick={() => setShowInstructions(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
