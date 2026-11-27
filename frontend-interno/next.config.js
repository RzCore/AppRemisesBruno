/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
  onDemandEntries: {
    maxInactiveAge: 15 * 60 * 1000,
    pagesBufferLength: 25,
  },
  images: {
    domains: [
      'localhost',
      'brunoremises.com.ar',
      'www.brunoremises.com.ar',
      'clientes.brunoremises.com.ar',
      'choferes.brunoremises.com.ar',
      'coordinacion.brunoremises.com.ar',
      'admin.brunoremises.com.ar',
    ],
  },
};

module.exports = nextConfig;
