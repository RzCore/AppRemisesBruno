// Utilidades compartidas de tarificación para traslados desde base (origen fuera del radio urbano)

export const DEFAULT_BASE_LAT = -34.8957; // Chivilcoy centro
export const DEFAULT_BASE_LON = -60.0189;
export const RADIO_URBANO_BASE_KM = 12; // Radio urbano de la base (coincide con isEnChivilcoy)
export const UMBRAL_KM_RUTA = 15; // A partir de 15 km aplica tarifa Km en Ruta (sin bajada de bandera)
export const DEFAULT_VALOR_KM_RUTA = 900;

/**
 * Calcula el precio de un viaje normal aplicando:
 * - < 15 km (urbano): bajadaBandera + (km - 1) * valorKm
 * - >= 15 km (ruta / larga distancia, si NO es tarifa personalizada): km * valorKmRuta (sin bajada de bandera)
 * Redondeado siempre a múltiplos de $100.
 */
export function calcularPrecioTarifaNormal(params: {
  distanciaFacturableKm: number;
  bajadaBandera: number;
  valorKm: number;
  valorKmRuta?: number | null;
  esTarifaPersonalizada?: boolean;
}): { precio: number; esTarifaRuta: boolean; valorKmAplicado: number } {
  const {
    distanciaFacturableKm,
    bajadaBandera,
    valorKm,
    valorKmRuta,
    esTarifaPersonalizada = false,
  } = params;

  if (!esTarifaPersonalizada && distanciaFacturableKm >= UMBRAL_KM_RUTA) {
    const kmRuta =
      typeof valorKmRuta === 'number' && valorKmRuta > 0
        ? valorKmRuta
        : Math.round(valorKm * 0.75);
    return {
      precio: redondearPrecioMultiplo100(distanciaFacturableKm * kmRuta),
      esTarifaRuta: true,
      valorKmAplicado: kmRuta,
    };
  }

  let precio = bajadaBandera;
  if (distanciaFacturableKm > 1) {
    precio += (distanciaFacturableKm - 1) * valorKm;
  }
  return {
    precio: redondearPrecioMultiplo100(precio),
    esTarifaRuta: false,
    valorKmAplicado: valorKm,
  };
}

/**
 * Detecta si el recorrido cruza corredores conocidos con peaje desde/hacia la zona de Chivilcoy:
 * - Ruta 5 Este / Acceso Oeste (Peaje Olivera pasando Mercedes, Luján, Moreno, CABA, Ezeiza, La Plata, etc.)
 * - Ruta 5 Oeste pasando Bragado (Peaje 9 de Julio, Carlos Casares, Pehuajó, Trenque Lauquen, etc.)
 * - Corredor Norte / Ruta 7 / Ruta 8 / Ruta 9 (Junín, Pergamino, Rosario, Pilar, Campana, Zárate, etc.)
 * No marca peaje en tramos sin peaje como Chivilcoy urbano, Alberti, Bragado, Suipacha, Moquehuá o Mercedes.
 */
export function detectarPeajesEnRecorrido(params: {
  origen?: string;
  destino?: string;
  latOrigen?: number;
  lonOrigen?: number;
  latDestino?: number;
  lonDestino?: number;
  distanciaKm?: number;
}): boolean {
  const { origen = '', destino = '', latOrigen, lonOrigen, latDestino, lonDestino, distanciaKm = 0 } = params;
  if (distanciaKm > 0 && distanciaKm < UMBRAL_KM_RUTA) {
    return false;
  }

  const texto = `${origen} ${destino}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  const regexZonasConPeaje =
    /\b(lujan|general rodriguez|gral\.?\s*rodriguez|moreno|merlo|ituzaingo|moron|castelar|ramos mejia|ciudadela|haedo|caba|capital federal|ciudad autonoma de buenos aires|retiro|palermo|belgrano|recoleta|microcentro|ezeiza|aeroparque|la plata|avellaneda|quilmes|lanus|lomas de zamora|tigre|pilar|escobar|campana|zarate|san isidro|vicente lopez|9 de julio|nueve de julio|carlos casares|pehuajo|trenque lauquen|santa rosa|junin|pergamino|rosario|mar del plata|pinamar|villa gesell|tandil|bahia blanca)\b/i;

  if (regexZonasConPeaje.test(texto)) {
    return true;
  }

  // Verificación geográfica:
  // - Al este de Mercedes (Peaje Olivera en Ruta 5, lon > -59.35)
  // - Al oeste de Bragado (Peaje 9 de Julio en Ruta 5, lon < -60.75)
  // - Al norte de Ruta 7 / Junín / Rosario (lat > -34.45)
  const puntos = [
    { lat: latOrigen, lon: lonOrigen },
    { lat: latDestino, lon: lonDestino },
  ];

  for (const pt of puntos) {
    if (typeof pt.lon === 'number' && !isNaN(pt.lon)) {
      if (pt.lon > -59.35 || pt.lon < -60.75) return true;
    }
    if (typeof pt.lat === 'number' && !isNaN(pt.lat)) {
      if (pt.lat > -34.45) return true;
    }
  }

  return false;
}

/**
 * Redondea el importe de un viaje normal al múltiplo de 100 más cercano (ej: 10450 -> 10500).
 */
export function redondearPrecioMultiplo100(precio: number): number {
  if (!isFinite(precio) || precio <= 0) return 0;
  return Math.round(precio / 100) * 100;
}

/**
 * Redondea kilómetros de viajes ART:
 * - Fracción > 0.5 redondea hacia arriba (ej: 183.7 -> 184)
 * - Fracción <= 0.5 redondea hacia abajo (ej: 183.5 -> 183)
 */
export function redondearKmArt(km: number): number {
  if (!isFinite(km) || km <= 0) return 0;
  const entero = Math.floor(km);
  const decimal = Math.round((km - entero) * 1000) / 1000;
  return decimal > 0.5 ? entero + 1 : entero;
}

interface RemoteRouteCacheEntry {
  distanciaKm: number;
  timestamp: number;
}

const remoteRouteCache = new Map<string, RemoteRouteCacheEntry>();
const REMOTE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora

export function calcularDistanciaHaversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function calcularDistanciaRutaKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<number> {
  const lineal = calcularDistanciaHaversineKm(lat1, lon1, lat2, lon2);
  if (lineal < 0.05) return 0;

  const key = `${lat1.toFixed(3)},${lon1.toFixed(3)}->${lat2.toFixed(3)},${lon2.toFixed(3)}`;
  const ahora = Date.now();
  const cached = remoteRouteCache.get(key);
  if (cached && ahora - cached.timestamp < REMOTE_CACHE_TTL_MS) {
    return cached.distanciaKm;
  }

  let distanciaKm: number | null = null;
  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    if (response.ok) {
      const data = (await response.json()) as any;
      if (data?.routes && data.routes.length > 0 && typeof data.routes[0].distance === 'number') {
        distanciaKm = Math.round((data.routes[0].distance / 1000) * 10) / 10;
      }
    }
  } catch {
    // Fallback a Haversine ajustado por ruta
  }

  if (distanciaKm === null) {
    // En tramos interurbanos (ruta), el factor de desvío sobre línea recta es ~1.2
    distanciaKm = Math.round(lineal * 1.2 * 10) / 10;
  }

  if (remoteRouteCache.size >= 1000) {
    const oldestKey = remoteRouteCache.keys().next().value;
    if (oldestKey) remoteRouteCache.delete(oldestKey);
  }
  remoteRouteCache.set(key, { distanciaKm, timestamp: ahora });

  return distanciaKm;
}

export interface AjusteOrigenRemotoResult {
  esOrigenRemoto: boolean;
  distanciaViajeKm: number;
  distanciaBaseAOrigenKm: number;
  distanciaDestinoABaseKm: number;
  distanciaFacturableKm: number;
  kmAproximacion: number;
}

/**
 * Ajusta la distancia facturable cuando el origen del viaje está fuera del radio urbano
 * de la agencia (ej. pasajero en Alberti pidiendo un móvil que sale desde Chivilcoy).
 *
 * Lógica comercial equivalente al cobro manual en base:
 * - Si el origen está dentro del radio urbano (<= 12 km de la base), no se aplica ningún recargo.
 * - Si el origen está fuera del radio urbano (> 12 km), el móvil recorre en total:
 *     Base -> Origen + Origen -> Destino + Destino -> Base
 *   Como el valor/km de la remisería está calibrado sobre distancia de ida (mitad del recorrido total),
 *   la distancia facturable equivalente es:
 *     max(distanciaViajeKm, (distBaseAOrigen + distanciaViajeKm + distDestinoABase) / 2)
 *
 * Ejemplos:
 * - Chivilcoy -> Chivilcoy (2 km): 2 km (sin cambio)
 * - Chivilcoy -> Alberti (30 km): 30 km (sin cambio)
 * - Alberti -> Alberti (2 km local): (30 + 2 + 30) / 2 = 31 km (viaje a Alberti + traslado local)
 * - Alberti -> Chivilcoy (30 km): (30 + 30 + 0) / 2 = 30 km (igual que Chivilcoy -> Alberti, sin cobrar doble)
 * - Alberti -> Bragado (20 km más lejos): (30 + 20 + 50) / 2 = 50 km (igual que Chivilcoy -> Bragado)
 */
export async function calcularAjusteOrigenRemoto(params: {
  distanciaViajeKm: number;
  latOrigen?: number;
  lonOrigen?: number;
  latDestino?: number;
  lonDestino?: number;
  baseLat?: number | null;
  baseLon?: number | null;
}): Promise<AjusteOrigenRemotoResult> {
  const {
    distanciaViajeKm,
    latOrigen,
    lonOrigen,
    latDestino,
    lonDestino,
  } = params;

  const baseLat = typeof params.baseLat === 'number' && !isNaN(params.baseLat) ? params.baseLat : DEFAULT_BASE_LAT;
  const baseLon = typeof params.baseLon === 'number' && !isNaN(params.baseLon) ? params.baseLon : DEFAULT_BASE_LON;

  if (
    typeof latOrigen !== 'number' ||
    typeof lonOrigen !== 'number' ||
    isNaN(latOrigen) ||
    isNaN(lonOrigen)
  ) {
    return {
      esOrigenRemoto: false,
      distanciaViajeKm,
      distanciaBaseAOrigenKm: 0,
      distanciaDestinoABaseKm: 0,
      distanciaFacturableKm: distanciaViajeKm,
      kmAproximacion: 0,
    };
  }

  const distLinealBaseAOrigen = calcularDistanciaHaversineKm(baseLat, baseLon, latOrigen, lonOrigen);
  if (distLinealBaseAOrigen <= RADIO_URBANO_BASE_KM) {
    return {
      esOrigenRemoto: false,
      distanciaViajeKm,
      distanciaBaseAOrigenKm: 0,
      distanciaDestinoABaseKm: 0,
      distanciaFacturableKm: distanciaViajeKm,
      kmAproximacion: 0,
    };
  }

  const hasDestino =
    typeof latDestino === 'number' &&
    typeof lonDestino === 'number' &&
    !isNaN(latDestino) &&
    !isNaN(lonDestino);

  const [distBaseAOrigen, distDestinoABase] = await Promise.all([
    calcularDistanciaRutaKm(baseLat, baseLon, latOrigen, lonOrigen),
    hasDestino
      ? calcularDistanciaRutaKm(latDestino!, lonDestino!, baseLat, baseLon)
      : Promise.resolve(-1),
  ]);

  const distVueltaBase = distDestinoABase >= 0 ? distDestinoABase : distBaseAOrigen;
  const distanciaEquivalenteIda =
    Math.round(((distBaseAOrigen + distanciaViajeKm + distVueltaBase) / 2) * 10) / 10;
  const distanciaFacturableKm = Math.max(distanciaViajeKm, distanciaEquivalenteIda);
  const kmAproximacion = Math.max(
    0,
    Math.round((distanciaFacturableKm - distanciaViajeKm) * 10) / 10
  );

  return {
    esOrigenRemoto: kmAproximacion > 0,
    distanciaViajeKm,
    distanciaBaseAOrigenKm: distBaseAOrigen,
    distanciaDestinoABaseKm: distVueltaBase,
    distanciaFacturableKm,
    kmAproximacion,
  };
}
