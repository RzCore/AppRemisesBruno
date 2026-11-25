'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Truck,
  DollarSign,
  UserCheck,
  Menu,
  X,
  Building2,
  Users,
  Car,
  BarChart3,
  Settings,
  Briefcase,
  LogOut,
  ChevronRight
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import ThemeToggle from '@/components/ThemeToggle';

export default function DuenioBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [sheetOpen, setSheetOpen] = useState(false);

  const mainTabs = [
    {
      name: 'Inicio',
      href: '/duenio/dashboard',
      icon: LayoutDashboard,
      isActive: pathname === '/duenio/dashboard'
    },
    {
      name: 'Flota',
      href: '/duenio/choferes',
      icon: Truck,
      isActive: pathname.startsWith('/duenio/choferes') || pathname.startsWith('/duenio/vehiculos')
    },
    {
      name: 'Caja',
      href: '/duenio/liquidaciones',
      icon: DollarSign,
      isActive: pathname.startsWith('/duenio/liquidaciones') || pathname.startsWith('/duenio/informes')
    },
    {
      name: 'Clientes',
      href: '/duenio/clientes',
      icon: UserCheck,
      isActive: pathname.startsWith('/duenio/clientes') || pathname.startsWith('/duenio/art')
    },
  ];

  const moreMenuItems = [
    {
      category: 'Operación & Flota',
      items: [
        { name: 'Mi Remisería', href: '/duenio/remiserias', icon: Building2, desc: 'Datos y sucursales' },
        { name: 'Coordinadores', href: '/duenio/coordinadores', icon: Users, desc: 'Operadores de base' },
        { name: 'Vehículos', href: '/duenio/vehiculos', icon: Car, desc: 'Móviles y estados' },
      ]
    },
    {
      category: 'Finanzas & Empresas',
      items: [
        { name: 'ART & Empresas', href: '/duenio/art', icon: Briefcase, desc: 'Convenios y facturación' },
        { name: 'Reporte Diario', href: '/duenio/informes/diario', icon: BarChart3, desc: 'Cierre del día' },
        { name: 'Reporte Mensual', href: '/duenio/informes/mensual', icon: BarChart3, desc: 'Balance acumulado' },
      ]
    },
    {
      category: 'Ajustes',
      items: [
        { name: 'Configurar Tarifas', href: '/duenio/configuracion', icon: Settings, desc: 'Precios, bajada de bandera y km' },
      ]
    }
  ];

  const handleLogout = () => {
    setSheetOpen(false);
    logout();
    router.push('/login');
    toast.success('Sesión cerrada correctamente');
  };

  const isMoreActive =
    pathname.startsWith('/duenio/remiserias') ||
    pathname.startsWith('/duenio/coordinadores') ||
    pathname.startsWith('/duenio/vehiculos') ||
    pathname.startsWith('/duenio/art') ||
    pathname.startsWith('/duenio/configuracion') ||
    (pathname.startsWith('/duenio/informes') && !pathname.includes('diario'));

  return (
    <>
      {/* Bottom Sheet Modal for "Más" */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setSheetOpen(false)}
          />

          {/* Drawer content */}
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col border-t border-slate-200 dark:border-slate-800 overflow-hidden animate-in slide-in-from-bottom duration-200">
            {/* Handle & Header */}
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 font-bold flex items-center justify-center">
                  {user?.duenio?.nombre?.charAt(0).toUpperCase() || 'D'}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base leading-tight">
                    {user?.duenio?.nombre || 'Dueño'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Panel de Control Ejecutivo</p>
                </div>
              </div>
              <button
                onClick={() => setSheetOpen(false)}
                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Menu groups */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5 pb-8">
              {/* Apariencia / Tema */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2">
                  Apariencia
                </p>
                <ThemeToggle variant="inline" />
              </div>

              {moreMenuItems.map((group) => (
                <div key={group.category} className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider px-2">
                    {group.category}
                  </p>
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-1 border border-slate-100 dark:border-slate-800 space-y-1">
                    {group.items.map((item) => {
                      const Icon = item.icon;
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setSheetOpen(false)}
                          className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                            active
                              ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300 font-semibold'
                              : 'hover:bg-white dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                              active ? 'bg-primary-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700'
                            }`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div>
                              <p className="text-sm font-semibold">{item.name}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">{item.desc}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Logout button */}
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/60 font-semibold text-sm transition-colors border border-red-100 dark:border-red-900/50"
              >
                <LogOut className="w-4 h-4" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Bottom Bar */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] lg:hidden transition-colors">
        <div className="grid grid-cols-5 items-center h-16 max-w-lg mx-auto px-1">
          {mainTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`flex flex-col items-center justify-center py-1 transition-all ${
                  tab.isActive
                    ? 'text-primary-600 dark:text-primary-400 font-bold scale-105'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <div className={`p-1 rounded-xl transition-colors ${
                  tab.isActive ? 'bg-primary-50 dark:bg-primary-950/60' : ''
                }`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-[11px] tracking-tight">{tab.name}</span>
              </Link>
            );
          })}

          {/* 5th Tab: Más */}
          <button
            onClick={() => setSheetOpen(true)}
            className={`flex flex-col items-center justify-center py-1 transition-all ${
              sheetOpen || isMoreActive
                ? 'text-primary-600 dark:text-primary-400 font-bold scale-105'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <div className={`p-1 rounded-xl transition-colors ${
              sheetOpen || isMoreActive ? 'bg-primary-50 dark:bg-primary-950/60' : ''
            }`}>
              <Menu className="w-5 h-5" />
            </div>
            <span className="text-[11px] tracking-tight">Más</span>
          </button>
        </div>
      </nav>
    </>
  );
}
