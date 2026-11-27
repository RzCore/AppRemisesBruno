export const CAPACIDAD_POR_VEHICULO = 4;
export const MAX_PASAJEROS_POR_PEDIDO = 12;
export const MAX_VEHICULOS_POR_PEDIDO = 3;

export interface CalculoPasajerosResult {
  cantidadPasajeros: number;
  cantidadVehiculos: number;
  error?: string;
}

/**
 * Calcula la cantidad de vehículos necesarios según la cantidad de pasajeros:
 * - 1 a 4 pasajeros  -> 1 vehículo
 * - 5 a 8 pasajeros  -> 2 vehículos
 * - 9 a 12 pasajeros -> 3 vehículos (corte máximo anti-bromas)
 */
export function calcularVehiculosPorPasajeros(raw?: unknown): CalculoPasajerosResult {
  if (raw === undefined || raw === null || raw === '') {
    return { cantidadPasajeros: 1, cantidadVehiculos: 1 };
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    return {
      cantidadPasajeros: 1,
      cantidadVehiculos: 1,
      error: 'La cantidad de pasajeros debe ser un número entero entre 1 y 12.',
    };
  }

  if (parsed > MAX_PASAJEROS_POR_PEDIDO) {
    return {
      cantidadPasajeros: MAX_PASAJEROS_POR_PEDIDO,
      cantidadVehiculos: MAX_VEHICULOS_POR_PEDIDO,
      error: `El máximo permitido por solicitud es de ${MAX_PASAJEROS_POR_PEDIDO} pasajeros (${MAX_VEHICULOS_POR_PEDIDO} vehículos).`,
    };
  }

  const cantidadVehiculos = Math.min(
    MAX_VEHICULOS_POR_PEDIDO,
    Math.ceil(parsed / CAPACIDAD_POR_VEHICULO)
  );

  return {
    cantidadPasajeros: parsed,
    cantidadVehiculos,
  };
}
