-- Activa Row Level Security (RLS) en todas las tablas del esquema public.
-- Toda la aplicación accede a la base de datos a través del backend Express + Prisma
-- (usuario postgres con privilegio BYPASSRLS). Habilitar RLS sin políticas para los roles
-- anon/authenticated bloquea el acceso público directo vía PostgREST y resuelve las alertas
-- "Unrestricted" de Supabase Security Advisor sin afectar el funcionamiento del sistema.

DO $$
DECLARE
  tbl RECORD;
BEGIN
  FOR tbl IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', tbl.tablename);
  END LOOP;
END $$;
