import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { sendFelevalPasswordAlertEmail } from '../lib/mailer';
import {
  calcularDistanciaHaversineKm,
  DEFAULT_BASE_LAT,
  DEFAULT_BASE_LON,
  RADIO_URBANO_BASE_KM
} from '../lib/pricingUtils';

const FELEVAL_BASE_URL = 'https://app.feleval.com.ar';
const ALGO = 'aes-256-gcm';

function getEncryptionKey(): Buffer {
  const secret =
    process.env.FELEVAL_ENCRYPTION_KEY ||
    process.env.JWT_SECRET ||
    'remises-bruno-feleval-default-secret-key';
  return crypto.createHash('sha256').update(secret).digest();
}

export function encryptPortalPassword(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptPortalPassword(encoded: string): string {
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de contraseña cifrada inválido');
  }
  const [ivHex, tagHex, encHex] = parts;
  const decipher = crypto.createDecipheriv(ALGO, getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encHex, 'hex')),
    decipher.final()
  ]);
  return decrypted.toString('utf8');
}

function stripHtml(html: string): string {
  return String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function geocodeNominatimSimple(address: string): Promise<{ lat: number; lon: number } | null> {
  if (!address || address.length < 4) return null;
  try {
    const q = address.toLowerCase().includes('argentina') ? address : `${address}, Argentina`;
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'RemisesBrunoSync/1.0 (notificaciones@rzcore.dev)' },
      signal: AbortSignal.timeout(4500)
    });
    if (!res.ok) return null;
    const data = (await res.json()) as any[];
    if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
  } catch {
    // fallback silencioso
  }
  return null;
}

async function calcularTramoOsrm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<{ km: number; minutos: number }> {
  const lineal = calcularDistanciaHaversineKm(lat1, lon1, lat2, lon2);
  if (lineal < 0.05) return { km: 0, minutos: 0 };

  try {
    const url = `http://router.project-osrm.org/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data?.routes?.[0]) {
        const km = Math.round((data.routes[0].distance / 1000) * 10) / 10;
        const minutos = Math.ceil(data.routes[0].duration / 60);
        return { km, minutos };
      }
    }
  } catch {
    // fallback Haversine
  }
  const kmEst = Math.round(lineal * 1.2 * 10) / 10;
  // ~65 km/h promedio en ruta, ~30 km/h en ciudad
  const vel = kmEst > 12 ? 65 : 30;
  const minutos = Math.ceil((kmEst / vel) * 60);
  return { km: kmEst, minutos };
}

function restarMinutosHora(horaTurno: string, minutosAntes: number): string {
  const [hStr, mStr] = horaTurno.split(':');
  const h = parseInt(hStr || '8', 10);
  const m = parseInt(mStr || '0', 10);
  let totalMin = h * 60 + m - minutosAntes;
  if (totalMin < 0) totalMin += 24 * 60;
  // Redondear hacia abajo a múltiplos de 5 minutos para llegar con margen
  totalMin = Math.floor(totalMin / 5) * 5;
  const hh = Math.floor(totalMin / 60) % 24;
  const mm = totalMin % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

async function calcularLogisticaFeleval(params: {
  origen: string;
  destino: string;
  horaTurno: string;
  modalidad: string;
  modoTabla: string;
  baseLat: number;
  baseLon: number;
}): Promise<{
  esLocal: boolean;
  cobrarDesdeBase: boolean;
  distanciaKm: number;
  horaSalida: string;
  minutosTotales: number;
}> {
  const { origen, destino, horaTurno, modalidad, modoTabla, baseLat, baseLon } = params;

  const textoLocalChivilcoy =
    /chivilcoy/i.test(origen) && /chivilcoy/i.test(destino);

  const [geoO, geoD] = await Promise.all([
    geocodeNominatimSimple(origen),
    geocodeNominatimSimple(destino)
  ]);

  if (geoO && geoD) {
    const distBaseOrigenLineal = calcularDistanciaHaversineKm(baseLat, baseLon, geoO.lat, geoO.lon);
    const distBaseDestinoLineal = calcularDistanciaHaversineKm(baseLat, baseLon, geoD.lat, geoD.lon);
    const origenFueraDeBase = distBaseOrigenLineal > RADIO_URBANO_BASE_KM;
    const destinoFueraDeBase = distBaseDestinoLineal > RADIO_URBANO_BASE_KM;
    const esLocalGeo = !origenFueraDeBase && !destinoFueraDeBase;

    const tramoViaje = await calcularTramoOsrm(geoO.lat, geoO.lon, geoD.lat, geoD.lon);

    if (origenFueraDeBase) {
      // Móvil sale de la base a buscar al pasajero a otra localidad y lo lleva al destino
      const tramoBaseOrigen = await calcularTramoOsrm(baseLat, baseLon, geoO.lat, geoO.lon);
      const kmTotales = Math.round((tramoBaseOrigen.km + tramoViaje.km) * 10) / 10;
      const minutosAntes = Math.max(30, tramoBaseOrigen.minutos + tramoViaje.minutos + 20);
      return {
        esLocal: false,
        cobrarDesdeBase: true,
        distanciaKm: kmTotales,
        horaSalida: restarMinutosHora(horaTurno, minutosAntes),
        minutosTotales: minutosAntes
      };
    }

    if (destinoFueraDeBase || !esLocalGeo) {
      // Sale de Chivilcoy hacia otra localidad
      const minutosAntes = Math.max(30, tramoViaje.minutos + 20);
      return {
        esLocal: false,
        cobrarDesdeBase: false,
        distanciaKm: tramoViaje.km,
        horaSalida: restarMinutosHora(horaTurno, minutosAntes),
        minutosTotales: minutosAntes
      };
    }

    // Viaje local dentro de Chivilcoy
    const minutosAntes = Math.max(25, tramoViaje.minutos + 15);
    return {
      esLocal: true,
      cobrarDesdeBase: false,
      distanciaKm: tramoViaje.km,
      horaSalida: restarMinutosHora(horaTurno, minutosAntes),
      minutosTotales: minutosAntes
    };
  }

  // Fallback si Nominatim no pudo geocodificar alguna dirección rural
  const esLocalFallback =
    textoLocalChivilcoy && (/modulo|m[oó]dulo|local/i.test(modalidad) || modoTabla.toUpperCase() === 'M');
  const minutosAntes = esLocalFallback ? 30 : 90;
  return {
    esLocal: esLocalFallback,
    cobrarDesdeBase: !/chivilcoy/i.test(origen),
    distanciaKm: 0,
    horaSalida: restarMinutosHora(horaTurno, minutosAntes),
    minutosTotales: minutosAntes
  };
}

function parseFechaHoraFeleval(fechaCol: string): { fecha: Date; horaTurno: string; horaSalida: string } {
  // Ej: "11/12/2026 10:00 HS"
  const m = fechaCol.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (!m) {
    const now = new Date();
    return { fecha: now, horaTurno: '08:00', horaSalida: '07:30' };
  }
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10) - 1;
  const year = parseInt(m[3], 10);
  const hour = parseInt(m[4], 10);
  const minute = parseInt(m[5], 10);

  // Guardamos fecha en horario local de Argentina (UTC-3)
  const fecha = new Date(Date.UTC(year, month, day, hour + 3, minute, 0));
  const horaTurno = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

  // Hora sugerida de salida: 30 minutos antes del turno
  const totalMinSalida = Math.max(0, hour * 60 + minute - 30);
  const horaSalida = `${String(Math.floor(totalMinSalida / 60)).padStart(2, '0')}:${String(totalMinSalida % 60).padStart(2, '0')}`;

  return { fecha, horaTurno, horaSalida };
}

function parseDetailLines(html: string): Record<string, string> {
  const lines = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((l) => l.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').trim())
    .filter(Boolean);

  const labels = new Set([
    'Siniestro - Autorización',
    'ART',
    'Fecha',
    'Hora Turno',
    'Hora Retorno',
    'Hora Viaje',
    'Prestador',
    'Chofer IDA',
    'Chofer RETORNO',
    'Modalidad',
    'Retorno',
    'Espera',
    'Nombre Completo',
    'Teléfono',
    'DNI',
    'Dirección Origen',
    'Dirección Destino',
    'Observaciones para el evento'
  ]);

  const result: Record<string, string> = {};
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (labels.has(line)) {
      const next = lines[i + 1];
      if (next && !labels.has(next) && next !== '---' && next !== 'Error') {
        result[line] = next;
      }
    }
  }
  return result;
}

function extractPhoneFromObservaciones(obs?: string): string {
  if (!obs) return '';
  const m = obs.match(/Tel(?:[eé]fono)?\s*:?\s*[A-Za-z]?:?\s*([0-9\-\s()]{7,20})/i);
  return m ? m[1].trim() : '';
}

function mergeCookies(existing: Map<string, string>, setCookies: string[]) {
  for (const c of setCookies) {
    const pair = c.split(';')[0];
    const idx = pair.indexOf('=');
    if (idx > 0) {
      existing.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }
}

function cookiesToHeader(map: Map<string, string>): string {
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

export interface FelevalSyncResult {
  success: boolean;
  estado: 'OK' | 'ERROR_CLAVE' | 'ERROR_CONEXION';
  mensaje: string;
  totalEnPortal: number;
  importados: number;
  yaExistentes: number;
  erroresDetalle: number;
  alertaEmailEnviada?: boolean;
}

export async function sincronizarArtFeleval(
  artEmpresaId: string,
  options?: { enviarAlertaSiempre?: boolean }
): Promise<FelevalSyncResult> {
  const art = await prisma.artEmpresa.findUnique({
    where: { id: artEmpresaId },
    include: { remiseria: { select: { latitud: true, longitud: true } } }
  });

  if (!art) {
    return {
      success: false,
      estado: 'ERROR_CONEXION',
      mensaje: 'ART / Empresa no encontrada',
      totalEnPortal: 0,
      importados: 0,
      yaExistentes: 0,
      erroresDetalle: 0
    };
  }

  if (!art.portalExternoEmail || !art.portalExternoPasswordEnc) {
    return {
      success: false,
      estado: 'ERROR_CLAVE',
      mensaje: 'Faltan configurar el email o contraseña del portal Feleval',
      totalEnPortal: 0,
      importados: 0,
      yaExistentes: 0,
      erroresDetalle: 0
    };
  }

  const baseUrl = (art.portalExternoUrl || FELEVAL_BASE_URL).replace(/\/+$/, '');
  const emailAlerta = art.portalExternoEmailAlerta || 'rizzofs@gmail.com';
  let passwordPlain = '';

  try {
    passwordPlain = decryptPortalPassword(art.portalExternoPasswordEnc);
  } catch {
    return {
      success: false,
      estado: 'ERROR_CLAVE',
      mensaje: 'No se pudo descifrar la contraseña guardada. Volvé a ingresarla.',
      totalEnPortal: 0,
      importados: 0,
      yaExistentes: 0,
      erroresDetalle: 0
    };
  }

  const cookieMap = new Map<string, string>();

  const registrarErrorClave = async (motivo: string): Promise<FelevalSyncResult> => {
    const yaAlertoHoy =
      art.portalExternoUltimoEstado === 'ERROR_CLAVE' &&
      art.portalExternoUltimaSync &&
      new Date(art.portalExternoUltimaSync).toDateString() === new Date().toDateString();

    let alertaEmailEnviada = false;
    if (options?.enviarAlertaSiempre || !yaAlertoHoy) {
      await sendFelevalPasswordAlertEmail(
        emailAlerta,
        art.nombre,
        art.portalExternoEmail || '',
        motivo
      );
      alertaEmailEnviada = true;
    }

    await prisma.artEmpresa.update({
      where: { id: art.id },
      data: {
        portalExternoUltimaSync: new Date(),
        portalExternoUltimoEstado: 'ERROR_CLAVE',
        portalExternoUltimoMensaje: motivo
      }
    });

    return {
      success: false,
      estado: 'ERROR_CLAVE',
      mensaje: motivo,
      totalEnPortal: 0,
      importados: 0,
      yaExistentes: 0,
      erroresDetalle: 0,
      alertaEmailEnviada
    };
  };

  try {
    // 1. Obtener formulario de login + CSRF token
    const resGet = await fetch(`${baseUrl}/users/sign_in`, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RemisesBrunoSync/1.0)' },
      signal: AbortSignal.timeout(15000)
    });
    const htmlLogin = await resGet.text();
    const cookiesGet = resGet.headers.getSetCookie ? resGet.headers.getSetCookie() : [];
    mergeCookies(cookieMap, cookiesGet);

    const tokenMatch =
      htmlLogin.match(/name="authenticity_token"[^>]*value="([^"]+)"/) ||
      htmlLogin.match(/name="csrf-token"[^>]*content="([^"]+)"/);
    const authToken = tokenMatch ? tokenMatch[1] : '';

    if (!authToken) {
      throw new Error('No se pudo obtener el token de inicio de sesión de Feleval');
    }

    // 2. Enviar credenciales
    const formBody = new URLSearchParams();
    formBody.set('utf8', '✓');
    formBody.set('authenticity_token', authToken);
    formBody.set('user[email]', art.portalExternoEmail.trim());
    formBody.set('user[password]', passwordPlain);
    formBody.set('user[remember_me]', '0');
    formBody.set('commit', 'Acceder');

    const resPost = await fetch(`${baseUrl}/users/sign_in`, {
      method: 'POST',
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookiesToHeader(cookieMap),
        'User-Agent': 'Mozilla/5.0 (compatible; RemisesBrunoSync/1.0)',
        'Referer': `${baseUrl}/users/sign_in`
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(15000)
    });

    const cookiesPost = resPost.headers.getSetCookie ? resPost.headers.getSetCookie() : [];
    mergeCookies(cookieMap, cookiesPost);

    const location = resPost.headers.get('location') || '';

    // Si no redirige (200 con error) o redirige a cambio de contraseña / login
    if (resPost.status !== 302 && resPost.status !== 303) {
      const bodyErr = stripHtml(await resPost.text());
      const motivo =
        /vencid|expir|caduc|cambiar.*clave|cambiar.*contrase/i.test(bodyErr)
          ? 'Feleval solicitó cambiar la contraseña (clave vencida).'
          : 'Credenciales rechazadas por Feleval (email o contraseña incorrectos / clave vencida).';
      return await registrarErrorClave(motivo);
    }

    if (/sign_in|password|expired|edit/i.test(location)) {
      return await registrarErrorClave(
        `Feleval redirigió a "${location}" — es necesario actualizar la contraseña.`
      );
    }

    // 3. Verificar página destino tras el login (por si Rails redirige / -> /users/password_expired)
    const nextUrl = location.startsWith('http') ? location : `${baseUrl}${location || '/'}`;
    const resHome = await fetch(nextUrl, {
      headers: {
        'Cookie': cookiesToHeader(cookieMap),
        'User-Agent': 'Mozilla/5.0 (compatible; RemisesBrunoSync/1.0)'
      },
      signal: AbortSignal.timeout(15000)
    });
    const cookiesHome = resHome.headers.getSetCookie ? resHome.headers.getSetCookie() : [];
    mergeCookies(cookieMap, cookiesHome);

    const finalUrl = resHome.url || '';
    const htmlHome = await resHome.text();
    if (
      /sign_in|password_expired|users\/password/i.test(finalUrl) ||
      /su contrase[ñn]a ha expirado|debe cambiar su contrase[ñn]a|contrase[ñn]a vencida/i.test(htmlHome)
    ) {
      return await registrarErrorClave(
        'Feleval indicó que la contraseña expiró y debe ser cambiada.'
      );
    }

    // 4. Obtener eventos pendientes en formato JSON
    const eventsUrl = `${baseUrl}/prestador/events.json?group_name=pending&state[]=sent&state[]=informed&start=0&length=200`;
    const resEvents = await fetch(eventsUrl, {
      headers: {
        'Cookie': cookiesToHeader(cookieMap),
        'User-Agent': 'Mozilla/5.0 (compatible; RemisesBrunoSync/1.0)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(20000)
    });

    if (resEvents.status === 401 || resEvents.status === 403) {
      return await registrarErrorClave('Sesión no autorizada al consultar eventos de Feleval.');
    }

    const contentType = resEvents.headers.get('content-type') || '';
    if (!resEvents.ok || !contentType.includes('application/json')) {
      throw new Error(`Respuesta inesperada de Feleval (${resEvents.status})`);
    }

    const json = (await resEvents.json()) as { recordsTotal?: number; data?: any[][] };
    const rows = Array.isArray(json.data) ? json.data : [];

    let importados = 0;
    let yaExistentes = 0;
    let erroresDetalle = 0;

    // 4b. Pre-filtrar filas nuevas y descargar detalles en paralelo (lotes de 4) para máxima velocidad
    const pendientesNuevos: Array<{ felevalEventId: string; externoId: string; row: any[] }> = [];
    for (const row of rows) {
      const rawAction = String(row[8] || '');
      const idMatch = rawAction.match(/\/prestador\/events\/(\d+)/);
      if (!idMatch) continue;
      const felevalEventId = idMatch[1];
      const externoId = `FELEVAL:${felevalEventId}`;
      pendientesNuevos.push({ felevalEventId, externoId, row });
    }

    const existentesDb = pendientesNuevos.length > 0
      ? await prisma.viaje.findMany({
          where: { externoId: { in: pendientesNuevos.map((p) => p.externoId) } },
          select: { externoId: true }
        })
      : [];
    const existentesSet = new Set(existentesDb.map((e) => e.externoId));
    const soloNuevos = pendientesNuevos.filter((p) => {
      if (existentesSet.has(p.externoId)) {
        yaExistentes++;
        return false;
      }
      return true;
    });

    const BATCH_SIZE = 4;
    for (let i = 0; i < soloNuevos.length; i += BATCH_SIZE) {
      const batch = soloNuevos.slice(i, i + BATCH_SIZE);
      const batchDetails = await Promise.all(
        batch.map(async (item) => {
          let detail: Record<string, string> = {};
          try {
            const resDetail = await fetch(`${baseUrl}/prestador/events/${item.felevalEventId}`, {
              headers: {
                'Cookie': cookiesToHeader(cookieMap),
                'User-Agent': 'Mozilla/5.0 (compatible; RemisesBrunoSync/1.0)'
              },
              signal: AbortSignal.timeout(12000)
            });
            if (resDetail.ok) {
              detail = parseDetailLines(await resDetail.text());
            }
          } catch {
            // Si falla el detalle, continuamos con los datos de la tabla
          }
          return { ...item, detail };
        })
      );

      for (const { felevalEventId, externoId, row, detail } of batchDetails) {
        try {
          const siniestroTabla = stripHtml(row[0]);
          const pacienteTabla = stripHtml(row[3]);
          const fechaTabla = stripHtml(row[4]);
          const origenTabla = stripHtml(row[5]);
          const destinoTabla = stripHtml(row[6]);
          const modoTabla = stripHtml(row[7]);

          const siniestro = detail['Siniestro - Autorización'] || siniestroTabla || null;
          const subArt = detail['ART'] || '';
          const modalidad = detail['Modalidad'] || (modoTabla === 'M' ? 'Modulo' : modoTabla);
          const retorno = detail['Retorno'] || '';
          const espera = detail['Espera'] || '';
          const clienteNombre = (detail['Nombre Completo'] || pacienteTabla || 'Pasajero ART').trim();
          const obsFeleval = detail['Observaciones para el evento'] || '';
          const telefono = (detail['Teléfono'] || extractPhoneFromObservaciones(obsFeleval)).trim();
          const dniRaw = (detail['DNI'] || '').replace(/\D/g, '');
          const origen = (detail['Dirección Origen'] || origenTabla || 'A confirmar').trim();
          const destino = (detail['Dirección Destino'] || destinoTabla || 'A confirmar').trim();

          const { fecha, horaTurno } = parseFechaHoraFeleval(fechaTabla);
          const horaTurnoFinal = detail['Hora Turno'] || horaTurno;

          const baseLat = typeof art.remiseria?.latitud === 'number' ? art.remiseria.latitud : DEFAULT_BASE_LAT;
          const baseLon = typeof art.remiseria?.longitud === 'number' ? art.remiseria.longitud : DEFAULT_BASE_LON;
          const logistica = await calcularLogisticaFeleval({
            origen,
            destino,
            horaTurno: horaTurnoFinal,
            modalidad,
            modoTabla,
            baseLat,
            baseLon
          });

          let clienteId: string | null = null;
          const cleanTel = telefono.replace(/\D/g, '');
          if (cleanTel || dniRaw) {
            const cli = await prisma.cliente.findFirst({
              where: {
                remiseriaId: art.remiseriaId,
                OR: [
                  ...(cleanTel ? [{ telefono: cleanTel }, { telefono }] : []),
                  ...(dniRaw ? [{ dni: dniRaw }] : [])
                ]
              },
              select: { id: true }
            });
            if (cli) clienteId = cli.id;
          }

          if (!clienteId && clienteNombre) {
            try {
              const partes = clienteNombre.split(/\s+/);
              const nombreCli = partes[0] || 'Pasajero';
              const apellidoCli = partes.length > 1 ? partes.slice(1).join(' ') : 'ART';
              const suffix = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
              const dniFinal = dniRaw || `ART${suffix.slice(-8)}`;
              const telFinal = cleanTel || telefono || `S/T-${suffix.slice(-6)}`;
              const dummyEmail = `art_${suffix}@cliente.brunoremises.local`;
              const passwordHash = await bcrypt.hash(dniFinal, 10);

              const nuevoUser = await prisma.user.create({
                data: { email: dummyEmail, passwordHash, rol: 'CLIENTE' }
              });
              const nuevoCli = await prisma.cliente.create({
                data: {
                  userId: nuevoUser.id,
                  remiseriaId: art.remiseriaId,
                  nombre: nombreCli,
                  apellido: apellidoCli,
                  dni: dniFinal,
                  telefono: telFinal,
                  email: dummyEmail,
                  direccion: origen,
                  fechaNacimiento: new Date('1990-01-01'),
                  observaciones: `Pasajero Feleval${subArt ? ` (${subArt})` : ''}`
                }
              });
              clienteId = nuevoCli.id;
            } catch {
              // Ignorar conflicto de unicidad eventual
            }
          }

          const esLocal = logistica.esLocal;
          const precioArt = esLocal
            ? Number(art.precioTramo || 0)
            : logistica.distanciaKm > 0
            ? Math.round(logistica.distanciaKm * Number(art.valorKm || 0))
            : 0;
          const precioChofer =
            art.pagaChoferTipo === 'PERSONALIZADO'
              ? esLocal
                ? Number(art.choferPrecioTramo || precioArt)
                : logistica.distanciaKm > 0
                ? Math.round(logistica.distanciaKm * Number(art.choferValorKm || 0))
                : 0
              : precioArt;

          const metaObs = [
            `[FELEVAL #${felevalEventId}]`,
            esLocal ? '[LOCAL]' : logistica.cobrarDesdeBase ? '[POR KM - DESDE BASE]' : '[POR KM]',
            subArt ? `ART: ${subArt}` : '',
            modalidad ? `Modalidad: ${modalidad}` : '',
            retorno ? `Retorno: ${retorno}` : '',
            espera ? `Espera: ${espera}` : '',
            obsFeleval
          ]
            .filter(Boolean)
            .join(' | ');

          await prisma.viaje.create({
            data: {
              remiseriaId: art.remiseriaId,
              artEmpresaId: art.id,
              externoId,
              clienteId,
              clienteNombre,
              clienteTelefono: telefono || null,
              origen,
              destino,
              fecha,
              horaSalidaChofer: logistica.horaSalida,
              horaTurno: horaTurnoFinal,
              distanciaKmConPasajero: logistica.distanciaKm,
              precio: precioChofer,
              precioArt: precioArt > 0 ? precioArt : null,
              numeroSiniestro: siniestro,
              observaciones: metaObs,
              prioridad: 'ALTA',
              estado: 'PENDIENTE',
              estadoCoordinacion: 'PENDIENTE_CONTACTO'
            }
          });

          importados++;
        } catch (rowErr) {
          console.error('Error importando fila de Feleval:', rowErr);
          erroresDetalle++;
        }
      }
    }

    const mensaje = `Sincronización OK: ${importados} viaje${importados !== 1 ? 's' : ''} nuevo${importados !== 1 ? 's' : ''} importado${importados !== 1 ? 's' : ''}, ${yaExistentes} ya existente${yaExistentes !== 1 ? 's' : ''}.`;

    await prisma.artEmpresa.update({
      where: { id: art.id },
      data: {
        portalExternoUltimaSync: new Date(),
        portalExternoUltimoEstado: 'OK',
        portalExternoUltimoMensaje: mensaje
      }
    });

    return {
      success: true,
      estado: 'OK',
      mensaje,
      totalEnPortal: rows.length,
      importados,
      yaExistentes,
      erroresDetalle
    };
  } catch (err: any) {
    const mensaje = `Error de conexión con Feleval: ${err?.message || 'desconocido'}`;
    await prisma.artEmpresa.update({
      where: { id: art.id },
      data: {
        portalExternoUltimaSync: new Date(),
        portalExternoUltimoEstado: 'ERROR_CONEXION',
        portalExternoUltimoMensaje: mensaje
      }
    });
    return {
      success: false,
      estado: 'ERROR_CONEXION',
      mensaje,
      totalEnPortal: 0,
      importados: 0,
      yaExistentes: 0,
      erroresDetalle: 0
    };
  }
}

let lastCronDateArg = '';

/**
 * Scheduler diario que corre todos los días a las 23:59 (hora Argentina)
 * para sincronizar todas las ARTs con integración Feleval activa.
 */
export function iniciarServicioSyncFeleval() {
  console.log('🔄 Servicio de sincronización diaria Feleval iniciado (programado 23:59 hs AR).');

  const tick = async () => {
    try {
      const now = new Date();
      const parts = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      }).formatToParts(now);

      const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
      const fechaArg = `${get('year')}-${get('month')}-${get('day')}`;
      const horaMin = `${get('hour')}:${get('minute')}`;

      if (horaMin === '23:59' && lastCronDateArg !== fechaArg) {
        lastCronDateArg = fechaArg;
        console.log(`⏰ [Feleval Sync 23:59] Ejecutando sincronización diaria (${fechaArg})...`);

        const artsActivas = await prisma.artEmpresa.findMany({
          where: {
            activo: true,
            portalExternoActivo: true,
            portalExternoTipo: 'FELEVAL'
          },
          select: { id: true, nombre: true }
        });

        for (const art of artsActivas) {
          const res = await sincronizarArtFeleval(art.id);
          console.log(`[Feleval Sync] ${art.nombre}: ${res.estado} — ${res.mensaje}`);
        }
      }
    } catch (err) {
      console.error('Error en cron diario de Feleval:', err);
    }
  };

  setInterval(tick, 45 * 1000);
}
