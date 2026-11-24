'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';

export default function LogoutButton({ className = '' }: { className?: string }) {
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <button
      onClick={handleLogout}
      className={`flex items-center justify-center p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition-colors ${className}`}
      title="Cerrar Sesión"
    >
      <LogOut className="w-5 h-5" />
    </button>
  );
}
