import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware exclusivo de la App Interna (Choferes, Coordinador y Dueño/Admin)
 * Subdominios soportados:
 * - choferes.brunoremises.com.ar
 * - coordinacion.brunoremises.com.ar
 * - admin.brunoremises.com.ar
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const host = request.headers.get('host')?.toLowerCase() || '';
  const hostname = host.split(':')[0];
  const pathname = url.pathname;

  // 1. Omitir recursos estáticos, _next, api interna, favicon, imágenes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // 2. Bloquear rutas obsoletas o de clientes en la app interna
  if (pathname.startsWith('/cliente') || pathname.startsWith('/registro-chofer')) {
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // 3. Rutas públicas de autenticación interna
  const isAuthRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password');

  if (isAuthRoute) {
    return NextResponse.next();
  }

  // 4. Extraer subdominio
  let subdomain = '';
  if (hostname.endsWith('.brunoremises.com.ar')) {
    subdomain = hostname.replace('.brunoremises.com.ar', '');
  } else if (hostname.endsWith('.localhost')) {
    subdomain = hostname.replace('.localhost', '');
  } else {
    const parts = hostname.split('.');
    if (parts.length >= 3 && parts[0] !== 'www') {
      subdomain = parts[0];
    }
  }

  // --- SUBDOMINIO: CHOFERES (choferes.brunoremises.com.ar) ---
  if (subdomain === 'choferes' || subdomain === 'chofer') {
    if (pathname === '/') {
      url.pathname = '/chofer/app';
      return NextResponse.rewrite(url);
    }
    if (pathname.startsWith('/chofer/')) {
      return NextResponse.next();
    }
    if (['/app', '/gastos', '/historial', '/perfil'].includes(pathname)) {
      url.pathname = `/chofer${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // --- SUBDOMINIO: COORDINACIÓN (coordinacion.brunoremises.com.ar) ---
  if (subdomain === 'coordinacion' || subdomain === 'coordinador') {
    if (pathname === '/') {
      url.pathname = '/coordinador/dashboard';
      return NextResponse.rewrite(url);
    }
    if (pathname.startsWith('/coordinador/')) {
      return NextResponse.next();
    }
    if (
      ['/dashboard', '/mapa', '/cierre', '/choferes', '/reportes'].includes(pathname) ||
      pathname.startsWith('/viajes') ||
      pathname.startsWith('/reservas')
    ) {
      url.pathname = `/coordinador${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // --- SUBDOMINIO: ADMIN / DUEÑO (admin.brunoremises.com.ar) ---
  if (subdomain === 'admin' || subdomain === 'duenio') {
    if (pathname === '/') {
      url.pathname = '/duenio/dashboard';
      return NextResponse.rewrite(url);
    }
    if (pathname.startsWith('/duenio/') || pathname.startsWith('/admin/')) {
      return NextResponse.next();
    }
    if (
      [
        '/dashboard',
        '/choferes',
        '/vehiculos',
        '/coordinadores',
        '/liquidaciones',
        '/estadisticas',
        '/remiserias',
        '/configuracion',
        '/perfil',
        '/art',
        '/clientes',
      ].includes(pathname) ||
      pathname.startsWith('/informes')
    ) {
      url.pathname = `/duenio${pathname}`;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
