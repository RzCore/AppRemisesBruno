'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import LogoBruno from '@/components/LogoBruno';

export default function ClientesEntryPage() {
  const { user, loading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (isAuthenticated && user?.rol === 'CLIENTE') {
        router.replace('/cliente/app');
      } else {
        router.replace('/cliente/login');
      }
    }
  }, [loading, isAuthenticated, user, router]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center text-white space-y-4">
        <div className="flex justify-center">
          <LogoBruno size={72} />
        </div>
        <h1 className="text-xl font-bold tracking-tight">Remises Bruno</h1>
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-500 mx-auto"></div>
      </div>
    </div>
  );
}
