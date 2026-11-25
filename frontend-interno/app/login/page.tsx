'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { toast } from 'react-hot-toast';
import { authService } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { LoginCredentials } from '@/types';
import { Eye, EyeOff, User, Lock } from 'lucide-react';
import Link from 'next/link';
import LogoBruno from '@/components/LogoBruno';
import InstallAppButton from '@/components/InstallAppButton';

export default function InternoLoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [portalDetectado, setPortalDetectado] = useState<'ADMIN' | 'COORDINADOR' | 'CHOFER' | null>(null);
  const router = useRouter();
  const { login } = useAuth();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const host = window.location.hostname.toLowerCase();
    if (host.startsWith('choferes.') || host.startsWith('chofer.')) {
      setPortalDetectado('CHOFER');
    } else if (host.startsWith('coordinacion.') || host.startsWith('coordinador.')) {
      setPortalDetectado('COORDINADOR');
    } else if (host.startsWith('admin.') || host.startsWith('duenio.')) {
      setPortalDetectado('ADMIN');
    }
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginCredentials>();

  const onSubmit = async (data: LoginCredentials) => {
    setIsLoading(true);
    try {
      const response = await authService.login(data);

      if (response.success && response.data) {
        const { user, accessToken, refreshToken } = response.data;

        if (user.rol === 'CLIENTE') {
          toast.error('Este acceso es exclusivo para personal de la agencia (Choferes, Coordinación y Administración).');
          return;
        }

        login(user as any, accessToken, refreshToken);
        toast.success('¡Sesión iniciada correctamente!');

        const hostname = typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
        const isProdDomain = hostname.includes('brunoremises.com.ar');

        if (isProdDomain) {
          if (user.rol === 'CHOFER') {
            if (!hostname.startsWith('choferes.')) {
              window.location.href = 'https://choferes.brunoremises.com.ar/';
              return;
            }
            router.push('/');
            return;
          } else if (user.rol === 'COORDINADOR') {
            if (!hostname.startsWith('coordinacion.')) {
              window.location.href = 'https://coordinacion.brunoremises.com.ar/';
              return;
            }
            router.push('/');
            return;
          } else if (user.rol === 'ADMIN') {
            if (!hostname.startsWith('admin.')) {
              window.location.href = 'https://admin.brunoremises.com.ar/admin/dashboard';
              return;
            }
            router.push('/admin/dashboard');
            return;
          } else {
            if (!hostname.startsWith('admin.')) {
              window.location.href = 'https://admin.brunoremises.com.ar/';
              return;
            }
            router.push('/');
            return;
          }
        }

        // Entorno local / preview
        if (user.rol === 'ADMIN') {
          router.push('/admin/dashboard');
        } else if (user.rol === 'COORDINADOR') {
          router.push('/coordinador/dashboard');
        } else if (user.rol === 'CHOFER') {
          router.push('/chofer/app');
        } else {
          router.push('/duenio/dashboard');
        }
        return;
      } else {
        toast.error(response.message || 'Credenciales inválidas');
      }
    } catch (error: any) {
      console.error('Error en login interno:', error);
      toast.error(error.response?.data?.message || 'Error al conectar con el servidor');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="card p-6 sm:p-8 shadow-2xl">
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <LogoBruno size={84} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Remises Bruno</h1>
            <p className="text-sm text-gray-600 mt-1">
              {portalDetectado === 'CHOFER'
                ? 'Portal de Choferes'
                : portalDetectado === 'COORDINADOR'
                  ? 'Central de Coordinación'
                  : portalDetectado === 'ADMIN'
                    ? 'Panel de Administración'
                    : 'Acceso Interno • Choferes, Coordinación y Administración'}
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  {...register('email', {
                    required: 'El email es requerido',
                    pattern: {
                      value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                      message: 'Email inválido',
                    },
                  })}
                  type="email"
                  id="email"
                  className="input pl-10"
                  placeholder="usuario@brunoremises.com.ar"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  {...register('password', {
                    required: 'La contraseña es requerida',
                    minLength: {
                      value: 6,
                      message: 'La contraseña debe tener al menos 6 caracteres',
                    },
                  })}
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  className="input pl-10 pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
            </div>

            <div className="flex justify-end">
              <Link
                href="/forgot-password"
                className="text-sm text-primary-600 hover:text-primary-700 transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full flex items-center justify-center"
            >
              {isLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                'Ingresar al Sistema'
              )}
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-gray-100 flex justify-center">
            <InstallAppButton />
          </div>
        </div>
      </div>
    </div>
  );
}
