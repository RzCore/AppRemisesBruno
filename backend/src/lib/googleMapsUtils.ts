/**
 * Integración de Google Maps Platform (Places API New, Routes API, Geocoding API)
 * usada exclusivamente desde el backend con caché RAM y fallback automático a OSM/Valhalla.
 */

const CHIVILCOY_LAT = -34.8957;
const CHIVILCOY_LON = -60.0189;

const PLACES_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
const placesCache = new Map<string, { data: any[]; expiresAt: number }>();

let googleConsecutiveErrors = 0;
let googleDisabledUntil = 0;

export function hasGoogleMapsKey(): boolean {
  const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
  return key.length > 10 && Date.now() > googleDisabledUntil;
}

function getGoogleMapsKey(): string {
  return (process.env.GOOGLE_MAPS_API_KEY || '').trim();
}

function registerGoogleError(context: string, detail?: any) {
  googleConsecutiveErrors++;
  console.warn(`⚠️ Google Maps (${context}) error #${googleConsecutiveErrors}:`, detail || '');
  if (googleConsecutiveErrors >= 4) {
    googleDisabledUntil = Date.now() + 60_000;
    console.warn('⚠️ Circuit Breaker Google Maps activo por 60s (fallback automático a OSM/Valhalla).');
  }
}

function registerGoogleSuccess() {
  googleConsecutiveErrors = 0;
}

/**
 * Decodifica una polyline estándar (precisión 1e5) de Google Routes API a [lat, lon][].
 */
export function decodeGooglePolyline5(encoded: string): [number, number][] {
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

    coords.push([lat / 1e5, lng / 1e5]);
  }

  return coords;
}

/**
 * Búsqueda de direcciones, calles y comercios usando Google Places API (New).
 * Devuelve objetos compatibles con el formato esperado por los frontends (`lat`, `lon`, `display_name`, `address`).
 */
export async function searchGooglePlaces(
  rawQuery: string,
  limit = 5,
  hasCityConstraint = false
): Promise<any[] | null> {
  if (!hasGoogleMapsKey()) return null;

  const query = (rawQuery || '').trim();
  if (query.length < 3) return [];

  const cacheKey = `${limit}:${hasCityConstraint ? '1' : '0'}:${query.toLowerCase()}`;
  const ahora = Date.now();
  const cached = placesCache.get(cacheKey);
  if (cached && cached.expiresAt > ahora) {
    return cached.data;
  }

  const textQuery = hasCityConstraint ? query : `${query}, Chivilcoy, Buenos Aires, Argentina`;

  const body: any = {
    textQuery,
    languageCode: 'es',
    regionCode: 'AR',
    maxResultCount: Math.min(Math.max(1, limit), 8),
  };

  if (!hasCityConstraint) {
    body.locationBias = {
      circle: {
        center: { latitude: CHIVILCOY_LAT, longitude: CHIVILCOY_LON },
        radius: 25000.0,
      },
    };
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getGoogleMapsKey(),
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.location',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => String(res.status));
      registerGoogleError('Places', `${res.status} ${errText.slice(0, 180)}`);
      return null;
    }

    const json = (await res.json()) as any;
    const places = Array.isArray(json?.places) ? json.places : [];
    registerGoogleSuccess();

    const mapped = places
      .filter((p: any) => p?.location && typeof p.location.latitude === 'number' && typeof p.location.longitude === 'number')
      .map((p: any) => {
        const name = (p.displayName?.text || '').trim();
        const formatted = (p.formattedAddress || '').replace(/,\s*Argentina$/i, '').trim();
        const nameNorm = name.toLowerCase();
        const fmtNorm = formatted.toLowerCase();
        const displayName =
          name && !fmtNorm.startsWith(nameNorm)
            ? `${name}, ${formatted}`
            : formatted || name;

        return {
          lat: String(p.location.latitude),
          lon: String(p.location.longitude),
          display_name: displayName,
          name,
          address: {
            road: formatted.split(',')[0]?.trim() || name,
            city: formatted.split(',')[1]?.trim() || '',
            state: 'Buenos Aires',
          },
          provider: 'google',
        };
      });

    if (placesCache.size >= 1500) {
      const oldestKey = placesCache.keys().next().value;
      if (oldestKey) placesCache.delete(oldestKey);
    }
    placesCache.set(cacheKey, { data: mapped, expiresAt: ahora + PLACES_CACHE_TTL_MS });
    return mapped;
  } catch (err: any) {
    registerGoogleError('Places', err?.message || err);
    return null;
  }
}

/**
 * Calcula una ruta vehicular usando Google Routes API (Essentials - TRAFFIC_UNAWARE).
 * Evita caminos rurales de tierra, devuelve distancia exacta, duración, polilínea y peajes.
 */
export async function calcularRutaGoogleRoutes(
  puntos: Array<{ lat: number; lon: number }>,
  options?: { includeGeometry?: boolean; timeoutMs?: number }
): Promise<{
  distanciaKm: number;
  duracionMin: number;
  coords: [number, number][];
  hasTollFromGoogle: boolean;
} | null> {
  if (!hasGoogleMapsKey() || puntos.length < 2) return null;

  const includeGeometry = Boolean(options?.includeGeometry);
  const timeoutMs = options?.timeoutMs ?? 2800;

  const origin = puntos[0];
  const destination = puntos[puntos.length - 1];
  const intermediates =
    puntos.length > 2
      ? puntos.slice(1, -1).map((p) => ({
          location: { latLng: { latitude: p.lat, longitude: p.lon } },
        }))
      : undefined;

  const body: any = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lon } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lon } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_UNAWARE',
    languageCode: 'es-AR',
    units: 'METRIC',
  };
  if (intermediates && intermediates.length > 0) {
    body.intermediates = intermediates;
  }

  try {
    const res = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': getGoogleMapsKey(),
        'X-Goog-FieldMask':
          'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline,routes.travelAdvisory.tollInfo',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => String(res.status));
      registerGoogleError('Routes', `${res.status} ${errText.slice(0, 180)}`);
      return null;
    }

    const json = (await res.json()) as any;
    const route = Array.isArray(json?.routes) ? json.routes[0] : null;
    if (!route || typeof route.distanceMeters !== 'number') {
      return null;
    }

    registerGoogleSuccess();
    const distanciaKm = Math.round((route.distanceMeters / 1000) * 10) / 10;
    const durationSec = parseInt(String(route.duration || '0').replace(/\D/g, ''), 10) || 0;
    const duracionMin = Math.max(3, Math.round(durationSec / 60));
    const encoded = route.polyline?.encodedPolyline || '';
    const decoded = encoded ? decodeGooglePolyline5(encoded) : [];
    const hasTollFromGoogle = Boolean(
      route.travelAdvisory?.tollInfo &&
        Array.isArray(route.travelAdvisory.tollInfo.estimatedPrice) &&
        route.travelAdvisory.tollInfo.estimatedPrice.length > 0
    );

    return {
      distanciaKm,
      duracionMin,
      coords: includeGeometry ? decoded : decoded, // siempre devolvemos decoded para chequear cabinas
      hasTollFromGoogle,
    };
  } catch (err: any) {
    registerGoogleError('Routes', err?.message || err);
    return null;
  }
}

/**
 * Reverse Geocoding (GPS lat/lon -> calle, altura y ciudad) con Google Geocoding API.
 */
export async function reverseGeocodeGoogle(lat: number, lon: number): Promise<string | null> {
  if (!hasGoogleMapsKey()) return null;

  try {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&language=es&region=ar&key=${encodeURIComponent(
      getGoogleMapsKey()
    )}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) {
      registerGoogleError('Geocoding', res.status);
      return null;
    }
    const json = (await res.json()) as any;
    if (json?.status !== 'OK' || !Array.isArray(json?.results) || json.results.length === 0) {
      return null;
    }
    registerGoogleSuccess();
    const first = json.results[0];
    const formatted = String(first.formatted_address || '')
      .replace(/,\s*Argentina$/i, '')
      .replace(/,\s*Provincia de Buenos Aires$/i, '')
      .trim();
    return formatted || null;
  } catch (err: any) {
    registerGoogleError('Geocoding', err?.message || err);
    return null;
  }
}
