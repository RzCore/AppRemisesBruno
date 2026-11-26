-- Agrega seguimiento de rechazos consecutivos, email del propietario del vehículo,
-- destino de transferencia por viaje (propia vs agencia) y desglose en liquidaciones.

ALTER TABLE "choferes" ADD COLUMN IF NOT EXISTS "rechazosConsecutivos" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "vehiculos" ADD COLUMN IF NOT EXISTS "propietarioEmail" TEXT;

ALTER TABLE "viajes" ADD COLUMN IF NOT EXISTS "destinoTransferencia" TEXT;

ALTER TABLE "liquidaciones" ADD COLUMN IF NOT EXISTS "totalTransferenciaAgencia" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
ALTER TABLE "liquidaciones" ADD COLUMN IF NOT EXISTS "totalTransferenciaPropia" DOUBLE PRECISION NOT NULL DEFAULT 0.0;
