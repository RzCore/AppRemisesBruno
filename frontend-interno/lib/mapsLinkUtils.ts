export interface ParsedCoords {
  lat: number;
  lng: number;
}

/**
 * Extrae coordenadas lat/lng desde:
 * - Un campo detallado en JSON: {"lat":-34.89,"lng":-60.01} o {"lat":-34.89,"lon":-60.01}
 * - Un string "lat,lng": "-34.8957,-60.0189"
 * - Un texto con coordenadas entre paréntesis: "Ubicación GPS (-34.8957, -60.0189)"
 * - Un link de Google Maps con ?q=lat,lng o @lat,lng o destination=lat,lng
 */
export function extractCoordsFromLocation(
  text?: string | null,
  detallado?: string | null
): ParsedCoords | null {
  const tryParsePair = (raw?: string | null): ParsedCoords | null => {
    if (!raw || typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed) return null;

    // 1. JSON { lat, lng } o { lat, lon }
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const lat = Number(parsed?.lat ?? parsed?.latitude);
        const lng = Number(parsed?.lng ?? parsed?.lon ?? parsed?.longitude);
        if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && (lat !== 0 || lng !== 0)) {
          return { lat, lng };
        }
      } catch {
        // continuar
      }
    }

    // 2. Formato directo "-34.8957,-60.0189"
    const directMatch = trimmed.match(/^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/);
    if (directMatch) {
      const lat = parseFloat(directMatch[1]);
      const lng = parseFloat(directMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }

    // 3. Coordenadas dentro de texto (ej: "Ubicación GPS (-34.8957, -60.0189)" o URL de Maps)
    const embeddedMatch = trimmed.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
    if (embeddedMatch) {
      const lat = parseFloat(embeddedMatch[1]);
      const lng = parseFloat(embeddedMatch[2]);
      if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }

    return null;
  };

  return tryParsePair(detallado) || tryParsePair(text);
}

/**
 * Determina si una dirección proviene de una ubicación GPS compartida por el pasajero.
 */
export function isSharedLocationText(text?: string | null, detallado?: string | null): boolean {
  if (text && /ubicaci[oó]n\s*gps|destino\s*gps|mi\s*ubicaci[oó]n|google\.com\/maps|maps\.google|maps\.app\.goo\.gl/i.test(text)) {
    return true;
  }
  return Boolean(extractCoordsFromLocation(text, detallado));
}

/**
 * Construye una URL de Google Maps lista para abrir en navegador o app nativa de Maps.
 */
export function buildGoogleMapsUrl(
  text?: string | null,
  detallado?: string | null,
  mode: 'dir' | 'search' = 'dir'
): string {
  const coords = extractCoordsFromLocation(text, detallado);
  const query = coords ? `${coords.lat},${coords.lng}` : (text || '').trim();
  if (!query) return 'https://www.google.com/maps';

  if (mode === 'search') {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}&travelmode=driving`;
}

/**
 * Detecta si un mensaje de chat contiene un enlace de Google Maps o coordenadas GPS compartidas.
 */
export function extractGoogleMapsUrlFromChatText(texto?: string | null): string | null {
  if (!texto || typeof texto !== 'string') return null;

  const urlMatch = texto.match(/https?:\/\/(?:www\.)?(?:google\.com\/maps[^\s]*|maps\.google\.com[^\s]*|maps\.app\.goo\.gl\/[^\s]*|goo\.gl\/maps\/[^\s]*)/i);
  if (urlMatch) {
    return urlMatch[0];
  }

  const coords = extractCoordsFromLocation(texto, null);
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }

  return null;
}
