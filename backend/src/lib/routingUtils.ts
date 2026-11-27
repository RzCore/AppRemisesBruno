/**
 * Motor centralizado de ruteo vehicular priorizando calles y rutas asfaltadas.
 *
 * Usa Valhalla (OpenStreetMap) con `exclude_unpaved: true`, `use_tracks: 0` y `use_highways: 1.0`
 * para evitar caminos rurales de tierra (comunes en provincia de Buenos Aires con OSRM estándar).
 * Si Valhalla no responde a tiempo, hace fallback automático a OSRM y luego a Haversine.
 */

export interface RutaCalculada {
  distanciaKm: number;
  duracionMin: number;
  coords: [number, number][]; // [lat, lon][]
  provider: 'valhalla' | 'osrm';
}

interface CacheEntry {
  data: RutaCalculada;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora
const routeWithGeomCache = new Map<string, CacheEntry>();
const routeSummaryCache = new Map<string, CacheEntry>();

let valhallaConsecutiveErrors = 0;
let valhallaDisabledUntil = 0;
let osrmConsecutiveErrors = 0;
let osrmDisabledUntil = 0;

/**
 * Decodifica una polyline6 de Valhalla a un array de [lat, lon].
 */
export function decodePolyline6(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coords.push([lat / 1e6, lng / 1e6]);
  }

  return coords;
}

/**
 * Calcula ruta vehicular evitando caminos de tierra (`exclude_unpaved: true, use_tracks: 0`).
 * Devuelve `null` si tanto Valhalla como OSRM fallan (el caller hace fallback a Haversine).
 */
export async function calcularRutaAsfaltada(
  puntos: Array<{ lat: number; lon: number }>,
  options?: { includeGeometry?: boolean; timeoutMs?: number }
): Promise<RutaCalculada | null> {
  if (!Array.isArray(puntos) || puntos.length < 2) return null;

  const includeGeometry = Boolean(options?.includeGeometry);
  const timeoutMs = options?.timeoutMs ?? (includeGeometry ? 2800 : 2200);
  const cacheMap = includeGeometry ? routeWithGeomCache : routeSummaryCache;
  const cacheKey = puntos.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`).join(';');
  const ahora = Date.now();

  const cached = cacheMap.get(cacheKey);
  if (cached && cached.expiresAt > ahora) {
    return cached.data;
  }

  // 1. Intentar Valhalla (evita caminos de tierra y tracks rurales)
  if (ahora > valhallaDisabledUntil) {
    try {
      const body = {
        locations: puntos.map((p) => ({ lat: p.lat, lon: p.lon })),
        costing: 'auto',
        costing_options: {
          auto: {
            exclude_unpaved: true,
            use_tracks: 0,
            use_highways: 1.0,
          },
        },
        directions_options: {
          units: 'kilometers',
        },
      };

      const res = await fetch('https://valhalla1.openstreetmap.de/route', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RemisesBrunoApp/1.1 (contacto@brunoremises.com.ar)',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (res.ok) {
        const json = (await res.json()) as any;
        const summary = json?.trip?.summary;
        if (summary && typeof summary.length === 'number' && summary.length >= 0) {
          const distanciaKm = Math.round(summary.length * 10) / 10;
          const duracionMin = Math.max(3, Math.round((Number(summary.time) || 0) / 60));
          let coords: [number, number][] = [];

          if (includeGeometry && Array.isArray(json?.trip?.legs)) {
            for (const leg of json.trip.legs) {
              if (typeof leg?.shape === 'string' && leg.shape.length > 0) {
                const decoded = decodePolyline6(leg.shape);
                if (coords.length > 0 && decoded.length > 0) {
                  coords.push(...decoded.slice(1));
                } else {
                  coords.push(...decoded);
                }
              }
            }
          }

          valhallaConsecutiveErrors = 0;
          const result: RutaCalculada = {
            distanciaKm,
            duracionMin,
            coords,
            provider: 'valhalla',
          };

          if (cacheMap.size >= 1500) {
            const oldestKey = cacheMap.keys().next().value;
            if (oldestKey) cacheMap.delete(oldestKey);
          }
          cacheMap.set(cacheKey, { data: result, expiresAt: ahora + CACHE_TTL_MS });
          return result;
        }
      }
      valhallaConsecutiveErrors++;
    } catch {
      valhallaConsecutiveErrors++;
    }

    if (valhallaConsecutiveErrors >= 3) {
      valhallaDisabledUntil = ahora + 60000;
      console.warn('⚠️ Valhalla saturado o sin respuesta. Circuit Breaker activo por 60s (fallback a OSRM).');
    }
  }

  // 2. Fallback a OSRM si Valhalla no respondió
  if (ahora > osrmDisabledUntil) {
    try {
      const rawCoords = puntos.map((p) => `${p.lon},${p.lat}`).join(';');
      const geomParam = includeGeometry ? 'overview=full&geometries=geojson' : 'overview=false';
      const url = `https://router.project-osrm.org/route/v1/driving/${rawCoords}?${geomParam}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(1800) });
      if (res.ok) {
        const json = (await res.json()) as any;
        if (Array.isArray(json?.routes) && json.routes.length > 0) {
          const route = json.routes[0];
          const distanciaKm = Math.round((Number(route.distance) / 1000) * 10) / 10;
          const duracionMin = Math.max(3, Math.round(Number(route.duration) / 60));
          const coords: [number, number][] =
            includeGeometry && Array.isArray(route.geometry?.coordinates)
              ? route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]])
              : [];

          osrmConsecutiveErrors = 0;
          const result: RutaCalculada = {
            distanciaKm,
            duracionMin,
            coords,
            provider: 'osrm',
          };

          if (cacheMap.size >= 1500) {
            const oldestKey = cacheMap.keys().next().value;
            if (oldestKey) cacheMap.delete(oldestKey);
          }
          cacheMap.set(cacheKey, { data: result, expiresAt: ahora + CACHE_TTL_MS });
          return result;
        }
      }
      osrmConsecutiveErrors++;
    } catch {
      osrmConsecutiveErrors++;
    }

    if (osrmConsecutiveErrors >= 3) {
      osrmDisabledUntil = ahora + 60000;
    }
  }

  return null;
}
