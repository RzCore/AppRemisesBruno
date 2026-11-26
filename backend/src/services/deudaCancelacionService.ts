import { prisma } from '../lib/prisma';

/**
 * Extrae los últimos 8 dígitos de un teléfono para emparejar formatos
 * distintos (ej: "5492346123456", "2346-123456", "02346 15 123456").
 */
export function normalizarTelefonoSufijo(tel?: string | null): string | null {
  if (!tel) return null;
  const digits = String(tel).replace(/\D/g, '');
  if (digits.length < 7) return null;
  return digits.slice(-8);
}

export async function registrarDeudaCancelacion(params: {
  remiseriaId: string;
  clienteId?: string | null;
  clienteTelefono?: string | null;
  clienteNombre?: string | null;
  viajeOrigenId: string;
  choferAcreedorId?: string | null;
  monto?: number | null;
  motivo: 'CANCELACION_MENOS_10_CUADRAS' | 'PASAJERO_AUSENTE';
  observaciones?: string | null;
}) {
  const {
    remiseriaId,
    clienteId,
    clienteTelefono,
    clienteNombre,
    viajeOrigenId,
    choferAcreedorId,
    monto,
    motivo,
    observaciones,
  } = params;

  if (!choferAcreedorId || !monto || monto <= 0) {
    return null;
  }

  // Si no hay ni clienteId ni teléfono válido, no podremos identificarlo en su próximo viaje
  const telLimpio = clienteTelefono ? String(clienteTelefono).replace(/\D/g, '') : null;
  if (!clienteId && (!telLimpio || telLimpio.length < 7)) {
    return null;
  }

  try {
    return await prisma.deudaCancelacion.upsert({
      where: { viajeOrigenId },
      update: {
        monto,
        motivo,
        observaciones: observaciones || undefined,
      },
      create: {
        remiseriaId,
        clienteId: clienteId || null,
        clienteTelefono: telLimpio || null,
        clienteNombre: clienteNombre || null,
        viajeOrigenId,
        choferAcreedorId,
        monto,
        motivo,
        estado: 'PENDIENTE',
        observaciones: observaciones || null,
      },
      include: {
        choferAcreedor: {
          select: {
            id: true,
            numeroChofer: true,
            nombre: true,
            apellido: true,
          },
        },
      },
    });
  } catch (err) {
    console.error('Error registrando deuda de cancelación:', err);
    return null;
  }
}

export async function obtenerDeudasPendientesPasajero(params: {
  remiseriaId: string;
  clienteId?: string | null;
  clienteTelefono?: string | null;
}) {
  const { remiseriaId, clienteId, clienteTelefono } = params;
  const sufijo = normalizarTelefonoSufijo(clienteTelefono);

  if (!clienteId && !sufijo) {
    return [];
  }

  const orConditions: any[] = [];
  if (clienteId) {
    orConditions.push({ clienteId });
  }
  if (sufijo) {
    orConditions.push({ clienteTelefono: { endsWith: sufijo } });
  }

  try {
    return await prisma.deudaCancelacion.findMany({
      where: {
        remiseriaId,
        estado: 'PENDIENTE',
        OR: orConditions,
      },
      include: {
        choferAcreedor: {
          select: {
            id: true,
            numeroChofer: true,
            nombre: true,
            apellido: true,
          },
        },
        viajeOrigen: {
          select: {
            id: true,
            origen: true,
            destino: true,
            fecha: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  } catch (err) {
    console.warn('Error consultando deudas pendientes del pasajero:', err);
    return [];
  }
}

export async function marcarDeudaCancelacionCobrada(params: {
  deudaId: string;
  choferCobradorId: string;
  viajeCobroId?: string | null;
  observaciones?: string | null;
}) {
  const { deudaId, choferCobradorId, viajeCobroId, observaciones } = params;

  return await prisma.deudaCancelacion.update({
    where: { id: deudaId },
    data: {
      estado: 'COBRADA',
      choferCobradorId,
      viajeCobroId: viajeCobroId || null,
      fechaCobro: new Date(),
      ...(observaciones ? { observaciones } : {}),
    },
    include: {
      choferAcreedor: {
        select: {
          id: true,
          numeroChofer: true,
          nombre: true,
          apellido: true,
        },
      },
      choferCobrador: {
        select: {
          id: true,
          numeroChofer: true,
          nombre: true,
          apellido: true,
        },
      },
    },
  });
}
