-- CreateTable
CREATE TABLE IF NOT EXISTS "gastos_remiseria" (
    "id" TEXT NOT NULL,
    "remiseriaId" TEXT NOT NULL,
    "coordinadorId" TEXT,
    "categoria" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "proveedor" TEXT,
    "monto" DOUBLE PRECISION NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'PAGADO',
    "metodoPago" TEXT NOT NULL DEFAULT 'EFECTIVO',
    "numeroComprobante" TEXT,
    "esRecurrente" BOOLEAN NOT NULL DEFAULT false,
    "diaVencimientoMensual" INTEGER,
    "periodoMes" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gastos_remiseria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "gastos_remiseria_remiseriaId_fecha_idx" ON "gastos_remiseria"("remiseriaId", "fecha");
CREATE INDEX IF NOT EXISTS "gastos_remiseria_remiseriaId_categoria_idx" ON "gastos_remiseria"("remiseriaId", "categoria");
CREATE INDEX IF NOT EXISTS "gastos_remiseria_remiseriaId_estado_idx" ON "gastos_remiseria"("remiseriaId", "estado");
CREATE INDEX IF NOT EXISTS "gastos_remiseria_remiseriaId_periodoMes_idx" ON "gastos_remiseria"("remiseriaId", "periodoMes");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_remiseria_remiseriaId_fkey') THEN
        ALTER TABLE "gastos_remiseria" ADD CONSTRAINT "gastos_remiseria_remiseriaId_fkey"
        FOREIGN KEY ("remiseriaId") REFERENCES "remiserias"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gastos_remiseria_coordinadorId_fkey') THEN
        ALTER TABLE "gastos_remiseria" ADD CONSTRAINT "gastos_remiseria_coordinadorId_fkey"
        FOREIGN KEY ("coordinadorId") REFERENCES "coordinadores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
