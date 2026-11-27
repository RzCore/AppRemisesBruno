import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types';
import bcrypt from 'bcryptjs';
import { batchDispatchService } from '../services/batchDispatchService';
import { checkAgenciaEstado } from '../services/agencyScheduleService';
import { calcularAjusteOrigenRemoto, calcularDistanciaRutaKm, calcularMinimoPorAnillo, calcularPrecioTarifaNormal, detectarPeajesEnRecorrido, DEFAULT_BASE_LAT, DEFAULT_BASE_LON, redondearKmArt, redondearPrecioMultiplo100 } from '../lib/pricingUtils';
import { calcularVehiculosPorPasajeros } from '../lib/passengerUtils';
import { calcularRutaAsfaltada } from '../lib/routingUtils';

const SOLO_LETRAS_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛãõÃÕçÇñÑ\s'´¨-]+$/;

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
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

const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas en memoria
const geocodeSearchCache = new Map<string, { data: any[]; expiresAt: number }>();
const geocodeInFlightMap = new Map<string, Promise<any[]>>();
const osrmDistanceCache = new Map<string, { distanceKm: number; expiresAt: number }>();

interface KnownPlaceEntry {
  display_name: string;
  lat: string;
  lon: string;
  keywords: string[];
  address: Record<string, string>;
}

const CHIVILCOY_KNOWN_PLACES: KnownPlaceEntry[] = [
  {
    display_name: 'Agencia (Avenida Sarmiento 271, Chivilcoy)',
    lat: '-34.9011383',
    lon: '-60.0137782',
    keywords: [
      'agencia',
      'base',
      'remiseria',
      'remises bruno',
      'avenida sarmiento 271',
      'av sarmiento 271',
      'sarmiento 271',
    ],
    address: {
      amenity: 'Agencia Remises Bruno',
      road: 'Avenida Sarmiento',
      house_number: '271',
      city: 'Chivilcoy',
      state: 'Buenos Aires',
    },
  },
  {
    display_name: 'Universidad Nacional de Luján (UNLu) - Centro Regional Chivilcoy, El Grito de Alcorta 110, Chivilcoy',
    lat: '-34.9189524',
    lon: '-59.9946500',
    keywords: [
      'universidad nacional de lujan',
      'universidad de lujan',
      'unlu',
      'centro regional chivilcoy',
      'el grito de alcorta 110',
      'grito de alcorta 110',
      'universidad chivilcoy',
    ],
    address: {
      amenity: 'Universidad Nacional de Luján',
      road: 'El Grito de Alcorta',
      house_number: '110',
      city: 'Chivilcoy',
      state: 'Buenos Aires',
    },
  },
];

function normalizarTextoBusqueda(str: string): string {
  return (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[,.;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buscarLugaresConocidos(rawQuery: string): any[] {
  const norm = normalizarTextoBusqueda(rawQuery);
  if (norm.length < 3) return [];
  const sinChivilcoy = norm.replace(/\bchivilcoy\b/g, '').replace(/\s+/g, ' ').trim();
  const matches: any[] = [];

  for (const place of CHIVILCOY_KNOWN_PLACES) {
    const matched = place.keywords.some((kw) => {
      if (norm.includes(kw) || kw.includes(norm)) return true;
      if (sinChivilcoy.length >= 3 && (sinChivilcoy.includes(kw) || kw.includes(sinChivilcoy))) {
        return true;
      }
      return false;
    });
    if (matched) {
      matches.push({
        lat: place.lat,
        lon: place.lon,
        display_name: place.display_name,
        address: place.address,
      });
    }
  }
  return matches;
}

function formatSuggestionDisplayName(
  addr: any,
  fallbackDisplay: string,
  houseNumberOverride?: string,
  poiName?: string
): string {
  const road = addr?.road || addr?.pedestrian || addr?.street || addr?.residential || '';
  const houseNumber = addr?.house_number || houseNumberOverride || '';
  const city =
    addr?.city ||
    addr?.town ||
    addr?.village ||
    addr?.municipality ||
    addr?.suburb ||
    'Chivilcoy';

  const cleanPoi = (poiName || addr?.amenity || '').trim();
  const poiDifferentFromRoad =
    cleanPoi &&
    road &&
    normalizarTextoBusqueda(cleanPoi) !== normalizarTextoBusqueda(road);

  if (road) {
    const roadHasNumber = houseNumber ? new RegExp(`\\b${houseNumber}\\b`).test(road) : false;
    const streetPart = houseNumber && !roadHasNumber ? `${road} ${houseNumber}` : road;
    const base = city ? `${streetPart}, ${city}` : streetPart;
    return poiDifferentFromRoad ? `${cleanPoi}, ${base}` : base;
  }
  return fallbackDisplay;
}

async function fetchNominatimList(qParam: string, limit: number, viewboxParam: string): Promise<any[]> {
  try {
    const viewboxSuffix = viewboxParam ? `&${viewboxParam}&bounded=0` : '';
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      qParam
    )}&countrycodes=ar&limit=${limit}&addressdetails=1${viewboxSuffix}`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RemisesBrunoApp/1.1 (contacto@brunoremises.com.ar)',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function fetchPhotonFallback(qParam: string, limit: number, houseNumberOverride?: string): Promise<any[]> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      qParam
    )}&lat=-34.8968&lon=-60.0190&limit=${limit}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(3500),
    });
    if (!response.ok) return [];
    const json = (await response.json()) as any;
    if (!Array.isArray(json?.features)) return [];

    return json.features
      .filter((f: any) => {
        const country = (f?.properties?.countrycode || f?.properties?.country || '').toLowerCase();
        return !country || country === 'ar' || country.includes('argentina');
      })
      .map((f: any) => {
        const props = f.properties || {};
        const coords = f.geometry?.coordinates || [];
        const road = props.street || props.name || '';
        const house_number = props.housenumber || houseNumberOverride || '';
        const city = props.city || props.town || props.locality || props.county || 'Chivilcoy';
        const state = props.state || 'Buenos Aires';
        const addr = { road, house_number, city, state };
        const rawDisplay = [road, house_number, city, state].filter(Boolean).join(', ');
        return {
          lat: coords[1] !== undefined ? String(coords[1]) : '',
          lon: coords[0] !== undefined ? String(coords[0]) : '',
          display_name: formatSuggestionDisplayName(addr, rawDisplay, houseNumberOverride),
          address: addr,
        };
      })
      .filter((item: any) => item.lat && item.lon && item.display_name);
  } catch {
    return [];
  }
}

export async function searchNominatimCached(rawQuery: string, limit = 5): Promise<any[]> {
  const queryString = (rawQuery || '').trim();
  if (!queryString || queryString.length < 3) return [];

  const cacheKey = `${limit}:${queryString.toLowerCase()}`;
  const ahora = Date.now();
  const cached = geocodeSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > ahora) {
    return cached.data;
  }

  // Deduplicar peticiones simultáneas idénticas en hora pico
  const inFlight = geocodeInFlightMap.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const fetchPromise = (async () => {
    try {
      // 1) Coincidencias directas con puntos de interés conocidos de Chivilcoy (ej. UNLu Chivilcoy)
      const knownMatches = buscarLugaresConocidos(queryString);

      const hasCityConstraint =
        /,/g.test(queryString) ||
        /chivilcoy|bragado|alberti|suipacha|moquehu[aá]|gorostiaga|chacabuco|25\s+de\s+mayo|9\s+de\s+julio|jun[ií]n|buenos\s+aires|caba|capital\s+federal|federal|ezeiza|retiro|luj[aá]n|mercedes|la\s+plata|saladillo|lobos|navarro|roque\s+p[eé]rez|san\s+andres\s+de\s+giles|aeroparque/i.test(
          queryString
        );
      const mencionaChivilcoy = /chivilcoy/i.test(queryString);
      const viewboxParam = !hasCityConstraint || mencionaChivilcoy ? 'viewbox=-60.55,-34.55,-59.35,-35.20' : '';

      // Extraer altura / número de calle si el usuario lo ingresó (ej: "Sarmiento 340")
      const houseNumMatch = queryString.match(/^(.*?)\s+(\d{1,5})(?:\s*,.*)?$/);
      const streetOnly = houseNumMatch ? houseNumMatch[1].trim() : '';
      const typedHouseNumber = houseNumMatch ? houseNumMatch[2] : undefined;

      // Si el usuario escribió solo el nombre de una localidad bonaerense (ej. "Bragado"),
      // agregar ", Buenos Aires, Argentina" para evitar confusiones con calles homónimas en Chivilcoy.
      const esSoloLocalidadRegional =
        !queryString.includes(',') &&
        !typedHouseNumber &&
        /^(bragado|alberti|suipacha|moquehu[aá]|gorostiaga|chacabuco|25\s+de\s+mayo|9\s+de\s+julio|jun[ií]n|luj[aá]n|mercedes|saladillo|lobos|navarro|roque\s+p[eé]rez|la\s+plata|ezeiza)$/i.test(
          queryString
        );

      const primaryQuery = esSoloLocalidadRegional
        ? `${queryString}, Buenos Aires, Argentina`
        : hasCityConstraint
        ? queryString
        : `${queryString}, Chivilcoy`;
      let data = await fetchNominatimList(primaryQuery, limit, viewboxParam);

      // Si el usuario incluyó coma en un lugar/institución (ej: "universidad nacional de lujan, chivilcoy"),
      // reintentar sin comas porque Nominatim suele resolver POIs mejor sin coma
      if (data.length === 0 && primaryQuery.includes(',')) {
        const sinComas = primaryQuery.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
        data = await fetchNominatimList(sinComas, limit, viewboxParam);
      }

      // Si buscó calle + altura y OSM solo tiene la calle sin numeración catastral, buscar por nombre de calle
      if (data.length === 0 && streetOnly.length >= 3) {
        const streetQuery = hasCityConstraint ? streetOnly : `${streetOnly}, Chivilcoy`;
        data = await fetchNominatimList(streetQuery, limit, viewboxParam);
      }

      if (!hasCityConstraint && data.length === 0) {
        data = await fetchNominatimList(queryString, limit, viewboxParam);
      }

      // Fallback a Photon (OSM) si Nominatim limitó o no devolvió resultados
      if (data.length === 0) {
        data = await fetchPhotonFallback(primaryQuery, limit, typedHouseNumber);
        if (data.length === 0 && streetOnly.length >= 3) {
          data = await fetchPhotonFallback(
            hasCityConstraint ? streetOnly : `${streetOnly}, Chivilcoy`,
            limit,
            typedHouseNumber
          );
        }
      } else {
        // Enriquecer display_name limpio preservando la altura ingresada por el usuario y el nombre de POI
        data = data.map((item: any) => {
          const addr = { ...(item.address || {}) };
          if (typedHouseNumber && !addr.house_number && (addr.road || addr.pedestrian || addr.street)) {
            addr.house_number = typedHouseNumber;
          }
          return {
            ...item,
            address: addr,
            display_name: formatSuggestionDisplayName(
              addr,
              item.display_name || '',
              typedHouseNumber,
              item.name
            ),
          };
        });
      }

      const merged = [
        ...knownMatches,
        ...(Array.isArray(data) ? data : []).filter(
          (d: any) => !knownMatches.some((k) => k.lat === String(d.lat) && k.lon === String(d.lon))
        ),
      ].slice(0, limit);

      const finalData = merged;
      if (finalData.length > 0) {
        if (geocodeSearchCache.size >= 1500) {
          const oldestKey = geocodeSearchCache.keys().next().value;
          if (oldestKey) geocodeSearchCache.delete(oldestKey);
        }
        geocodeSearchCache.set(cacheKey, {
          data: finalData,
          expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
        });
      }
      return finalData;
    } finally {
      geocodeInFlightMap.delete(cacheKey);
    }
  })();

  geocodeInFlightMap.set(cacheKey, fetchPromise);
  return fetchPromise;
}

async function geocodeAddressInternal(query: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const data = await searchNominatimCached(query, 1);
    if (data && data.length > 0 && data[0].lat && data[0].lon) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
  } catch (e) {
    return null;
  }
}

export const coordinatorDashboardController = {
  // Obtener viajes en curso (incluye asignados/en camino/en curso)
  async getViajesEnCurso(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      // Obtener la remisería del coordinador
      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const viajes = await prisma.viaje.findMany({
        where: {
          remiseriaId: coordinador.remiseriaId,
          estado: {
            in: ['ACEPTADO', 'EN_CAMINO', 'EN_CURSO']
          }
        },
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              email: true
            }
          },
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              vehiculo: {
                select: {
                  id: true,
                  patente: true,
                  marca: true,
                  modelo: true
                }
              }
            }
          },
          vehiculo: {
            select: {
              id: true,
              patente: true,
              marca: true,
              modelo: true
            }
          },
          artEmpresa: true
        },
        orderBy: {
          fecha: 'desc'
        }
      });

      res.json({
        success: true,
        data: viajes
      });
    } catch (error) {
      console.error('Error getting viajes en curso:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener viajes finalizados y anulados (historial)
  async getViajesHistorial(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      let remiseriaId: string | null = null;
      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });
      if (coordinador) {
        remiseriaId = coordinador.remiseriaId;
      } else if ((req.user as any)?.remiseriaId) {
        remiseriaId = (req.user as any).remiseriaId;
      }

      if (!remiseriaId) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador o remisería no encontrada'
        });
      }

      const { estado, fechaDesde, fechaHasta, limit, choferId, vehiculoId } = req.query;

      const whereClause: any = {
        remiseriaId,
        estado: {
          in: ['COMPLETADO', 'CANCELADO']
        }
      };

      if (estado && typeof estado === 'string' && ['COMPLETADO', 'CANCELADO'].includes(estado.toUpperCase())) {
        whereClause.estado = estado.toUpperCase();
      }

      if (choferId && typeof choferId === 'string' && choferId.trim() !== '') {
        whereClause.choferId = choferId.trim();
      }

      if (vehiculoId && typeof vehiculoId === 'string' && vehiculoId.trim() !== '') {
        whereClause.OR = [
          { vehiculoId: vehiculoId.trim() },
          { chofer: { vehiculo: { id: vehiculoId.trim() } } }
        ];
      }

      if (fechaDesde || fechaHasta) {
        whereClause.fecha = {};
        if (fechaDesde && typeof fechaDesde === 'string') {
          whereClause.fecha.gte = new Date(fechaDesde);
        }
        if (fechaHasta && typeof fechaHasta === 'string') {
          const hasta = new Date(fechaHasta);
          if (fechaHasta.length === 10) {
            hasta.setHours(23, 59, 59, 999);
          }
          whereClause.fecha.lte = hasta;
        }
      }

      const take = limit ? Math.min(Number(limit), 1000) : 300;

      const viajes = await prisma.viaje.findMany({
        where: whereClause,
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              email: true
            }
          },
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              numeroChofer: true,
              telefono: true,
              vehiculo: {
                select: {
                  id: true,
                  patente: true,
                  marca: true,
                  modelo: true
                }
              }
            }
          },
          vehiculo: {
            select: {
              id: true,
              patente: true,
              marca: true,
              modelo: true
            }
          },
          artEmpresa: true
        },
        orderBy: {
          fecha: 'desc'
        },
        take
      });

      res.json({
        success: true,
        data: viajes
      });
    } catch (error) {
      console.error('Error getting viajes historial:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener viajes sin asignar
  async getViajesSinAsignar(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const viajes = await prisma.viaje.findMany({
        where: {
          estado: 'PENDIENTE',
          OR: [
            { remiseriaId: coordinador.remiseriaId },
            { clienteId: { not: null } }
          ]
        },
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              email: true
            }
          },
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              vehiculo: true
            }
          },
          vehiculo: true,
          artEmpresa: {
            select: {
              id: true,
              nombre: true
            }
          }
        },
        orderBy: {
          fecha: 'asc'
        }
      });

      res.json({
        success: true,
        data: viajes
      });
    } catch (error) {
      console.error('Error getting viajes sin asignar:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Asignar chofer y vehículo a un viaje pendiente
  async asignarViaje(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const { id } = req.params;
      const { choferId, vehiculoId } = req.body;

      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      if (!choferId) {
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar un chofer para asignar el viaje'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const viaje = await prisma.viaje.findUnique({
        where: { id },
        include: { cliente: true }
      });

      if (!viaje) {
        return res.status(404).json({
          success: false,
          message: 'Viaje no encontrado'
        });
      }

      const chofer = await prisma.chofer.findUnique({
        where: { id: choferId },
        include: { vehiculo: true }
      });

      if (!chofer) {
        return res.status(404).json({
          success: false,
          message: 'Chofer no encontrado'
        });
      }

      const finalVehiculoId = vehiculoId || chofer.vehiculoId || null;

      // Si el chofer no tenía ese vehículo asociado y se eligió uno, opcionalmente lo vinculamos al viaje
      const updatedViaje = await prisma.viaje.update({
        where: { id },
        data: {
          choferId: chofer.id,
          vehiculoId: finalVehiculoId,
          remiseriaId: coordinador.remiseriaId,
          estado: 'ACEPTADO',
          clienteNombre: viaje.clienteNombre || (viaje.cliente ? `${viaje.cliente.nombre} ${viaje.cliente.apellido}` : undefined),
          clienteTelefono: viaje.clienteTelefono || viaje.cliente?.telefono || undefined,
          clienteEmail: viaje.clienteEmail || viaje.cliente?.email || undefined
        },
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              email: true
            }
          },
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              vehiculo: {
                select: {
                  id: true,
                  patente: true,
                  marca: true,
                  modelo: true,
                  color: true
                }
              }
            }
          },
          vehiculo: {
            select: {
              id: true,
              patente: true,
              marca: true,
              modelo: true,
              color: true
            }
          }
        }
      });

      await prisma.appUsage.create({
        data: {
          userId: coordinadorId,
          userEmail: coordinador.email,
          action: 'ASSIGN_VIAJE',
          details: JSON.stringify({
            viajeId: updatedViaje.id,
            choferId: chofer.id,
            vehiculoId: finalVehiculoId
          }),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null
        }
      });

      // Al asignarle un viaje inmediato desde la central, sacarlo de la Tabla de espera
      // (si es un viaje programado de ART, mantenerlo en la Tabla para que siga recibiendo viajes normales)
      if (chofer.enParadaVirtual && !viaje.artEmpresaId) {
        await prisma.chofer.update({
          where: { id: chofer.id },
          data: { enParadaVirtual: false, paradaVirtualIngreso: null }
        });
      }

      const vehAsignado = updatedViaje.vehiculo || updatedViaje.chofer?.vehiculo;
      const nombreChoferAsignado = `${chofer.nombre} ${chofer.apellido}`.trim();
      const marcaAsignada = vehAsignado?.marca || 'Vehículo';
      const modeloAsignado = vehAsignado?.modelo || '';
      const colorAsignado = vehAsignado?.color || 'Color a confirmar';
      const patenteAsignada = vehAsignado?.patente || 'En trámite';
      const autoDescAsignado = `${marcaAsignada} ${modeloAsignado} - Color ${colorAsignado} (Patente ${patenteAsignada})`.trim();

      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        if (io) {
          io.to(coordinador.remiseriaId).emit('viaje_asignado_directo', {
            choferId: chofer.id,
            viaje: updatedViaje
          });
          io.to(coordinador.remiseriaId).emit('viaje_estado_actualizado', {
            viajeId: updatedViaje.id,
            estado: 'ACEPTADO',
            mensaje: `¡Tu viaje fue aceptado por ${nombreChoferAsignado}! Auto: ${autoDescAsignado}`,
            choferNombre: nombreChoferAsignado,
            vehiculo: {
              marca: marcaAsignada,
              modelo: modeloAsignado,
              color: colorAsignado,
              patente: patenteAsignada,
            },
            viaje: updatedViaje
          });
        }
      } catch (sErr) {
        console.warn('Socket asignarViaje warning:', sErr);
      }

      // Notificación inmediata al cliente por WhatsApp
      const telCli = updatedViaje.clienteTelefono || updatedViaje.cliente?.telefono;
      if (telCli) {
        try {
          const { whatsappService } = await import('../services/whatsappService');
          const msgWhatsApp =
            `🚕 *¡TU VIAJE FUE ACEPTADO!*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `👤 *Chofer:* ${nombreChoferAsignado}\n` +
            `🚗 *Auto:* ${marcaAsignada} ${modeloAsignado}\n` +
            `🎨 *Color:* ${colorAsignado}\n` +
            `🔢 *Patente:* *${patenteAsignada}*\n` +
            `━━━━━━━━━━━━━━━━━━━\n` +
            `📍 *Origen:* ${updatedViaje.origen}\n` +
            `${updatedViaje.codigoPin ? `🔒 *PIN de seguridad:* *${updatedViaje.codigoPin}*\n\n` : '\n'}` +
            `El conductor ya se encuentra en camino hacia tu ubicación. Te avisaremos en cuanto esté en la puerta.`;

          await whatsappService.enviarTexto(telCli, msgWhatsApp);
        } catch (waErr) {
          console.warn('Aviso envío WhatsApp viaje asignado coordinatorDashboardController:', waErr);
        }
      }

      // Notificación Push nativa al chofer asignado (para cuando tiene la app cerrada o bloqueada)
      try {
        const { pushNotificationService } = await import('../services/pushNotificationService');
        const pasajero = updatedViaje.clienteNombre || 'Pasajero';
        pushNotificationService.enviarAChofer(chofer.id, {
          title: '🚕 ¡Viaje asignado por Central!',
          body: `${pasajero} en ${updatedViaje.origen} ➔ ${updatedViaje.destino}`,
          url: '/chofer/app',
          tag: `viaje-asignado-${updatedViaje.id}`,
          data: { viajeId: updatedViaje.id },
        }).catch((e) => console.warn('Push error asignar viaje:', e));

        // Notificación Push nativa al cliente en su celular bloqueado
        if (updatedViaje.clienteId) {
          const vehiculo = updatedViaje.vehiculo;
          const autoStr = vehiculo ? ` (${vehiculo.marca} ${vehiculo.modelo} - ${vehiculo.patente})` : '';
          pushNotificationService.enviarACliente(updatedViaje.clienteId, {
            title: '🚕 ¡Chofer asignado!',
            body: `${chofer.nombre || 'Un chofer'}${autoStr} fue asignado a tu viaje y va en camino.`,
            url: '/cliente/app',
            tag: `asignado-${updatedViaje.id}`,
            data: { viajeId: updatedViaje.id },
          }).catch((e) => console.warn('Push error cliente asignar viaje:', e));
        }

        // Notificación automática por WhatsApp al pasajero
        try {
          const { whatsappBotService } = await import('../services/whatsappBotService');
          whatsappBotService.notificarCambioEstadoPasajero(updatedViaje, 'ACEPTADO').catch(() => {});
        } catch {}
      } catch (pErr) {
        console.warn('Push error asignar viaje:', pErr);
      }

      res.json({
        success: true,
        data: updatedViaje,
        message: 'Auto y chofer asignados exitosamente'
      });
    } catch (error) {
      console.error('Error asignando viaje:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor al asignar el viaje'
      });
    }
  },

  // Actualizar estado de un viaje (EN_CAMINO, EN_CURSO, COMPLETADO, CANCELADO)
  async actualizarEstadoViaje(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const { id } = req.params;
      const { estado } = req.body;

      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const estadosValidos = ['PENDIENTE', 'ACEPTADO', 'EN_CAMINO', 'EN_CURSO', 'COMPLETADO', 'CANCELADO'];
      if (!estado || !estadosValidos.includes(estado)) {
        return res.status(400).json({
          success: false,
          message: 'Estado de viaje inválido'
        });
      }

      const updatedViaje = await prisma.viaje.update({
        where: { id },
        data: { estado },
        include: {
          cliente: true,
          chofer: true,
          vehiculo: true
        }
      });

      // Notificación automática por WhatsApp al pasajero según cambio de estado
      try {
        const { whatsappBotService } = await import('../services/whatsappBotService');
        whatsappBotService.notificarCambioEstadoPasajero(updatedViaje, estado).catch(() => {});
      } catch {}

      res.json({
        success: true,
        data: updatedViaje,
        message: `Estado del viaje actualizado a ${estado}`
      });
    } catch (error) {
      console.error('Error actualizando estado de viaje:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener viajes reservados
  async getViajesReservados(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      // Reservados muestra únicamente reservas de clientes particulares (excluye viajes/reservas de ART)
      const reservas = await prisma.reserva.findMany({
        where: {
          remiseriaId: coordinador.remiseriaId,
          estado: 'ACTIVA',
          artEmpresaId: null
        },
        include: {
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true
            }
          },
          vehiculo: {
            select: {
              id: true,
              patente: true,
              marca: true,
              modelo: true
            }
          }
        },
        orderBy: {
          fechaInicio: 'asc'
        }
      });

      res.json({
        success: true,
        data: reservas
      });
    } catch (error) {
      console.error('Error getting reservas:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Crear nuevo viaje
  async createViaje(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const {
        origen,
        destino,
        precio,
        fecha,
        clienteNombre,
        clienteTelefono,
        clienteEmail,
        clienteId,
        prioridad,
        origenDetallado,
        destinoDetallado,
        observaciones,
        choferId,
        vehiculoId,
        artEmpresaId,
        numeroSiniestro,
        metodoPago,
        preferenciaSexoChofer,
        conMascota,
        conSillaRuedas,
        cantidadPasajeros: rawCantidadPasajeros
      } = req.body;

      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      let metodoPagoFinal: 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE' = 'EFECTIVO';
      if (metodoPago === 'CUENTA_CORRIENTE' || metodoPago === 'TRANSFERENCIA' || metodoPago === 'EFECTIVO') {
        metodoPagoFinal = metodoPago;
      } else if (clienteId) {
        const cl = await prisma.cliente.findUnique({
          where: { id: clienteId },
          select: { cuentaCorrienteHabilitada: true }
        });
        if (cl?.cuentaCorrienteHabilitada) {
          metodoPagoFinal = 'CUENTA_CORRIENTE';
        }
      }

      let preferenciaSexoFinal = 'INDISTINTO';
      if (preferenciaSexoChofer === 'FEMENINO' || preferenciaSexoChofer === 'MASCULINO' || preferenciaSexoChofer === 'INDISTINTO') {
        preferenciaSexoFinal = preferenciaSexoChofer;
      } else if (clienteId) {
        const clPref = await prisma.cliente.findUnique({
          where: { id: clienteId },
          select: { preferenciaSexoChofer: true }
        });
        if (clPref?.preferenciaSexoChofer) {
          preferenciaSexoFinal = clPref.preferenciaSexoChofer;
        }
      }

      const { cantidadPasajeros, cantidadVehiculos } = calcularVehiculosPorPasajeros(rawCantidadPasajeros);

      const viaje = await prisma.viaje.create({
        data: {
          origen,
          destino,
          precio: parseFloat(precio) || 0,
          fecha: new Date(fecha),
          clienteNombre,
          clienteTelefono,
          clienteEmail,
          clienteId: clienteId || null,
          prioridad: prioridad || 'NORMAL',
          preferenciaSexoChofer: preferenciaSexoFinal,
          conMascota: Boolean(conMascota),
          conSillaRuedas: Boolean(conSillaRuedas),
          cantidadPasajeros,
          cantidadVehiculos,
          metodoPago: metodoPagoFinal,
          origenDetallado,
          destinoDetallado,
          observaciones,
          choferId: choferId || null,
          vehiculoId: vehiculoId || null,
          artEmpresaId: artEmpresaId || null,
          numeroSiniestro: numeroSiniestro ? String(numeroSiniestro).trim() : null,
          remiseriaId: coordinador.remiseriaId,
          estado: choferId ? 'ACEPTADO' : 'PENDIENTE'
        },
        include: {
          cliente: true,
          artEmpresa: true,
          chofer: true,
          vehiculo: true
        }
      });

      // Emitir socket en tiempo real para que los choferes reciban la oferta al instante
      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        if (io && !artEmpresaId && viaje.estado === 'PENDIENTE') {
          io.to(coordinador.remiseriaId).emit('nuevo_viaje_recibido', viaje);
        }
      } catch {}

      // Track the action
      await prisma.appUsage.create({
        data: {
          userId: coordinadorId,
          userEmail: coordinador.email,
          action: 'CREATE_VIAJE',
          details: JSON.stringify({ viajeId: viaje.id }),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null
        }
      });

      res.status(201).json({
        success: true,
        data: viaje,
        message: 'Viaje creado exitosamente'
      });
    } catch (error) {
      console.error('Error creating viaje:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Registrar cliente rápido (al vuelo)
  async createCliente(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const {
        nombre,
        apellido,
        dni,
        telefono,
        email,
        direccion
      } = req.body;

      if (!nombre || !apellido || !dni || !telefono || !direccion) {
        return res.status(400).json({
          success: false,
          message: 'Campos requeridos faltantes (nombre, apellido, dni, telefono, direccion)'
        });
      }

      const cleanDni = String(dni).replace(/\D/g, '');
      const cleanTel = String(telefono).replace(/\D/g, '');
      const cleanNombre = String(nombre).trim();
      const cleanApellido = String(apellido).trim();

      if (!/^\d{7,8}$/.test(cleanDni)) {
        return res.status(400).json({
          success: false,
          message: 'El DNI debe contener únicamente números (7 u 8 dígitos)'
        });
      }

      if (cleanNombre.length < 2 || !SOLO_LETRAS_REGEX.test(cleanNombre)) {
        return res.status(400).json({
          success: false,
          message: 'El nombre solo puede contener letras'
        });
      }

      if (cleanApellido.length < 2 || !SOLO_LETRAS_REGEX.test(cleanApellido)) {
        return res.status(400).json({
          success: false,
          message: 'El apellido solo puede contener letras'
        });
      }

      if (!/^\d{8,15}$/.test(cleanTel)) {
        return res.status(400).json({
          success: false,
          message: 'El teléfono debe contener únicamente números (al menos 8 dígitos)'
        });
      }

      // Verificar si ya existe un cliente con ese DNI
      const existingCliente = await prisma.cliente.findUnique({
        where: { dni: cleanDni }
      });

      if (existingCliente) {
        return res.status(400).json({
          success: false,
          message: 'El DNI ya está registrado en el sistema'
        });
      }

      // Generar email único si no se provee o verificar el existente
      let finalEmail = email;
      if (!finalEmail) {
        finalEmail = `${cleanDni}@appremises.com`;
      }

      const existingUser = await prisma.user.findUnique({
        where: { email: finalEmail }
      });

      if (existingUser) {
        finalEmail = `${cleanDni}-${Date.now()}@appremises.com`;
      }

      // Password por defecto
      const passwordHash = await bcrypt.hash('RemisDefault123!', 10);

      // Crear el registro de User
      const user = await prisma.user.create({
        data: {
          email: finalEmail,
          passwordHash,
          rol: 'CLIENTE',
          activo: true
        }
      });

      // Crear el registro de Cliente
      const cliente = await prisma.cliente.create({
        data: {
          nombre: cleanNombre,
          apellido: cleanApellido,
          dni: cleanDni,
          telefono: cleanTel,
          email: finalEmail,
          direccion,
          fechaNacimiento: new Date('1990-01-01'), // Fecha por defecto
          activo: true,
          userId: user.id
        }
      });

      res.status(201).json({
        success: true,
        data: cliente,
        message: 'Cliente registrado exitosamente'
      });
    } catch (error) {
      console.error('Error creating cliente:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Calcular precio estimado basado en origen, destino y tarifas de la remisería
  async calcularPrecio(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const { origen, destino, latOrigen, lonOrigen, latDestino, lonDestino, artEmpresaId, clienteId, esViajeLocal, cobrarDesdeBase } = req.body;

      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      if (!origen || !destino) {
        return res.status(400).json({
          success: false,
          message: 'Origen y destino son requeridos'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      let remiseriaActual = coordinador?.remiseria || null;
      const esDuenioSolicitante = req.user?.rol === 'DUENIO';

      if (!remiseriaActual && esDuenioSolicitante) {
        const duenio = await prisma.duenio.findUnique({
          where: { userId: coordinadorId },
          include: { remiserias: { include: { remiseria: true } } }
        });
        remiseriaActual = duenio?.remiserias?.[0]?.remiseria || null;
      }

      if (!remiseriaActual) {
        return res.status(404).json({
          success: false,
          message: 'Remisería no encontrada para el usuario'
        });
      }

      const rawValorKm = remiseriaActual?.valorKm;
      const rawBajadaBandera = remiseriaActual?.bajadaBandera;
      let valorKm = rawValorKm && rawValorKm > 0 ? rawValorKm : 1200;
      let bajadaBandera = rawBajadaBandera && rawBajadaBandera > 0 ? rawBajadaBandera : 3500;
      let artEmpresaAplicada: any = null;

      // Si se especificó una ART / Empresa:
      // CONFIDENCIALIDAD TOTAL: Al chofer y coordinador solo se les liquida:
      // O la tarifa especial acordada con el chofer, o la lista normal de precios.
      // El precio acordado entre el dueño y la ART nunca se divulga.
      let artObj: any = null;
      if (artEmpresaId) {
        const art = await prisma.artEmpresa.findUnique({
          where: { id: artEmpresaId }
        });
        if (art && art.activo) {
          artObj = art;
          artEmpresaAplicada = {
            id: art.id,
            nombre: art.nombre
          };
          if (art.pagaChoferTipo === 'PERSONALIZADO' && art.choferPrecioTramo && art.choferPrecioTramo > 0) {
            bajadaBandera = art.choferPrecioTramo;
            if (art.choferValorKm && art.choferValorKm > 0) {
              valorKm = art.choferValorKm;
            }
          }
          // Si pagaChoferTipo es 'LISTA_NORMAL', se mantiene la tarifa normal de la remisería
        }
      }

      // Si no es ART y viene un clienteId, verificar si el cliente tiene tarifa personalizada en su Cuenta Corriente (Similar a ART)
      let clienteTarifaAplicada: any = null;
      if (!artEmpresaId && clienteId) {
        const clienteObj = await prisma.cliente.findUnique({
          where: { id: clienteId }
        });
        if (clienteObj && clienteObj.cuentaCorrienteHabilitada && clienteObj.tipoTarifa === 'PERSONALIZADA') {
          clienteTarifaAplicada = {
            id: clienteObj.id,
            nombre: `${clienteObj.nombre} ${clienteObj.apellido}`,
            tipoTarifa: clienteObj.tipoTarifa,
            precioTramo: clienteObj.tarifaPrecioTramo,
            valorKm: clienteObj.tarifaValorKm
          };
          if (clienteObj.tarifaPrecioTramo && clienteObj.tarifaPrecioTramo > 0) {
            bajadaBandera = clienteObj.tarifaPrecioTramo;
          }
          if (clienteObj.tarifaValorKm && clienteObj.tarifaValorKm > 0) {
            valorKm = clienteObj.tarifaValorKm;
          }
        }
      }

      let distanciaKm = 0;
      let calculatedViaRoute = false;

      let finalLatOrigen = latOrigen ? parseFloat(latOrigen.toString()) : undefined;
      let finalLonOrigen = lonOrigen ? parseFloat(lonOrigen.toString()) : undefined;
      let finalLatDestino = latDestino ? parseFloat(latDestino.toString()) : undefined;
      let finalLonDestino = lonDestino ? parseFloat(lonDestino.toString()) : undefined;

      // Si faltan coordenadas pero tenemos los textos de las direcciones, geocodificamos automáticamente
      if ((!finalLatOrigen || !finalLonOrigen) && origen) {
        const geoO = await geocodeAddressInternal(origen);
        if (geoO) {
          finalLatOrigen = geoO.lat;
          finalLonOrigen = geoO.lon;
        }
      }

      if ((!finalLatDestino || !finalLonDestino) && destino && destino.toLowerCase() !== 'a convenir') {
        const geoD = await geocodeAddressInternal(destino);
        if (geoD) {
          finalLatDestino = geoD.lat;
          finalLonDestino = geoD.lon;
        }
      }

      // Si tenemos las coordenadas de origen y destino, calculamos por OSRM (con caché en memoria) o Haversine
      if (finalLatOrigen && finalLonOrigen && finalLatDestino && finalLonDestino) {
        const routeKey = `${finalLatOrigen.toFixed(4)},${finalLonOrigen.toFixed(4)}->${finalLatDestino.toFixed(4)},${finalLonDestino.toFixed(4)}`;
        const cachedRoute = osrmDistanceCache.get(routeKey);
        if (cachedRoute && cachedRoute.expiresAt > Date.now()) {
          distanciaKm = cachedRoute.distanceKm;
          calculatedViaRoute = true;
        } else {
          const rutaAsf = await calcularRutaAsfaltada(
            [
              { lat: finalLatOrigen, lon: finalLonOrigen },
              { lat: finalLatDestino, lon: finalLonDestino },
            ],
            { includeGeometry: false, timeoutMs: 2500 }
          );
          if (rutaAsf && rutaAsf.distanciaKm >= 0) {
            distanciaKm = rutaAsf.distanciaKm;
            calculatedViaRoute = true;
            if (osrmDistanceCache.size >= 1500) {
              const oldestKey = osrmDistanceCache.keys().next().value;
              if (oldestKey) osrmDistanceCache.delete(oldestKey);
            }
            osrmDistanceCache.set(routeKey, {
              distanceKm: distanciaKm,
              expiresAt: Date.now() + GEOCODE_CACHE_TTL_MS,
            });
          }
        }

        if (!calculatedViaRoute) {
          const distLineal = haversineDistanceKm(finalLatOrigen, finalLonOrigen, finalLatDestino, finalLonDestino);
          distanciaKm = Math.round(distLineal * 1.3 * 10) / 10;
          calculatedViaRoute = true;
        }
      }

      // Si el destino es "a convenir" o no se pudo geolocalizar, estimamos viaje urbano base
      if (!calculatedViaRoute) {
        if (!destino || destino.toLowerCase() === 'a convenir') {
          distanciaKm = 1.0;
        } else {
          distanciaKm = 2.5; // Distancia urbana estándar promedio
        }
      }

      const esLocalArt = Boolean(artObj && esViajeLocal === true);
      const usarDesdeBase = Boolean(cobrarDesdeBase === true);

      let distanciaFacturable = distanciaKm;
      let distBaseAOrigenKm = 0;
      let ajusteRemoto: any = { esOrigenRemoto: false, kmAproximacion: 0, distanciaFacturableKm: distanciaKm };

      if (!esLocalArt && usarDesdeBase && finalLatOrigen && finalLonOrigen) {
        // Cobrar desde la base hasta el destino (Base -> Origen + Origen -> Destino)
        const baseLat = typeof remiseriaActual?.latitud === 'number' ? remiseriaActual.latitud : DEFAULT_BASE_LAT;
        const baseLon = typeof remiseriaActual?.longitud === 'number' ? remiseriaActual.longitud : DEFAULT_BASE_LON;
        distBaseAOrigenKm = await calcularDistanciaRutaKm(baseLat, baseLon, finalLatOrigen, finalLonOrigen);
        distanciaFacturable = Math.round((distBaseAOrigenKm + distanciaKm) * 10) / 10;
        ajusteRemoto = {
          esOrigenRemoto: true,
          kmAproximacion: distBaseAOrigenKm,
          distanciaFacturableKm: distanciaFacturable
        };
      } else if (!esLocalArt) {
        // Ajuste automático por origen fuera del radio urbano de la base (ej. pasajero en Alberti pidiendo móvil desde Chivilcoy)
        ajusteRemoto = await calcularAjusteOrigenRemoto({
          distanciaViajeKm: distanciaKm,
          latOrigen: finalLatOrigen,
          lonOrigen: finalLonOrigen,
          latDestino: finalLatDestino,
          lonDestino: finalLonDestino,
          baseLat: remiseriaActual?.latitud,
          baseLon: remiseriaActual?.longitud,
        });
        distanciaFacturable = ajusteRemoto.distanciaFacturableKm;
      }

      if (artObj && !esLocalArt) {
        distanciaFacturable = redondearKmArt(distanciaFacturable);
      }

      let precioEstimado = bajadaBandera;
      if (artObj && esViajeLocal !== undefined) {
        if (esLocalArt) {
          // Viaje Local ART: tarifa fija independientemente de la distancia
          if (artObj.pagaChoferTipo === 'PERSONALIZADO' && artObj.choferPrecioTramo && artObj.choferPrecioTramo > 0) {
            precioEstimado = artObj.choferPrecioTramo;
          } else {
            precioEstimado = bajadaBandera;
          }
        } else {
          // Viaje NO Local ART: se cobra por km recorrido redondeado (>0.5 arriba, <=0.5 abajo)
          if (artObj.pagaChoferTipo === 'PERSONALIZADO' && artObj.choferValorKm && artObj.choferValorKm > 0) {
            precioEstimado = Math.round(distanciaFacturable * artObj.choferValorKm);
          } else {
            precioEstimado = Math.round(distanciaFacturable * valorKm);
          }
        }
      } else {
        // Fórmula estándar de remisería:
        // - < 15 km (o tarifa personalizada de cliente): bajada de bandera + (km - 1) * valorKm
        // - >= 15 km (tarifa normal): km * valorKmRuta (sin bajada de bandera)
        const esTarifaPersonalizadaCliente = Boolean(
          clienteTarifaAplicada && clienteTarifaAplicada.tipoTarifa === 'PERSONALIZADA'
        );
        const { precio: precioNormal } = calcularPrecioTarifaNormal({
          distanciaFacturableKm: distanciaFacturable,
          bajadaBandera,
          valorKm,
          valorKmRuta: remiseriaActual?.valorKmRuta,
          esTarifaPersonalizada: esTarifaPersonalizadaCliente,
        });
        const minimoAnillo = calcularMinimoPorAnillo({
          latOrigen: finalLatOrigen,
          lonOrigen: finalLonOrigen,
          baseLat: remiseriaActual?.latitud,
          baseLon: remiseriaActual?.longitud,
          bajadaBandera,
          anillo2RadioKm: remiseriaActual?.anillo2RadioKm,
          anillo2RecargoPorcentaje: remiseriaActual?.anillo2RecargoPorcentaje,
          anillo3RadioKm: remiseriaActual?.anillo3RadioKm,
          anillo3RecargoPorcentaje: remiseriaActual?.anillo3RecargoPorcentaje,
          esTarifaPersonalizada: esTarifaPersonalizadaCliente,
        });
        precioEstimado = Math.max(precioNormal, minimoAnillo.precioMinimo);
      }

      const tienePeajes = detectarPeajesEnRecorrido({
        latOrigen: finalLatOrigen,
        lonOrigen: finalLonOrigen,
        latDestino: finalLatDestino,
        lonDestino: finalLonDestino,
        distanciaKm: distanciaFacturable,
      });

      // Precio confidencial ART (solo se devuelve al DUENIO)
      let precioArtEstimado: number | undefined = undefined;
      if (esDuenioSolicitante && artObj) {
        precioArtEstimado = esLocalArt
          ? (artObj.precioTramo || 0)
          : Math.round(distanciaFacturable * (artObj.valorKm || 0));
      }

      res.json({
        success: true,
        data: {
          origen,
          destino,
          distanciaKm: distanciaFacturable,
          distanciaViajeKm: distanciaKm,
          distBaseAOrigenKm,
          esViajeLocal: esLocalArt,
          cobrarDesdeBase: usarDesdeBase,
          esOrigenRemoto: ajusteRemoto.esOrigenRemoto,
          kmAproximacion: ajusteRemoto.kmAproximacion,
          precio: precioEstimado,
          precioEstimado,
          precioSugerido: precioEstimado,
          ...(precioArtEstimado !== undefined ? { precioArtEstimado } : {}),
          bajadaBandera,
          valorKm,
          valorKmRuta: remiseriaActual?.valorKmRuta || 900,
          tienePeajes,
          calculatedViaRoute,
          artEmpresa: artEmpresaAplicada,
          esTarifaArt: !!artEmpresaAplicada,
          coords: {
            origen: finalLatOrigen && finalLonOrigen ? { lat: finalLatOrigen, lon: finalLonOrigen } : null,
            destino: finalLatDestino && finalLonDestino ? { lat: finalLatDestino, lon: finalLonDestino } : null
          }
        }
      });
    } catch (error) {
      console.error('Error al calcular precio estimado:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Geocodificación de direcciones usando OpenStreetMap Nominatim (con caché en memoria y deduplicación para hora pico)
  async geocode(req: Request, res: Response) {
    try {
      const { q } = req.query;
      if (!q) {
        return res.status(400).json({
          success: false,
          message: 'Query es requerido'
        });
      }

      const data = await searchNominatimCached(q as string, 5);

      res.json({
        success: true,
        data
      });
    } catch (error) {
      console.error('Error en geocodificación:', error);
      res.status(500).json({
        success: false,
        message: 'Error al buscar direcciones en el mapa'
      });
    }
  },

  // Crear nueva reserva
  async createReserva(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const {
        clienteNombre,
        clienteTelefono,
        clienteEmail,
        origen,
        destino,
        fechaInicio,
        fechaFin,
        horaInicio,
        horaFin,
        diasSemana,
        tipo,
        observaciones,
        preferenciaSexoChofer,
        conMascota,
        conSillaRuedas,
        cantidadPasajeros: rawCantidadPasajeros
      } = req.body;

      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const { cantidadPasajeros: cantPasReserva, cantidadVehiculos: cantVehReserva } = calcularVehiculosPorPasajeros(req.body.cantidadPasajeros);

      const reserva = await prisma.reserva.create({
        data: {
          clienteNombre,
          clienteTelefono,
          clienteEmail,
          origen,
          destino,
          fechaInicio: new Date(fechaInicio),
          fechaFin: fechaFin ? new Date(fechaFin) : null,
          horaInicio,
          horaFin,
          diasSemana: diasSemana ? JSON.stringify(diasSemana) : null,
          tipo: tipo || 'UNICA',
          preferenciaSexoChofer:
            preferenciaSexoChofer === 'FEMENINO' || preferenciaSexoChofer === 'MASCULINO'
              ? preferenciaSexoChofer
              : 'INDISTINTO',
          conMascota: Boolean(conMascota),
          conSillaRuedas: Boolean(conSillaRuedas),
          cantidadPasajeros: cantPasReserva,
          cantidadVehiculos: cantVehReserva,
          observaciones,
          remiseriaId: coordinador.remiseriaId,
          estado: 'ACTIVA'
        }
      });

      // Track the action
      await prisma.appUsage.create({
        data: {
          userId: coordinadorId,
          userEmail: coordinador.email,
          action: 'CREATE_RESERVA',
          details: JSON.stringify({ reservaId: reserva.id }),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null
        }
      });

      res.status(201).json({
        success: true,
        data: reserva,
        message: 'Reserva creada exitosamente'
      });
    } catch (error) {
      console.error('Error creating reserva:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Actualizar reserva existente
  async updateReserva(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const { id } = req.params;
      const {
        clienteNombre,
        clienteTelefono,
        clienteEmail,
        origen,
        destino,
        fechaInicio,
        fechaFin,
        horaInicio,
        horaFin,
        diasSemana,
        tipo,
        observaciones,
        preferenciaSexoChofer,
        conMascota,
        conSillaRuedas,
        cantidadPasajeros: rawCantidadPasajeros
      } = req.body;

      if (!coordinadorId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId }
      });

      let remiseriaIdScope: string | null = coordinador?.remiseriaId || null;
      if (!remiseriaIdScope && req.user?.rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId: coordinadorId },
          include: { remiserias: { select: { remiseriaId: true } } }
        });
        remiseriaIdScope = duenio?.remiserias?.[0]?.remiseriaId || null;
      }

      if (!remiseriaIdScope) {
        return res.status(404).json({ success: false, message: 'Usuario sin remisería asociada' });
      }

      const existente = await prisma.reserva.findFirst({
        where: { id, remiseriaId: remiseriaIdScope }
      });

      if (!existente) {
        return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
      }

      const pasajerosUpdate =
        rawCantidadPasajeros !== undefined
          ? calcularVehiculosPorPasajeros(rawCantidadPasajeros)
          : null;

      const reservaActualizada = await prisma.reserva.update({
        where: { id },
        data: {
          ...(clienteNombre !== undefined ? { clienteNombre } : {}),
          ...(clienteTelefono !== undefined ? { clienteTelefono } : {}),
          ...(clienteEmail !== undefined ? { clienteEmail } : {}),
          ...(origen !== undefined ? { origen } : {}),
          ...(destino !== undefined ? { destino } : {}),
          ...(fechaInicio ? { fechaInicio: new Date(fechaInicio) } : {}),
          fechaFin: fechaFin ? new Date(fechaFin) : null,
          ...(horaInicio !== undefined ? { horaInicio } : {}),
          horaFin: horaFin || null,
          diasSemana: diasSemana ? JSON.stringify(diasSemana) : null,
          ...(tipo !== undefined ? { tipo } : {}),
          ...(pasajerosUpdate && !pasajerosUpdate.error
            ? {
                cantidadPasajeros: pasajerosUpdate.cantidadPasajeros,
                cantidadVehiculos: pasajerosUpdate.cantidadVehiculos,
              }
            : {}),
          observaciones: observaciones ?? null,
        }
      });

      res.json({
        success: true,
        data: reservaActualizada,
        message: 'Reserva actualizada exitosamente'
      });
    } catch (error) {
      console.error('Error updating reserva:', error);
      res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  // Eliminar / cancelar reserva
  async deleteReserva(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const { id } = req.params;

      if (!coordinadorId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId }
      });

      let remiseriaIdScope: string | null = coordinador?.remiseriaId || null;
      if (!remiseriaIdScope && req.user?.rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId: coordinadorId },
          include: { remiserias: { select: { remiseriaId: true } } }
        });
        remiseriaIdScope = duenio?.remiserias?.[0]?.remiseriaId || null;
      }

      if (!remiseriaIdScope) {
        return res.status(404).json({ success: false, message: 'Usuario sin remisería asociada' });
      }

      const existente = await prisma.reserva.findFirst({
        where: { id, remiseriaId: remiseriaIdScope }
      });

      if (!existente) {
        return res.status(404).json({ success: false, message: 'Reserva no encontrada' });
      }

      await prisma.reserva.update({
        where: { id },
        data: { estado: 'CANCELADA' }
      });

      res.json({
        success: true,
        message: 'Reserva eliminada exitosamente'
      });
    } catch (error) {
      console.error('Error deleting reserva:', error);
      res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  // Obtener vehículos en tiempo real
  async getVehiculosTiempoReal(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const parseEnPausa = (obs?: string | null): boolean => {
        if (!obs || !obs.startsWith('{')) return false;
        try {
          const parsed = JSON.parse(obs);
          return Boolean(parsed?.enPausa);
        } catch {
          return false;
        }
      };

      const vehiculos = await prisma.vehiculo.findMany({
        where: {
          remiseriaId: coordinador.remiseriaId,
          estado: 'ACTIVO'
        },
        include: {
          choferes: {
            where: { estado: 'ACTIVO' },
            select: {
              id: true,
              numeroChofer: true,
              nombre: true,
              apellido: true,
              telefono: true,
              isOnline: true,
              esFranquero: true,
              observaciones: true,
              turnos: {
                where: { activo: true },
                select: { id: true }
              }
            }
          }
        }
      });

      // También traer choferes activos con turno activo/pausado y sin vehículo asignado
      const choferesSinVehiculo = await prisma.chofer.findMany({
        where: {
          remiseriaId: coordinador.remiseriaId,
          estado: 'ACTIVO',
          vehiculoId: null,
          OR: [
            { isOnline: true },
            { turnos: { some: { activo: true } } }
          ]
        },
        include: {
          turnos: {
            where: { activo: true },
            select: { id: true }
          }
        }
      });

      const viajesActivosFlota = await prisma.viaje.findMany({
        where: {
          remiseriaId: coordinador.remiseriaId,
          OR: [
            { estado: { in: ['EN_CAMINO', 'EN_CURSO'] } },
            { estado: 'ACEPTADO', artEmpresaId: null }
          ]
        },
        select: { choferId: true, vehiculoId: true }
      });
      const choferesEnViajeSet = new Set(viajesActivosFlota.map(v => v.choferId).filter(Boolean));
      const vehiculosEnViajeSet = new Set(viajesActivosFlota.map(v => v.vehiculoId).filter(Boolean));

      // Solo incluir vehículos que tengan al menos un chofer con turno activo o pausado (o en viaje)
      const vehiculosConEstado = vehiculos
        .map(v => {
          const choferesActivosEnTurno = (v.choferes || []).filter(
            c => c.isOnline || (c.turnos && c.turnos.length > 0) || choferesEnViajeSet.has(c.id)
          );
          if (choferesActivosEnTurno.length === 0 && !vehiculosEnViajeSet.has(v.id)) {
            return null;
          }

          // Priorizar el chofer que actualmente está operando este vehículo compartido:
          // 1) En viaje activo, 2) Online ahora (no pausado), 3) Online en pausa / turno activo, 4) Titular
          const choferesOrdenados = [...choferesActivosEnTurno].sort((a, b) => {
            const score = (c: typeof a) =>
              (choferesEnViajeSet.has(c.id) ? 8 : 0) +
              (c.isOnline && !parseEnPausa(c.observaciones) ? 4 : 0) +
              (c.isOnline || (c.turnos && c.turnos.length > 0) ? 2 : 0) +
              (!c.esFranquero ? 1 : 0);
            return score(b) - score(a);
          });
          const choferAsig = choferesOrdenados[0];
          const estaEnViaje =
            vehiculosEnViajeSet.has(v.id) ||
            choferesOrdenados.some(c => choferesEnViajeSet.has(c.id));
          const estaEnPausa = choferAsig ? parseEnPausa(choferAsig.observaciones) : false;

          return {
            ...v,
            choferes: choferesOrdenados,
            choferActivo: choferAsig || null,
            enViaje: Boolean(estaEnViaje),
            enPausa: Boolean(!estaEnViaje && estaEnPausa),
            estadoOperativo: estaEnViaje ? 'en_viaje' : (estaEnPausa ? 'en_pausa' : 'disponible')
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      const choferesMapeados = choferesSinVehiculo.map(c => {
        const estaEnViaje = choferesEnViajeSet.has(c.id);
        const estaEnPausa = !estaEnViaje && parseEnPausa(c.observaciones);
        return {
          id: c.id,
          patente: 'Auto Propio',
          marca: 'Chofer',
          modelo: 'Móvil',
          anio: 2024,
          color: 'Azul',
          tipo: 'Auto',
          capacidad: 4,
          estado: 'ACTIVO' as const,
          enViaje: Boolean(estaEnViaje),
          enPausa: Boolean(estaEnPausa),
          estadoOperativo: estaEnViaje ? 'en_viaje' : (estaEnPausa ? 'en_pausa' : 'disponible'),
          propietario: `${c.nombre} ${c.apellido}`,
          latitud: null,
          longitud: null,
          ultimaUbicacion: null,
          remiseriaId: coordinador.remiseriaId,
          observaciones: estaEnViaje ? 'En viaje activo' : (estaEnPausa ? 'Turno en pausa' : 'Chofer conectado'),
          choferes: [{
            id: c.id,
            nombre: c.nombre,
            apellido: c.apellido,
            telefono: c.telefono,
            isOnline: c.isOnline
          }]
        };
      });

      res.json({
        success: true,
        data: [...vehiculosConEstado, ...choferesMapeados],
        remiseria: coordinador.remiseria ? {
          id: coordinador.remiseria.id,
          nombreFantasia: coordinador.remiseria.nombreFantasia,
          razonSocial: coordinador.remiseria.razonSocial,
          cuit: coordinador.remiseria.cuit,
          direccion: coordinador.remiseria.direccion,
          telefono: coordinador.remiseria.telefono,
          latitud: coordinador.remiseria.latitud,
          longitud: coordinador.remiseria.longitud,
        } : null
      });
    } catch (error) {
      console.error('Error getting vehiculos tiempo real:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener los datos y ubicación de la remisería del coordinador
  async getMiRemiseria(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador || !coordinador.remiseria) {
        return res.status(404).json({
          success: false,
          message: 'Remisería no encontrada para este coordinador'
        });
      }

      res.json({
        success: true,
        data: coordinador.remiseria
      });
    } catch (error) {
      console.error('Error getting mi remiseria:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener choferes en tiempo real
  async getChoferesTiempoReal(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const hoyInicio = new Date();
      hoyInicio.setHours(0, 0, 0, 0);
      const hoyFin = new Date();
      hoyFin.setHours(23, 59, 59, 999);

      const [choferes, viajesEnCurso, viajesArtHoy] = await Promise.all([
        prisma.chofer.findMany({
          where: {
            remiseriaId: coordinador.remiseriaId,
            estado: 'ACTIVO',
            isOnline: true
          },
          include: {
            vehiculo: {
              select: {
                id: true,
                patente: true,
                marca: true,
                modelo: true
              }
            }
          },
          orderBy: [
            { paradaVirtualIngreso: 'asc' },
            { updatedAt: 'asc' }
          ]
        }),
        prisma.viaje.findMany({
          where: {
            remiseriaId: coordinador.remiseriaId,
            choferId: { not: null },
            OR: [
              { estado: { in: ['EN_CAMINO', 'EN_CURSO'] } },
              { estado: 'ACEPTADO', artEmpresaId: null }
            ]
          },
          select: { choferId: true }
        }),
        prisma.viaje.findMany({
          where: {
            remiseriaId: coordinador.remiseriaId,
            artEmpresaId: { not: null },
            choferId: { not: null },
            estado: { in: ['ACEPTADO', 'EN_CAMINO', 'EN_CURSO', 'PENDIENTE'] },
            fecha: { gte: hoyInicio, lte: hoyFin }
          },
          include: {
            artEmpresa: { select: { nombre: true } }
          }
        })
      ]);

      const viajesArtPorChoferMap = new Map<string, any>();
      for (const va of viajesArtHoy) {
        if (va.choferId && !viajesArtPorChoferMap.has(va.choferId)) {
          viajesArtPorChoferMap.set(va.choferId, va);
        }
      }

      const choferesOcupadosSet = new Set(viajesEnCurso.map(v => v.choferId));
      const choferesEnriquecidos = choferes.map(c => {
        const tieneViaje = choferesOcupadosSet.has(c.id);
        const viajeArt = viajesArtPorChoferMap.get(c.id);
        let enPausa = false;
        try {
          if (c.observaciones && c.observaciones.startsWith('{')) {
            enPausa = Boolean(JSON.parse(c.observaciones).enPausa);
          }
        } catch {}
        return {
          ...c,
          estado: tieneViaje ? 'en_viaje' : (enPausa ? 'en_pausa' : 'disponible'),
          enParadaVirtual: tieneViaje ? false : c.enParadaVirtual,
          comprometidoArt: Boolean(viajeArt),
          proximoViajeArt: viajeArt ? {
            id: viajeArt.id,
            artNombre: viajeArt.artEmpresa?.nombre || 'ART / Empresa',
            horaSalidaChofer: viajeArt.horaSalidaChofer || '08:00',
            horaTurno: viajeArt.horaTurno || '10:00',
            origen: viajeArt.origen,
            destino: viajeArt.destino,
            clienteNombre: viajeArt.clienteNombre,
            numeroSiniestro: viajeArt.numeroSiniestro
          } : null
        };
      });

      res.json({
        success: true,
        data: choferesEnriquecidos
      });
    } catch (error) {
      console.error('Error getting choferes tiempo real:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener estadísticas del dashboard
  async getDashboardStats(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const [
        viajesEnCurso,
        viajesSinAsignar,
        reservasActivas,
        totalVehiculos,
        totalChoferes,
        viajesFinalizados,
        viajesCancelados
      ] = await Promise.all([
        prisma.viaje.count({
          where: {
            remiseriaId: coordinador.remiseriaId,
            OR: [
              { estado: { in: ['EN_CAMINO', 'EN_CURSO'] } },
              { estado: 'ACEPTADO', artEmpresaId: null }
            ]
          }
        }),
        prisma.viaje.count({
          where: {
            estado: 'PENDIENTE',
            artEmpresaId: null,
            OR: [
              { remiseriaId: coordinador.remiseriaId },
              { clienteId: { not: null } }
            ]
          }
        }),
        prisma.reserva.count({
          where: {
            remiseriaId: coordinador.remiseriaId,
            estado: 'ACTIVA',
            artEmpresaId: null
          }
        }),
        prisma.vehiculo.count({
          where: {
            remiseriaId: coordinador.remiseriaId,
            estado: 'ACTIVO'
          }
        }),
        prisma.chofer.count({
          where: {
            remiseriaId: coordinador.remiseriaId,
            estado: 'ACTIVO'
          }
        }),
        prisma.viaje.count({
          where: {
            remiseriaId: coordinador.remiseriaId,
            estado: 'COMPLETADO'
          }
        }),
        prisma.viaje.count({
          where: {
            remiseriaId: coordinador.remiseriaId,
            estado: 'CANCELADO'
          }
        })
      ]);

      res.json({
        success: true,
        data: {
          viajesEnCurso,
          viajesSinAsignar,
          reservasActivas,
          totalVehiculos,
          totalChoferes,
          viajesFinalizados,
          viajesCancelados,
          viajesHistorial: viajesFinalizados + viajesCancelados
        }
      });
    } catch (error) {
      console.error('Error getting dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener propuesta de despacho óptimo (Batch Matching)
  async getDespachoOptimo(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const optimizacion = await batchDispatchService.calcularLoteOptimo(coordinador.remiseriaId);
      res.json(optimizacion);
    } catch (error) {
      console.error('Error al calcular lote óptimo:', error);
      res.status(500).json({
        success: false,
        message: 'Error al calcular lote de despacho óptimo'
      });
    }
  },

  // Aplicar las asignaciones de un lote óptimo
  async aplicarDespachoOptimo(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      if (!coordinadorId) {
        return res.status(401).json({
          success: false,
          message: 'Usuario no autenticado'
        });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId }
      });

      if (!coordinador) {
        return res.status(404).json({
          success: false,
          message: 'Coordinador no encontrado'
        });
      }

      const { matches } = req.body;
      if (!matches || !Array.isArray(matches) || matches.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe enviar un arreglo de asignaciones (matches) a aplicar'
        });
      }

      const resultado = await batchDispatchService.aplicarLote(
        coordinador.remiseriaId,
        matches,
        coordinadorId
      );

      res.json(resultado);
    } catch (error: any) {
      console.error('Error al aplicar lote óptimo:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Error al aplicar asignaciones en lote'
      });
    }
  },

  // 1. Búsqueda predictiva de pasajeros habituales por teléfono o nombre
  async searchClientesPredictivo(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const { q } = req.query;

      if (!coordinadorId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      if (!q || typeof q !== 'string' || q.trim().length < 2) {
        return res.json({ success: true, data: [] });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId }
      });

      let remiseriaIdScope: string | null = coordinador?.remiseriaId || null;
      if (!remiseriaIdScope && req.user?.rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId: coordinadorId },
          include: { remiserias: { select: { remiseriaId: true } } }
        });
        remiseriaIdScope = duenio?.remiserias?.[0]?.remiseriaId || null;
      }

      if (!remiseriaIdScope) {
        return res.status(404).json({ success: false, message: 'Usuario sin remisería asociada' });
      }

      const searchTerm = q.trim();

      const clientes = await prisma.cliente.findMany({
        where: {
          OR: [
            { telefono: { contains: searchTerm, mode: 'insensitive' } },
            { nombre: { contains: searchTerm, mode: 'insensitive' } },
            { apellido: { contains: searchTerm, mode: 'insensitive' } },
            { dni: { contains: searchTerm } }
          ]
        },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          telefono: true,
          email: true,
          direccion: true,
          observaciones: true,
          direccionesFrecuentes: true
        },
        take: 6
      });

      const clientesConHistorial = await Promise.all(
        clientes.map(async (c) => {
          const ultimosViajes = await prisma.viaje.findMany({
            where: {
              OR: [
                { clienteId: c.id },
                { clienteTelefono: c.telefono }
              ]
            },
            orderBy: { fecha: 'desc' },
            take: 3,
            select: {
              origen: true,
              destino: true,
              precio: true,
              fecha: true
            }
          });

          let lugaresFrecuentes: Array<{ alias: string; direccion: string; lat?: number; lon?: number }> = [];
          if (c.direccionesFrecuentes) {
            try {
              const parsed =
                typeof c.direccionesFrecuentes === 'string'
                  ? JSON.parse(c.direccionesFrecuentes)
                  : c.direccionesFrecuentes;
              if (Array.isArray(parsed)) {
                lugaresFrecuentes = parsed
                  .filter((d: any) => d && typeof d.direccion === 'string' && d.direccion.trim())
                  .map((d: any) => ({
                    alias: String(d.alias || 'Favorito').trim(),
                    direccion: String(d.direccion).trim(),
                    lat: d.lat !== undefined && !isNaN(Number(d.lat)) ? Number(d.lat) : undefined,
                    lon: d.lon !== undefined && !isNaN(Number(d.lon)) ? Number(d.lon) : undefined,
                  }));
              }
            } catch {}
          }

          const origenesHabituales = Array.from(new Set([
            ...lugaresFrecuentes.map((l) => l.direccion),
            ...(c.direccion ? [c.direccion] : []),
            ...ultimosViajes.map((v) => v.origen).filter(Boolean)
          ]));
          const destinosHabituales = Array.from(new Set([
            ...lugaresFrecuentes.map((l) => l.direccion),
            ...ultimosViajes.map((v) => v.destino).filter(Boolean)
          ]));

          return {
            ...c,
            nombreCompleto: `${c.nombre} ${c.apellido}`.trim(),
            lugaresFrecuentes,
            origenesHabituales,
            destinosHabituales,
            ultimoViaje: ultimosViajes[0] || null
          };
        })
      );

      res.json({
        success: true,
        data: clientesConHistorial
      });
    } catch (error) {
      console.error('Error buscando clientes predictivo:', error);
      res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  // 2. Carga ultrarrápida de viaje express telefónico (< 5s)
  async crearViajeExpress(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      if (!coordinadorId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({ success: false, message: 'Coordinador no encontrado' });
      }

      const {
        telefono,
        nombre,
        apellido,
        origen,
        destino,
        precio,
        choferId,
        vehiculoId,
        observaciones,
        prioridad,
        recargoTipo,
        recargoMonto,
        artEmpresaId,
        numeroSiniestro,
        preferenciaSexoChofer,
        conMascota,
        conSillaRuedas,
        cantidadPasajeros: rawCantidadPasajeros
      } = req.body;

      if (!telefono || !origen) {
        return res.status(400).json({
          success: false,
          message: 'Teléfono y dirección de origen son obligatorios'
        });
      }

      let clienteId: string | null = null;
      const cleanPhone = String(telefono).replace(/\D/g, '');
      if (cleanPhone.length < 7) {
        return res.status(400).json({
          success: false,
          message: 'Ingrese un teléfono numérico válido'
        });
      }
      const cleanNomExpress = nombre ? String(nombre).replace(/[^a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛãõÃÕçÇñÑ\s'´¨-]/g, '').trim() : '';
      const cleanApeExpress = apellido ? String(apellido).replace(/[^a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛãõÃÕçÇñÑ\s'´¨-]/g, '').trim() : '';

      let cliente = await prisma.cliente.findFirst({
        where: { telefono: cleanPhone }
      });

      if (!cliente && cleanNomExpress) {
        try {
          const dummyEmail = `cliente_${cleanPhone || Date.now()}@bruno.local`;
          const dummyDni = `TEL_${cleanPhone.slice(-8) || Date.now()}`;
          const bcrypt = await import('bcryptjs');
          const hashedPassword = await bcrypt.default.hash('123456', 10);

          const nuevoUser = await prisma.user.create({
            data: {
              email: dummyEmail,
              passwordHash: hashedPassword,
              rol: 'CLIENTE'
            }
          });

          cliente = await prisma.cliente.create({
            data: {
              userId: nuevoUser.id,
              nombre: cleanNomExpress,
              apellido: cleanApeExpress,
              dni: dummyDni,
              telefono: cleanPhone,
              email: dummyEmail,
              direccion: origen,
              fechaNacimiento: new Date('1990-01-01'),
              remiseriaId: coordinador.remiseriaId
            }
          });
          clienteId = cliente.id;
        } catch (errCliente) {
          console.warn('Aviso creación cliente rápido:', errCliente);
        }
      } else if (cliente) {
        clienteId = cliente.id;
      }

      let precioFinal = parseFloat(precio) || 0;
      if (precioFinal <= 0 && clienteId && !artEmpresaId) {
        const clienteCC = await prisma.cliente.findUnique({ where: { id: clienteId } });
        if (clienteCC && clienteCC.cuentaCorrienteHabilitada && clienteCC.tipoTarifa === 'PERSONALIZADA') {
          const bBandera = (clienteCC.tarifaPrecioTramo && clienteCC.tarifaPrecioTramo > 0) ? clienteCC.tarifaPrecioTramo : (coordinador.remiseria.bajadaBandera || 3500);
          const vKm = (clienteCC.tarifaValorKm && clienteCC.tarifaValorKm > 0) ? clienteCC.tarifaValorKm : (coordinador.remiseria.valorKm || 1200);
          const kmEst = parseFloat(req.body.distanciaKm) || 1.0;
          let pEst = bBandera;
          if (kmEst > 1) {
            pEst += (kmEst - 1) * vKm;
          }
          precioFinal = Math.round(pEst / 50) * 50;
        }
      }
      if (precioFinal <= 0) {
        precioFinal = coordinador.remiseria.bajadaBandera || 3500;
      }

      // El viaje siempre se crea como PENDIENTE para que el chofer lo acepte voluntariamente
      const estadoInicial = 'PENDIENTE';

      let choferVehiculoId = vehiculoId || null;
      if (choferId && !choferVehiculoId) {
        const choferEncontrado = await prisma.chofer.findUnique({
          where: { id: choferId },
          select: { vehiculoId: true }
        });
        choferVehiculoId = choferEncontrado?.vehiculoId || null;
      }

      // Cálculo del precio confidencial facturado a la ART
      // Regla ART:
      // - Si es viaje local (esViajeLocal === true): tarifa fija precioTramo (indistinta la distancia)
      // - Si NO es local (esViajeLocal === false): distanciaFacturable * valorKm (sin sumar tramo local)
      const esViajeLocalArt = req.body.esViajeLocal === true;
      const kmFacturableExpress = parseFloat(req.body.distanciaKm) || 0;
      let precioArtCalculado: number | null = null;
      if (artEmpresaId) {
        const art = await prisma.artEmpresa.findUnique({ where: { id: artEmpresaId } });
        if (art) {
          if (esViajeLocalArt) {
            precioArtCalculado = art.precioTramo || 0;
          } else {
            const kmEst = kmFacturableExpress > 0 ? kmFacturableExpress : 1.0;
            precioArtCalculado = Math.round(kmEst * (art.valorKm || 0));
          }
        }
      }

      const { cantidadPasajeros: cantPasExpress, cantidadVehiculos: cantVehExpress } = calcularVehiculosPorPasajeros(req.body.cantidadPasajeros);

      const nuevoViaje = await prisma.viaje.create({
        data: {
          remiseriaId: coordinador.remiseriaId,
          clienteId,
          clienteNombre: cleanNomExpress ? `${cleanNomExpress} ${cleanApeExpress}`.trim() : (cliente ? `${cliente.nombre} ${cliente.apellido}`.trim() : 'Pasajero Telefónico'),
          clienteTelefono: cleanPhone,
          origen: origen.trim(),
          destino: (destino || 'A convenir').trim(),
          distanciaKmConPasajero: kmFacturableExpress,
          precio: precioFinal,
          precioArt: precioArtCalculado,
          fecha: new Date(),
          estado: estadoInicial,
          observaciones: observaciones || null,
          prioridad: prioridad || 'NORMAL',
          preferenciaSexoChofer:
            preferenciaSexoChofer === 'FEMENINO' || preferenciaSexoChofer === 'MASCULINO' || preferenciaSexoChofer === 'INDISTINTO'
              ? preferenciaSexoChofer
              : (cliente?.preferenciaSexoChofer || 'INDISTINTO'),
          conMascota: Boolean(conMascota),
          conSillaRuedas: Boolean(conSillaRuedas),
          cantidadPasajeros: cantPasExpress,
          cantidadVehiculos: cantVehExpress,
          choferId: choferId || null,
          vehiculoId: choferVehiculoId,
          recargoTipo: null,
          recargoMonto: 0,
          artEmpresaId: artEmpresaId || null,
          numeroSiniestro: numeroSiniestro ? String(numeroSiniestro).trim() : null
        },
        include: {
          cliente: true,
          artEmpresa: {
            select: {
              id: true,
              nombre: true
            }
          },
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              vehiculo: true
            }
          },
          vehiculo: true
        }
      });

      await prisma.appUsage.create({
        data: {
          userId: coordinadorId,
          userEmail: coordinador.email,
          action: 'CREATE_VIAJE_EXPRESS',
          details: JSON.stringify({ viajeId: nuevoViaje.id, choferId, precio: precioFinal }),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null
        }
      });

      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        if (io) {
          io.to(coordinador.remiseriaId).emit('nuevo_viaje_recibido', nuevoViaje);
          io.to(coordinador.remiseriaId).emit('viaje_disponible', nuevoViaje);
          if (choferId) {
            io.to(coordinador.remiseriaId).emit('viaje_asignado_directo', {
              choferId,
              viaje: nuevoViaje
            });
            io.to(coordinador.remiseriaId).emit('viaje_estado_actualizado', {
              viajeId: nuevoViaje.id,
              estado: 'PENDIENTE',
              mensaje: 'Viaje ofrecido al chofer, pendiente de aceptación',
              viaje: nuevoViaje
            });
          }
        }
      } catch (socketErr) {
        console.warn('Aviso socket viaje express:', socketErr);
      }

      res.status(201).json({
        success: true,
        data: nuevoViaje,
        message: choferId ? 'Viaje despachado al móvil (pendiente de aceptación por el chofer)' : 'Viaje ingresado a la cola sin asignar'
      });
    } catch (error) {
      console.error('Error creando viaje express:', error);
      res.status(500).json({ success: false, message: 'Error al registrar viaje express' });
    }
  },

  // 3. Reasignación rápida de móvil en caliente (1 clic)
  async reasignarViaje(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      const { id } = req.params;
      const { nuevoChoferId, nuevoVehiculoId, motivo } = req.body;

      if (!coordinadorId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      if (!nuevoChoferId) {
        return res.status(400).json({ success: false, message: 'Debe seleccionar el nuevo chofer' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({ success: false, message: 'Coordinador no encontrado' });
      }

      const viaje = await prisma.viaje.findUnique({
        where: { id },
        include: { chofer: true, cliente: true }
      });

      if (!viaje) {
        return res.status(404).json({ success: false, message: 'Viaje no encontrado' });
      }

      const choferAnteriorId = viaje.choferId;

      const nuevoChofer = await prisma.chofer.findUnique({
        where: { id: nuevoChoferId },
        include: { vehiculo: true }
      });

      if (!nuevoChofer) {
        return res.status(404).json({ success: false, message: 'Nuevo chofer no encontrado' });
      }

      const finalVehiculoId = nuevoVehiculoId || nuevoChofer.vehiculoId || null;

      const viajeActualizado = await prisma.viaje.update({
        where: { id },
        data: {
          choferId: nuevoChofer.id,
          vehiculoId: finalVehiculoId,
          choferAnteriorId: choferAnteriorId || undefined,
          motivoReasignacion: motivo || 'Reasignación operativa por central',
          estado: 'ACEPTADO'
        },
        include: {
          cliente: true,
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              vehiculo: true
            }
          },
          vehiculo: true
        }
      });

      await prisma.appUsage.create({
        data: {
          userId: coordinadorId,
          userEmail: coordinador.email,
          action: 'REASSIGN_VIAJE',
          details: JSON.stringify({
            viajeId: id,
            choferAnteriorId,
            nuevoChoferId,
            motivo
          }),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null
        }
      });

      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        if (io) {
          if (choferAnteriorId) {
            io.to(coordinador.remiseriaId).emit('viaje_retirado_chofer', {
              choferId: choferAnteriorId,
              viajeId: id,
              motivo: motivo || 'Viaje reasignado a otro móvil por la central'
            });
          }

          io.to(coordinador.remiseriaId).emit('viaje_asignado_directo', {
            choferId: nuevoChofer.id,
            viaje: viajeActualizado
          });

          io.to(coordinador.remiseriaId).emit('viaje_estado_actualizado', {
            viajeId: id,
            estado: 'ACEPTADO',
            mensaje: `Viaje reasignado a ${nuevoChofer.nombre} ${nuevoChofer.apellido}`,
            viaje: viajeActualizado
          });

          io.to(coordinador.remiseriaId).emit('chofer_reasignado', {
            viajeId: id,
            nuevoChofer: {
              nombre: `${nuevoChofer.nombre} ${nuevoChofer.apellido}`,
              telefono: nuevoChofer.telefono,
              vehiculo: nuevoChofer.vehiculo ? `${nuevoChofer.vehiculo.marca} ${nuevoChofer.vehiculo.modelo} (${nuevoChofer.vehiculo.patente})` : 'Auto Asignado'
            }
          });
        }
      } catch (socketErr) {
        console.warn('Aviso socket reasignar viaje:', socketErr);
      }

      res.json({
        success: true,
        data: viajeActualizado,
        message: `Viaje reasignado con éxito a ${nuevoChofer.nombre} ${nuevoChofer.apellido}`
      });
    } catch (error) {
      console.error('Error al reasignar viaje:', error);
      res.status(500).json({ success: false, message: 'Error interno al reasignar el viaje' });
    }
  },

  // 4. Auditoría de cancelaciones
  async getAuditoriaCancelaciones(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      if (!coordinadorId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId }
      });

      let remiseriaIdScope: string | null = coordinador?.remiseriaId || null;
      if (!remiseriaIdScope && req.user?.rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId: coordinadorId },
          include: { remiserias: { select: { remiseriaId: true } } }
        });
        remiseriaIdScope = duenio?.remiserias?.[0]?.remiseriaId || null;
      }

      if (!remiseriaIdScope) {
        return res.status(404).json({ success: false, message: 'Usuario sin remisería asociada' });
      }

      const { fechaDesde, fechaHasta, canceladoPor } = req.query;

      const whereClause: any = {
        remiseriaId: remiseriaIdScope,
        estado: 'CANCELADO'
      };

      if (canceladoPor && typeof canceladoPor === 'string' && ['CLIENTE', 'CHOFER', 'COORDINADOR'].includes(canceladoPor.toUpperCase())) {
        whereClause.canceladoPor = canceladoPor.toUpperCase();
      }

      if (fechaDesde || fechaHasta) {
        whereClause.fecha = {};
        if (fechaDesde && typeof fechaDesde === 'string') {
          whereClause.fecha.gte = new Date(fechaDesde);
        }
        if (fechaHasta && typeof fechaHasta === 'string') {
          const hasta = new Date(fechaHasta);
          if (fechaHasta.length === 10) hasta.setHours(23, 59, 59, 999);
          whereClause.fecha.lte = hasta;
        }
      }

      const viajesCancelados = await prisma.viaje.findMany({
        where: whereClause,
        include: {
          cliente: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true
            }
          },
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              telefono: true,
              vehiculo: true
            }
          }
        },
        orderBy: {
          fecha: 'desc'
        },
        take: 300
      });

      const totalCancelados = viajesCancelados.length;
      const canceladosCliente = viajesCancelados.filter((v) => v.canceladoPor === 'CLIENTE').length;
      const canceladosChofer = viajesCancelados.filter((v) => v.canceladoPor === 'CHOFER').length;
      const canceladosCoordinador = viajesCancelados.filter((v) => v.canceladoPor === 'COORDINADOR' || !v.canceladoPor).length;
      const conCostoMinimo = viajesCancelados.filter((v) => v.debeAbonarMinimo || (v.costoCancelacion && v.costoCancelacion > 0)).length;
      const totalRecaudadoCancelaciones = viajesCancelados.reduce((acc, v) => acc + (v.costoCancelacion || 0), 0);

      const motivosConteo: Record<string, number> = {};
      viajesCancelados.forEach((v) => {
        const motivoKey = (v.motivoCancelacion || 'Sin motivo especificado').trim();
        motivosConteo[motivoKey] = (motivosConteo[motivoKey] || 0) + 1;
      });

      const rankingMotivos = Object.entries(motivosConteo)
        .map(([motivo, cantidad]) => ({ motivo, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

      res.json({
        success: true,
        data: {
          metricas: {
            totalCancelados,
            canceladosCliente,
            canceladosChofer,
            canceladosCoordinador,
            conCostoMinimo,
            totalRecaudadoCancelaciones,
            rankingMotivos
          },
          viajes: viajesCancelados
        }
      });
    } catch (error) {
      console.error('Error obteniendo auditoría de cancelaciones:', error);
      res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  // 5. Configuración de tarifas especiales (Lluvia, Nocturna, Feriado)
  async getConfiguracionTarifas(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      if (!coordinadorId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId },
        include: { remiseria: true }
      });

      if (!coordinador) {
        return res.status(404).json({ success: false, message: 'Coordinador no encontrado' });
      }

      const rem = coordinador.remiseria;
      res.json({
        success: true,
        data: {
          tarifaEspecialActiva: rem.tarifaEspecialActiva || 'NORMAL',
          porcentajeRecargoTarifa: rem.porcentajeRecargoTarifa || 0,
          bajadaBandera: rem.bajadaBandera || 3500,
          valorKm: rem.valorKm || 1200,
          valorHoraEspera: rem.valorHoraEspera || 12000
        }
      });
    } catch (error) {
      console.error('Error al obtener configuración de tarifas:', error);
      res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  async updateConfiguracionTarifas(req: AuthenticatedRequest, res: Response) {
    try {
      const coordinadorId = req.user?.id;
      if (!coordinadorId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId: coordinadorId }
      });

      let remiseriaIdScope: string | null = coordinador?.remiseriaId || null;
      if (!remiseriaIdScope && req.user?.rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId: coordinadorId },
          include: { remiserias: { select: { remiseriaId: true } } }
        });
        remiseriaIdScope = duenio?.remiserias?.[0]?.remiseriaId || null;
      }

      if (!remiseriaIdScope) {
        return res.status(404).json({ success: false, message: 'Usuario sin remisería asociada' });
      }

      const { tarifaEspecialActiva, porcentajeRecargoTarifa, bajadaBandera, valorKm, valorHoraEspera } = req.body;

      const dataToUpdate: any = {};
      if (tarifaEspecialActiva !== undefined) dataToUpdate.tarifaEspecialActiva = tarifaEspecialActiva;
      if (porcentajeRecargoTarifa !== undefined) dataToUpdate.porcentajeRecargoTarifa = parseFloat(porcentajeRecargoTarifa);
      if (bajadaBandera !== undefined) dataToUpdate.bajadaBandera = parseFloat(bajadaBandera);
      if (valorKm !== undefined) dataToUpdate.valorKm = parseFloat(valorKm);
      if (valorHoraEspera !== undefined) dataToUpdate.valorHoraEspera = parseFloat(valorHoraEspera);

      const updatedRemiseria = await prisma.remiseria.update({
        where: { id: remiseriaIdScope },
        data: dataToUpdate
      });

      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        if (io) {
          io.to(remiseriaIdScope).emit('tarifa_configuracion_actualizada', {
            tarifaEspecialActiva: updatedRemiseria.tarifaEspecialActiva,
            porcentajeRecargoTarifa: updatedRemiseria.porcentajeRecargoTarifa,
            bajadaBandera: updatedRemiseria.bajadaBandera,
            valorKm: updatedRemiseria.valorKm
          });
        }
      } catch (socketErr) {
        console.warn('Aviso socket tarifas:', socketErr);
      }

      res.json({
        success: true,
        data: updatedRemiseria,
        message: 'Configuración de tarifas actualizada exitosamente'
      });
    } catch (error) {
      console.error('Error actualizando tarifas:', error);
      res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  // 6. Estado de Atención de la Central (Abierta / En Pausa por Tormenta, Emergencia o Fiestas)
  async getEstadoAtencionCentral(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId },
        include: { remiseria: true }
      });

      let rem = coordinador?.remiseria || null;
      if (!rem) {
        rem = await prisma.remiseria.findFirst({ where: { estado: true } }) || await prisma.remiseria.findFirst();
      }

      if (!rem) {
        return res.status(404).json({ success: false, message: 'Remisería no encontrada' });
      }

      return res.json({
        success: true,
        data: {
          remiseriaId: rem.id,
          nombreFantasia: rem.nombreFantasia,
          agenciaAbierta: rem.agenciaAbierta !== false,
          mensajeCierre: rem.mensajeCierre || '',
          cierreAutomaticoFiestas: rem.cierreAutomaticoFiestas !== false,
          estadoOperativo: checkAgenciaEstado(rem)
        }
      });
    } catch (error) {
      console.error('Error obteniendo estado de atención de la central:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  async updateEstadoAtencionCentral(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const rol = req.user?.rol;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      if (rol !== 'COORDINADOR' && rol !== 'DUENIO' && rol !== 'ADMIN') {
        return res.status(403).json({ success: false, message: 'No autorizado' });
      }

      const coordinador = await prisma.coordinador.findFirst({
        where: { userId }
      });

      let targetRemiseriaId = coordinador?.remiseriaId || null;
      if (!targetRemiseriaId && rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId },
          include: { remiserias: true }
        });
        targetRemiseriaId = duenio?.remiserias?.[0]?.remiseriaId || null;
      }
      if (!targetRemiseriaId) {
        const remDefault = await prisma.remiseria.findFirst({ where: { estado: true } }) || await prisma.remiseria.findFirst();
        targetRemiseriaId = remDefault?.id || null;
      }

      if (!targetRemiseriaId) {
        return res.status(404).json({ success: false, message: 'Remisería no encontrada' });
      }

      const { agenciaAbierta, mensajeCierre, cierreAutomaticoFiestas } = req.body;
      const dataToUpdate: any = {};

      if (agenciaAbierta !== undefined) dataToUpdate.agenciaAbierta = Boolean(agenciaAbierta);
      if (mensajeCierre !== undefined) dataToUpdate.mensajeCierre = String(mensajeCierre);
      if (cierreAutomaticoFiestas !== undefined) dataToUpdate.cierreAutomaticoFiestas = Boolean(cierreAutomaticoFiestas);

      const updatedRemiseria = await prisma.remiseria.update({
        where: { id: targetRemiseriaId },
        data: dataToUpdate
      });

      // Emitir actualización en vivo a App de Clientes, Panel Dueño y otros Coordinadores
      try {
        const { getIO } = await import('../lib/socket');
        const io = getIO();
        if (io) {
          io.emit('agencia_estado_actualizado', {
            remiseriaId: updatedRemiseria.id,
            agenciaAbierta: updatedRemiseria.agenciaAbierta,
            mensajeCierre: updatedRemiseria.mensajeCierre,
            cierreAutomaticoFiestas: updatedRemiseria.cierreAutomaticoFiestas,
            estadoOperativo: checkAgenciaEstado(updatedRemiseria)
          });
        }
      } catch (socketErr) {
        console.warn('Aviso socket agencia_estado_actualizado:', socketErr);
      }

      return res.json({
        success: true,
        data: {
          remiseriaId: updatedRemiseria.id,
          agenciaAbierta: updatedRemiseria.agenciaAbierta,
          mensajeCierre: updatedRemiseria.mensajeCierre,
          cierreAutomaticoFiestas: updatedRemiseria.cierreAutomaticoFiestas,
          estadoOperativo: checkAgenciaEstado(updatedRemiseria)
        },
        message: updatedRemiseria.agenciaAbierta
          ? 'Central habilitada y recibiendo viajes'
          : 'Central puesta en pausa / cerrada temporalmente'
      });
    } catch (error) {
      console.error('Error actualizando estado de atención de la central:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  // Reportes y métricas simplificadas del coordinador: facturación y viajes por auto + picos por hora
  async getReportesMetricas(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const rol = req.user?.rol;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({ where: { userId } });
      let remiseriaId = coordinador?.remiseriaId || null;

      if (!remiseriaId && rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId },
          include: { remiserias: true }
        });
        remiseriaId = duenio?.remiserias?.[0]?.remiseriaId || null;
      }
      if (!remiseriaId) {
        const remDefault =
          (await prisma.remiseria.findFirst({ where: { estado: true } })) ||
          (await prisma.remiseria.findFirst());
        remiseriaId = remDefault?.id || null;
      }

      if (!remiseriaId) {
        return res.status(404).json({ success: false, message: 'Remisería no encontrada' });
      }

      const periodo = String(req.query.periodo || 'hoy').toLowerCase();
      const ARG_OFFSET_MS = 3 * 60 * 60 * 1000;
      const ahoraArg = new Date(Date.now() - ARG_OFFSET_MS);
      const y = ahoraArg.getUTCFullYear();
      const m = ahoraArg.getUTCMonth();
      const d = ahoraArg.getUTCDate();

      // Medianoche Argentina en UTC = 03:00:00Z
      let desde: Date;
      let hasta: Date;

      if (periodo === 'ayer') {
        desde = new Date(Date.UTC(y, m, d - 1, 3, 0, 0, 0));
        hasta = new Date(Date.UTC(y, m, d, 2, 59, 59, 999));
      } else if (periodo === 'semana') {
        const dayOfWeek = ahoraArg.getUTCDay(); // 0=Dom .. 6=Sab
        const diffLunes = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        desde = new Date(Date.UTC(y, m, d - diffLunes, 3, 0, 0, 0));
        hasta = new Date(Date.UTC(y, m, d + 1, 2, 59, 59, 999));
      } else if (periodo === 'mes') {
        desde = new Date(Date.UTC(y, m, 1, 3, 0, 0, 0));
        hasta = new Date(Date.UTC(y, m, d + 1, 2, 59, 59, 999));
      } else {
        // hoy
        desde = new Date(Date.UTC(y, m, d, 3, 0, 0, 0));
        hasta = new Date(Date.UTC(y, m, d + 1, 2, 59, 59, 999));
      }

      const viajes = await prisma.viaje.findMany({
        where: {
          remiseriaId,
          estado: 'COMPLETADO',
          fecha: { gte: desde, lte: hasta }
        },
        select: {
          id: true,
          precio: true,
          fecha: true,
          choferId: true,
          vehiculoId: true,
          chofer: {
            select: {
              id: true,
              numeroChofer: true,
              nombre: true,
              apellido: true,
              vehiculo: {
                select: {
                  id: true,
                  patente: true,
                  marca: true,
                  modelo: true
                }
              }
            }
          },
          vehiculo: {
            select: {
              id: true,
              patente: true,
              marca: true,
              modelo: true
            }
          }
        }
      });

      const porAutoMap = new Map<
        string,
        {
          key: string;
          numeroMovil: string;
          patente: string;
          vehiculo: string;
          choferes: Set<string>;
          cantidadViajes: number;
          totalFacturado: number;
        }
      >();

      const horasCount = Array.from({ length: 24 }, (_, h) => ({
        hora: `${String(h).padStart(2, '0')}:00`,
        horaNum: h,
        cantidad: 0
      }));

      let totalFacturadoGeneral = 0;

      for (const v of viajes) {
        const precio = Number(v.precio) || 0;
        totalFacturadoGeneral += precio;

        // Hora en Argentina (UTC-3)
        const fechaArg = new Date(new Date(v.fecha).getTime() - ARG_OFFSET_MS);
        const hArg = fechaArg.getUTCHours();
        if (hArg >= 0 && hArg < 24) {
          horasCount[hArg].cantidad += 1;
        }

        const veh = v.vehiculo || v.chofer?.vehiculo || null;
        const autoKey = veh?.id || v.choferId || 'sin-asignar';
        const numeroMovil = v.chofer?.numeroChofer || '-';
        const patente = veh?.patente || 'Sin patente';
        const modelo = veh ? `${veh.marca || ''} ${veh.modelo || ''}`.trim() : 'Móvil';
        const choferNombre = v.chofer
          ? `${v.chofer.nombre || ''} ${v.chofer.apellido || ''}`.trim()
          : 'Sin chofer';

        let entry = porAutoMap.get(autoKey);
        if (!entry) {
          entry = {
            key: autoKey,
            numeroMovil,
            patente,
            vehiculo: modelo || 'Móvil',
            choferes: new Set<string>(),
            cantidadViajes: 0,
            totalFacturado: 0
          };
          porAutoMap.set(autoKey, entry);
        }
        if (entry.numeroMovil === '-' && numeroMovil !== '-') {
          entry.numeroMovil = numeroMovil;
        }
        if (choferNombre) entry.choferes.add(choferNombre);
        entry.cantidadViajes += 1;
        entry.totalFacturado += precio;
      }

      const autos = Array.from(porAutoMap.values())
        .map((a) => ({
          id: a.key,
          numeroMovil: a.numeroMovil,
          patente: a.patente,
          vehiculo: a.vehiculo,
          choferNombre: Array.from(a.choferes).join(' / '),
          cantidadViajes: a.cantidadViajes,
          totalFacturado: Math.round(a.totalFacturado * 100) / 100
        }))
        .sort((a, b) => b.totalFacturado - a.totalFacturado);

      const horaPicoObj = horasCount.reduce(
        (best, cur) => (cur.cantidad > best.cantidad ? cur : best),
        horasCount[0]
      );

      return res.json({
        success: true,
        data: {
          periodo,
          desde: desde.toISOString(),
          hasta: hasta.toISOString(),
          totalViajes: viajes.length,
          totalFacturado: Math.round(totalFacturadoGeneral * 100) / 100,
          autosActivos: autos.length,
          horaPico: horaPicoObj && horaPicoObj.cantidad > 0 ? horaPicoObj.hora : null,
          maxViajesHora: horaPicoObj?.cantidad || 0,
          autos,
          viajesPorHora: horasCount
        }
      });
    } catch (error) {
      console.error('Error obteniendo reportes y métricas del coordinador:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  },

  // Listado de Empresas / Clientes con Cuenta Corriente habilitada (acceso 1 clic en Nuevo Viaje)
  async getClientesCuentaCorriente(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Usuario no autenticado' });
      }

      const coordinador = await prisma.coordinador.findFirst({ where: { userId } });
      const remiseriaId = coordinador?.remiseriaId || null;

      const clientes = await prisma.cliente.findMany({
        where: {
          activo: true,
          cuentaCorrienteHabilitada: true,
          AND: [
            ...(remiseriaId ? [{ OR: [{ remiseriaId }, { remiseriaId: null }] }] : []),
            {
              OR: [
                { apellido: { in: ['(Empresa)', '(Institución)'] } },
                { email: { endsWith: '@empresa.brunoremises.com.ar' } }
              ]
            }
          ]
        },
        select: {
          id: true,
          nombre: true,
          apellido: true,
          dni: true,
          telefono: true,
          email: true,
          direccion: true,
          cuentaCorrienteHabilitada: true,
          direccionesFrecuentes: true
        },
        orderBy: { nombre: 'asc' },
        take: 40
      });

      const data = clientes.map((c) => {
        let lugaresFrecuentes: Array<{ alias: string; direccion: string; lat?: number; lon?: number }> = [];
        if (c.direccionesFrecuentes) {
          try {
            const parsed =
              typeof c.direccionesFrecuentes === 'string'
                ? JSON.parse(c.direccionesFrecuentes)
                : c.direccionesFrecuentes;
            if (Array.isArray(parsed)) {
              lugaresFrecuentes = parsed
                .filter((d: any) => d && typeof d.direccion === 'string' && d.direccion.trim())
                .map((d: any) => ({
                  alias: String(d.alias || 'Favorito').trim(),
                  direccion: String(d.direccion).trim(),
                  lat: d.lat !== undefined && !isNaN(Number(d.lat)) ? Number(d.lat) : undefined,
                  lon: d.lon !== undefined && !isNaN(Number(d.lon)) ? Number(d.lon) : undefined,
                }));
            }
          } catch {}
        }
        return {
          ...c,
          nombreMostrar:
            c.apellido === '(Empresa)' ? c.nombre : `${c.nombre} ${c.apellido}`.trim(),
          lugaresFrecuentes
        };
      });

      return res.json({ success: true, data });
    } catch (error) {
      console.error('Error listando cuentas corrientes para coordinador:', error);
      return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
  }
};
