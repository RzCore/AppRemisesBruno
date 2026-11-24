import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware exclusivo de la App de Clientes
 * Dominios soportados:
 * - brunoremises.com.ar / www.brunoremises.com.ar
 * - cliente.brunoremises.com.ar / clientes.brunoremises.com.ar
 * - localhost:3000 / previews de Vercel
 */
export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
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

  // 2. Enlace público de seguimiento en tiempo real
  if (pathname.startsWith('/track/')) {
    return NextResponse.next();
  }

  // 3. Rutas limpias de autenticación de pasajeros
  if (pathname === '/login' || pathname === '/registro' || pathname === '/register') {
    url.pathname = '/cliente/login';
    return NextResponse.rewrite(url);
  }

  // 4. Raíz del dominio abre directo la App de Clientes
  if (pathname === '/') {
    url.pathname = '/cliente/app';
    return NextResponse.rewrite(url);
  }

  // 5. Rutas directas bajo /cliente/*
  if (pathname.startsWith('/cliente/')) {
    return NextResponse.next();
  }

  // 6. Alias limpios sin prefijo /cliente
  if (['/app', '/viajes', '/reserva', '/perfil'].includes(pathname)) {
    url.pathname = `/cliente${pathname}`;
    return NextResponse.rewrite(url);
  }

  // 7. Cualquier otra ruta desconocida vuelve al inicio de la app de clientes
  url.pathname = '/';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
