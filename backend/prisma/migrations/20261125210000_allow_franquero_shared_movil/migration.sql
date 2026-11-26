-- Permite que choferes franqueros/relevo compartan el mismo número de móvil (numeroChofer)
-- y agrega la bandera booleana esFranquero para identificarlos en el sistema.

-- 1. Eliminar restricción UNIQUE sobre numeroChofer
DROP INDEX IF EXISTS "choferes_numeroChofer_key";

-- 2. Agregar columna esFranquero
ALTER TABLE "choferes" ADD COLUMN IF NOT EXISTS "esFranquero" BOOLEAN NOT NULL DEFAULT false;

-- 3. Crear índice compuesto no único para búsquedas rápidas por remisería y número de móvil
CREATE INDEX IF NOT EXISTS "choferes_remiseriaId_numeroChofer_idx" ON "choferes"("remiseriaId", "numeroChofer");
