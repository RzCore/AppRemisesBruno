'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Car, Headphones, Shield, ArrowRight, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';
import LogoBruno from '@/components/LogoBruno';

export default function InternoHomePage() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated && user) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
      const isProdDomain = hostname.includes('brunoremises.com.ar');

      if (isProdDomain) {
        if (user.rol === 'CHOFER') {
          window.location.href = 'https://choferes.brunoremises.com.ar/';
          return;
        } else if (user.rol === 'COORDINADOR') {
          window.location.href = 'https://coordinacion.brunoremises.com.ar/';
          return;
        } else {
          window.location.href = 'https://admin.brunoremises.com.ar/';
          return;
        }
      }

      if (user.rol === 'ADMIN') {
        router.push('/admin/dashboard');
      } else if (user.rol === 'COORDINADOR') {
        router.push('/coordinador/dashboard');
      } else if (user.rol === 'CHOFER') {
        router.push('/chofer/app');
      } else {
        router.push('/duenio/dashboard');
      }
    }
  }, [loading, isAuthenticated, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center text-white space-y-4">
          <div className="flex justify-center">
            <LogoBruno size={72} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Remises Bruno • Gestión</h1>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
        </div>
      </div>
    );
  }

  const portalesInternos = [
    {
      title: 'Portal Choferes',
      subdomain: 'choferes.brunoremises.com.ar',
      localHref: '/chofer/app',
      desc: 'App de conductor: conectate al turno, recibí viajes despachados y registrá odometría y gastos.',
      icon: Car,
      badge: 'Conductores',
      gradient: 'from-emerald-600 to-teal-600',
      btnColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    },
    {
      title: 'Central de Coordinación',
      subdomain: 'coordinacion.brunoremises.com.ar',
      localHref: '/coordinador/dashboard',
      desc: 'Despacho de viajes, mapa en vivo de la flota, asignación de reservas y cierres diarios de caja.',
      icon: Headphones,
      badge: 'Operaciones',
      gradient: 'from-amber-600 to-orange-600',
      btnColor: 'bg-amber-600 hover:bg-amber-700 text-white',
    },
    {
      title: 'Panel de Administración',
      subdomain: 'admin.brunoremises.com.ar',
      localHref: '/duenio/dashboard',
      desc: 'Gestión integral: liquidaciones de choferes, altas de flota, reportes financieros y configuración.',
      icon: Shield,
      badge: 'Dirección',
      gradient: 'from-purple-600 to-indigo-600',
      btnColor: 'bg-purple-600 hover:bg-purple-700 text-white',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between">
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <LogoBruno size={40} />
            <div>
              <span className="text-lg font-black tracking-tight text-white block">REMISES BRUNO</span>
              <span className="text-[10px] uppercase tracking-widest text-blue-400 font-semibold block -mt-1">
                Sistema Interno de Flota y Gestión
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/registro-chofer"
              className="hidden sm:inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Postulación Choferes</span>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/30 transition-all"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Iniciar Sesión</span>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 w-full flex-1 flex flex-col justify-center">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white mb-3">
            Plataforma Interna de Operaciones
          </h1>
          <p className="text-sm sm:text-base text-slate-400">
            Acceso exclusivo para Choferes, Coordinadores y Administración de Remises Bruno.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {portalesInternos.map((portal) => {
            const Icon = portal.icon;
            return (
              <div
                key={portal.title}
                className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col justify-between transition-all shadow-xl"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${portal.gradient} flex items-center justify-center shadow-lg`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      {portal.badge}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white mb-1">{portal.title}</h2>
                  <p className="text-xs font-mono text-blue-400/90 mb-3">{portal.subdomain}</p>
                  <p className="text-sm text-slate-400 leading-relaxed mb-6">{portal.desc}</p>
                </div>

                <Link
                  href={portal.localHref}
                  className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 transition-all ${portal.btnColor}`}
                >
                  <span>Ingresar</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="border-t border-slate-900 py-5 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Remises Bruno • Uso exclusivo del personal autorizado
      </footer>
    </div>
  );
}
