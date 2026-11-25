'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LogoBruno from '@/components/LogoBruno';
import {
  LayoutDashboard,
  Building2,
  Users,
  Truck,
  Car,
  BarChart3,
  Settings,
  LogOut,
  DollarSign,
  Briefcase,
  UserCheck
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import DuenioBottomNav from '@/components/DuenioBottomNav';
import DuenioNotifications from '@/components/DuenioNotifications';
import ThemeToggle from '@/components/ThemeToggle';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ThemeModuleProvider } from '@/contexts/ThemeContext';

export default function DuenioLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);

  // Evitar saltos de scroll indeseados al entrar o navegar entre secciones
  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
    }
  }, [pathname]);

  const navigation = [
    { name: 'Dashboard', href: '/duenio/dashboard', icon: LayoutDashboard },
    { name: 'Mi Remisería', href: '/duenio/remiserias', icon: Building2 },
    { name: 'ART', href: '/duenio/art', icon: Briefcase },
    { name: 'Clientes', href: '/duenio/clientes', icon: UserCheck },
    { name: 'Coordinadores', href: '/duenio/coordinadores', icon: Users },
    { name: 'Choferes', href: '/duenio/choferes', icon: Truck },
    { name: 'Vehículos', href: '/duenio/vehiculos', icon: Car },
    { name: 'Liquidaciones', href: '/duenio/liquidaciones', icon: DollarSign },
    { name: 'Reportes', href: '/duenio/informes/mensual', icon: BarChart3 },
    { name: 'Configuración', href: '/duenio/configuracion', icon: Settings },
  ];

  const handleLogout = () => {
    logout();
    router.push('/login');
    toast.success('Sesión cerrada correctamente');
  };

  return (
    <ProtectedRoute allowedRoles={['DUENIO']}>
      <ThemeModuleProvider>
        <div className="duenio-module h-screen h-[100dvh] bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex overflow-hidden transition-colors duration-200">
        {/* Mobile sidebar overlay */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-72 h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
          <div className="h-full flex flex-col">
            {/* Sidebar Header */}
            <div className="h-20 flex items-center px-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <Link href="/duenio/dashboard" className="flex items-center gap-3">
                <LogoBruno size={40} />
                <div className="flex flex-col">
                  <span className="font-bold text-lg text-slate-900 dark:text-slate-100 leading-tight">Remises Bruno</span>
                  <span className="text-xs text-primary-600 dark:text-primary-400 font-medium">Panel de Dueño</span>
                </div>
              </Link>
            </div>

            {/* Navigation Links */}
            <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
              {navigation.map((item) => {
                const isActive = pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`
                      flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group font-medium text-sm
                      ${isActive 
                        ? 'bg-primary-50 dark:bg-primary-950/60 text-primary-700 dark:text-primary-300' 
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'}
                    `}
                  >
                    <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600 dark:text-primary-400' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors'}`} />
                    {item.name}
                  </Link>
                );
              })}
            </nav>

            {/* Sidebar Footer (User Info) */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-sm flex-shrink-0">
                  {user?.duenio?.nombre?.charAt(0).toUpperCase() || 'D'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {user?.duenio?.nombre || 'Dueño'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {user?.email}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full mt-2 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <LogOut className="w-5 h-5 text-red-500 dark:text-red-400" />
                Cerrar Sesión
              </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
          {/* Topbar - Compact on mobile like a native app header */}
          <header className="h-14 sm:h-16 lg:h-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shrink-0 z-30 flex items-center justify-between px-4 sm:px-6 lg:px-8 transition-colors">
            <div className="flex items-center gap-2 min-w-0">
              {/* Mobile Brand / App Identity */}
              <div className="flex items-center gap-2 lg:hidden">
                <LogoBruno size={32} />
                <div className="flex flex-col">
                  <span className="font-bold text-sm text-slate-900 dark:text-slate-100 leading-tight">Remises Bruno</span>
                  <span className="text-[10px] text-primary-600 dark:text-primary-400 font-semibold uppercase tracking-wider">Dueño</span>
                </div>
              </div>

              {/* Desktop Section Title */}
              <div className="hidden lg:block">
                <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                  {navigation.find(n => pathname.startsWith(n.href))?.name || 'Dashboard'}
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
              <ThemeToggle />
              <DuenioNotifications />
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5"></div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 dark:text-slate-300 font-medium hidden sm:block">{user?.duenio?.nombre}</span>
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-950 text-primary-700 dark:text-primary-300 flex items-center justify-center font-bold text-xs ring-2 ring-primary-50 dark:ring-primary-900/40">
                  {user?.duenio?.nombre?.charAt(0).toUpperCase() || 'D'}
                </div>
              </div>
            </div>
          </header>

          {/* Page Content with bottom padding for mobile bar */}
          <main ref={mainRef} className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/50 dark:bg-slate-950 pb-24 lg:pb-8 transition-colors">
            <div className="max-w-7xl mx-auto p-3 sm:p-6 lg:p-8 min-w-0 w-full">
              {children}
            </div>
          </main>

          {/* Mobile App Bottom Navigation */}
          <DuenioBottomNav />
        </div>
      </div>
      </ThemeModuleProvider>
    </ProtectedRoute>
  );
}
