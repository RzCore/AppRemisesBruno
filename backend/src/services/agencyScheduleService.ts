export interface AgencyScheduleStatus {
  abierta: boolean;
  motivo: 'ABIERTA' | 'MANUAL' | 'FIESTAS_NAVIDAD' | 'FIESTAS_ANIO_NUEVO';
  mensaje: string;
  reaperturaEstimada?: string;
}

/**
 * Evalúa si la remisería se encuentra abierta en una fecha/hora dada.
 * Considera tanto la configuración manual del dueño como el régimen especial de fiestas:
 * - 24/12: trabaja hasta las 18:00 hs y reabre el 25/12 a las 19:00 hs.
 * - 31/12: trabaja hasta las 18:00 hs y reabre el 01/01 a las 19:00 hs.
 */
export function checkAgenciaEstado(
  remiseria?: {
    agenciaAbierta?: boolean | null;
    mensajeCierre?: string | null;
    cierreAutomaticoFiestas?: boolean | null;
  } | null,
  dateToCheck: Date = new Date()
): AgencyScheduleStatus {
  if (!remiseria) {
    return {
      abierta: true,
      motivo: 'ABIERTA',
      mensaje: 'La agencia se encuentra abierta y prestando servicio normal.'
    };
  }

  // Convertir fecha a hora local de Argentina (UTC-3)
  const argDateStr = dateToCheck.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' });
  const argDate = new Date(argDateStr);

  const month = argDate.getMonth() + 1; // 1 = Enero, 12 = Diciembre
  const day = argDate.getDate(); // 1-31
  const hour = argDate.getHours(); // 0-23
  const minute = argDate.getMinutes();

  const timeDec = hour + minute / 60;

  // 1. Cierre automático por Fiestas de Fin de Año (si está habilitado o no está explícitamente en false)
  if (remiseria.cierreAutomaticoFiestas !== false) {
    // NAVIDAD: 24/12 desde las 18:00 hs hasta el 25/12 a las 19:00 hs
    const isNavidadEve = (month === 12 && day === 24 && timeDec >= 18);
    const isNavidadDay = (month === 12 && day === 25 && timeDec < 19);

    if (isNavidadEve || isNavidadDay) {
      const customMsg = remiseria.mensajeCierre?.trim();
      return {
        abierta: false,
        motivo: 'FIESTAS_NAVIDAD',
        mensaje: customMsg && customMsg.length > 5
          ? customMsg
          : '🎄 Por vísperas y celebración de Navidad, la agencia permanecerá cerrada desde el 24/12 a las 18:00 hs hasta el 25/12 a las 19:00 hs. ¡Felices Fiestas!',
        reaperturaEstimada: '25/12 a las 19:00 hs'
      };
    }

    // AÑO NUEVO: 31/12 desde las 18:00 hs hasta el 01/01 a las 19:00 hs
    const isNewYearEve = (month === 12 && day === 31 && timeDec >= 18);
    const isNewYearDay = (month === 1 && day === 1 && timeDec < 19);

    if (isNewYearEve || isNewYearDay) {
      const customMsg = remiseria.mensajeCierre?.trim();
      return {
        abierta: false,
        motivo: 'FIESTAS_ANIO_NUEVO',
        mensaje: customMsg && customMsg.length > 5
          ? customMsg
          : '🎆 Por vísperas y celebración de Fin de Año, la agencia permanecerá cerrada desde el 31/12 a las 18:00 hs hasta el 01/01 a las 19:00 hs. ¡Feliz Año Nuevo!',
        reaperturaEstimada: '01/01 a las 19:00 hs'
      };
    }
  }

  // 2. Cierre manual marcado por el dueño
  if (remiseria.agenciaAbierta === false) {
    const customMsg = remiseria.mensajeCierre?.trim();
    return {
      abierta: false,
      motivo: 'MANUAL',
      mensaje: customMsg && customMsg.length > 5
        ? customMsg
        : 'La agencia se encuentra momentáneamente cerrada. Disculpe las molestias.',
      reaperturaEstimada: 'Próximamente'
    };
  }

  // 3. Estado normal abierto
  return {
    abierta: true,
    motivo: 'ABIERTA',
    mensaje: 'La agencia se encuentra abierta y prestando servicio normal.'
  };
}
