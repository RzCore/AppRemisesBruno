import { prisma } from '../lib/prisma';
import { whatsappService } from './whatsappService';
import { pushNotificationService } from './pushNotificationService';
import { transcriptionService } from './transcriptionService';
import { checkAgenciaEstado } from './agencyScheduleService';
import { calcularAjusteOrigenRemoto } from '../lib/pricingUtils';
import crypto from 'crypto';

// ==============================================================================
// MÁQUINA DE ESTADOS Y CONTROLADOR CONVERSACIONAL DEL BOT DE WHATSAPP
// ==============================================================================

type EstadoConversacion =
  | 'IDLE'
  | 'ESPERANDO_DNI_REGISTRO'
  | 'ESPERANDO_NOMBRE_REGISTRO'
  | 'ESPERANDO_TIPO_RESERVA'
  | 'ESPERANDO_FECHA_HORA_RESERVA'
  | 'ESPERANDO_DIAS_HORA_PERIODICA'
  | 'ESPERANDO_ORIGEN'
  | 'CONFIRMANDO_AUDIO_ORIGEN'
  | 'ESPERANDO_DESTINO'
  | 'CONFIRMANDO_AUDIO_DESTINO'
  | 'CONFIRMANDO_COTIZACION'
  | 'CONFIRMANDO_CANCELACION_VIAJE'
  | 'CONFIRMANDO_CANCELACION_RESERVA';

interface SesionClienteWhatsApp {
  telefono: string;
  estado: EstadoConversacion;
  dniTemporal?: string;
  nombreTemporal?: string;
  esReserva?: boolean;
  tipoReserva?: 'UNICA' | 'PERIODICA';
  diasSemanaReserva?: string[];
  diasSemanaTexto?: string;
  fechaHoraReserva?: Date;
  fechaHoraTexto?: string;
  horaInicioStr?: string;
  nombre?: string;
  origen?: string;
  origenLat?: number;
  origenLon?: number;
  destino?: string;
  destinoLat?: number;
  destinoLon?: number;
  distanciaKm?: number;
  precioEstimado?: number;
  audioDireccionPendiente?: string;
  audioTextoOriginal?: string;
  viajeCancelarId?: string;
  reservaCancelarId?: string;
  updatedAt: number;
}

// Almacenamiento en memoria de sesiones activas (expiran a los 30 minutos de inactividad)
const sesionesMap = new Map<string, SesionClienteWhatsApp>();

// Almacenamiento en memoria de pausas para atención humana directa con el coordinador (10 min con cronómetro)
const pausasHumanasMap = new Map<string, { hasta: Date; nombre?: string; timerId?: NodeJS.Timeout }>();

function getSesion(telefono: string): SesionClienteWhatsApp {
  const cleanTel = whatsappService.formatearNumero(telefono);
  const ahora = Date.now();
  let sesion = sesionesMap.get(cleanTel);

  // Si la sesión expiró tras 30 minutos de inactividad, reiniciarla
  if (sesion && ahora - sesion.updatedAt > 30 * 60 * 1000) {
    sesionesMap.delete(cleanTel);
    sesion = undefined;
  }

  if (!sesion) {
    sesion = {
      telefono: cleanTel,
      estado: 'IDLE',
      updatedAt: ahora,
    };
    sesionesMap.set(cleanTel, sesion);
  } else {
    sesion.updatedAt = ahora;
  }

  return sesion;
}

function resetSesion(telefono: string) {
  const cleanTel = whatsappService.formatearNumero(telefono);
  sesionesMap.delete(cleanTel);
}

// ==============================================================================
// MOTOR DE GEOCODIFICACIÓN Y RUTEADOR REAL (OPENSTREETMAP NOMINATIM + OSRM)
// ==============================================================================

const geocodeCache = new Map<string, { lat: number; lon: number; nombreOficial?: string; display?: string }>();
const osrmDistanceCache = new Map<string, number>();

interface PuntoInteres {
  alias: RegExp[];
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
}

// Puntos de referencia emblemáticos y frecuencias urbanas en Chivilcoy
const PUNTOS_INTERES_CHIVILCOY: PuntoInteres[] = [
  // --- Boliches, Discotecas y Bares Nocturnos ---
  {
    alias: [/ozono/i, /ozono\s*planet/i, /ozono\s*megadisco/i],
    nombre: 'Ozono Megadisco (Av. José León Suárez 1103)',
    direccion: 'Av. José León Suárez 1103, Chivilcoy',
    lat: -34.8814513,
    lon: -60.0011988,
  },
  {
    alias: [/babako/i, /babakos/i, /babaco/i],
    nombre: "Babako's Disco (Av. Antonio de Tomaso 851)",
    direccion: 'Av. Antonio de Tomaso 851, Chivilcoy',
    lat: -34.8797418,
    lon: -60.0408011,
  },
  {
    alias: [/ruta\s*30\s*bar/i, /bar\s*ruta\s*30/i],
    nombre: 'Ruta 30 Bar (Lavalle 100)',
    direccion: 'Lavalle 100, Chivilcoy',
    lat: -34.8994017,
    lon: -60.0189655,
  },
  {
    alias: [/sam\s*cervecer[ií]a/i, /cervecer[ií]a\s*sam/i, /\bsam\s*bar\b/i],
    nombre: 'SAM Cervecería (Olavarría 60)',
    direccion: 'Olavarría 60, Chivilcoy',
    lat: -34.8907786,
    lon: -60.0247803,
  },
  {
    alias: [/grey\s*bar/i, /bar\s*grey/i],
    nombre: 'Grey Bar (Pellegrini 424)',
    direccion: 'Carlos Pellegrini 424, Chivilcoy',
    lat: -34.8903598,
    lon: -60.0133635,
  },
  {
    alias: [/ambros[ií]a/i],
    nombre: 'Ambrosía Resto Bar (Rivadavia 25)',
    direccion: 'Rivadavia 25, Chivilcoy',
    lat: -34.8957329,
    lon: -60.0185349,
  },

  // --- Salud y Centros Médicos ---
  {
    alias: [/hospital/i, /guardia del hospital/i, /hospital municipal/i, /santiago fornos/i],
    nombre: 'Hospital Municipal (Av. Hijas de San José 31)',
    direccion: 'Av. Hijas de San José 31, Chivilcoy',
    lat: -34.9119734,
    lon: -60.0372253,
  },
  {
    alias: [/policl[ií]nica/i, /cl[ií]nica del trabajo/i],
    nombre: 'Policlínica (Brandsen 360)',
    direccion: 'Brandsen 360, Chivilcoy',
    lat: -34.9051772,
    lon: -60.0205314,
  },
  {
    alias: [/sanatorio\s*chivilcoy/i, /\bsanatorio\b/i],
    nombre: 'Sanatorio Chivilcoy (Av. Soárez 321)',
    direccion: 'Av. Soárez 321, Chivilcoy',
    lat: -34.891907,
    lon: -60.0129891,
  },

  // --- Clubes Deportivos y Sociales ---
  {
    alias: [/22 de octubre/i, /club 22/i],
    nombre: 'Club 22 de Octubre (Av. 22 de Octubre 179)',
    direccion: 'Av. 22 de Octubre 179, Chivilcoy',
    lat: -34.9054481,
    lon: -60.0232202,
  },
  {
    alias: [/club col[oó]n/i, /cancha de col[oó]n/i, /bar col[oó]n/i, /\bcol[oó]n\b/i],
    nombre: 'Club Colón (Vicente López 170)',
    direccion: 'Vicente López 170, Chivilcoy',
    lat: -34.8919066,
    lon: -60.018989,
  },
  {
    alias: [/racing/i, /club racing/i, /estadio norte/i, /grilon arena/i],
    nombre: 'Racing Club (Av. Soárez 313)',
    direccion: 'Av. Soárez 313, Chivilcoy',
    lat: -34.8919578,
    lon: -60.0132627,
  },
  {
    alias: [/gimnasia/i, /club gimnasia/i, /cancha de gimnasia/i],
    nombre: 'Club Gimnasia (Av. Antonio de Tomaso 449)',
    direccion: 'Av. Antonio de Tomaso 449, Chivilcoy',
    lat: -34.8852128,
    lon: -60.0338578,
  },
  {
    alias: [/san lorenzo/i, /club san lorenzo/i],
    nombre: 'Club San Lorenzo (Río Juramento 220)',
    direccion: 'Río Juramento 220, Chivilcoy',
    lat: -34.8955594,
    lon: -60.01057,
  },
  {
    alias: [/cer[aá]mica/i, /cer[aá]mica argentina/i, /club cer[aá]mica/i],
    nombre: 'Cerámica Argentina (Deán Funes 225)',
    direccion: 'Deán Funes 225, Chivilcoy',
    lat: -34.8971137,
    lon: -60.0122093,
  },

  // --- Supermercados ---
  {
    alias: [/\bvea\b/i, /supermercado vea/i],
    nombre: 'Supermercado Vea (Pellegrini 150)',
    direccion: 'Carlos Pellegrini 150, Chivilcoy',
    lat: -34.8941633,
    lon: -60.0177289,
  },
  {
    alias: [/la an[oó]nima/i, /an[oó]nima/i],
    nombre: 'La Anónima (Av. Soárez 52)',
    direccion: 'Av. Soárez 52, Chivilcoy',
    lat: -34.8953196,
    lon: -60.0174422,
  },

  // --- Instituciones Educativas ---
  {
    alias: [/colegio nacional/i, /\bnacional\b/i, /secundaria 3/i],
    nombre: 'Colegio Nacional (Av. Calixto Calderón 25)',
    direccion: 'Av. Calixto Calderón 25, Chivilcoy',
    lat: -34.9032889,
    lon: -60.0267372,
  },
  {
    alias: [/escuela normal/i, /la normal/i, /isfd 6/i, /instituto 6/i],
    nombre: 'Escuela Normal (Av. José León Suárez 25)',
    direccion: 'Av. José León Suárez 25, Chivilcoy',
    lat: -34.8905012,
    lon: -60.0112796,
  },
  {
    alias: [/escuela comercial/i, /el comercial/i, /secundaria 4/i],
    nombre: 'Escuela Comercial (Av. Antonio de Tomaso 26)',
    direccion: 'Av. Antonio de Tomaso 26, Chivilcoy',
    lat: -34.8909041,
    lon: -60.0272738,
  },
  {
    alias: [/escuela industrial/i, /el industrial/i, /escuela t[eé]cnica/i, /t[eé]cnica 1/i],
    nombre: 'Escuela Técnica 1 (Industrial) (Pellegrini 338)',
    direccion: 'Carlos Pellegrini 338, Chivilcoy',
    lat: -34.8914936,
    lon: -60.0147406,
  },

  // --- Plazas y Parques ---
  {
    alias: [/plaza principal/i, /plaza 25 de mayo/i, /\bcentro\b/i],
    nombre: 'Plaza 25 de Mayo (Centro)',
    direccion: 'Plaza 25 de Mayo, Chivilcoy',
    lat: -34.896867,
    lon: -60.0190293,
  },
  {
    alias: [/plaza col[oó]n/i],
    nombre: 'Plaza Colón',
    direccion: 'Plaza Colón, Chivilcoy',
    lat: -34.8908759,
    lon: -60.0192553,
  },
  {
    alias: [/plaza espa[ñn]a/i],
    nombre: 'Plaza España',
    direccion: 'Plaza España, Chivilcoy',
    lat: -34.8896774,
    lon: -60.0116277,
  },
  {
    alias: [/plaza mitre/i],
    nombre: 'Plaza Mitre',
    direccion: 'Plaza Mitre, Chivilcoy',
    lat: -34.8967027,
    lon: -60.0117616,
  },
  {
    alias: [/plaza belgrano/i],
    nombre: 'Plaza Belgrano',
    direccion: 'Plaza Belgrano, Chivilcoy',
    lat: -34.9028737,
    lon: -60.0188456,
  },
  {
    alias: [/plaza moreno/i],
    nombre: 'Plaza Moreno',
    direccion: 'Plaza Moreno, Chivilcoy',
    lat: -34.9029951,
    lon: -60.0102956,
  },
  {
    alias: [/plaza varela/i, /plaza florencio varela/i],
    nombre: 'Plaza Florencio Varela',
    direccion: 'Plaza Florencio Varela, Chivilcoy',
    lat: -34.8970396,
    lon: -60.0263349,
  },
  {
    alias: [/parque infantil/i, /parque rivadavia/i],
    nombre: 'Parque Infantil Bernardino Rivadavia',
    direccion: 'Parque Infantil, Chivilcoy',
    lat: -34.8903708,
    lon: -60.0265812,
  },
  {
    alias: [/parque martija/i, /\bmartija\b/i],
    nombre: 'Parque Martija (Ruta 30)',
    direccion: 'Ruta Provincial 30, Chivilcoy',
    lat: -34.865,
    lon: -60.105,
  },

  // --- Transporte, Gobierno y Bancos ---
  {
    alias: [/terminal/i, /terminal de [oó]mnibus/i],
    nombre: 'Terminal de Ómnibus (Humberto Primo y Av. Villarino)',
    direccion: 'Humberto Primo, Chivilcoy',
    lat: -34.888547,
    lon: -60.01236,
  },
  {
    alias: [/estaci[oó]n de tren/i, /estaci[oó]n sud/i, /\bestaci[oó]n\b/i],
    nombre: 'Estación Sud (Av. Ceballos)',
    direccion: 'Av. Ceballos, Chivilcoy',
    lat: -34.9045,
    lon: -60.012,
  },
  {
    alias: [/cementerio/i, /cementerio municipal/i],
    nombre: 'Cementerio Municipal (Av. José León Suárez)',
    direccion: 'Av. José León Suárez, Chivilcoy',
    lat: -34.878,
    lon: -60.005,
  },
  {
    alias: [/palacio municipal/i, /municipalidad/i, /\bla muni\b/i],
    nombre: 'Palacio Municipal (25 de Mayo 35)',
    direccion: '25 de Mayo 35, Chivilcoy',
    lat: -34.8962,
    lon: -60.0188,
  },
  {
    alias: [/banco naci[oó]n/i],
    nombre: 'Banco Nación (Av. Soárez y San Martín)',
    direccion: 'Av. Soárez 2, Chivilcoy',
    lat: -34.8965,
    lon: -60.0195,
  },
  {
    alias: [/banco provincia/i],
    nombre: 'Banco Provincia (Pellegrini 2)',
    direccion: 'Pellegrini 2, Chivilcoy',
    lat: -34.897,
    lon: -60.0185,
  },

  // --- Localidades Vecinas y Destinos Interurbanos / de Ruta ---
  {
    // Match "alberti" solo cuando se refiera a la ciudad (sin número de calle ni esquinas)
    alias: [
      /^(voy\s+a\s+|hasta\s+|a\s+|para\s+)?alberti(\s+centro|\s+ciudad)?$/i,
      /ciudad\s+de\s+alberti/i,
      /alberti\s+ruta\s*5/i,
      /partido\s+de\s+alberti/i,
    ],
    nombre: 'Alberti (Centro - Ruta 5)',
    direccion: 'Alberti, Provincia de Buenos Aires',
    lat: -35.0317876,
    lon: -60.2804069,
  },
  {
    alias: [/moquehu[aá]/i],
    nombre: 'Moquehuá (Centro)',
    direccion: 'Moquehuá, Partido de Chivilcoy',
    lat: -35.0920287,
    lon: -59.7754756,
  },
  {
    alias: [/gorostiaga/i],
    nombre: 'Gorostiaga (Centro)',
    direccion: 'Gorostiaga, Partido de Chivilcoy',
    lat: -34.8384597,
    lon: -59.8630066,
  },
  {
    alias: [/la rica/i],
    nombre: 'La Rica (Centro)',
    direccion: 'La Rica, Partido de Chivilcoy',
    lat: -34.9732415,
    lon: -59.861755,
  },
  {
    alias: [/suipacha/i],
    nombre: 'Suipacha (Centro - Ruta 5)',
    direccion: 'Suipacha, Provincia de Buenos Aires',
    lat: -34.7733304,
    lon: -59.690381,
  },
  {
    alias: [/bragado/i],
    nombre: 'Bragado (Centro - Ruta 5)',
    direccion: 'Bragado, Provincia de Buenos Aires',
    lat: -35.1155766,
    lon: -60.489771,
  },
  {
    alias: [/mercedes/i],
    nombre: 'Mercedes (Centro - Ruta 5)',
    direccion: 'Mercedes, Provincia de Buenos Aires',
    lat: -34.6506717,
    lon: -59.4317202,
  },
  {
    alias: [/chacabuco/i],
    nombre: 'Chacabuco (Centro - Ruta 30)',
    direccion: 'Chacabuco, Provincia de Buenos Aires',
    lat: -34.6297043,
    lon: -60.470185,
  },
  {
    alias: [/25 de mayo/i, /veinticinco de mayo/i],
    nombre: '25 de Mayo (Centro)',
    direccion: 'Veinticinco de Mayo, Provincia de Buenos Aires',
    lat: -35.4324152,
    lon: -60.171624,
  },
  {
    alias: [/navarro/i],
    nombre: 'Navarro (Centro - Ruta 30)',
    direccion: 'Navarro, Provincia de Buenos Aires',
    lat: -35.0058641,
    lon: -59.2779545,
  },
  {
    alias: [/ezeiza/i, /aeropuerto\s*(de\s*)?ezeiza/i, /\beze\b/i],
    nombre: 'Aeropuerto Internacional de Ezeiza (EZE)',
    direccion: 'Aeropuerto Internacional Ministro Pistarini, Ezeiza',
    lat: -34.8168141,
    lon: -58.5474234,
  },
  {
    alias: [/aeroparque/i, /\baep\b/i],
    nombre: 'Aeroparque Jorge Newbery (AEP)',
    direccion: 'Aeroparque Jorge Newbery, CABA',
    lat: -34.5594364,
    lon: -58.4146299,
  },
  {
    alias: [/\bcaba\b/i, /capital federal/i, /buenos aires centro/i, /\bobelisco\b/i],
    nombre: 'Ciudad de Buenos Aires (Centro / Obelisco)',
    direccion: 'Obelisco, Av. 9 de Julio, CABA',
    lat: -34.603722,
    lon: -58.381592,
  },
];

function buscarPuntoInteres(texto: string): PuntoInteres | null {
  const t = texto.trim().toLowerCase();
  for (const p of PUNTOS_INTERES_CHIVILCOY) {
    for (const r of p.alias) {
      if (r.test(t)) {
        return p;
      }
    }
  }
  return null;
}

/**
 * Geocodifica una dirección escrita en lenguaje natural (ej: "Eustaquia Sánchez 64", "José León Suárez y calle 21")
 * Prioriza puntos de interés reconocidos de Chivilcoy y resuelve intersecciones / esquinas comunes.
 */
async function geocodificarDireccion(
  rawQuery: string
): Promise<{ lat: number; lon: number; nombreOficial?: string; display?: string } | null> {
  const q = (rawQuery || '').trim();
  if (!q || q.length < 2) return null;

  // 1. Verificar si coincide con un punto de interés conocido de Chivilcoy
  const puntoDirecto = buscarPuntoInteres(q);
  if (puntoDirecto) {
    return {
      lat: puntoDirecto.lat,
      lon: puntoDirecto.lon,
      nombreOficial: puntoDirecto.nombre,
      display: puntoDirecto.direccion,
    };
  }

  const cacheKey = q.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }

  // 2. Limpiar preposiciones y frases conversacionales ("voy hasta", "hasta el", "estoy en", etc.)
  let limpia = transcriptionService.extraerDireccion(q);

  // Verificar si la versión limpia coincide con un punto de interés
  const puntoLimpio = buscarPuntoInteres(limpia);
  if (puntoLimpio) {
    const resPunto = {
      lat: puntoLimpio.lat,
      lon: puntoLimpio.lon,
      nombreOficial: puntoLimpio.nombre,
      display: puntoLimpio.direccion,
    };
    geocodeCache.set(cacheKey, resPunto);
    return resPunto;
  }

  // 3. Generar variantes ordenadas de búsqueda en OpenStreetMap
  const queryFinal = limpia.length >= 3 ? limpia : q;
  const variantes: string[] = [];
  const hasCityConstraint =
    /chivilcoy|alberti|moquehu[aá]|gorostiaga|la\s+rica|suipacha|bragado|mercedes|chacabuco|ezeiza|aeroparque|caba|buenos\s+aires|lujan|navarro/i.test(
      queryFinal
    );
  const base = hasCityConstraint ? queryFinal : `${queryFinal}, Chivilcoy`;
  variantes.push(base);

  // Si incluye " y calle X", normalizar a " y X"
  if (/ y calle /i.test(queryFinal)) {
    const simplificada = queryFinal.replace(/ y calle /gi, ' y ');
    variantes.push(hasCityConstraint ? simplificada : `${simplificada}, Chivilcoy`);
  }

  // Si incluye intersección (" y " o " esq "), probar también invertir el orden de las calles en la esquina
  if (/\s+y\s+|\s+esq\.?\s+/i.test(queryFinal)) {
    const partes = queryFinal.split(/\s+y\s+|\s+esq\.?\s+/i);
    if (partes[0] && partes[1] && partes[0].trim().length >= 3 && partes[1].trim().length >= 3) {
      const invertida = `${partes[1].trim()} y ${partes[0].trim()}`;
      variantes.push(hasCityConstraint ? invertida : `${invertida}, Chivilcoy`);
    }
  }

  // Si tiene número al final, buscar también el nombre de la calle sola
  const matchNumero = queryFinal.match(/^([a-zA-ZáéíóúÁÉÍÓÚñÑ\s\.\d]+?)\s+(\d{1,5})$/);
  if (matchNumero && matchNumero[1]) {
    variantes.push(hasCityConstraint ? `${matchNumero[1].trim()}` : `${matchNumero[1].trim()}, Chivilcoy`);
  }

  // Si es un destino interurbano (Alberti, Suipacha, etc.), ampliar el viewbox al corredor regional
  const esInterurbano =
    /alberti|moquehu[aá]|gorostiaga|la\s+rica|suipacha|bragado|mercedes|chacabuco|ezeiza|aeroparque|caba|buenos\s+aires|lujan|navarro/i.test(
      queryFinal
    );
  const viewboxParam = esInterurbano
    ? 'viewbox=-60.65,-34.30,-58.20,-35.65&bounded=0'
    : 'viewbox=-60.15,-34.83,-59.88,-34.96&bounded=0';

  for (const query of variantes) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        query
      )}&countrycodes=ar&limit=1&addressdetails=1&${viewboxParam}`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'AppRemises/1.0 (coordinacion@remises.com)' },
        signal: AbortSignal.timeout(3000),
      });

      const data = (await res.json()) as any[];
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        const display = data[0].display_name || '';

        // Validar que la respuesta pertenezca efectivamente a Chivilcoy o sus corredores interurbanos válidos
        const esValido =
          display.toLowerCase().includes('chivilcoy') ||
          display.toLowerCase().includes('alberti') ||
          display.toLowerCase().includes('moquehu') ||
          display.toLowerCase().includes('gorostiaga') ||
          display.toLowerCase().includes('suipacha') ||
          display.toLowerCase().includes('bragado') ||
          display.toLowerCase().includes('mercedes') ||
          display.toLowerCase().includes('chacabuco') ||
          display.toLowerCase().includes('ezeiza') ||
          display.toLowerCase().includes('aeroparque') ||
          display.toLowerCase().includes('buenos aires') ||
          (lat >= -35.15 && lat <= -34.70 && lon >= -60.30 && lon <= -59.75);

        if (esValido) {
          const resultado = {
            lat,
            lon,
            display,
          };
          geocodeCache.set(cacheKey, resultado);
          return resultado;
        }
      }
    } catch (err) {
      // Continuar con la siguiente variante si hay timeout
    }
  }

  return null;
}

/**
 * Calcula la distancia real de viaje en auto por calles utilizando OSRM (Open Source Routing Machine).
 * Si OSRM no responde en 3 segundos, utiliza Haversine con coeficiente urbano de curvas.
 */
async function calcularDistanciaReal(lat1: number, lon1: number, lat2: number, lon2: number): Promise<number> {
  const routeKey = `${lat1.toFixed(4)},${lon1.toFixed(4)}->${lat2.toFixed(4)},${lon2.toFixed(4)}`;
  if (osrmDistanceCache.has(routeKey)) {
    return osrmDistanceCache.get(routeKey)!;
  }

  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    const data = (await res.json()) as any;
    if (data.routes && data.routes.length > 0) {
      const km = data.routes[0].distance / 1000;
      const kmRedondeado = Math.round(km * 10) / 10;
      osrmDistanceCache.set(routeKey, kmRedondeado);
      return kmRedondeado;
    }
  } catch (err) {
    console.warn('OSRM timeout/error, utilizando estimación Haversine urbana:', err);
  }

  // Fallback Haversine con factor 1.35 de recorrido urbano en cuadrícula
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
  const linealKm = R * c;
  const kmEstimado = Math.round(linealKm * 1.35 * 10) / 10;
  return kmEstimado;
}

// ==============================================================================
// HELPERS DE FECHA Y PARSEO NATURAL DE RESERVAS (ZONA HORARIA ARGENTINA UTC-3)
// ==============================================================================

function getFechaActualArgentina(): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  dayOfWeek: number;
} {
  const now = new Date();
  const arFormatter = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'long',
    hour12: false,
  });

  const parts = arFormatter.formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const year = parseInt(map.year, 10);
  const month = parseInt(map.month, 10) - 1; // 0-indexed
  const day = parseInt(map.day, 10);
  const hour = parseInt(map.hour, 10);
  const minute = parseInt(map.minute, 10);

  const arDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
  const dayOfWeek = arDate.getUTCDay();

  return { year, month, day, hour, minute, dayOfWeek };
}

function formatearFechaLegible(fechaUtc: Date): { fechaTexto: string; horaStr: string } {
  const parts = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(fechaUtc);

  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;

  const weekdayCapitalized = map.weekday.charAt(0).toUpperCase() + map.weekday.slice(1);
  const horaStr = `${map.hour}:${map.minute}`;
  const fechaTexto = `${weekdayCapitalized} ${map.day}/${map.month} a las ${horaStr} hs`;

  return { fechaTexto, horaStr };
}

function parsearDiasYHoraPeriodica(input: string):
  | { diasNumeros: string[]; diasTexto: string; horaStr: string; fechaInicio: Date; resumenTexto: string }
  | { error: string } {
  const txt = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // 1. Extraer hora (ej. 00:30, 8:00, 8 hs, 22 horas, 8 y media)
  let hora: number | null = null;
  let minuto = 0;

  const matchHHMM = txt.match(/\b(\d{1,2})\s*[:.]\s*(\d{2})\b/);
  if (matchHHMM) {
    hora = parseInt(matchHHMM[1], 10);
    minuto = parseInt(matchHHMM[2], 10);
  } else {
    const matchYMedia = txt.match(/\b(\d{1,2})\s+y\s+media\b/);
    const matchYCuarto = txt.match(/\b(\d{1,2})\s+y\s+cuarto\b/);
    const matchHs = txt.match(/\b(?:a\s+las\s+)?(\d{1,2})\s*(?:hs|h|horas?|hrs?)\b/);
    const matchALas = txt.match(/\ba\s+las\s+(\d{1,2})\b/);
    if (matchYMedia) {
      hora = parseInt(matchYMedia[1], 10);
      minuto = 30;
    } else if (matchYCuarto) {
      hora = parseInt(matchYCuarto[1], 10);
      minuto = 15;
    } else if (matchHs) {
      hora = parseInt(matchHs[1], 10);
    } else if (matchALas) {
      hora = parseInt(matchALas[1], 10);
    }
  }

  if (hora === null || hora < 0 || hora > 23 || minuto < 0 || minuto > 59) {
    return {
      error:
        '⚠️ No pudimos reconocer el horario.\n\nEscribí los días y la hora juntos, por ejemplo:\n• *Lunes a Viernes 07:30*\n• *Viernes, Sábado y Domingo 00:30*\n• *Martes y Jueves 18:00*',
    };
  }

  // 2. Extraer días de la semana (0=Dom, 1=Lun, ..., 6=Sab)
  const diasSet = new Set<string>();
  if (txt.includes('todos los dias') || txt.includes('diario') || txt.includes('diariamente')) {
    ['1', '2', '3', '4', '5', '6', '0'].forEach((d) => diasSet.add(d));
  }
  if (txt.includes('lunes a viernes') || txt.includes('lun a vie') || txt.includes('dias habiles')) {
    ['1', '2', '3', '4', '5'].forEach((d) => diasSet.add(d));
  }
  if (txt.includes('lunes a sabado') || txt.includes('lun a sab')) {
    ['1', '2', '3', '4', '5', '6'].forEach((d) => diasSet.add(d));
  }
  if (txt.includes('fin de semana') || txt.includes('fines de semana')) {
    diasSet.add('6');
    diasSet.add('0');
  }

  const patronesDias: Array<{ num: string; regex: RegExp }> = [
    { num: '1', regex: /\b(lunes|lun)\b/ },
    { num: '2', regex: /\b(martes|mar)\b/ },
    { num: '3', regex: /\b(miercoles|mie)\b/ },
    { num: '4', regex: /\b(jueves|jue)\b/ },
    { num: '5', regex: /\b(viernes|vie)\b/ },
    { num: '6', regex: /\b(sabados?|sab)\b/ },
    { num: '0', regex: /\b(domingos?|dom)\b/ },
  ];
  for (const p of patronesDias) {
    if (p.regex.test(txt)) diasSet.add(p.num);
  }

  if (diasSet.size === 0) {
    return {
      error:
        '⚠️ No pudimos reconocer qué días de la semana querés repetir la reserva.\n\nPor ejemplo escribí:\n• *Lunes a Viernes 07:30*\n• *Viernes, Sábado y Domingo 00:30*\n• *Lunes, Miércoles y Viernes 14:00*',
    };
  }

  const ordenVisual = ['1', '2', '3', '4', '5', '6', '0'];
  const nombresDia: Record<string, string> = {
    '1': 'Lunes',
    '2': 'Martes',
    '3': 'Miércoles',
    '4': 'Jueves',
    '5': 'Viernes',
    '6': 'Sábado',
    '0': 'Domingo',
  };
  const diasNumeros = ordenVisual.filter((d) => diasSet.has(d));
  const diasTexto = diasNumeros.map((d) => nombresDia[d]).join(', ');
  const horaStr = `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;

  // Calcular próxima ocurrencia en hora Argentina (UTC-3) como fechaInicio
  const ahoraMs = Date.now();
  const argOffsetMs = 3 * 60 * 60 * 1000;
  let fechaInicio = new Date(ahoraMs);
  for (let offset = 0; offset <= 7; offset++) {
    const argCand = new Date(ahoraMs - argOffsetMs + offset * 24 * 60 * 60 * 1000);
    const dow = String(argCand.getUTCDay());
    if (!diasSet.has(dow)) continue;
    const occUtc = Date.UTC(
      argCand.getUTCFullYear(),
      argCand.getUTCMonth(),
      argCand.getUTCDate(),
      hora + 3,
      minuto,
      0,
      0
    );
    if (occUtc > ahoraMs) {
      fechaInicio = new Date(occUtc);
      break;
    }
  }

  return {
    diasNumeros,
    diasTexto,
    horaStr,
    fechaInicio,
    resumenTexto: `🔁 ${diasTexto} a las ${horaStr} hs`,
  };
}

function parsearFechaHoraReserva(input: string): { fecha: Date; fechaTexto: string; horaStr: string } | { error: string } {
  const texto = input.trim().toLowerCase();
  const ar = getFechaActualArgentina();

  // 1. "en X horas" / "en X minutos"
  const matchEnHoras = texto.match(/en\s+(\d+)\s*(h|hs|hora|horas)/i);
  const matchEnMins = texto.match(/en\s+(\d+)\s*(m|min|mins|minuto|minutos)/i);
  if (matchEnHoras || matchEnMins) {
    const addHours = matchEnHoras ? parseInt(matchEnHoras[1], 10) : 0;
    const addMins = matchEnMins ? parseInt(matchEnMins[1], 10) : 0;
    const targetUtcMs = Date.now() + (addHours * 60 + addMins) * 60 * 1000;
    const targetDate = new Date(targetUtcMs);

    const diffMins = (targetDate.getTime() - Date.now()) / (1000 * 60);
    if (diffMins < 15) {
      return { error: '⚠️ Por favor indicá un horario con al menos *15 minutos de anticipación*.' };
    }

    const { fechaTexto, horaStr } = formatearFechaLegible(targetDate);
    return { fecha: targetDate, fechaTexto, horaStr };
  }

  // 2. Extraer Hora (HH:mm, HH.mm, HH hs, etc.)
  let textoSinFecha = texto
    .replace(/\b(hoy|mañana|manana|pasado mañana|pasado manana)\b/g, '')
    .replace(/\b(lunes|martes|miercoles|miércoles|jueves|viernes|sabado|sábado|domingo)\b/g, '')
    .replace(/\b\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?\b/g, '')
    .trim();

  const timeRegex = /(?:a\s+las\s+)?(\d{1,2})(?:[:.](\d{2}))?\s*(hs|hrs|horas|am|pm)?/i;
  const timeMatch = textoSinFecha.match(timeRegex);
  if (!timeMatch || !timeMatch[1]) {
    return {
      error:
        '⚠️ No pudimos reconocer la hora de tu reserva.\n\nPor favor escribí la fecha y hora indicando el horario (ej: *Mañana 08:30*, *Hoy 23:00*, *Lunes 07:15*).',
    };
  }

  let targetHour = parseInt(timeMatch[1], 10);
  const targetMinute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
  const ampm = (timeMatch[3] || '').toLowerCase();

  if (ampm === 'pm' && targetHour < 12) targetHour += 12;
  if (ampm === 'am' && targetHour === 12) targetHour = 0;

  if (targetHour < 0 || targetHour > 23 || targetMinute < 0 || targetMinute > 59) {
    return { error: '⚠️ El horario ingresado no es válido. Ingresá una hora entre 00:00 y 23:59.' };
  }

  let targetYear = ar.year;
  let targetMonth = ar.month;
  let targetDay = ar.day;

  // 3. Determinar el Día
  if (texto.includes('pasado mañana') || texto.includes('pasado manana')) {
    targetDay += 2;
  } else if (texto.includes('mañana') || texto.includes('manana')) {
    targetDay += 1;
  } else if (texto.includes('hoy')) {
    // Es hoy
  } else {
    // ¿Nombre de día de semana?
    const diasSemanaMap: Record<string, number> = {
      domingo: 0,
      lunes: 1,
      martes: 2,
      miercoles: 3,
      miércoles: 3,
      jueves: 4,
      viernes: 5,
      sabado: 6,
      sábado: 6,
    };

    let diaSemanaEncontrado = -1;
    for (const [diaNombre, diaNum] of Object.entries(diasSemanaMap)) {
      if (new RegExp(`\\b${diaNombre}\\b`, 'i').test(texto)) {
        diaSemanaEncontrado = diaNum;
        break;
      }
    }

    if (diaSemanaEncontrado !== -1) {
      let diffDays = (diaSemanaEncontrado - ar.dayOfWeek + 7) % 7;
      if (diffDays === 0) {
        if (targetHour < ar.hour || (targetHour === ar.hour && targetMinute <= ar.minute)) {
          diffDays = 7;
        }
      }
      targetDay += diffDays;
    } else {
      // ¿Fecha numérica DD/MM?
      const fechaNumMatch = texto.match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
      if (fechaNumMatch) {
        targetDay = parseInt(fechaNumMatch[1], 10);
        targetMonth = parseInt(fechaNumMatch[2], 10) - 1;
        if (fechaNumMatch[3]) {
          let y = parseInt(fechaNumMatch[3], 10);
          if (y < 100) y += 2000;
          targetYear = y;
        }
      } else {
        // Sin día explícito: si la hora ya pasó hoy (o falta menos de 15m), asume mañana
        if (targetHour < ar.hour || (targetHour === ar.hour && targetMinute <= ar.minute + 15)) {
          targetDay += 1;
        }
      }
    }
  }

  // Argentina es UTC-3, por lo que UTC = targetHour + 3
  const targetDateUtc = new Date(Date.UTC(targetYear, targetMonth, targetDay, targetHour + 3, targetMinute, 0));

  const diffMinutes = (targetDateUtc.getTime() - Date.now()) / (1000 * 60);
  if (diffMinutes < 15) {
    return {
      error:
        '⚠️ La hora elegida ya pasó o es muy próxima. Por favor programá tu viaje con al menos *15 minutos de anticipación*.\n\n_Si necesitás un móvil ya mismo, presioná "Pedir Ahora"_',
    };
  }

  if (diffMinutes > 30 * 24 * 60) {
    return {
      error: '⚠️ Las reservas pueden programarse hasta con 30 días de anticipación.',
    };
  }

  const { fechaTexto, horaStr } = formatearFechaLegible(targetDateUtc);
  return {
    fecha: targetDateUtc,
    fechaTexto,
    horaStr,
  };
}

// Registro en memoria para evitar saludar múltiples veces el mismo día de cumpleaños
const cumpleSaludadosMap = new Set<string>();

const APP_CLIENTES_URL = 'https://cliente.brunoremises.com.ar';

function esEmailAutogenerado(email?: string | null): boolean {
  if (!email) return true;
  const e = email.toLowerCase().trim();
  return (
    /^cliente_\d+.*@remisesbruno\.com\.ar$/.test(e) ||
    e.endsWith('@cliente.brunoremises.com.ar') ||
    e.endsWith('@bruno.local') ||
    e.endsWith('@appremises.com')
  );
}

/**
 * Determina si en la fecha actual de Argentina (o en una fecha dada) es el cumpleaños real del pasajero.
 * Ignora la fecha comodín 1990-01-01T00:00:00.000Z asignada automáticamente al crear cuentas rápidas.
 */
export function esCumpleaniosCliente(
  cliente?: { fechaNacimiento?: Date | string | null; email?: string | null } | null,
  fechaReferenciaUtc?: Date
): boolean {
  if (!cliente?.fechaNacimiento) return false;
  const fn = new Date(cliente.fechaNacimiento);
  if (isNaN(fn.getTime())) return false;

  const bYear = fn.getUTCFullYear();
  const bMonth = fn.getUTCMonth(); // 0-11
  const bDay = fn.getUTCDate(); // 1-31
  const bHours = fn.getUTCHours();

  // Ignorar el placeholder automático 1990-01-01 00:00:00 UTC si nunca fue editado por el usuario
  if (bYear === 1990 && bMonth === 0 && bDay === 1 && bHours === 0) {
    return false;
  }

  if (fechaReferenciaUtc) {
    const parts = new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(fechaReferenciaUtc);
    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    const refMonth = parseInt(map.month, 10) - 1;
    const refDay = parseInt(map.day, 10);
    return bMonth === refMonth && bDay === refDay;
  }

  const ar = getFechaActualArgentina();
  return bMonth === ar.month && bDay === ar.day;
}

function obtenerClaveCumpleHoy(identificador: string): string {
  const ar = getFechaActualArgentina();
  return `${ar.year}-${ar.month + 1}-${ar.day}:${identificador}`;
}

// ==============================================================================
// REGISTRO Y VINCULACIÓN SEGURA DE CLIENTES DESDE WHATSAPP
// ==============================================================================

async function crearClienteDesdeWhatsApp(
  telefono: string,
  dni: string,
  nombre: string,
  apellido: string,
  remiseriaId: string
) {
  const bcrypt = await import('bcryptjs');
  const hashedPassword = await bcrypt.default.hash('123456', 10);
  const emailDummy = `cliente_${dni.replace(/\D/g, '') || Date.now()}_${Date.now()}@remisesbruno.com.ar`;

  const user = await prisma.user.create({
    data: {
      email: emailDummy,
      passwordHash: hashedPassword,
      rol: 'CLIENTE',
      activo: true,
    },
  });

  const cliente = await prisma.cliente.create({
    data: {
      userId: user.id,
      nombre: nombre.trim() || 'Pasajero',
      apellido: (apellido || '').trim(),
      dni: dni.trim(),
      telefono,
      email: emailDummy,
      direccion: 'Chivilcoy, Buenos Aires',
      fechaNacimiento: new Date('1990-01-01'),
      remiseriaId: remiseriaId || null,
      activo: true,
    },
    include: {
      remiseria: true,
      user: true,
    },
  });

  return cliente;
}

// ==============================================================================
// SERVICIO PRINCIPAL DEL BOT DE WHATSAPP
// ==============================================================================

export const whatsappBotService = {
  /**
   * Procesa cualquier mensaje entrante de un usuario por WhatsApp
   */
  async procesarMensaje(params: {
    from: string;
    messageId: string;
    tipo: 'text' | 'interactive' | 'location' | 'audio';
    texto?: string;
    botonId?: string;
    location?: { latitude: number; longitude: number; name?: string; address?: string };
    audioId?: string;
    senderName?: string;
  }) {
    const { from, messageId, tipo, texto, botonId, location, audioId, senderName } = params;
    const cleanFrom = whatsappService.formatearNumero(from);
    const sesion = getSesion(cleanFrom);

    // Marcar mensaje como leído en WhatsApp
    whatsappService.marcarComoLeido(messageId).catch(() => {});

    // 0. VERIFICACIÓN DE PAUSA DEL BOT (ATENCIÓN HUMANA POR WHATSAPP)
    const pausaActual = pausasHumanasMap.get(cleanFrom);
    if (pausaActual) {
      if (Date.now() < pausaActual.hasta.getTime()) {
        const txt = (texto || '').trim().toLowerCase();
        // Si el usuario solicita reactivar el bot explícitamente
        if (txt === 'bot' || txt === 'menu' || txt === 'menú' || txt === 'reiniciar' || txt === 'activar bot') {
          if (pausaActual.timerId) clearTimeout(pausaActual.timerId);
          pausasHumanasMap.delete(cleanFrom);
          resetSesion(cleanFrom);
          const saludoReanudado = `🤖 *Asistente automático reactivado*\n\n¡Hola de nuevo! El bot está listo para tomar tus viajes y reservas. ¿Cómo querés viajar hoy?`;
          return await whatsappService.enviarBotones(cleanFrom, saludoReanudado, [
            { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
            { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
            { id: 'BTN_ESTADO', title: '📍 Estado / Ayuda' },
          ]);
        }
        // El bot está pausado: no responde nada para permitir diálogo fluido con el operador humano
        return;
      } else {
        // Pausa expirada tras 10 minutos
        if (pausaActual.timerId) clearTimeout(pausaActual.timerId);
        pausasHumanasMap.delete(cleanFrom);
      }
    }

    // 1. Identificar o registrar al cliente en la base de datos
    let cliente = await prisma.cliente.findFirst({
      where: {
        OR: [
          { telefono: cleanFrom },
          { telefono: { contains: cleanFrom.slice(-8) } }, // Coincidencia por últimos 8 dígitos
        ],
      },
      include: {
        remiseria: true,
      },
    });

    // Obtener remisería principal
    let remiseria = cliente?.remiseria;
    if (!remiseria) {
      remiseria = await prisma.remiseria.findFirst();
    }
    const remiseriaId = remiseria?.id || '';
    const bajadaBandera = remiseria?.bajadaBandera || 3500;
    const valorKm = remiseria?.valorKm || 800;

    // ==============================================================================
    // VALIDACIÓN DE SEGURIDAD PARA PRIMER CONTACTO (SOLICITUD DE DNI Y VINCULACIÓN)
    // ==============================================================================
    if (!cliente) {
      if (sesion.estado === 'ESPERANDO_DNI_REGISTRO') {
        const dniLimpio = (texto || '').replace(/\D/g, '').trim();
        if (dniLimpio.length < 7 || dniLimpio.length > 9) {
          return await whatsappService.enviarTexto(
            cleanFrom,
            '⚠️ Por favor ingresá un número de *DNI válido* (de 7 u 8 dígitos, sin puntos ni letras):'
          );
        }

        // 1. Verificar si ya existe una cuenta con este DNI (ej: cuenta creada previamente en la App)
        const clientePorDni = await prisma.cliente.findUnique({
          where: { dni: dniLimpio },
          include: { remiseria: true, user: true },
        });

        if (clientePorDni) {
          // Vincular este número de teléfono de WhatsApp a su cuenta de cliente existente
          cliente = await prisma.cliente.update({
            where: { id: clientePorDni.id },
            data: { telefono: cleanFrom },
            include: { remiseria: true, user: true },
          });

          sesion.nombre = cliente.nombre;
          sesion.estado = 'IDLE';

          const saludoApp = `👋 ¡Hola, *${cliente.nombre}*! Gracias por comunicarte con *Remises Bruno*.\n\n🛡️ Verificamos tu cuenta de la App con tu DNI.\n\n¿Cómo querés viajar hoy?`;
          return await whatsappService.enviarBotones(cleanFrom, saludoApp, [
            { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
            { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
            { id: 'BTN_ESTADO', title: '📍 Mis Viajes' },
          ]);
        }

        // 2. Si no existe en la app, verificar nombre oficial o solicitar Nombre y Apellido
        let nombreDetectado = senderName || '';
        let apellidoDetectado = '';
        try {
          const { identityVerificationService } = await import('./identityVerificationService');
          const identidad = await identityVerificationService.verificarPorDni(dniLimpio);
          if (identidad?.nombre && identidad.nombre.trim().length > 1) {
            nombreDetectado = identidad.nombre.trim();
            apellidoDetectado = identidad.apellido?.trim() || '';
          }
        } catch {}

        if (nombreDetectado && nombreDetectado.toLowerCase() !== 'pasajero' && nombreDetectado.length > 2) {
          cliente = await crearClienteDesdeWhatsApp(cleanFrom, dniLimpio, nombreDetectado, apellidoDetectado, remiseriaId);
          sesion.nombre = cliente.nombre;
          sesion.estado = 'IDLE';

          const saludoNuevo =
            `✅ *Identidad registrada con éxito.*\n\n` +
            `👋 ¡Hola, *${cliente.nombre}*! Gracias por comunicarte con *Remises Bruno*.\n\n` +
            `📲 _Tip: También podés descargar nuestra App en_ *${APP_CLIENTES_URL}* _(ingresando con tu DNI) para pedir viajes aunque algún día falle WhatsApp._\n\n` +
            `¿Cómo querés viajar hoy?`;
          return await whatsappService.enviarBotones(cleanFrom, saludoNuevo, [
            { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
            { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
            { id: 'BTN_ESTADO', title: '📍 Mis Viajes' },
          ]);
        } else {
          sesion.dniTemporal = dniLimpio;
          sesion.estado = 'ESPERANDO_NOMBRE_REGISTRO';
          return await whatsappService.enviarTexto(
            cleanFrom,
            `✅ DNI recibido: *${dniLimpio}*.\n\n✍️ Por favor escribí tu *Nombre y Apellido* para registrarte como pasajero en nuestra central:`
          );
        }
      }

      if (sesion.estado === 'ESPERANDO_NOMBRE_REGISTRO') {
        const nombreInput = (texto || senderName || 'Pasajero').trim();
        const partes = nombreInput.split(' ');
        const nombre = partes[0] || 'Pasajero';
        const apellido = partes.slice(1).join(' ') || '';
        const dniFinal = sesion.dniTemporal || '11111111';

        cliente = await crearClienteDesdeWhatsApp(cleanFrom, dniFinal, nombre, apellido, remiseriaId);
        sesion.nombre = cliente.nombre;
        sesion.estado = 'IDLE';

        const saludoNuevo =
          `✅ *¡Registro completado exitosamente!*\n\n` +
          `👋 ¡Hola, *${cliente.nombre}*! Gracias por comunicarte con *Remises Bruno*.\n\n` +
          `📲 _Tip: También podés descargar nuestra App en_ *${APP_CLIENTES_URL}* _(ingresando con tu DNI) para pedir viajes aunque algún día falle WhatsApp._\n\n` +
          `¿Cómo querés viajar hoy?`;
        return await whatsappService.enviarBotones(cleanFrom, saludoNuevo, [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
          { id: 'BTN_ESTADO', title: '📍 Mis Viajes' },
        ]);
      }

      // Si es el primer mensaje de este número de teléfono:
      sesion.estado = 'ESPERANDO_DNI_REGISTRO';
      return await whatsappService.enviarTexto(
        cleanFrom,
        `👋 ¡Hola! Bienvenido a *Remises Bruno*.\n\n🛡️ *Por razones de seguridad de nuestros pasajeros y conductores*, solicitamos tu número de *DNI* (sin puntos ni espacios) antes de iniciar tu primer viaje:`
      );
    }

    const nombreMostrado = cliente?.nombre || senderName || 'Pasajero';
    sesion.nombre = nombreMostrado;

    // 2. Comandos globales directos (reiniciar, cancelar pedido/reserva, estado, operador)
    const textoLower = (texto || '').trim().toLowerCase();
    const actionId = botonId || '';

    // Botones directos de cancelación de un pedido o reserva ya confirmados
    if (actionId.startsWith('BTN_CANCELAR_VIAJE')) {
      const targetViajeId = actionId.replace('BTN_CANCELAR_VIAJE_', '').trim();
      return await this.solicitarConfirmacionCancelarViaje(
        cleanFrom,
        sesion,
        cliente?.id,
        targetViajeId && targetViajeId !== 'BTN_CANCELAR_VIAJE' ? targetViajeId : undefined
      );
    }

    if (actionId.startsWith('BTN_SI_CANCELAR_VIAJE_')) {
      const targetViajeId = actionId.replace('BTN_SI_CANCELAR_VIAJE_', '').trim();
      return await this.ejecutarCancelacionViajeWhatsApp(cleanFrom, cliente?.id, targetViajeId || undefined);
    }

    if (actionId.startsWith('BTN_NO_CANCELAR_VIAJE_')) {
      const targetViajeId = actionId.replace('BTN_NO_CANCELAR_VIAJE_', '').trim();
      resetSesion(cleanFrom);
      const cod = targetViajeId ? `#${targetViajeId.slice(-4).toUpperCase()}` : '';
      return await whatsappService.enviarBotones(
        cleanFrom,
        `👍 *¡Perfecto!* Tu pedido *${cod}* continúa activo en nuestra central.`,
        [
          { id: 'BTN_ESTADO', title: '📍 Estado del viaje' },
          { id: targetViajeId ? `BTN_CANCELAR_VIAJE_${targetViajeId}` : 'BTN_CANCELAR_VIAJE', title: '❌ Cancelar Pedido' },
          { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
        ]
      );
    }

    if (actionId.startsWith('BTN_CANCELAR_RESERVA')) {
      const targetReservaId = actionId.replace('BTN_CANCELAR_RESERVA_', '').trim();
      return await this.solicitarConfirmacionCancelarReserva(
        cleanFrom,
        sesion,
        cliente?.id,
        targetReservaId && targetReservaId !== 'BTN_CANCELAR_RESERVA' ? targetReservaId : undefined
      );
    }

    if (actionId.startsWith('BTN_SI_CANCELAR_RESERVA_')) {
      const targetReservaId = actionId.replace('BTN_SI_CANCELAR_RESERVA_', '').trim();
      return await this.ejecutarCancelacionReservaWhatsApp(cleanFrom, cliente?.id, targetReservaId || undefined);
    }

    if (actionId.startsWith('BTN_NO_CANCELAR_RESERVA_')) {
      const targetReservaId = actionId.replace('BTN_NO_CANCELAR_RESERVA_', '').trim();
      resetSesion(cleanFrom);
      return await whatsappService.enviarBotones(
        cleanFrom,
        `👍 *¡Perfecto!* Tu reserva programada continúa activa en nuestra central.`,
        [
          { id: 'BTN_ESTADO', title: '📍 Mis Reservas' },
          { id: targetReservaId ? `BTN_CANCELAR_RESERVA_${targetReservaId}` : 'BTN_CANCELAR_RESERVA', title: '❌ Cancelar Reserva' },
          { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
        ]
      );
    }

    const esTextoCancelarViajeActivo =
      textoLower === 'cancelar viaje' ||
      textoLower === 'cancelar pedido' ||
      textoLower === 'cancelar remis' ||
      textoLower === 'cancelar remís' ||
      textoLower === 'no quiero viajar' ||
      textoLower === 'no voy a viajar' ||
      textoLower === 'no viajo';

    const esTextoCancelarReservaActiva =
      textoLower === 'cancelar reserva' ||
      textoLower === 'anular reserva';

    if (esTextoCancelarReservaActiva) {
      return await this.solicitarConfirmacionCancelarReserva(cleanFrom, sesion, cliente?.id);
    }

    if (esTextoCancelarViajeActivo) {
      return await this.solicitarConfirmacionCancelarViaje(cleanFrom, sesion, cliente?.id);
    }

    if (
      sesion.estado !== 'CONFIRMANDO_CANCELACION_VIAJE' &&
      sesion.estado !== 'CONFIRMANDO_CANCELACION_RESERVA' &&
      (actionId === 'BTN_CANCELAR' || textoLower === 'cancelar' || textoLower === 'salir')
    ) {
      // Si el usuario está en IDLE (no está armando una cotización) y escribe "cancelar",
      // verificar primero si tiene un pedido o reserva activa en curso para cancelarla realmente en central
      if (sesion.estado === 'IDLE' && actionId !== 'BTN_CANCELAR' && textoLower === 'cancelar') {
        const viajeActivoParaCancelar = await prisma.viaje.findFirst({
          where: {
            OR: [
              { clienteTelefono: cleanFrom },
              { clienteTelefono: { contains: cleanFrom.slice(-8) } },
              ...(cliente?.id ? [{ clienteId: cliente.id }] : []),
            ],
            estado: { in: ['PENDIENTE', 'ACEPTADO', 'EN_CAMINO', 'EN_CURSO'] },
          },
          orderBy: { createdAt: 'desc' },
        });

        if (viajeActivoParaCancelar) {
          return await this.solicitarConfirmacionCancelarViaje(
            cleanFrom,
            sesion,
            cliente?.id,
            viajeActivoParaCancelar.id
          );
        }

        const reservaActivaParaCancelar = await prisma.reserva.findFirst({
          where: {
            OR: [
              { clienteTelefono: cleanFrom },
              { clienteTelefono: { contains: cleanFrom.slice(-8) } },
              ...(cliente?.id ? [{ clienteId: cliente.id }] : []),
            ],
            estado: 'ACTIVA',
            fechaInicio: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
          orderBy: { fechaInicio: 'asc' },
        });

        if (reservaActivaParaCancelar) {
          return await this.solicitarConfirmacionCancelarReserva(
            cleanFrom,
            sesion,
            cliente?.id,
            reservaActivaParaCancelar.id
          );
        }
      }

      resetSesion(cleanFrom);
      return await whatsappService.enviarBotones(
        cleanFrom,
        '❌ Operación cancelada. ¡Cuando nos necesites volvé a escribirnos!',
        [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
        ]
      );
    }

    const esSolicitudOperador = (
      actionId === 'BTN_OPERADOR' ||
      textoLower === 'operador' ||
      textoLower === 'central' ||
      textoLower === 'coordinador' ||
      textoLower === 'humano' ||
      textoLower === 'persona' ||
      textoLower.includes('hablar con') ||
      textoLower.includes('atencion humana') ||
      textoLower.includes('atención humana') ||
      textoLower === 'hablar con operador' ||
      textoLower === 'hablar con coordinador' ||
      textoLower === 'hablar con alguien'
    );

    if (esSolicitudOperador) {
      // Activar pausa del bot por 10 minutos para permitir diálogo humano con el operador
      const MINUTOS_PAUSA = 10;
      const hasta = new Date(Date.now() + MINUTOS_PAUSA * 60 * 1000);

      // Limpiar timer previo si existía para este teléfono
      const pausaPrevia = pausasHumanasMap.get(cleanFrom);
      if (pausaPrevia?.timerId) {
        clearTimeout(pausaPrevia.timerId);
      }

      // Cronómetro automático de 10 minutos para reconectar el bot y saludar al cliente
      const timerId = setTimeout(async () => {
        const p = pausasHumanasMap.get(cleanFrom);
        if (p) {
          pausasHumanasMap.delete(cleanFrom);
          try {
            const msgReconexionAuto =
              `🤖 *Asistente automático reconectado*\n\n` +
              `Hola, *${nombreMostrado}*. Han pasado los 10 minutos de atención con la central y el bot se ha vuelto a conectar automáticamente.\n\n` +
              `¿En qué te podemos ayudar?`;

            await whatsappService.enviarBotones(cleanFrom, msgReconexionAuto, [
              { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
              { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
              { id: 'BTN_ESTADO', title: '📍 Estado / Ayuda' },
            ]);
          } catch (e) {
            console.warn('Aviso enviando mensaje de reconexión automática tras 10 min:', e);
          }
        }
      }, MINUTOS_PAUSA * 60 * 1000);

      pausasHumanasMap.set(cleanFrom, { hasta, nombre: nombreMostrado, timerId });

      // Notificar al coordinador en tiempo real por WebSocket
      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        io.to(remiseriaId).emit('solicitud_atencion_humana', {
          telefono: cleanFrom,
          nombre: nombreMostrado,
          mensaje: texto || 'El pasajero solicitó contactarse con el operador/coordinador.',
          timestamp: new Date().toISOString(),
          expiraEnMinutos: MINUTOS_PAUSA,
        });
      } catch (wsErr) {
        console.warn('Aviso socket al emitir solicitud_atencion_humana:', wsErr);
      }

      const msgDerivacion =
        `👤 *TRANSFERENCIA CON EL COORDINADOR*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `Hola, *${nombreMostrado}*. Un operador de *Remises Bruno* se pondrá en contacto con vos por este chat a la brevedad.\n\n` +
        `⏸️ *El bot ha sido pausado por 10 minutos* para que puedas conversar directamente con la central sin interrupciones automáticas.\n` +
        `⏱️ _Pasados los 10 minutos, el asistente automático se reconectará por sí solo._\n\n` +
        `💡 _Si necesitás volver a activar el bot antes, escribí_ *MENU* _o_ *BOT*.\n` +
        `📞 _Líneas directas de guardia:_ 2346-427637 / 2346-433000.`;

      return await whatsappService.enviarTexto(cleanFrom, msgDerivacion);
    }

    if (actionId === 'BTN_ESTADO' || textoLower === 'estado' || textoLower === 'mis viajes') {
      return await this.consultarEstadoViaje(cleanFrom, cliente?.id);
    }

    // ==============================================================================
    // 3. PROCESAMIENTO DE MENSAJES DE AUDIO / VOZ (TRANSCRIPCIÓN Y CONFIRMACIÓN)
    // ==============================================================================
    if (tipo === 'audio' && audioId) {
      const transcripcion = await transcriptionService.transcribirAudioWhatsApp(audioId);

      if (!transcripcion || transcripcion.trim().length < 2) {
        return await whatsappService.enviarTexto(
          cleanFrom,
          '🎙️ *No pudimos entender con claridad tu audio por ruido de fondo.*\n\n✍️ Por favor escribinos tu mensaje por texto o compartinos tu ubicación GPS con el clip 📎.'
        );
      }

      let direccionLimpia = transcriptionService.extraerDireccion(transcripcion);
      const puntoEncontrado = buscarPuntoInteres(direccionLimpia) || buscarPuntoInteres(transcripcion);
      if (puntoEncontrado) {
        direccionLimpia = puntoEncontrado.nombre;
      }
      sesion.audioTextoOriginal = transcripcion;
      sesion.audioDireccionPendiente = direccionLimpia;

      if (sesion.estado === 'IDLE') {
        const transLower = transcripcion.toLowerCase();
        if (
          transLower.includes('reserva') ||
          transLower.includes('agendar') ||
          transLower.includes('para mañana') ||
          transLower.includes('para más tarde')
        ) {
          sesion.esReserva = true;
          const parseResult = parsearFechaHoraReserva(transcripcion);
          if (!('error' in parseResult)) {
            sesion.fechaHoraReserva = parseResult.fecha;
            sesion.fechaHoraTexto = parseResult.fechaTexto;
            sesion.horaInicioStr = parseResult.horaStr;
            sesion.estado = 'ESPERANDO_ORIGEN';
            return await whatsappService.enviarTexto(
              cleanFrom,
              `🎙️ *Te escuchamos:* _"${transcripcion}"_\n\n🗓️ *Reserva programada para:* ${parseResult.fechaTexto}\n\n📍 *¿Dónde te pasamos a buscar?*\nPodés escribir la dirección o mandar otro audio indicando el origen:`
            );
          } else {
            sesion.estado = 'ESPERANDO_FECHA_HORA_RESERVA';
            return await whatsappService.enviarTexto(
              cleanFrom,
              `🎙️ *Te escuchamos:* _"${transcripcion}"_\n\n📅 ¿Para qué día y hora necesitás el remís? (ej: *Mañana 08:30*, *Hoy 23:00*)`
            );
          }
        } else {
          // Audio normal en IDLE pidiendo auto
          const estadoAgencia = checkAgenciaEstado(remiseria);
          if (!estadoAgencia.abierta) {
            resetSesion(cleanFrom);
            const msgCerrado = `⛔ *AGENCIA CERRADA*\n\nHola, *${nombreMostrado}*.\nEn este momento nuestra central se encuentra cerrada.\n\n📢 *Aviso:* ${estadoAgencia.mensaje}\n\n${estadoAgencia.reaperturaEstimada ? `🚗 *Apertura prevista:* ${estadoAgencia.reaperturaEstimada}\n\n` : ''}Si tenés una urgencia podés comunicarte con nuestro operador de guardia o consultar tus reservas agendadas.`;
            return await whatsappService.enviarBotones(cleanFrom, msgCerrado, [
              { id: 'BTN_OPERADOR', title: '📞 Operador Guardia' },
              { id: 'BTN_ESTADO', title: '📍 Mis Reservas' },
            ]);
          }

          sesion.esReserva = false;
          sesion.estado = 'CONFIRMANDO_AUDIO_ORIGEN';
          return await whatsappService.enviarBotones(
            cleanFrom,
            `🎙️ *Escuchamos tu audio:*\n_\"${transcripcion}\"_\n\n🟢 Entendimos que tu origen es:\n*${direccionLimpia}*\n\n¿Es correcta esta dirección para buscarte?`,
            [
              { id: 'BTN_CONFIRMAR_AUDIO_ORIGEN', title: '✅ Sí, es correcta' },
              { id: 'BTN_REINTENTAR_AUDIO_ORIGEN', title: '✍️ No, escribirla' },
            ],
            'Confirmación de Audio'
          );
        }
      }

      if (sesion.estado === 'ESPERANDO_ORIGEN') {
        sesion.estado = 'CONFIRMANDO_AUDIO_ORIGEN';
        return await whatsappService.enviarBotones(
          cleanFrom,
          `🎙️ *Escuchamos tu audio:*\n_\"${transcripcion}\"_\n\n🟢 Entendimos que tu origen es:\n*${direccionLimpia}*\n\n¿Es correcta esta dirección para buscarte?`,
          [
            { id: 'BTN_CONFIRMAR_AUDIO_ORIGEN', title: '✅ Sí, es correcta' },
            { id: 'BTN_REINTENTAR_AUDIO_ORIGEN', title: '✍️ No, escribirla' },
          ],
          'Confirmación de Audio'
        );
      }

      if (sesion.estado === 'ESPERANDO_DESTINO') {
        sesion.estado = 'CONFIRMANDO_AUDIO_DESTINO';
        return await whatsappService.enviarBotones(
          cleanFrom,
          `🎙️ *Escuchamos tu audio:*\n_\"${transcripcion}\"_\n\n🔴 Entendimos que tu destino es:\n*${direccionLimpia}*\n\n¿Es correcto este destino?`,
          [
            { id: 'BTN_CONFIRMAR_AUDIO_DESTINO', title: '✅ Sí, es correcto' },
            { id: 'BTN_REINTENTAR_AUDIO_DESTINO', title: '✍️ No, escribirlo' },
          ],
          'Confirmación de Audio'
        );
      }

      if (sesion.estado === 'ESPERANDO_DIAS_HORA_PERIODICA') {
        const parsedPer = parsearDiasYHoraPeriodica(transcripcion);
        if ('error' in parsedPer) {
          return await whatsappService.enviarTexto(
            cleanFrom,
            `🎙️ *Te escuchamos:* _"${transcripcion}"_\n\n${parsedPer.error}`
          );
        }
        sesion.tipoReserva = 'PERIODICA';
        sesion.diasSemanaReserva = parsedPer.diasNumeros;
        sesion.diasSemanaTexto = parsedPer.diasTexto;
        sesion.fechaHoraReserva = parsedPer.fechaInicio;
        sesion.fechaHoraTexto = parsedPer.resumenTexto;
        sesion.horaInicioStr = parsedPer.horaStr;
        sesion.estado = 'ESPERANDO_ORIGEN';
        return await whatsappService.enviarTexto(
          cleanFrom,
          `🎙️ *Te escuchamos:* _"${transcripcion}"_\n\n🔁 *Reserva periódica:* ${parsedPer.resumenTexto}\n\n📍 *¿Dónde te pasamos a buscar?*\nPodés escribir la dirección o mandar otro audio diciendo el lugar:`
        );
      }

      if (sesion.estado === 'ESPERANDO_FECHA_HORA_RESERVA') {
        const parseResult = parsearFechaHoraReserva(transcripcion);
        if ('error' in parseResult) {
          return await whatsappService.enviarTexto(
            cleanFrom,
            `🎙️ *Te escuchamos:* _"${transcripcion}"_\n\n${parseResult.error}`
          );
        }
        sesion.fechaHoraReserva = parseResult.fecha;
        sesion.fechaHoraTexto = parseResult.fechaTexto;
        sesion.horaInicioStr = parseResult.horaStr;
        sesion.estado = 'ESPERANDO_ORIGEN';
        return await whatsappService.enviarTexto(
          cleanFrom,
          `🗓️ *Reserva para:* ${parseResult.fechaTexto}\n\n📍 *¿Dónde te pasamos a buscar?*\nPodés escribir la dirección o mandar otro audio diciendo el lugar:`
        );
      }
    }

    // ==============================================================================
    // 4. MANEJO SEGÚN ESTADO DE LA CONVERSACIÓN
    // ==============================================================================
    switch (sesion.estado) {
      case 'IDLE': {
        // Disparador: Reservar para más tarde (única o periódica)
        if (
          actionId === 'BTN_RESERVAR' ||
          textoLower.includes('reserva') ||
          textoLower.includes('agendar') ||
          textoLower.includes('programar') ||
          textoLower.includes('para mañana') ||
          textoLower.includes('para mas tarde') ||
          textoLower.includes('para más tarde') ||
          textoLower.includes('otro momento')
        ) {
          sesion.esReserva = true;
          sesion.tipoReserva = undefined;
          sesion.diasSemanaReserva = undefined;
          sesion.diasSemanaTexto = undefined;
          sesion.estado = 'ESPERANDO_TIPO_RESERVA';
          return await whatsappService.enviarBotones(
            cleanFrom,
            `📅 *¿Qué tipo de reserva querés programar?*\n\n• *Reserva Única:* para un día y horario puntual.\n• *Reserva Periódica:* se repite automáticamente los días de la semana que elijas (ej. Lunes a Viernes 07:30).`,
            [
              { id: 'BTN_RESERVA_UNICA', title: '📅 Reserva Única' },
              { id: 'BTN_RESERVA_PERIODICA', title: '🔁 Reserva Periódica' },
            ]
          );
        }

        // Disparador: Pedir ahora inmediatamente
        if (
          actionId === 'BTN_PEDIR' ||
          actionId === 'BTN_PEDIR_AHORA' ||
          textoLower.includes('pedir') ||
          textoLower.includes('remis') ||
          textoLower.includes('auto') ||
          textoLower.includes('viaje') ||
          textoLower.includes('ahora')
        ) {
          // Validar estado de la agencia antes de iniciar el pedido
          const estadoAgencia = checkAgenciaEstado(remiseria);
          if (!estadoAgencia.abierta) {
            resetSesion(cleanFrom);
            const msgCerrado = `⛔ *AGENCIA CERRADA*\n\nHola, *${nombreMostrado}*.\nEn este momento nuestra central se encuentra cerrada.\n\n📢 *Aviso:* ${estadoAgencia.mensaje}\n\n${estadoAgencia.reaperturaEstimada ? `🚗 *Apertura prevista:* ${estadoAgencia.reaperturaEstimada}\n\n` : ''}Si tenés una urgencia podés consultar al operador de guardia o verificar tus viajes anteriores.`;
            return await whatsappService.enviarBotones(cleanFrom, msgCerrado, [
              { id: 'BTN_OPERADOR', title: '📞 Operador Guardia' },
              { id: 'BTN_ESTADO', title: '📍 Mis Viajes' },
            ]);
          }

          sesion.esReserva = false;
          sesion.estado = 'ESPERANDO_ORIGEN';
          return await whatsappService.enviarTexto(
            cleanFrom,
            `📍 *¿Dónde te pasamos a buscar?*\n\nPodés:\n1. 📎 Compartir tu *ubicación GPS* desde el clip de WhatsApp.\n2. ✍️ O escribir la calle y altura (ej: *Rivadavia 250*).\n3. 🎙️ O mandar un *mensaje de voz*.`
          );
        }

        // Si ya tiene un viaje activo en curso, mostrarle el estado directo
        const viajeActivo = await prisma.viaje.findFirst({
          where: {
            OR: [
              { clienteTelefono: cleanFrom },
              { clienteId: cliente?.id },
            ],
            estado: { in: ['PENDIENTE', 'ACEPTADO', 'EN_CAMINO', 'EN_CURSO'] },
          },
        });

        if (viajeActivo) {
          return await this.consultarEstadoViaje(cleanFrom, cliente?.id);
        }

        // Validar si la agencia está cerrada al saludar
        const estadoAgencia = checkAgenciaEstado(remiseria);
        if (!estadoAgencia.abierta) {
          const mensajeCerrado = `👋 ¡Hola, *${nombreMostrado}*!\n\n⛔ *En este momento nuestra central se encuentra cerrada.*\n\n📢 *Aviso:* ${estadoAgencia.mensaje}\n\n${estadoAgencia.reaperturaEstimada ? `🚗 *Apertura prevista:* ${estadoAgencia.reaperturaEstimada}\n\n` : ''}Podés consultar tus viajes agendados o comunicarte con nuestro operador de guardia.`;
          return await whatsappService.enviarBotones(cleanFrom, mensajeCerrado, [
            { id: 'BTN_OPERADOR', title: '📞 Operador Guardia' },
            { id: 'BTN_ESTADO', title: '📍 Mis Reservas' },
          ]);
        }

        // Saludo de bienvenida y menú principal interactivo
        const mensajeBienvenida = `👋 ¡Hola, *${nombreMostrado}*! Gracias por comunicarte con *Remises Bruno*.\n\n¿Cómo querés viajar hoy?`;
        return await whatsappService.enviarBotones(cleanFrom, mensajeBienvenida, [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
          { id: 'BTN_ESTADO', title: '📍 Estado / Ayuda' },
        ]);
      }

      case 'ESPERANDO_TIPO_RESERVA': {
        if (
          actionId === 'BTN_RESERVA_PERIODICA' ||
          textoLower.includes('periodic') ||
          textoLower.includes('periódic') ||
          textoLower.includes('repetir') ||
          textoLower.includes('semanal') ||
          textoLower.includes('todos los')
        ) {
          sesion.tipoReserva = 'PERIODICA';
          sesion.estado = 'ESPERANDO_DIAS_HORA_PERIODICA';
          return await whatsappService.enviarTexto(
            cleanFrom,
            `🔁 *Reserva Periódica*\n\nIndicá *qué días de la semana y a qué hora* necesitás el remís.\n\nPor ejemplo:\n• *Lunes a Viernes 07:30*\n• *Viernes, Sábado y Domingo 00:30*\n• *Martes y Jueves 14:00*\n\n_(Se generará automáticamente 15 minutos antes de cada horario)_`
          );
        }

        sesion.tipoReserva = 'UNICA';
        sesion.estado = 'ESPERANDO_FECHA_HORA_RESERVA';
        return await whatsappService.enviarTexto(
          cleanFrom,
          `📅 *¿Para qué día y hora necesitás el remís?*\n\nPodés escribir por ejemplo:\n• *'Hoy 23:30'*\n• *'Mañana 08:00'*\n• *'Lunes 07:30'*\n• *'25/11 14:00'*\n\n_(O podés mandarnos un audio diciendo el día y la hora)_`
        );
      }

      case 'ESPERANDO_DIAS_HORA_PERIODICA': {
        if (!texto || texto.trim().length < 3) {
          return await whatsappService.enviarTexto(
            cleanFrom,
            '⚠️ Por favor indicá los días y la hora (ej: *Lunes a Viernes 07:30* o *Viernes, Sábado y Domingo 00:30*).'
          );
        }

        const parsedPer = parsearDiasYHoraPeriodica(texto);
        if ('error' in parsedPer) {
          return await whatsappService.enviarTexto(cleanFrom, parsedPer.error);
        }

        sesion.tipoReserva = 'PERIODICA';
        sesion.diasSemanaReserva = parsedPer.diasNumeros;
        sesion.diasSemanaTexto = parsedPer.diasTexto;
        sesion.fechaHoraReserva = parsedPer.fechaInicio;
        sesion.fechaHoraTexto = parsedPer.resumenTexto;
        sesion.horaInicioStr = parsedPer.horaStr;
        sesion.estado = 'ESPERANDO_ORIGEN';

        return await whatsappService.enviarTexto(
          cleanFrom,
          `🔁 *Reserva periódica configurada:*\n${parsedPer.resumenTexto}\n\n📍 *¿Dónde te pasamos a buscar?*\nPodés:\n1. 📎 Compartir tu *ubicación GPS* desde el clip de WhatsApp.\n2. ✍️ O escribir la dirección (ej: *Rivadavia 250*).\n3. 🎙️ O mandar un *audio*.`
        );
      }

      case 'ESPERANDO_FECHA_HORA_RESERVA': {
        if (!texto || texto.trim().length < 2) {
          return await whatsappService.enviarTexto(
            cleanFrom,
            '⚠️ Por favor indicá el día y la hora de tu reserva (ej: *Mañana 08:30*, *Hoy 23:00*, *Lunes 07:15*).'
          );
        }

        const parseResult = parsearFechaHoraReserva(texto);
        if ('error' in parseResult) {
          return await whatsappService.enviarTexto(cleanFrom, parseResult.error);
        }

        // Validar si la agencia está cerrada en la fecha y hora seleccionada para la reserva
        const estadoAgenciaReserva = checkAgenciaEstado(remiseria, parseResult.fecha);
        if (!estadoAgenciaReserva.abierta) {
          return await whatsappService.enviarTexto(
            cleanFrom,
            `⚠️ En el horario elegido nuestra central permanecerá cerrada.\n\n📢 *Motivo:* ${estadoAgenciaReserva.mensaje}\n\nPor favor escribí otra fecha u horario para tu reserva (ej: *Mañana 08:30*, *Lunes 09:00*):`
          );
        }

        sesion.fechaHoraReserva = parseResult.fecha;
        sesion.fechaHoraTexto = parseResult.fechaTexto;
        sesion.horaInicioStr = parseResult.horaStr;
        sesion.estado = 'ESPERANDO_ORIGEN';

        return await whatsappService.enviarTexto(
          cleanFrom,
          `🗓️ *Reserva para:* ${parseResult.fechaTexto}\n\n📍 *¿Dónde te pasamos a buscar?*\nPodés:\n1. 📎 Compartir tu *ubicación GPS* desde el clip de WhatsApp.\n2. ✍️ O escribir la dirección (ej: *Rivadavia 250*).\n3. 🎙️ O mandar un *audio*.`
        );
      }

      case 'ESPERANDO_ORIGEN': {
        if (tipo === 'location' && location) {
          sesion.origenLat = location.latitude;
          sesion.origenLon = location.longitude;
          sesion.origen = location.address || location.name || `Ubicación GPS (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`;
        } else if (texto && texto.trim().length >= 3) {
          // Limpiar frases introductorias ("estoy en...", "salgo de...") y validar dirección
          const direccionLimpia = transcriptionService.extraerDireccion(texto.trim());
          const geoO = await geocodificarDireccion(direccionLimpia);
          if (!geoO) {
            return await whatsappService.enviarTexto(
              cleanFrom,
              `⚠️ No pudimos encontrar la dirección *"${direccionLimpia}"* en el mapa de Chivilcoy.\n\nPor favor verificá:\n• Que el nombre de la calle y la altura estén bien escritos (ej: *Rivadavia 250*).\n• Si es una esquina, asegurate de que ambas calles se crucen (ej: *Sarmiento y Belgrano*).\n• O compartinos tu *ubicación GPS* directa desde el clip 📎 de WhatsApp.`
            );
          }
          sesion.origen = geoO.nombreOficial || direccionLimpia;
          sesion.origenLat = geoO.lat;
          sesion.origenLon = geoO.lon;
        } else {
          return await whatsappService.enviarTexto(
            cleanFrom,
            '⚠️ Por favor enviá una dirección válida, compartí tu ubicación GPS o mandanos un audio.'
          );
        }

        sesion.estado = 'ESPERANDO_DESTINO';
        return await whatsappService.enviarTexto(
          cleanFrom,
          `✅ *Origen:* ${sesion.origen}\n\n🏁 *¿Hacia dónde te llevamos?*\nEscribí la dirección de destino o mandá un audio (ej: *Av. Sarmiento 500*, *Hospital Municipal*):`
        );
      }

      case 'CONFIRMANDO_AUDIO_ORIGEN': {
        const esAfirmativo =
          actionId === 'BTN_CONFIRMAR_AUDIO_ORIGEN' ||
          textoLower === 'si' ||
          textoLower === 'sí' ||
          textoLower.includes('correcto') ||
          textoLower.includes('correcta');

        const esNegativo =
          actionId === 'BTN_REINTENTAR_AUDIO_ORIGEN' ||
          textoLower === 'no' ||
          textoLower.includes('corregir') ||
          textoLower.includes('cambiar');

        if (esAfirmativo) {
          const dirO = transcriptionService.extraerDireccion(sesion.audioDireccionPendiente || 'Origen confirmado por audio');
          const geoO = await geocodificarDireccion(dirO);
          if (!geoO) {
            sesion.estado = 'ESPERANDO_ORIGEN';
            return await whatsappService.enviarTexto(
              cleanFrom,
              `⚠️ No pudimos encontrar la dirección *"${dirO}"* en el mapa de Chivilcoy.\n\nPor favor verificá:\n• Que el nombre de la calle y la altura estén bien escritos (ej: *Rivadavia 250*).\n• Si es una esquina, asegurate de que ambas calles se crucen.\n• O compartinos tu *ubicación GPS* directa desde el clip 📎 de WhatsApp.`
            );
          }
          sesion.origen = geoO.nombreOficial || dirO;
          sesion.origenLat = geoO.lat;
          sesion.origenLon = geoO.lon;
          sesion.estado = 'ESPERANDO_DESTINO';
          return await whatsappService.enviarTexto(
            cleanFrom,
            `✅ *Origen confirmado:* ${sesion.origen}\n\n🏁 *¿Hacia dónde te llevamos?*\nEscribí la dirección de destino o mandá un audio:`
          );
        } else if (esNegativo) {
          sesion.estado = 'ESPERANDO_ORIGEN';
          return await whatsappService.enviarTexto(
            cleanFrom,
            '✍️ Por favor escribí la calle y altura por texto (ej: *Rivadavia 250*) o compartinos tu ubicación GPS 📎:'
          );
        } else if (texto && texto.trim().length >= 3) {
          // El usuario escribió directamente la corrección
          const geoO = await geocodificarDireccion(texto.trim());
          if (!geoO) {
            return await whatsappService.enviarTexto(
              cleanFrom,
              `⚠️ No pudimos encontrar la dirección *"${texto.trim()}"* en el mapa de Chivilcoy.\n\nPor favor verificá el nombre de la calle y altura (ej: *Rivadavia 250*) o compartinos tu ubicación GPS 📎:`
            );
          }
          sesion.origen = geoO.nombreOficial || texto.trim();
          sesion.origenLat = geoO.lat;
          sesion.origenLon = geoO.lon;
          sesion.estado = 'ESPERANDO_DESTINO';
          return await whatsappService.enviarTexto(
            cleanFrom,
            `✅ *Origen:* ${sesion.origen}\n\n🏁 *¿Hacia dónde te llevamos?*\nEscribí la dirección de destino o mandá un audio:`
          );
        } else {
          return await whatsappService.enviarBotones(
            cleanFrom,
            `Entendimos que tu origen es: *${sesion.audioDireccionPendiente}*\n\n¿Es correcto?`,
            [
              { id: 'BTN_CONFIRMAR_AUDIO_ORIGEN', title: '✅ Sí, es correcta' },
              { id: 'BTN_REINTENTAR_AUDIO_ORIGEN', title: '✍️ No, escribirla' },
            ]
          );
        }
      }

      case 'ESPERANDO_DESTINO': {
        if (tipo === 'location' && location) {
          sesion.destinoLat = location.latitude;
          sesion.destinoLon = location.longitude;
          sesion.destino = location.address || location.name || `Destino GPS (${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)})`;
        } else if (texto && texto.trim().length >= 3) {
          // Limpiar frases como "voy hasta...", "llevame a..." y validar en el mapa
          const direccionLimpia = transcriptionService.extraerDireccion(texto.trim());
          const geoD = await geocodificarDireccion(direccionLimpia);
          if (!geoD) {
            return await whatsappService.enviarTexto(
              cleanFrom,
              `⚠️ No pudimos encontrar el destino *"${direccionLimpia}"* en el mapa de Chivilcoy.\n\nPor favor verificá el nombre de la calle (ej: *Av. Sarmiento 500*), punto de referencia (ej: *Hospital*, *Terminal*) o compartí tu ubicación GPS 📎:`
            );
          }
          sesion.destino = geoD.nombreOficial || direccionLimpia;
          sesion.destinoLat = geoD.lat;
          sesion.destinoLon = geoD.lon;
        } else {
          return await whatsappService.enviarTexto(
            cleanFrom,
            '⚠️ Por favor escribí la dirección hacia dónde te llevamos o mandanos un audio.'
          );
        }

        // Si el origen no tenía coordenadas, intentar nuevamente
        if ((!sesion.origenLat || !sesion.origenLon) && sesion.origen) {
          const geoO = await geocodificarDireccion(sesion.origen);
          if (geoO) {
            sesion.origenLat = geoO.lat;
            sesion.origenLon = geoO.lon;
            if (geoO.nombreOficial) {
              sesion.origen = geoO.nombreOficial;
            }
          }
        }

        // Calcular distancia real (vía OSRM o Haversine)
        let dist = 2.5;
        if (sesion.origenLat && sesion.origenLon && sesion.destinoLat && sesion.destinoLon) {
          dist = await calcularDistanciaReal(
            sesion.origenLat,
            sesion.origenLon,
            sesion.destinoLat,
            sesion.destinoLon
          );
          if (dist < 0.5) dist = 0.8;
        }

        // Ajuste por origen fuera del radio urbano de la base (ej. Alberti -> Alberti)
        const ajusteRemoto = await calcularAjusteOrigenRemoto({
          distanciaViajeKm: dist,
          latOrigen: sesion.origenLat,
          lonOrigen: sesion.origenLon,
          latDestino: sesion.destinoLat,
          lonDestino: sesion.destinoLon,
          baseLat: remiseria?.latitud,
          baseLon: remiseria?.longitud,
        });
        const distFacturable = ajusteRemoto.distanciaFacturableKm;

        // Cálculo de precio según tarifario vigente de la remisería
        const kmAdicionales = Math.max(0, distFacturable - 1);
        const precioGpsPuro = bajadaBandera + kmAdicionales * valorKm;
        const precioEstimado = Math.round(precioGpsPuro / 100) * 100;

        sesion.distanciaKm = distFacturable;
        sesion.precioEstimado = precioEstimado;
        sesion.estado = 'CONFIRMANDO_COTIZACION';

        const notaOrigenRemoto = ajusteRemoto.esOrigenRemoto
          ? `🚗 _Incluye traslado del móvil desde base (Chivilcoy)_\n`
          : '';

        if (sesion.esReserva && sesion.fechaHoraTexto) {
          const resumenReserva =
            `📋 *Resumen de tu Reserva Programada:*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `🗓️ *Fecha y Hora:* *${sesion.fechaHoraTexto}*\n` +
            `🟢 *Origen:* ${sesion.origen}\n` +
            `🔴 *Destino:* ${sesion.destino}\n` +
            `📏 *Distancia:* ~${dist} km\n` +
            notaOrigenRemoto +
            `💵 *Precio estimado:* *$${precioEstimado.toLocaleString('es-AR')}* _(Efectivo)_\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `¿Confirmás la reserva?`;

          return await whatsappService.enviarBotones(
            cleanFrom,
            resumenReserva,
            [
              { id: 'BTN_CONFIRMAR_RESERVA', title: '✅ Confirmar Reserva' },
              { id: 'BTN_CANCELAR', title: '❌ Cancelar' },
            ],
            'Reserva de Viaje'
          );
        } else {
          const resumen =
            `📋 *Resumen de tu viaje:*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `🟢 *Origen:* ${sesion.origen}\n` +
            `🔴 *Destino:* ${sesion.destino}\n` +
            `📏 *Distancia:* ~${dist} km\n` +
            notaOrigenRemoto +
            `💵 *Precio estimado:* *$${precioEstimado.toLocaleString('es-AR')}* _(Efectivo)_\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `¿Deseas solicitar el móvil ahora?`;

          return await whatsappService.enviarBotones(
            cleanFrom,
            resumen,
            [
              { id: 'BTN_CONFIRMAR', title: '✅ Confirmar Pedido' },
              { id: 'BTN_CANCELAR', title: '❌ Cancelar' },
            ],
            'Cotización de Viaje'
          );
        }
      }

      case 'CONFIRMANDO_AUDIO_DESTINO': {
        const esAfirmativo =
          actionId === 'BTN_CONFIRMAR_AUDIO_DESTINO' ||
          textoLower === 'si' ||
          textoLower === 'sí' ||
          textoLower.includes('correcto') ||
          textoLower.includes('correcta');

        const esNegativo =
          actionId === 'BTN_REINTENTAR_AUDIO_DESTINO' ||
          textoLower === 'no' ||
          textoLower.includes('corregir') ||
          textoLower.includes('cambiar');

        if (esAfirmativo) {
          const dirD = transcriptionService.extraerDireccion(sesion.audioDireccionPendiente || 'Destino confirmado por audio');
          const geoD = await geocodificarDireccion(dirD);
          if (!geoD) {
            sesion.estado = 'ESPERANDO_DESTINO';
            return await whatsappService.enviarTexto(
              cleanFrom,
              `⚠️ No pudimos encontrar el destino *"${dirD}"* en el mapa de Chivilcoy.\n\nPor favor escribí la calle y altura (ej: *Av. Sarmiento 500*), punto de referencia o mandá un nuevo audio:`
            );
          }
          sesion.destino = geoD.nombreOficial || dirD;
          sesion.destinoLat = geoD.lat;
          sesion.destinoLon = geoD.lon;

          if ((!sesion.origenLat || !sesion.origenLon) && sesion.origen) {
            const geoO = await geocodificarDireccion(sesion.origen);
            if (geoO) {
              sesion.origenLat = geoO.lat;
              sesion.origenLon = geoO.lon;
              if (geoO.nombreOficial) {
                sesion.origen = geoO.nombreOficial;
              }
            }
          }

          let dist = 2.5;
          if (sesion.origenLat && sesion.origenLon && sesion.destinoLat && sesion.destinoLon) {
            dist = await calcularDistanciaReal(
              sesion.origenLat,
              sesion.origenLon,
              sesion.destinoLat,
              sesion.destinoLon
            );
            if (dist < 0.5) dist = 0.8;
          }

          const ajusteRemoto2 = await calcularAjusteOrigenRemoto({
            distanciaViajeKm: dist,
            latOrigen: sesion.origenLat,
            lonOrigen: sesion.origenLon,
            latDestino: sesion.destinoLat,
            lonDestino: sesion.destinoLon,
            baseLat: remiseria?.latitud,
            baseLon: remiseria?.longitud,
          });
          const distFacturable2 = ajusteRemoto2.distanciaFacturableKm;

          const kmAdicionales = Math.max(0, distFacturable2 - 1);
          const precioGpsPuro = bajadaBandera + kmAdicionales * valorKm;
          const precioEstimado = Math.round(precioGpsPuro / 100) * 100;

          sesion.distanciaKm = distFacturable2;
          sesion.precioEstimado = precioEstimado;
          sesion.estado = 'CONFIRMANDO_COTIZACION';

          const notaOrigenRemoto2 = ajusteRemoto2.esOrigenRemoto
            ? `🚗 _Incluye traslado del móvil desde base (Chivilcoy)_\n`
            : '';

          if (sesion.esReserva && sesion.fechaHoraTexto) {
            const resumenReserva =
              `📋 *Resumen de tu Reserva Programada:*\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `🗓️ *Fecha y Hora:* *${sesion.fechaHoraTexto}*\n` +
              `🟢 *Origen:* ${sesion.origen}\n` +
              `🔴 *Destino:* ${sesion.destino}\n` +
              `📏 *Distancia:* ~${dist} km\n` +
              notaOrigenRemoto2 +
              `💵 *Precio estimado:* *$${precioEstimado.toLocaleString('es-AR')}* _(Efectivo)_\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `¿Confirmás la reserva?`;

            return await whatsappService.enviarBotones(
              cleanFrom,
              resumenReserva,
              [
                { id: 'BTN_CONFIRMAR_RESERVA', title: '✅ Confirmar Reserva' },
                { id: 'BTN_CANCELAR', title: '❌ Cancelar' },
              ],
              'Reserva de Viaje'
            );
          } else {
            const resumen =
              `📋 *Resumen de tu viaje:*\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `🟢 *Origen:* ${sesion.origen}\n` +
              `🔴 *Destino:* ${sesion.destino}\n` +
              `📏 *Distancia:* ~${dist} km\n` +
              notaOrigenRemoto2 +
              `💵 *Precio estimado:* *$${precioEstimado.toLocaleString('es-AR')}* _(Efectivo)_\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `¿Deseas solicitar el móvil ahora?`;

            return await whatsappService.enviarBotones(
              cleanFrom,
              resumen,
              [
                { id: 'BTN_CONFIRMAR', title: '✅ Confirmar Pedido' },
                { id: 'BTN_CANCELAR', title: '❌ Cancelar' },
              ],
              'Cotización de Viaje'
            );
          }
        } else if (esNegativo) {
          sesion.estado = 'ESPERANDO_DESTINO';
          return await whatsappService.enviarTexto(
            cleanFrom,
            '✍️ Por favor escribí el destino por texto (ej: *Av. Sarmiento 500* o *Hospital Municipal*):'
          );
        } else if (texto && texto.trim().length >= 3) {
          // El usuario escribió directamente la corrección del destino
          const geoD = await geocodificarDireccion(texto.trim());
          if (!geoD) {
            return await whatsappService.enviarTexto(
              cleanFrom,
              `⚠️ No pudimos encontrar el destino *"${texto.trim()}"* en el mapa de Chivilcoy.\n\nPor favor verificá la dirección (ej: *Av. Sarmiento 500* o *Hospital Municipal*):`
            );
          }
          sesion.destino = geoD.nombreOficial || texto.trim();
          sesion.destinoLat = geoD.lat;
          sesion.destinoLon = geoD.lon;

          let dist = 2.5;
          if (sesion.origenLat && sesion.origenLon && sesion.destinoLat && sesion.destinoLon) {
            dist = await calcularDistanciaReal(
              sesion.origenLat,
              sesion.origenLon,
              sesion.destinoLat,
              sesion.destinoLon
            );
            if (dist < 0.5) dist = 0.8;
          }

          const ajusteRemoto3 = await calcularAjusteOrigenRemoto({
            distanciaViajeKm: dist,
            latOrigen: sesion.origenLat,
            lonOrigen: sesion.origenLon,
            latDestino: sesion.destinoLat,
            lonDestino: sesion.destinoLon,
            baseLat: remiseria?.latitud,
            baseLon: remiseria?.longitud,
          });
          const distFacturable3 = ajusteRemoto3.distanciaFacturableKm;

          const kmAdicionales = Math.max(0, distFacturable3 - 1);
          const precioGpsPuro = bajadaBandera + kmAdicionales * valorKm;
          const precioEstimado = Math.round(precioGpsPuro / 100) * 100;

          sesion.distanciaKm = distFacturable3;
          sesion.precioEstimado = precioEstimado;
          sesion.estado = 'CONFIRMANDO_COTIZACION';

          const notaOrigenRemoto3 = ajusteRemoto3.esOrigenRemoto
            ? `🚗 _Incluye traslado del móvil desde base (Chivilcoy)_\n`
            : '';

          if (sesion.esReserva && sesion.fechaHoraTexto) {
            const resumenReserva =
              `📋 *Resumen de tu Reserva Programada:*\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `🗓️ *Fecha y Hora:* *${sesion.fechaHoraTexto}*\n` +
              `🟢 *Origen:* ${sesion.origen}\n` +
              `🔴 *Destino:* ${sesion.destino}\n` +
              `📏 *Distancia:* ~${dist} km\n` +
              notaOrigenRemoto3 +
              `💵 *Precio estimado:* *$${precioEstimado.toLocaleString('es-AR')}* _(Efectivo)_\n` +
              `━━━━━━━━━━━━━━━━━━━\n` +
              `¿Confirmás la reserva?`;

            return await whatsappService.enviarBotones(
              cleanFrom,
              resumenReserva,
              [
                { id: 'BTN_CONFIRMAR_RESERVA', title: '✅ Confirmar Reserva' },
                { id: 'BTN_CANCELAR', title: '❌ Cancelar' },
              ],
              'Reserva de Viaje'
            );
          }

          const resumen =
            `📋 *Resumen de tu viaje:*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `🟢 *Origen:* ${sesion.origen}\n` +
            `🔴 *Destino:* ${sesion.destino}\n` +
            `📏 *Distancia:* ~${dist} km\n` +
            notaOrigenRemoto3 +
            `💵 *Precio estimado:* *$${precioEstimado.toLocaleString('es-AR')}* _(Efectivo)_\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `¿Deseas solicitar el móvil ahora?`;

          return await whatsappService.enviarBotones(
            cleanFrom,
            resumen,
            [
              { id: 'BTN_CONFIRMAR', title: '✅ Confirmar Pedido' },
              { id: 'BTN_CANCELAR', title: '❌ Cancelar' },
            ],
            'Cotización de Viaje'
          );
        } else {
          return await whatsappService.enviarBotones(
            cleanFrom,
            `Entendimos que tu destino es: *${sesion.audioDireccionPendiente}*\n\n¿Es correcto?`,
            [
              { id: 'BTN_CONFIRMAR_AUDIO_DESTINO', title: '✅ Sí, es correcto' },
              { id: 'BTN_REINTENTAR_AUDIO_DESTINO', title: '✍️ No, escribirlo' },
            ]
          );
        }
      }

      case 'CONFIRMANDO_COTIZACION': {
        const esAfirmativo =
          actionId === 'BTN_CONFIRMAR' ||
          actionId === 'BTN_CONFIRMAR_RESERVA' ||
          textoLower.includes('si') ||
          textoLower.includes('sí') ||
          textoLower.includes('confirmar') ||
          textoLower.includes('confirmo');

        if (esAfirmativo) {
          if (sesion.esReserva) {
            return await this.crearReservaDesdeWhatsApp(cleanFrom, sesion, cliente, remiseriaId);
          } else {
            return await this.crearViajeDesdeWhatsApp(cleanFrom, sesion, cliente, remiseriaId);
          }
        } else {
          const botonConfirmarId = sesion.esReserva ? 'BTN_CONFIRMAR_RESERVA' : 'BTN_CONFIRMAR';
          return await whatsappService.enviarBotones(
            cleanFrom,
            '¿Querés confirmar el servicio o cancelarlo?',
            [
              { id: botonConfirmarId, title: '✅ Confirmar' },
              { id: 'BTN_CANCELAR', title: '❌ Cancelar' },
            ]
          );
        }
      }

      case 'CONFIRMANDO_CANCELACION_VIAJE': {
        const targetId = sesion.viajeCancelarId;
        const confirma =
          textoLower === 'si' ||
          textoLower === 'sí' ||
          textoLower.includes('cancelar') ||
          textoLower.includes('confirmo') ||
          textoLower.includes('seguro');
        const rechaza =
          textoLower === 'no' ||
          textoLower.includes('mantener') ||
          textoLower.includes('seguir') ||
          textoLower.includes('volver');

        if (confirma) {
          return await this.ejecutarCancelacionViajeWhatsApp(cleanFrom, cliente?.id, targetId);
        }
        if (rechaza) {
          resetSesion(cleanFrom);
          const cod = targetId ? `#${targetId.slice(-4).toUpperCase()}` : '';
          return await whatsappService.enviarBotones(
            cleanFrom,
            `👍 *¡Perfecto!* Tu pedido *${cod}* continúa activo en nuestra central.`,
            [
              { id: 'BTN_ESTADO', title: '📍 Estado del viaje' },
              { id: targetId ? `BTN_CANCELAR_VIAJE_${targetId}` : 'BTN_CANCELAR_VIAJE', title: '❌ Cancelar Pedido' },
              { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
            ]
          );
        }
        return await whatsappService.enviarBotones(
          cleanFrom,
          '¿Confirmás que querés cancelar tu pedido?',
          [
            { id: `BTN_SI_CANCELAR_VIAJE_${targetId || ''}`, title: '✅ Sí, cancelar' },
            { id: `BTN_NO_CANCELAR_VIAJE_${targetId || ''}`, title: '🔙 No, mantener' },
          ]
        );
      }

      case 'CONFIRMANDO_CANCELACION_RESERVA': {
        const targetResId = sesion.reservaCancelarId;
        const confirma =
          textoLower === 'si' ||
          textoLower === 'sí' ||
          textoLower.includes('cancelar') ||
          textoLower.includes('confirmo') ||
          textoLower.includes('seguro');
        const rechaza =
          textoLower === 'no' ||
          textoLower.includes('mantener') ||
          textoLower.includes('seguir') ||
          textoLower.includes('volver');

        if (confirma) {
          return await this.ejecutarCancelacionReservaWhatsApp(cleanFrom, cliente?.id, targetResId);
        }
        if (rechaza) {
          resetSesion(cleanFrom);
          return await whatsappService.enviarBotones(
            cleanFrom,
            `👍 *¡Perfecto!* Tu reserva programada continúa activa en nuestra central.`,
            [
              { id: 'BTN_ESTADO', title: '📍 Mis Reservas' },
              { id: targetResId ? `BTN_CANCELAR_RESERVA_${targetResId}` : 'BTN_CANCELAR_RESERVA', title: '❌ Cancelar Reserva' },
              { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
            ]
          );
        }
        return await whatsappService.enviarBotones(
          cleanFrom,
          '¿Confirmás que querés cancelar tu reserva programada?',
          [
            { id: `BTN_SI_CANCELAR_RESERVA_${targetResId || ''}`, title: '✅ Sí, cancelar' },
            { id: `BTN_NO_CANCELAR_RESERVA_${targetResId || ''}`, title: '🔙 No, mantener' },
          ]
        );
      }
    }
  },

  /**
   * Crea una Reserva programada en la base de datos de Remises Bruno
   */
  async crearReservaDesdeWhatsApp(
    cleanFrom: string,
    sesion: SesionClienteWhatsApp,
    clienteExistente: any,
    remiseriaId: string
  ) {
    try {
      const fechaInicio = sesion.fechaHoraReserva || new Date();
      const horaInicio = sesion.horaInicioStr || '08:00';
      const fechaTexto = sesion.fechaHoraTexto || 'Fecha programada';

      // Validar si la agencia está cerrada en la fecha y hora seleccionada
      const remiseriaData = await prisma.remiseria.findUnique({
        where: { id: remiseriaId },
        select: { agenciaAbierta: true, mensajeCierre: true, cierreAutomaticoFiestas: true }
      });
      const estadoAgenciaReserva = checkAgenciaEstado(remiseriaData, fechaInicio);
      if (!estadoAgenciaReserva.abierta) {
        resetSesion(cleanFrom);
        return await whatsappService.enviarTexto(
          cleanFrom,
          `⛔ *NO FUE POSIBLE AGENDAR LA RESERVA*\n\nNuestra central permanecerá cerrada en la fecha y hora solicitada (${fechaTexto}).\n\n📢 *Motivo:* ${estadoAgenciaReserva.mensaje}\n\n${estadoAgenciaReserva.reaperturaEstimada ? `🚗 *Apertura prevista:* ${estadoAgenciaReserva.reaperturaEstimada}\n\n` : ''}Por favor escribinos para coordinar otro horario.`
        );
      }

      const trackingToken = crypto.randomBytes(16).toString('hex');
      const codigoPin = Math.floor(1000 + Math.random() * 9000).toString();
      const origen = sesion.origen || 'Origen solicitado por WhatsApp';
      const destino = sesion.destino || 'Destino a convenir';
      const precio = sesion.precioEstimado || 3500;
      const clienteNombre = sesion.nombre || 'Pasajero WhatsApp';

      const origenDetallado =
        sesion.origenLat && sesion.origenLon
          ? `${sesion.origenLat},${sesion.origenLon}`
          : undefined;
      const destinoDetallado =
        sesion.destinoLat && sesion.destinoLon
          ? `${sesion.destinoLat},${sesion.destinoLon}`
          : undefined;

      const esPeriodica = sesion.tipoReserva === 'PERIODICA';
      const diasSemanaJson =
        esPeriodica && sesion.diasSemanaReserva && sesion.diasSemanaReserva.length > 0
          ? JSON.stringify(sesion.diasSemanaReserva)
          : null;

      // 1. Guardar en la tabla Reserva (para que aparezca en el tab Reservados de la Central
      //    y el servicio automático dispare cada viaje 15 minutos antes del horario pactado)
      const reserva = await prisma.reserva.create({
        data: {
          clienteNombre,
          clienteTelefono: cleanFrom,
          clienteEmail: clienteExistente?.email || null,
          origen,
          destino,
          fechaInicio,
          horaInicio,
          tipo: esPeriodica ? 'PERIODICA' : 'UNICA',
          diasSemana: diasSemanaJson,
          estado: 'ACTIVA',
          observaciones: `Reserva ${esPeriodica ? 'periódica ' : ''}programada por WhatsApp Bot (${fechaTexto}). Est: $${precio.toLocaleString('es-AR')}`,
          remiseriaId,
          clienteId: clienteExistente?.id || null,
        },
      });

      // Resetear estado de la sesión
      resetSesion(cleanFrom);

      // 2. Notificar en tiempo real por WebSocket a la central del Coordinador
      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        io.to(remiseriaId).emit('nueva_reserva_recibida', reserva);
      } catch (sErr) {
        console.warn('Socket aviso WhatsApp nueva reserva:', sErr);
      }

      // 3. Confirmar al pasajero por WhatsApp (con saludo de cumpleaños si corresponde)
      let prefijoCumpleReserva = '';
      if (esCumpleaniosCliente(clienteExistente)) {
        const claveCumple = obtenerClaveCumpleHoy(cleanFrom);
        if (!cumpleSaludadosMap.has(claveCumple)) {
          cumpleSaludadosMap.add(claveCumple);
          const nomCumple = (clienteExistente?.nombre || clienteNombre).trim();
          prefijoCumpleReserva =
            `🎂🎉 *¡MUY FELIZ CUMPLEAÑOS, ${nomCumple.toUpperCase()}!* 🎉🎂\n` +
            `De parte de todo el equipo de *Remises Bruno*, te deseamos que pases un día espectacular. ¡Gracias por elegirnos en tu día! 🥂✨\n` +
            `━━━━━━━━━━━━━━━━━━━\n\n`;
        }
      }

      const confirmacionTexto =
        prefijoCumpleReserva +
        `📅 *¡Reserva ${esPeriodica ? 'periódica ' : ''}agendada con éxito!*\n\n` +
        `Tu ${esPeriodica ? 'programación semanal' : 'viaje'} quedó registrado en nuestra central:\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `🗓️ *${esPeriodica ? 'Días y Hora' : 'Fecha y Hora'}:* *${fechaTexto}*\n` +
        `🟢 *Origen:* ${origen}\n` +
        `🔴 *Destino:* ${destino}\n` +
        `📏 *Distancia:* ~${sesion.distanciaKm || 2.5} km\n` +
        `💵 *Precio estimado:* *$${precio.toLocaleString('es-AR')}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n\n` +
        `Nuestro sistema generará tu pedido automáticamente *15 minutos antes* de cada horario y te avisaremos por WhatsApp en cuanto el chofer salga a buscarte.\n\n` +
        `📲 _Descargá nuestra App en_ *${APP_CLIENTES_URL}* _para seguir tus viajes y pedir remís aunque algún día se caiga WhatsApp._`;

      await whatsappService.enviarBotones(cleanFrom, confirmacionTexto, [
        { id: 'BTN_ESTADO', title: '📍 Mis Reservas' },
        { id: `BTN_CANCELAR_RESERVA_${reserva.id}`, title: '❌ Cancelar Reserva' },
        { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
      ]);

      return { success: true, reservaId: reserva.id };
    } catch (err: any) {
      console.error('Error creando reserva desde WhatsApp:', err);
      resetSesion(cleanFrom);
      return await whatsappService.enviarTexto(
        cleanFrom,
        'Tuvimos un inconveniente al agendar tu reserva. Por favor comunicate con nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
      );
    }
  },

  /**
   * Crea el Viaje inmediato en la base de datos de Remises Bruno y lo dispara a Central y Choferes
   */
  async crearViajeDesdeWhatsApp(
    cleanFrom: string,
    sesion: SesionClienteWhatsApp,
    clienteExistente: any,
    remiseriaId: string
  ) {
    try {
      // Validar si la agencia está cerrada al momento del pedido
      const remiseriaData = await prisma.remiseria.findUnique({
        where: { id: remiseriaId },
        select: { agenciaAbierta: true, mensajeCierre: true, cierreAutomaticoFiestas: true }
      });
      const estadoAgencia = checkAgenciaEstado(remiseriaData);
      if (!estadoAgencia.abierta) {
        resetSesion(cleanFrom);
        const msgCerrado = `⛔ *AGENCIA CERRADA*\n\nNuestra central se encuentra momentáneamente cerrada.\n\n📢 *Aviso:* ${estadoAgencia.mensaje}\n\n${estadoAgencia.reaperturaEstimada ? `🚗 *Apertura prevista:* ${estadoAgencia.reaperturaEstimada}\n\n` : ''}Disculpá las molestias ocasionadas.`;
        return await whatsappService.enviarBotones(cleanFrom, msgCerrado, [
          { id: 'BTN_OPERADOR', title: '📞 Operador Guardia' },
          { id: 'BTN_ESTADO', title: '📍 Mis Reservas' },
        ]);
      }

      const trackingToken = crypto.randomBytes(16).toString('hex');
      const codigoPin = Math.floor(1000 + Math.random() * 9000).toString();
      const origen = sesion.origen || 'Origen solicitado por WhatsApp';
      const destino = sesion.destino || 'Destino a convenir';
      const precio = sesion.precioEstimado || 3500;
      const clienteNombre = sesion.nombre || 'Pasajero WhatsApp';

      const origenDetallado =
        sesion.origenLat && sesion.origenLon
          ? `${sesion.origenLat},${sesion.origenLon}`
          : undefined;
      const destinoDetallado =
        sesion.destinoLat && sesion.destinoLon
          ? `${sesion.destinoLat},${sesion.destinoLon}`
          : undefined;

      const viaje = await prisma.viaje.create({
        data: {
          origen,
          destino,
          precio,
          fecha: new Date(),
          estado: 'PENDIENTE',
          observaciones: 'Pedido generado automáticamente por WhatsApp Bot',
          clienteId: clienteExistente?.id || null,
          clienteNombre,
          clienteTelefono: cleanFrom,
          remiseriaId,
          origenDetallado,
          destinoDetallado,
          trackingToken,
          codigoPin,
          metodoPago: 'EFECTIVO',
        },
        include: {
          cliente: true,
          chofer: true,
          vehiculo: true,
          remiseria: true,
        },
      });

      // Resetear estado de la sesión
      resetSesion(cleanFrom);

      // 1. Notificar en tiempo real por WebSocket a la central del Coordinador
      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        io.to(remiseriaId).emit('nuevo_viaje_recibido', viaje);
      } catch (sErr) {
        console.warn('Socket aviso WhatsApp nuevo viaje:', sErr);
      }

      // 2. Disparar notificación Push a los choferes conectados de la remisería
      try {
        pushNotificationService.enviarAChoferesDeRemiseria(remiseriaId, {
          title: '🚕 ¡Nuevo viaje por WhatsApp!',
          body: `${origen} ➔ ${destino} ($${precio.toLocaleString('es-AR')})`,
          url: '/chofer/app',
          tag: `whatsapp-viaje-${viaje.id}`,
          data: { viajeId: viaje.id },
        }).catch(() => {});
      } catch {}

      // 3. Confirmar al pasajero por WhatsApp (con saludo especial si hoy es su cumpleaños)
      let prefijoCumple = '';
      if (esCumpleaniosCliente(clienteExistente)) {
        const claveCumple = obtenerClaveCumpleHoy(cleanFrom);
        cumpleSaludadosMap.add(claveCumple);
        const nomCumple = (clienteExistente?.nombre || clienteNombre).trim();
        prefijoCumple =
          `🎂🎉 *¡MUY FELIZ CUMPLEAÑOS, ${nomCumple.toUpperCase()}!* 🎉🎂\n` +
          `De parte de todo el equipo de *Remises Bruno*, te deseamos un día espectacular lleno de alegría. ¡Gracias por dejarnos acompañarte en tu cumpleaños! 🥂✨\n` +
          `━━━━━━━━━━━━━━━━━━━\n\n`;
      }

      // Verificar si el pasajero tiene deuda pendiente de viaje mínimo anterior
      let avisoDeudaPendiente = '';
      try {
        const { obtenerDeudasPendientesPasajero } = await import('./deudaCancelacionService');
        const deudas = await obtenerDeudasPendientesPasajero({
          remiseriaId,
          clienteId: clienteExistente?.id || null,
          clienteTelefono: cleanFrom,
        });
        if (deudas.length > 0) {
          const totalDeuda = deudas.reduce((acc: number, d: any) => acc + Number(d.monto || 0), 0);
          const detalleChoferes = deudas
            .map((d: any) => `Móvil #${d.choferAcreedor.numeroChofer} (${d.choferAcreedor.nombre})`)
            .join(', ');
          avisoDeudaPendiente =
            `\n⚠️ *Saldo pendiente anterior:* *$${totalDeuda.toLocaleString('es-AR')}* (viaje mínimo correspondiente a ${detalleChoferes}). El chofer te lo cobrará junto con este viaje.\n`;
        }
      } catch {}

      const confirmacionTexto =
        prefijoCumple +
        `🚕 *¡Pedido confirmado!*\n\n` +
        `Tu solicitud ya ingresó a nuestra central con el viaje *#${viaje.id.slice(-4).toUpperCase()}*.\n` +
        `🔒 *PIN de inicio de viaje:* *${codigoPin}*${avisoDeudaPendiente}\n\n` +
        `Estamos asignándote el mejor móvil disponible. Te avisaremos por acá en cuanto el chofer salga a buscarte.\n\n` +
        `📲 _Tip: Descargá nuestra App en_ *${APP_CLIENTES_URL}* _para ver el móvil en el mapa y pedir viajes aunque algún día se caiga WhatsApp._`;

      await whatsappService.enviarBotones(cleanFrom, confirmacionTexto, [
        { id: 'BTN_ESTADO', title: '📍 Estado del viaje' },
        { id: `BTN_CANCELAR_VIAJE_${viaje.id}`, title: '❌ Cancelar Pedido' },
        { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
      ]);

      return { success: true, viajeId: viaje.id };
    } catch (err: any) {
      console.error('Error creando viaje desde WhatsApp:', err);
      resetSesion(cleanFrom);
      return await whatsappService.enviarTexto(
        cleanFrom,
        'Tuvimos un inconveniente al registrar tu pedido. Por favor comunicate con nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
      );
    }
  },

  /**
   * Consulta y responde el estado actual de los viajes o reservas del cliente
   */
  async consultarEstadoViaje(cleanFrom: string, clienteId?: string) {
    const [viaje, reservas] = await Promise.all([
      prisma.viaje.findFirst({
        where: {
          OR: [
            { clienteTelefono: cleanFrom },
            ...(clienteId ? [{ clienteId }] : []),
          ],
          estado: { in: ['PENDIENTE', 'ACEPTADO', 'EN_CAMINO', 'EN_CURSO'] },
        },
        include: {
          chofer: true,
          vehiculo: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.reserva.findMany({
        where: {
          clienteTelefono: cleanFrom,
          estado: 'ACTIVA',
          fechaInicio: { gte: new Date(Date.now() - 60 * 60 * 1000) },
        },
        include: {
          chofer: true,
        },
        orderBy: { fechaInicio: 'asc' },
        take: 3,
      }),
    ]);

    if (!viaje && reservas.length === 0) {
      return await whatsappService.enviarBotones(
        cleanFrom,
        'No tenés ningún viaje activo ni reservas programadas en este momento.',
        [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
        ]
      );
    }

    let respuesta = '';

    // Si tiene un viaje activo en curso o por llegar
    if (viaje) {
      const choferNombre = viaje.chofer?.nombre || 'Chofer en asignación';
      const vehiculo = viaje.vehiculo;
      const vehiculoStr = vehiculo ? `${vehiculo.marca} ${vehiculo.modelo} (${vehiculo.patente})` : 'Móvil a confirmar';

      let estadoTexto = '';
      switch (viaje.estado) {
        case 'PENDIENTE':
          estadoTexto = '🟡 *Buscando móvil disponible...* Tu viaje ya está en pantalla central.';
          break;
        case 'ACEPTADO':
          estadoTexto = `🟢 *Chofer asignado:* ${choferNombre}\n🚗 *Vehículo:* ${vehiculoStr}\n_El chofer va en camino a buscarte._`;
          break;
        case 'EN_CAMINO':
          estadoTexto = `🔔 *¡Tu remis ya está esperando afuera!*\n🚗 *Vehículo:* ${vehiculoStr}\n_Ya podés salir a subirte._`;
          break;
        case 'EN_CURSO':
          estadoTexto = `🚕 *Viaje en curso* hacia ${viaje.destino}.`;
          break;
      }

      respuesta +=
        `📋 *Estado de tu Viaje #${viaje.id.slice(-4).toUpperCase()}*\n` +
        `━━━━━━━━━━━━━━━━━━━\n` +
        `${estadoTexto}\n` +
        `🟢 *Origen:* ${viaje.origen}\n` +
        `🔴 *Destino:* ${viaje.destino}\n` +
        `🔒 *PIN de seguridad:* *${viaje.codigoPin || 'Sin PIN'}*\n` +
        `━━━━━━━━━━━━━━━━━━━`;
    }

    // Si tiene reservas activas
    if (reservas.length > 0) {
      if (respuesta.length > 0) respuesta += '\n\n';
      respuesta += `📅 *Tus Reservas Programadas:*\n━━━━━━━━━━━━━━━━━━━\n`;
      respuesta += reservas
        .map((r) => {
          const { fechaTexto } = formatearFechaLegible(r.fechaInicio);
          const choferStr = r.chofer
            ? `🚗 Móvil asignado: *${r.chofer.nombre}*`
            : `🟡 Agendada en central (se asignará previo al viaje)`;
          return (
            `🗓️ *${fechaTexto}*\n` +
            `🟢 *Origen:* ${r.origen}\n` +
            `🔴 *Destino:* ${r.destino}\n` +
            `${choferStr}`
          );
        })
        .join('\n───────────────────\n');
    }

    if (viaje) {
      if (['PENDIENTE', 'ACEPTADO', 'EN_CAMINO'].includes(viaje.estado)) {
        return await whatsappService.enviarBotones(cleanFrom, respuesta, [
          { id: `BTN_CANCELAR_VIAJE_${viaje.id}`, title: '❌ Cancelar Pedido' },
          { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
        ]);
      }
      return await whatsappService.enviarBotones(cleanFrom, respuesta, [
        { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
      ]);
    }

    if (reservas.length > 0) {
      return await whatsappService.enviarBotones(cleanFrom, respuesta, [
        { id: `BTN_CANCELAR_RESERVA_${reservas[0].id}`, title: '❌ Cancelar Reserva' },
        { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
        { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
      ]);
    }

    return await whatsappService.enviarTexto(cleanFrom, respuesta);
  },

  /**
   * Solicita confirmación antes de cancelar un viaje activo desde WhatsApp
   */
  async solicitarConfirmacionCancelarViaje(
    cleanFrom: string,
    sesion: SesionClienteWhatsApp,
    clienteId?: string,
    viajeIdEspecifico?: string
  ) {
    const filtroCliente = {
      OR: [
        { clienteTelefono: cleanFrom },
        { clienteTelefono: { contains: cleanFrom.slice(-8) } },
        ...(clienteId ? [{ clienteId }] : []),
      ],
    };

    const viaje = await prisma.viaje.findFirst({
      where: viajeIdEspecifico
        ? { id: viajeIdEspecifico, ...filtroCliente }
        : {
            ...filtroCliente,
            estado: { in: ['PENDIENTE', 'ACEPTADO', 'EN_CAMINO', 'EN_CURSO'] },
          },
      include: {
        vehiculo: true,
        chofer: { include: { vehiculo: true } },
        remiseria: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!viaje) {
      resetSesion(cleanFrom);
      return await whatsappService.enviarBotones(
        cleanFrom,
        'ℹ️ No encontramos ningún pedido activo para cancelar en este momento.',
        [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
        ]
      );
    }

    const cod = `#${viaje.id.slice(-4).toUpperCase()}`;

    if (viaje.estado === 'COMPLETADO' || viaje.estado === 'CANCELADO') {
      resetSesion(cleanFrom);
      return await whatsappService.enviarBotones(
        cleanFrom,
        `ℹ️ El pedido *${cod}* ${viaje.estado === 'CANCELADO' ? 'ya fue cancelado anteriormente' : 'ya ha finalizado'}.`,
        [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
        ]
      );
    }

    if (viaje.estado === 'EN_CURSO') {
      resetSesion(cleanFrom);
      return await whatsappService.enviarBotones(
        cleanFrom,
        `⚠️ El viaje *${cod}* ya figura *en curso* con el pasajero a bordo y no puede cancelarse automáticamente.\n\nSi necesitás asistencia comunicate con nuestra central.`,
        [{ id: 'BTN_OPERADOR', title: '📞 Hablar Central' }]
      );
    }

    // Evaluar si el móvil ya está en puerta o a menos de 10 cuadras (1.0 km)
    let aplicaMinimo = false;
    const montoMinimo = viaje.remiseria?.bajadaBandera || 3500;
    if (viaje.estado === 'EN_CAMINO') {
      aplicaMinimo = true;
    } else if (viaje.estado === 'ACEPTADO') {
      const latMovil = viaje.vehiculo?.latitud || viaje.chofer?.vehiculo?.latitud;
      const lonMovil = viaje.vehiculo?.longitud || viaje.chofer?.vehiculo?.longitud;
      if (latMovil && lonMovil && viaje.origenDetallado?.includes(',')) {
        const [latO, lonO] = viaje.origenDetallado.split(',').map((n) => parseFloat(n));
        if (!isNaN(latO) && !isNaN(lonO)) {
          const R = 6371;
          const dLat = ((latO - latMovil) * Math.PI) / 180;
          const dLon = ((lonO - lonMovil) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((latMovil * Math.PI) / 180) *
              Math.cos((latO * Math.PI) / 180) *
              Math.sin(dLon / 2) *
              Math.sin(dLon / 2);
          const distLinealKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          if (distLinealKm <= 1.0) {
            aplicaMinimo = true;
          }
        }
      }
    }

    sesion.estado = 'CONFIRMANDO_CANCELACION_VIAJE';
    sesion.viajeCancelarId = viaje.id;

    const avisoCosto = aplicaMinimo
      ? `\n⚠️ *Importante:* Tu móvil ya se encuentra a menos de 10 cuadras (o en tu puerta), por lo que al cancelar corresponde abonar el viaje mínimo (*$${montoMinimo.toLocaleString('es-AR')}*).\n`
      : '';

    const msgConfirmar =
      `⚠️ *¿Cancelar pedido ${cod}?*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🟢 *Origen:* ${viaje.origen}\n` +
      `🔴 *Destino:* ${viaje.destino}\n` +
      `━━━━━━━━━━━━━━━━━━━` +
      avisoCosto +
      `\n¿Confirmás que decidiste no viajar?`;

    return await whatsappService.enviarBotones(
      cleanFrom,
      msgConfirmar,
      [
        { id: `BTN_SI_CANCELAR_VIAJE_${viaje.id}`, title: '✅ Sí, cancelar' },
        { id: `BTN_NO_CANCELAR_VIAJE_${viaje.id}`, title: '🔙 No, mantener' },
      ],
      'Cancelar Pedido'
    );
  },

  /**
   * Ejecuta la cancelación real del viaje en base de datos y notifica a Central y Chofer
   */
  async ejecutarCancelacionViajeWhatsApp(
    cleanFrom: string,
    clienteId?: string,
    viajeIdEspecifico?: string
  ) {
    try {
      const filtroCliente = {
        OR: [
          { clienteTelefono: cleanFrom },
          { clienteTelefono: { contains: cleanFrom.slice(-8) } },
          ...(clienteId ? [{ clienteId }] : []),
        ],
      };

      const viaje = await prisma.viaje.findFirst({
        where: viajeIdEspecifico
          ? { id: viajeIdEspecifico, ...filtroCliente }
          : {
              ...filtroCliente,
              estado: { in: ['PENDIENTE', 'ACEPTADO', 'EN_CAMINO'] },
            },
        include: {
          vehiculo: true,
          chofer: { include: { vehiculo: true } },
          remiseria: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      resetSesion(cleanFrom);

      if (!viaje) {
        return await whatsappService.enviarBotones(
          cleanFrom,
          'ℹ️ No encontramos ningún pedido activo para cancelar.',
          [
            { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
            { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
          ]
        );
      }

      const cod = `#${viaje.id.slice(-4).toUpperCase()}`;

      if (viaje.estado === 'COMPLETADO' || viaje.estado === 'CANCELADO') {
        return await whatsappService.enviarBotones(
          cleanFrom,
          `ℹ️ El pedido *${cod}* ${viaje.estado === 'CANCELADO' ? 'ya estaba cancelado' : 'ya ha finalizado'}.`,
          [
            { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
            { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
          ]
        );
      }

      if (viaje.estado === 'EN_CURSO') {
        return await whatsappService.enviarBotones(
          cleanFrom,
          `⚠️ El viaje *${cod}* ya está en curso y no puede cancelarse por este medio.`,
          [{ id: 'BTN_OPERADOR', title: '📞 Hablar Central' }]
        );
      }

      let debeAbonarMinimo = false;
      let costoCancelacion: number | null = null;
      let distanciaAlOrigenKm: number | null = null;

      if (viaje.estado === 'ACEPTADO' || viaje.estado === 'EN_CAMINO') {
        const latMovil = viaje.vehiculo?.latitud || viaje.chofer?.vehiculo?.latitud;
        const lonMovil = viaje.vehiculo?.longitud || viaje.chofer?.vehiculo?.longitud;

        if (viaje.estado === 'EN_CAMINO') {
          debeAbonarMinimo = true;
        } else if (latMovil && lonMovil && viaje.origenDetallado?.includes(',')) {
          const [latO, lonO] = viaje.origenDetallado.split(',').map((n) => parseFloat(n));
          if (!isNaN(latO) && !isNaN(lonO)) {
            const R = 6371;
            const dLat = ((latO - latMovil) * Math.PI) / 180;
            const dLon = ((lonO - lonMovil) * Math.PI) / 180;
            const a =
              Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos((latMovil * Math.PI) / 180) *
                Math.cos((latO * Math.PI) / 180) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
            distanciaAlOrigenKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            if (distanciaAlOrigenKm <= 1.0) {
              debeAbonarMinimo = true;
            }
          }
        }

        if (debeAbonarMinimo) {
          costoCancelacion = viaje.remiseria?.bajadaBandera || 3500;
        }
      }

      const motivo = 'Cancelado por el cliente desde WhatsApp';
      const updatedViaje = await prisma.viaje.update({
        where: { id: viaje.id },
        data: {
          estado: 'CANCELADO',
          motivoCancelacion: motivo,
          canceladoPor: 'CLIENTE',
          canceladoEn: new Date(),
          debeAbonarMinimo,
          costoCancelacion,
        },
        include: {
          cliente: true,
          chofer: true,
          vehiculo: true,
        },
      });

      // Si el viaje provenía de una reserva programada, cancelar también la reserva asociada
      await prisma.reserva
        .updateMany({
          where: {
            clienteTelefono: viaje.clienteTelefono || cleanFrom,
            origen: viaje.origen,
            destino: viaje.destino,
            fechaInicio: viaje.fecha,
            estado: 'ACTIVA',
          },
          data: { estado: 'CANCELADA' },
        })
        .catch(() => {});

      // Notificar en tiempo real a Central y Chofer vía Socket.IO
      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        io.to(viaje.remiseriaId).emit('viaje_cancelado', {
          viajeId: viaje.id,
          motivo,
          canceladoPor: 'CLIENTE',
          debeAbonarMinimo,
          costoCancelacion,
          distanciaKm: distanciaAlOrigenKm ? Number(distanciaAlOrigenKm.toFixed(1)) : null,
          viaje: updatedViaje,
        });
        io.to(viaje.remiseriaId).emit('viaje_estado_actualizado', {
          viajeId: viaje.id,
          estado: 'CANCELADO',
          mensaje: `Viaje cancelado por cliente vía WhatsApp`,
          viaje: updatedViaje,
        });
      } catch (sErr) {
        console.warn('Socket aviso cancelación WhatsApp:', sErr);
      }

      // Si tenía chofer asignado, enviar notificación Push nativa al chofer
      if (updatedViaje.choferId) {
        pushNotificationService
          .enviarAChofer(updatedViaje.choferId, {
            title: `🚨 Viaje ${cod} cancelado`,
            body: `El pasajero canceló el viaje (${viaje.origen} ➔ ${viaje.destino}).`,
            url: '/chofer/app',
            tag: `viaje-cancelado-${viaje.id}`,
            data: { viajeId: viaje.id },
          })
          .catch(() => {});
      }

      const notaMinimo = debeAbonarMinimo
        ? `\n\n⚠️ _Nota: Como el móvil ya se encontraba a menos de 10 cuadras, se registró el viaje mínimo ($${(costoCancelacion || 3500).toLocaleString('es-AR')}) pendiente para abonar en tu próximo viaje._`
        : '';

      if (debeAbonarMinimo && costoCancelacion && updatedViaje.choferId) {
        try {
          const { registrarDeudaCancelacion } = await import('./deudaCancelacionService');
          await registrarDeudaCancelacion({
            remiseriaId: viaje.remiseriaId,
            clienteId: viaje.clienteId,
            clienteTelefono: cleanFrom || viaje.clienteTelefono || null,
            clienteNombre: viaje.clienteNombre || null,
            viajeOrigenId: viaje.id,
            choferAcreedorId: updatedViaje.choferId,
            monto: costoCancelacion,
            motivo: 'CANCELACION_MENOS_10_CUADRAS',
            observaciones: motivo || 'Cancelado por WhatsApp con móvil a menos de 10 cuadras',
          });
        } catch (deudaErr) {
          console.warn('Aviso registrando deuda cancelación WhatsApp:', deudaErr);
        }
      }

      return await whatsappService.enviarBotones(
        cleanFrom,
        `❌ *Pedido ${cod} cancelado*\n\nTu solicitud fue cancelada correctamente y avisamos a nuestra central.${notaMinimo}\n\n¡Cuando necesites viajar nuevamente estamos a tu disposición!`,
        [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
        ]
      );
    } catch (err) {
      console.error('Error cancelando viaje desde WhatsApp:', err);
      resetSesion(cleanFrom);
      return await whatsappService.enviarTexto(
        cleanFrom,
        'Tuvimos un inconveniente al cancelar el pedido. Por favor comunicate con nuestra central al 2346-427637 o 2346-433000.'
      );
    }
  },

  /**
   * Solicita confirmación antes de cancelar una reserva programada desde WhatsApp
   */
  async solicitarConfirmacionCancelarReserva(
    cleanFrom: string,
    sesion: SesionClienteWhatsApp,
    clienteId?: string,
    reservaIdEspecifica?: string
  ) {
    const filtroCliente = {
      OR: [
        { clienteTelefono: cleanFrom },
        { clienteTelefono: { contains: cleanFrom.slice(-8) } },
        ...(clienteId ? [{ clienteId }] : []),
      ],
    };

    const reserva = await prisma.reserva.findFirst({
      where: reservaIdEspecifica
        ? { id: reservaIdEspecifica, ...filtroCliente }
        : {
            ...filtroCliente,
            estado: 'ACTIVA',
            fechaInicio: { gte: new Date(Date.now() - 60 * 60 * 1000) },
          },
      orderBy: { fechaInicio: 'asc' },
    });

    if (!reserva || reserva.estado !== 'ACTIVA') {
      resetSesion(cleanFrom);
      return await whatsappService.enviarBotones(
        cleanFrom,
        'ℹ️ No tenés ninguna reserva programada activa para cancelar.',
        [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
        ]
      );
    }

    sesion.estado = 'CONFIRMANDO_CANCELACION_RESERVA';
    sesion.reservaCancelarId = reserva.id;
    const { fechaTexto } = formatearFechaLegible(reserva.fechaInicio);

    const msgConfirmar =
      `⚠️ *¿Cancelar reserva programada?*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `🗓️ *Fecha y Hora:* ${fechaTexto}\n` +
      `🟢 *Origen:* ${reserva.origen}\n` +
      `🔴 *Destino:* ${reserva.destino}\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `¿Confirmás que deseás cancelar esta reserva?`;

    return await whatsappService.enviarBotones(
      cleanFrom,
      msgConfirmar,
      [
        { id: `BTN_SI_CANCELAR_RESERVA_${reserva.id}`, title: '✅ Sí, cancelar' },
        { id: `BTN_NO_CANCELAR_RESERVA_${reserva.id}`, title: '🔙 No, mantener' },
      ],
      'Cancelar Reserva'
    );
  },

  /**
   * Ejecuta la cancelación de una reserva programada y su viaje pendiente asociado
   */
  async ejecutarCancelacionReservaWhatsApp(
    cleanFrom: string,
    clienteId?: string,
    reservaIdEspecifica?: string
  ) {
    try {
      const filtroCliente = {
        OR: [
          { clienteTelefono: cleanFrom },
          { clienteTelefono: { contains: cleanFrom.slice(-8) } },
          ...(clienteId ? [{ clienteId }] : []),
        ],
      };

      const reserva = await prisma.reserva.findFirst({
        where: reservaIdEspecifica
          ? { id: reservaIdEspecifica, ...filtroCliente }
          : {
              ...filtroCliente,
              estado: 'ACTIVA',
            },
        orderBy: { fechaInicio: 'asc' },
      });

      resetSesion(cleanFrom);

      if (!reserva || reserva.estado !== 'ACTIVA') {
        return await whatsappService.enviarBotones(
          cleanFrom,
          'ℹ️ Esta reserva ya fue cancelada o finalizada.',
          [
            { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
            { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
          ]
        );
      }

      await prisma.reserva.update({
        where: { id: reserva.id },
        data: { estado: 'CANCELADA' },
      });

      // Buscar y cancelar también el Viaje programado creado junto a la reserva
      const codReserva = reserva.id.slice(-4).toUpperCase();
      const viajeAsociado = await prisma.viaje.findFirst({
        where: {
          remiseriaId: reserva.remiseriaId,
          estado: { in: ['PENDIENTE', 'ACEPTADO'] },
          OR: [
            { observaciones: { contains: `Reserva #${codReserva}` } },
            {
              clienteTelefono: reserva.clienteTelefono,
              origen: reserva.origen,
              destino: reserva.destino,
              fecha: reserva.fechaInicio,
            },
          ],
        },
        include: { cliente: true, chofer: true, vehiculo: true },
      });

      if (viajeAsociado) {
        const updatedViaje = await prisma.viaje.update({
          where: { id: viajeAsociado.id },
          data: {
            estado: 'CANCELADO',
            motivoCancelacion: 'Reserva cancelada por el cliente desde WhatsApp',
            canceladoPor: 'CLIENTE',
            canceladoEn: new Date(),
          },
          include: { cliente: true, chofer: true, vehiculo: true },
        });

        try {
          const { getIO } = await import('../lib/socket');
          const io = getIO();
          io.to(reserva.remiseriaId).emit('viaje_cancelado', {
            viajeId: viajeAsociado.id,
            motivo: 'Reserva cancelada por el cliente desde WhatsApp',
            canceladoPor: 'CLIENTE',
            debeAbonarMinimo: false,
            costoCancelacion: null,
            viaje: updatedViaje,
          });
          io.to(reserva.remiseriaId).emit('viaje_estado_actualizado', {
            viajeId: viajeAsociado.id,
            estado: 'CANCELADO',
            mensaje: 'Reserva cancelada por el cliente vía WhatsApp',
            viaje: updatedViaje,
          });
        } catch {}
      }

      const { fechaTexto } = formatearFechaLegible(reserva.fechaInicio);
      return await whatsappService.enviarBotones(
        cleanFrom,
        `❌ *Reserva cancelada*\n\nTu reserva programada para el *${fechaTexto}* (${reserva.origen} ➔ ${reserva.destino}) fue cancelada correctamente.\n\n¡Cuando nos necesites volvé a escribirnos!`,
        [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
        ]
      );
    } catch (err) {
      console.error('Error cancelando reserva desde WhatsApp:', err);
      resetSesion(cleanFrom);
      return await whatsappService.enviarTexto(
        cleanFrom,
        'Tuvimos un inconveniente al cancelar la reserva. Por favor comunicate con nuestra central al 2346-427637 o 2346-433000.'
      );
    }
  },

  /**
   * Notifica por WhatsApp al pasajero cuando el chofer avisa que está llegando o afuera
   */
  async notificarCambioEstadoPasajero(viaje: any, nuevoEstado: string, mensajeExtra?: string) {
    const telefono = viaje.clienteTelefono || viaje.cliente?.telefono;
    if (!telefono) return;

    const choferNombre = viaje.chofer?.nombre || 'Tu chofer';
    const vehiculo = viaje.vehiculo;
    const autoStr = vehiculo ? ` (${vehiculo.marca} ${vehiculo.modelo} - ${vehiculo.patente})` : '';

    if (nuevoEstado === 'EN_CAMINO') {
      const msg = `🔔 *¡Tu remis está esperando afuera!*\n${choferNombre} ya está en tu puerta${autoStr}.\n¡Ya podés salir a subirte!`;
      await whatsappService.enviarTexto(telefono, msg).catch(() => {});
    } else if (nuevoEstado === 'ACEPTADO') {
      const msg = `🚗 *¡Chofer en camino!*\n${choferNombre} aceptó tu viaje${autoStr} y va en camino a buscarte.`;
      await whatsappService
        .enviarBotones(telefono, msg, [
          { id: 'BTN_ESTADO', title: '📍 Estado del viaje' },
          { id: viaje.id ? `BTN_CANCELAR_VIAJE_${viaje.id}` : 'BTN_CANCELAR_VIAJE', title: '❌ Cancelar Pedido' },
          { id: 'BTN_OPERADOR', title: '📞 Hablar Central' },
        ])
        .catch(() => {});
    } else if (nuevoEstado === 'LLEGANDO') {
      const msg = `📍 *¡Tu remis está a 2 cuadras!*\n${choferNombre}${autoStr} está llegando. ¡Podés ir preparándote!`;
      await whatsappService.enviarTexto(telefono, msg).catch(() => {});
    } else if (nuevoEstado === 'COMPLETADO') {
      const cleanPhone = telefono.replace(/[^0-9]/g, '');
      const obs = (viaje.observaciones || '').toLowerCase();
      const email = (viaje.cliente?.email || viaje.clienteEmail || '').toLowerCase();

      // Notificar si el viaje fue solicitado por WhatsApp o proviene de un canal WhatsApp
      const esSolicitadoPorWhatsApp = Boolean(
        obs.includes('whatsapp') ||
        email.includes('whatsapp') ||
        sesionesMap.has(cleanPhone)
      );

      if (esSolicitadoPorWhatsApp) {
        const montoNumero = Number(viaje.precio || 0);
        const montoFormateado = montoNumero.toLocaleString('es-AR');
        const metodoPago = viaje.metodoPago === 'TRANSFERENCIA'
          ? 'Transferencia bancaria 💳'
          : viaje.metodoPago === 'CUENTA_CORRIENTE'
            ? 'Cuenta Corriente 🏛️'
            : 'Efectivo 💵';

        const nombreCliente = viaje.clienteNombre || viaje.cliente?.nombre || 'Pasajero';
        const peajes = Number(viaje.montoPeajes || 0);
        const peajesTexto = peajes > 0 ? `\n🛣️ *Peajes incluidos:* $${peajes.toLocaleString('es-AR')}` : '';

        const msgFinalizado =
          `🏁 *¡VIAJE FINALIZADO!*\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `Hola *${nombreCliente}*, tu viaje ha finalizado con éxito.\n\n` +
          `💵 *Monto abonado:* *$${montoFormateado}* (${metodoPago})${peajesTexto}\n` +
          `📍 *Recorrido:* ${viaje.origen} ➔ ${viaje.destino}\n` +
          `━━━━━━━━━━━━━━━━━━━\n` +
          `✨ *¡Muchas gracias por elegir Remises Bruno!*\n` +
          `Esperamos que hayas tenido un excelente viaje. Ante cualquier consulta estamos a tu disposición. ¡Hasta la próxima! 🚕🙌\n\n` +
          `📲 *¿Todavía no tenés nuestra App?*\n` +
          `Ingresá en ${APP_CLIENTES_URL} e instalala en tu celular para pedir viajes al instante, seguir el móvil en vivo y viajar siempre aunque algún día falle WhatsApp.`;

        await whatsappService.enviarTexto(telefono, msgFinalizado).catch((err) => {
          console.warn('Aviso enviando WhatsApp fin de viaje:', err);
        });
      }
    }
  },

  /**
   * Pausa las respuestas automáticas del bot para un número específico por N minutos
   */
  pausarBotParaCliente(telefono: string, minutos: number = 10, nombre?: string) {
    const cleanTel = whatsappService.formatearNumero(telefono);
    const previa = pausasHumanasMap.get(cleanTel);
    if (previa?.timerId) clearTimeout(previa.timerId);

    const timerId = setTimeout(async () => {
      const p = pausasHumanasMap.get(cleanTel);
      if (p) {
        pausasHumanasMap.delete(cleanTel);
        try {
          const msg = `🤖 *Asistente automático reconectado*\n\nHan pasado los 10 minutos y el bot se ha vuelto a conectar. ¿Cómo querés viajar hoy?`;
          await whatsappService.enviarBotones(cleanTel, msg, [
            { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
            { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
            { id: 'BTN_ESTADO', title: '📍 Estado / Ayuda' },
          ]);
        } catch {}
      }
    }, minutos * 60 * 1000);

    pausasHumanasMap.set(cleanTel, {
      hasta: new Date(Date.now() + minutos * 60 * 1000),
      nombre,
      timerId,
    });
  },

  /**
   * Reanuda las respuestas automáticas del bot para un número y le avisa al cliente
   */
  async reanudarBotParaCliente(telefono: string, notificarCliente: boolean = true) {
    const cleanTel = whatsappService.formatearNumero(telefono);
    const p = pausasHumanasMap.get(cleanTel);
    if (p?.timerId) clearTimeout(p.timerId);
    pausasHumanasMap.delete(cleanTel);

    if (notificarCliente) {
      try {
        const msgReconexion =
          `🤖 *Asistente automático reactivado*\n\n` +
          `El operador ha finalizado la atención y el bot se encuentra nuevamente disponible para tus viajes y reservas.\n\n` +
          `¿En qué te podemos ayudar?`;

        await whatsappService.enviarBotones(cleanTel, msgReconexion, [
          { id: 'BTN_PEDIR_AHORA', title: '🚕 Pedir Ahora' },
          { id: 'BTN_RESERVAR', title: '📅 Reservar Viaje' },
          { id: 'BTN_ESTADO', title: '📍 Estado / Ayuda' },
        ]);
      } catch (err) {
        console.warn('Aviso notificando reanudación manual de bot:', err);
      }
    }
  },

  /**
   * Envía un saludo de Feliz Cumpleaños por WhatsApp cuando el pasajero solicita un viaje desde la App Web (máximo 1 vez en el día)
   */
  async enviarSaludoCumpleaniosPasajero(cliente: {
    id?: string;
    nombre?: string | null;
    telefono?: string | null;
    fechaNacimiento?: Date | string | null;
    email?: string | null;
  } | null) {
    if (!cliente || !cliente.telefono || !esCumpleaniosCliente(cliente)) return false;

    const cleanTel = whatsappService.formatearNumero(cliente.telefono);
    if (!cleanTel || cleanTel.length < 8) return false;

    const claveCumple = obtenerClaveCumpleHoy(cleanTel);
    if (cumpleSaludadosMap.has(claveCumple)) return false;
    cumpleSaludadosMap.add(claveCumple);

    const nombre = (cliente.nombre || 'Pasajero').trim();
    const mensaje =
      `🎂🎉 *¡MUY FELIZ CUMPLEAÑOS, ${nombre.toUpperCase()}!* 🎉🎂\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Vimos que acabás de solicitar un viaje en un día muy especial. De parte de todo el equipo de *Remises Bruno*, queremos desearte un excelente cumpleaños lleno de alegría.\n\n` +
      `🚕 ¡Tu móvil ya está en gestión y gracias por elegirnos para acompañarte hoy! 🥂✨`;

    try {
      await whatsappService.enviarTexto(cleanTel, mensaje);
      return true;
    } catch (err) {
      console.warn('Aviso enviando saludo de cumpleaños por WhatsApp:', err);
      return false;
    }
  },

  /**
   * Verifica si el bot está pausado para un número
   */
  estaBotPausado(telefono: string): boolean {
    const cleanTel = whatsappService.formatearNumero(telefono);
    const pausa = pausasHumanasMap.get(cleanTel);
    if (!pausa) return false;
    if (Date.now() >= pausa.hasta.getTime()) {
      pausasHumanasMap.delete(cleanTel);
      return false;
    }
    return true;
  },
};
