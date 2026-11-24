'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { clienteAuthService } from '@/lib/api';
import LogoBruno from '@/components/LogoBruno';
import ThemeToggle from '@/components/ThemeToggle';
import InstallAppButton from '@/components/InstallAppButton';
import { toast } from 'react-hot-toast';
import {
  User,
  Phone,
  ShieldCheck,
  ArrowRight,
  MessageSquare,
  Lock,
  RotateCcw,
  Sparkles,
  CheckCircle,
  HelpCircle,
  ArrowLeft
} from 'lucide-react';
import Link from 'next/link';

const soloNumeros = (val: string) => val.replace(/\D/g, '');
const soloLetras = (val: string) =>
  val.replace(/[^a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛãõÃÕçÇñÑ\s'´¨-]/g, '');

export default function ClienteLoginPage() {
  const router = useRouter();
  const { user, login } = useAuth();

  // Estados del flujo de ingreso
  // 'IDENTIFICADOR': paso 1 (DNI o Teléfono)
  // 'PIN': paso 2a (ingresar PIN de 4 dígitos)
  // 'OTP_WHATSAPP': paso 2b (código de 4 dígitos recibido por WhatsApp)
  // 'REGISTRO_EXPRESS': paso nuevo cliente (no encontrado en la base)
  const [paso, setPaso] = useState<'IDENTIFICADOR' | 'PIN' | 'OTP_WHATSAPP' | 'REGISTRO_EXPRESS'>('IDENTIFICADOR');

  const [identificador, setIdentificador] = useState('');
  const [pin, setPin] = useState('');
  const [codigoOtp, setCodigoOtp] = useState('');
  const [telefonoEnmascarado, setTelefonoEnmascarado] = useState('');
  const [loading, setLoading] = useState(false);

  // Datos para registro express si no está registrado
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoApellido, setNuevoApellido] = useState('');
  const [nuevoDni, setNuevoDni] = useState('');
  const [nuevoTelefono, setNuevoTelefono] = useState('');
  const [nuevoPin, setNuevoPin] = useState('');

  // Temporizador de reenvío de código WhatsApp
  const [cooldownOtp, setCooldownOtp] = useState(0);

  useEffect(() => {
    // Si ya tiene sesión activa de CLIENTE, enviarlo a la app
    if (user && user.rol === 'CLIENTE') {
      router.replace('/cliente/app');
    }
  }, [user, router]);

  useEffect(() => {
    if (cooldownOtp > 0) {
      const timer = setTimeout(() => setCooldownOtp(cooldownOtp - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldownOtp]);

  // Paso 1: Procesar Identificador (DNI o Celular)
  const handleContinuarIdentificador = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = soloNumeros(identificador.trim());
    if (cleanId.length < 7) {
      toast.error('Por favor ingresá un número de DNI o teléfono válido (al menos 7 dígitos)');
      return;
    }

    setLoading(true);
    try {
      // Intentamos verificar si el cliente ya existe
      const res = await clienteAuthService.loginCliente(cleanId, '__check_only__');
      
      if (res.data?.code === 'CLIENTE_NO_ENCONTRADO') {
        // Cliente nuevo -> derivar a Registro Express
        if (cleanId.length === 7 || cleanId.length === 8) {
          setNuevoDni(cleanId);
          setNuevoTelefono('');
        } else {
          setNuevoTelefono(cleanId);
          setNuevoDni('');
        }
        setPaso('REGISTRO_EXPRESS');
        toast('¡Bienvenido! Completá tus datos para empezar a viajar.', { icon: '👋' });
      } else {
        // Cliente existe -> mostrar opción de PIN o solicitar código
        setPaso('PIN');
      }
    } catch {
      setPaso('PIN');
    } finally {
      setLoading(false);
    }
  };

  // Paso 2a: Ingresar con PIN de 4 dígitos
  const handleLoginConPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin || pin.length < 4) {
      toast.error('El PIN debe tener 4 dígitos numéricos');
      return;
    }

    setLoading(true);
    try {
      const res = await clienteAuthService.loginCliente(identificador, pin);
      const payload: any = res.data || res;
      const userObj = payload?.user || (res as any)?.user;
      const token = payload?.accessToken || payload?.token || (res as any)?.token;
      const refreshToken = payload?.refreshToken || (res as any)?.refreshToken;

      if (res.success && userObj && token) {
        toast.success(res.message || '¡Bienvenido a Remises Bruno!', { icon: '🚗' });
        login(userObj, token, refreshToken);
        router.replace('/cliente/app');
      } else {
        toast.error(res.message || 'PIN incorrecto. Podés ingresar solicitando un código por WhatsApp.');
      }
    } catch {
      toast.error('Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  // Solicitar código OTP por WhatsApp
  const handlePedirCodigoWhatsApp = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await clienteAuthService.solicitarCodigo(identificador);
      if (res.success) {
        setTelefonoEnmascarado(res.data?.telefonoEnmascarado || '');
        setCooldownOtp(60);
        setPaso('OTP_WHATSAPP');
        toast.success(res.message || 'Código enviado a tu WhatsApp', { icon: '💬', duration: 5000 });
      } else {
        toast.error(res.message || 'No se pudo enviar el código por WhatsApp');
      }
    } catch {
      toast.error('Error al conectar con WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  // Paso 2b: Verificar código OTP de WhatsApp
  const handleVerificarCodigoOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigoOtp || codigoOtp.length !== 4) {
      toast.error('Ingresá los 4 dígitos del código');
      return;
    }

    setLoading(true);
    try {
      const res = await clienteAuthService.verificarCodigo(identificador, codigoOtp);
      const payload: any = res.data || res;
      const userObj = payload?.user || (res as any)?.user;
      const token = payload?.accessToken || payload?.token || (res as any)?.token;
      const refreshToken = payload?.refreshToken || (res as any)?.refreshToken;

      if (res.success && userObj && token) {
        toast.success('¡Identidad verificada exitosamente!', { icon: '✅' });
        login(userObj, token, refreshToken);
        router.replace('/cliente/app');
      } else {
        toast.error(res.message || 'Código incorrecto o expirado');
      }
    } catch {
      toast.error('Error al verificar código');
    } finally {
      setLoading(false);
    }
  };

  // Paso 3: Registro Express de nuevo cliente
  const handleRegistroExpress = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNom = soloLetras(nuevoNombre).trim();
    const cleanApe = soloLetras(nuevoApellido).trim();

    if (cleanNom.length < 2) {
      toast.error('Por favor ingresá tu nombre (solo letras)');
      return;
    }
    if (cleanApe.length < 2) {
      toast.error('Por favor ingresá tu apellido (solo letras)');
      return;
    }

    const cleanD = soloNumeros(nuevoDni);
    const cleanT = soloNumeros(nuevoTelefono);
    const cleanP = soloNumeros(nuevoPin);

    if (cleanD.length < 7 || cleanD.length > 8) {
      toast.error('El DNI debe tener 7 u 8 dígitos numéricos');
      return;
    }
    if (cleanT.length < 8) {
      toast.error('Por favor ingresá un número de teléfono celular válido');
      return;
    }
    if (cleanP.length > 0 && cleanP.length < 4) {
      toast.error('Si ingresás un PIN, debe tener al menos 4 dígitos numéricos');
      return;
    }

    setLoading(true);
    try {
      const res = await clienteAuthService.registroExpress({
        dni: cleanD,
        nombre: cleanNom,
        apellido: cleanApe,
        telefono: cleanT,
        pin: cleanP || undefined
      });

      const payload: any = res.data || res;
      const userObj = payload?.user || (res as any)?.user;
      const token = payload?.accessToken || payload?.token || (res as any)?.token;
      const refreshToken = payload?.refreshToken || (res as any)?.refreshToken;

      if (res.success && userObj && token) {
        toast.success(res.message || '¡Cuenta creada con éxito!', { icon: '🎉' });
        login(userObj, token, refreshToken);
        router.replace('/cliente/app');
      } else {
        toast.error(res.message || 'Error al completar el registro');
      }
    } catch {
      toast.error('Error al registrar cuenta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col justify-between items-center p-4 selection:bg-emerald-500 selection:text-white transition-colors duration-200">
      {/* Botón flotante de Modo Oscuro */}
      <div className="absolute top-4 right-4 z-20">
        <ThemeToggle />
      </div>

      {/* Espaciador superior para mantener la tarjeta centrada */}
      <div className="hidden sm:block" aria-hidden="true" />

      <div className="w-full max-w-md my-auto bg-white dark:bg-slate-900 rounded-3xl shadow-xl shadow-slate-200/60 dark:shadow-none border border-slate-100 dark:border-slate-800 p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200">
        {/* Encabezado con Logo oficial */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="mb-3 transform hover:scale-105 transition-transform">
            <LogoBruno size={80} />
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            Remises Bruno
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Acceso exclusivo para Pasajeros
          </p>
        </div>

        {/* ============================================================== */}
        {/* PASO 1: Ingreso de DNI o Teléfono                              */}
        {/* ============================================================== */}
        {paso === 'IDENTIFICADOR' && (
          <form onSubmit={handleContinuarIdentificador} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                Ingresá tu DNI o Número de Celular
              </label>
              <div className="relative">
                <input
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={15}
                  autoFocus
                  required
                  value={identificador}
                  onChange={(e) => setIdentificador(soloNumeros(e.target.value).slice(0, 15))}
                  placeholder="Ej: 35123456 ó 2346551234"
                  className="w-full pl-4 pr-4 py-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-bold text-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:text-slate-400 placeholder:text-sm placeholder:font-normal"
                />
              </div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5 leading-relaxed">
                Podés ingresar con tu DNI de siempre o tu WhatsApp sin acordarte contraseñas difíciles.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !identificador.trim()}
              className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* ============================================================== */}
        {/* PASO 2A: Ingreso con PIN de 4 dígitos                          */}
        {/* ============================================================== */}
        {paso === 'PIN' && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => {
                  setPin('');
                  setPaso('IDENTIFICADOR');
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Volver</span>
              </button>
              <span className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg">
                {identificador}
              </span>
            </div>

            <form onSubmit={handleLoginConPin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2">
                  Ingresá tu PIN de 4 dígitos
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  autoFocus
                  required
                  value={pin}
                  onChange={(e) => setPin(soloNumeros(e.target.value).slice(0, 6))}
                  placeholder="••••"
                  className="w-full text-center tracking-[0.5em] py-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-black text-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:tracking-normal placeholder:text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading || pin.length < 4}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Ingresar</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="relative py-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white dark:bg-slate-900 px-3 text-slate-400 font-semibold">
                  ¿No te acordás el PIN?
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePedirCodigoWhatsApp}
              disabled={loading}
              className="w-full py-3 px-4 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40 dark:border-emerald-700/40 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Enviar código de 4 dígitos a mi WhatsApp</span>
            </button>
          </div>
        )}

        {/* ============================================================== */}
        {/* PASO 2B: Verificación de Código OTP de WhatsApp                */}
        {/* ============================================================== */}
        {paso === 'OTP_WHATSAPP' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPaso('PIN')}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Usar PIN</span>
              </button>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                WhatsApp: {telefonoEnmascarado}
              </span>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/60 dark:border-emerald-800/60 rounded-2xl text-center">
              <p className="text-xs text-emerald-800 dark:text-emerald-200 font-medium">
                💬 Te enviamos un código de 4 dígitos por WhatsApp. Ingresalo para entrar:
              </p>
            </div>

            <form onSubmit={handleVerificarCodigoOtp} className="space-y-4">
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  autoFocus
                  required
                  value={codigoOtp}
                  onChange={(e) => setCodigoOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="0000"
                  className="w-full text-center tracking-[0.6em] py-3.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-2xl text-slate-900 dark:text-white font-black text-3xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all placeholder:tracking-normal placeholder:text-slate-400 placeholder:text-lg"
                />
              </div>

              <button
                type="submit"
                disabled={loading || codigoOtp.length !== 4}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Confirmar e Ingresar</span>
                    <CheckCircle className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>

            <div className="text-center pt-2">
              {cooldownOtp > 0 ? (
                <p className="text-xs text-slate-400">
                  Podés pedir otro código en <span className="font-bold text-slate-600 dark:text-slate-300">{cooldownOtp}s</span>
                </p>
              ) : (
                <button
                  type="button"
                  onClick={handlePedirCodigoWhatsApp}
                  className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reenviar código por WhatsApp</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* PASO 3: Registro Express de Cliente Nuevo                      */}
        {/* ============================================================== */}
        {paso === 'REGISTRO_EXPRESS' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPaso('IDENTIFICADOR')}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 font-semibold"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Cambiar DNI / Celular</span>
              </button>
              <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-lg">
                Nuevo Pasajero
              </span>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/60 rounded-2xl">
              <p className="text-xs text-amber-900 dark:text-amber-200 font-semibold flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                ¡Es tu primera vez! Completá tus datos para pedir tu remís:
              </p>
            </div>

            <form onSubmit={handleRegistroExpress} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nombre *
                  </label>
                  <input
                    type="text"
                    autoFocus
                    required
                    maxLength={50}
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(soloLetras(e.target.value))}
                    placeholder="Ej: Juan"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Apellido *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={50}
                    value={nuevoApellido}
                    onChange={(e) => setNuevoApellido(soloLetras(e.target.value))}
                    placeholder="Ej: Pérez"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    DNI *
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    required
                    value={nuevoDni}
                    onChange={(e) => setNuevoDni(soloNumeros(e.target.value).slice(0, 8))}
                    placeholder="35123456"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Celular (WhatsApp) *
                  </label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={15}
                    required
                    value={nuevoTelefono}
                    onChange={(e) => setNuevoTelefono(soloNumeros(e.target.value).slice(0, 15))}
                    placeholder="2346551234"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Creá tu PIN de 4 dígitos (Opcional)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={nuevoPin}
                  onChange={(e) => setNuevoPin(soloNumeros(e.target.value).slice(0, 6))}
                  placeholder="Ej: 1234 (para entrar siempre rápido)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-2xl shadow-lg shadow-emerald-600/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span>Crear Cuenta y Pedir Remís</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        <div className="pt-2 flex justify-center">
          <InstallAppButton />
        </div>
      </div>

      {/* Footer Desarrollador - RzCore */}
      <footer className="w-full pt-6 pb-2 flex justify-center">
        <a
          href="https://rzcore.dev"
          target="_blank"
          rel="noopener noreferrer"
          title="Visitar rzcore.dev"
          className="group inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl bg-white/80 dark:bg-slate-900/80 hover:bg-white dark:hover:bg-slate-900 border border-slate-200/80 dark:border-slate-800 hover:border-sky-400/60 dark:hover:border-sky-500/50 shadow-sm hover:shadow-md transition-all duration-200"
        >
          <span className="w-7 h-7 overflow-hidden flex items-center justify-center shrink-0">
            <img
              src="/Rz-Core-Isologo.png"
              alt="RzCore Logo"
              className="w-12 h-12 max-w-none object-contain pointer-events-none select-none group-hover:scale-110 transition-transform duration-200"
            />
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Desarrollado por{' '}
            <span className="font-extrabold text-slate-800 dark:text-slate-100 group-hover:text-sky-600 dark:group-hover:text-sky-400 transition-colors">
              RzCore
            </span>
          </span>
        </a>
      </footer>
    </div>
  );
}
