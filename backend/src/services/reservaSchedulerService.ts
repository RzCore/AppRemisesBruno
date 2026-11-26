import { prisma } from '../lib/prisma';
import { getIO } from '../lib/socket';

// Anticipación por defecto en minutos para disparar el viaje antes de la hora reservada
const ANTICIPACION_MINUTOS = 15;
// Ventana de tolerancia posterior (por si el servidor se reinició justo en el minuto exacto)
const TOLERANCIA_POSTERIOR_MINUTOS = 10;
// Offset fijo de Argentina (UTC-3, sin horario de verano)
const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;

// Registro en memoria para evitar evaluaciones duplicadas en el mismo ciclo/día: `${reservaId}:${YYYY-MM-DD}`
const reservasDisparadas = new Set<string>();

function getArgDateParts(date: Date) {
  const argDate = new Date(date.getTime() - ARG_OFFSET_MS);
  const year = argDate.getUTCFullYear();
  const month = argDate.getUTCMonth() + 1;
  const day = argDate.getUTCDate();
  const dayOfWeek = argDate.getUTCDay(); // 0=Dom, 1=Lun, ..., 6=Sab
  const ymd = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return { year, month, day, dayOfWeek, ymd };
}

/**
 * Extrae el YYYY-MM-DD de una fecha de reserva (fechaInicio / fechaFin).
 * Si viene guardada exactamente como medianoche UTC (ej. de new Date('2026-11-27')),
 * conserva el día calendario UTC para evitar corrimiento de -1 día en Argentina.
 */
function getReservaYMD(date: Date): string {
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return getArgDateParts(date).ymd;
}

const DIA_NOMBRE_A_NUMERO: Record<string, string> = {
  '0': '0',
  DOMINGO: '0',
  DOM: '0',
  '1': '1',
  LUNES: '1',
  LUN: '1',
  '2': '2',
  MARTES: '2',
  MAR: '2',
  '3': '3',
  MIERCOLES: '3',
  MIÉRCOLES: '3',
  MIE: '3',
  '4': '4',
  JUEVES: '4',
  JUE: '4',
  '5': '5',
  VIERNES: '5',
  VIE: '5',
  '6': '6',
  SABADO: '6',
  SÁBADO: '6',
  SAB: '6',
};

function parseDiasSemana(diasSemana: string | null): string[] {
  if (!diasSemana) return [];
  let rawItems: string[] = [];
  try {
    const parsed = JSON.parse(diasSemana);
    if (Array.isArray(parsed)) {
      rawItems = parsed.map((d) => String(d).trim());
    }
  } catch {
    rawItems = diasSemana
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return rawItems
    .map((item) => DIA_NOMBRE_A_NUMERO[item.toUpperCase()])
    .filter((v): v is string => Boolean(v));
}

/**
 * Procesa todas las reservas activas y genera automáticamente el Viaje en estado PENDIENTE
 * cuando faltan <= ANTICIPACION_MINUTOS para la hora pactada.
 */
export async function procesarReservasProgramadas() {
  const ahora = new Date();
  const ahoraMs = ahora.getTime();

  // Evaluamos tanto el día de hoy como el de mañana (hora Argentina) para cubrir
  // correctamente reservas de medianoche/madrugada (ej. 00:05 o 00:30 cuando son las 23:50 del día anterior).
  const hoyArg = getArgDateParts(ahora);
  const mananaArg = getArgDateParts(new Date(ahoraMs + 24 * 60 * 60 * 1000));
  const diasCandidatos = [hoyArg, mananaArg];

  const reservasActivas = await prisma.reserva.findMany({
    where: {
      estado: 'ACTIVA',
    },
    include: {
      cliente: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          telefono: true,
          email: true,
        },
      },
    },
  });

  if (!reservasActivas || reservasActivas.length === 0) return;

  let io: any = null;
  try {
    io = getIO();
  } catch {
    io = null;
  }

  for (const reserva of reservasActivas) {
    if (!reserva.horaInicio) continue;

    const [hStr, mStr] = reserva.horaInicio.split(':');
    const hora = parseInt(hStr, 10);
    const minuto = parseInt(mStr, 10);
    if (isNaN(hora) || isNaN(minuto)) continue;

    const fechaInicioYMD = getReservaYMD(new Date(reserva.fechaInicio));
    const fechaFinYMD = reserva.fechaFin ? getReservaYMD(new Date(reserva.fechaFin)) : null;

    // Si es periódica con fechaFin ya vencida (anterior a hoy), marcarla como COMPLETADA
    if (reserva.tipo === 'PERIODICA' && fechaFinYMD && fechaFinYMD < hoyArg.ymd) {
      await prisma.reserva.update({
        where: { id: reserva.id },
        data: { estado: 'COMPLETADA' },
      });
      continue;
    }

    const diasPermitidos = parseDiasSemana(reserva.diasSemana);

    for (const candidato of diasCandidatos) {
      // 1. Validar que el día candidato corresponda a la reserva
      if (reserva.tipo === 'UNICA') {
        if (candidato.ymd !== fechaInicioYMD) continue;
      } else {
        // PERIODICA
        if (candidato.ymd < fechaInicioYMD) continue;
        if (fechaFinYMD && candidato.ymd > fechaFinYMD) continue;
        if (diasPermitidos.length > 0 && !diasPermitidos.includes(String(candidato.dayOfWeek))) {
          continue;
        }
      }

      // 2. Calcular timestamp UTC exacto de esta ocurrencia (hora Argentina = UTC-3 => sumar 3h a UTC)
      const ocurrenciaMs = Date.UTC(
        candidato.year,
        candidato.month - 1,
        candidato.day,
        hora + 3,
        minuto,
        0,
        0
      );
      const diffMinutos = (ocurrenciaMs - ahoraMs) / 60000;

      // Disparar cuando falten <= ANTICIPACION_MINUTOS y no haya pasado más de TOLERANCIA_POSTERIOR_MINUTOS
      if (diffMinutos > ANTICIPACION_MINUTOS || diffMinutos < -TOLERANCIA_POSTERIOR_MINUTOS) {
        continue;
      }

      const claveDisparo = `${reserva.id}:${candidato.ymd}`;
      if (reservasDisparadas.has(claveDisparo)) {
        continue;
      }

      // 3. Verificar en base de datos para garantizar idempotencia incluso tras reinicios del servidor
      const ventanaDesde = new Date(ocurrenciaMs - 60 * 60 * 1000);
      const ventanaHasta = new Date(ocurrenciaMs + 60 * 60 * 1000);
      const yaExiste = await prisma.viaje.findFirst({
        where: {
          remiseriaId: reserva.remiseriaId,
          origen: reserva.origen,
          destino: reserva.destino,
          clienteTelefono: reserva.clienteTelefono,
          fecha: {
            gte: ventanaDesde,
            lte: ventanaHasta,
          },
        },
        select: { id: true },
      });

      if (yaExiste) {
        reservasDisparadas.add(claveDisparo);
        if (reserva.tipo === 'UNICA') {
          await prisma.reserva.update({
            where: { id: reserva.id },
            data: { estado: 'COMPLETADA' },
          });
        }
        continue;
      }

      // 4. Crear el viaje en estado PENDIENTE para despacho inmediato
      const notaReserva = `📅 Reserva automática (${reserva.horaInicio} hs)`;
      const observacionesFinal = reserva.observaciones
        ? `${notaReserva} • ${reserva.observaciones}`
        : notaReserva;

      const nuevoViaje = await prisma.viaje.create({
        data: {
          origen: reserva.origen,
          destino: reserva.destino,
          precio: 0,
          fecha: new Date(ocurrenciaMs),
          estado: 'PENDIENTE',
          prioridad: 'ALTA',
          clienteNombre: reserva.clienteNombre,
          clienteTelefono: reserva.clienteTelefono,
          clienteEmail: reserva.clienteEmail || null,
          clienteId: reserva.clienteId || null,
          choferId: reserva.choferId || null,
          vehiculoId: reserva.vehiculoId || null,
          remiseriaId: reserva.remiseriaId,
          observaciones: observacionesFinal,
        },
        include: {
          cliente: true,
          chofer: true,
          vehiculo: true,
        },
      });

      reservasDisparadas.add(claveDisparo);

      if (reserva.tipo === 'UNICA') {
        await prisma.reserva.update({
          where: { id: reserva.id },
          data: { estado: 'COMPLETADA' },
        });
      }

      console.log(
        `📅 [Reserva Automática] Viaje #${nuevoViaje.id} generado para ${reserva.clienteNombre} (${candidato.ymd} ${reserva.horaInicio} hs)`
      );

      // 5. Notificar en tiempo real a la central y a los choferes conectados
      if (io) {
        io.to(reserva.remiseriaId).emit('nuevo_viaje_recibido', nuevoViaje);

        // 6. Si no tiene chofer preasignado, verificar si hay móviles libres ahora mismo.
        // Si no hay ningún vehículo disponible, emitir alerta prioritaria al coordinador.
        if (!reserva.choferId) {
          const [choferesOnline, viajesActivos] = await Promise.all([
            prisma.chofer.findMany({
              where: {
                remiseriaId: reserva.remiseriaId,
                estado: 'ACTIVO',
                isOnline: true,
              },
              select: { id: true, observaciones: true },
            }),
            prisma.viaje.findMany({
              where: {
                remiseriaId: reserva.remiseriaId,
                choferId: { not: null },
                OR: [
                  { estado: { in: ['EN_CAMINO', 'EN_CURSO'] } },
                  { estado: 'ACEPTADO', artEmpresaId: null },
                ],
              },
              select: { choferId: true },
            }),
          ]);

          const ocupadosSet = new Set(viajesActivos.map((v) => v.choferId).filter(Boolean));
          const libres = choferesOnline.filter((c) => {
            if (ocupadosSet.has(c.id)) return false;
            if (c.observaciones && c.observaciones.startsWith('{')) {
              try {
                if (JSON.parse(c.observaciones).enPausa === true) return false;
              } catch {}
            }
            return true;
          });

          if (libres.length === 0) {
            console.log(
              `⚠️ [Reserva Automática] Sin móviles libres para viaje #${nuevoViaje.id} (${reserva.clienteNombre}, ${reserva.horaInicio} hs)`
            );
            io.to(reserva.remiseriaId).emit('reserva_sin_moviles_disponibles', {
              viajeId: nuevoViaje.id,
              reservaId: reserva.id,
              horaInicio: reserva.horaInicio,
              clienteNombre: reserva.clienteNombre,
              clienteTelefono: reserva.clienteTelefono,
              origen: reserva.origen,
              destino: reserva.destino,
              choferesOnline: choferesOnline.length,
              choferesEnViaje: ocupadosSet.size,
              mensaje: `Reserva de ${reserva.clienteNombre} (${reserva.horaInicio} hs) sin móviles disponibles en este momento.`,
            });
          }
        }
      }
    }
  }

  // Limpieza simple del set en memoria para no crecer indefinidamente
  if (reservasDisparadas.size > 500) {
    reservasDisparadas.clear();
  }
}

/**
 * Inicia el monitor periódico (cada 60 segundos) que dispara reservas programadas automáticamente.
 */
export function iniciarServicioReservasAutomaticas() {
  console.log(
    `📅 Servicio de disparo automático de reservas iniciado (${ANTICIPACION_MINUTOS} min de anticipación).`
  );

  // Primera pasada a los 5 segundos de iniciar el servidor
  setTimeout(() => {
    procesarReservasProgramadas().catch((err) =>
      console.error('Error en revisión inicial de reservas automáticas:', err)
    );
  }, 5000);

  // Revisión continua cada 60 segundos
  setInterval(() => {
    procesarReservasProgramadas().catch((err) =>
      console.error('Error en el servicio de reservas automáticas:', err)
    );
  }, 60 * 1000);
}
