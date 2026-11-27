import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types';
import { checkAgenciaEstado } from '../services/agencyScheduleService';
import { searchNominatimCached } from './coordinatorDashboardController';
import { esCumpleaniosCliente, whatsappBotService } from '../services/whatsappBotService';
import { calcularAjusteOrigenRemoto, calcularMinimoPorAnillo, calcularPrecioTarifaNormal, detectarPeajesEnRecorrido } from '../lib/pricingUtils';
import { calcularVehiculosPorPasajeros } from '../lib/passengerUtils';
import { calcularRutaAsfaltada } from '../lib/routingUtils';

// Cache y Circuit Breaker para cotizaciones (Blindaje de Carga y Resiliencia QA)
interface RouteCacheEntry {
  distanciaKm: number;
  tiempoEstimado: number;
  tienePeajes?: boolean;
  timestamp: number;
}
const routeCache = new Map<string, RouteCacheEntry>();
let osrmConsecutiveErrors = 0;
let osrmDisabledUntil = 0;

const SOLO_LETRAS_REGEX = /^[a-zA-ZáéíóúÁÉÍÓÚàèìòùÀÈÌÒÙäëïöüÄËÏÖÜâêîôûÂÊÎÔÛãõÃÕçÇñÑ\s'´¨-]+$/;

export const registerCliente = async (req: Request, res: Response) => {
  try {
    const {
      nombre,
      apellido,
      dni,
      telefono,
      email,
      password,
      direccion,
      fechaNacimiento,
      genero
    } = req.body;

    // Validar campos requeridos
    if (!nombre || !apellido || !dni || !telefono || !email || !password || !direccion || !fechaNacimiento) {
      return res.status(400).json({
        success: false,
        error: 'Todos los campos son requeridos'
      });
    }

    const cleanDni = String(dni).replace(/\D/g, '');
    const cleanTel = String(telefono).replace(/\D/g, '');
    const cleanNombre = String(nombre).trim();
    const cleanApellido = String(apellido).trim();

    if (!/^\d{7,8}$/.test(cleanDni)) {
      return res.status(400).json({
        success: false,
        error: 'El DNI debe contener únicamente números (7 u 8 dígitos)'
      });
    }

    if (cleanNombre.length < 2 || !SOLO_LETRAS_REGEX.test(cleanNombre)) {
      return res.status(400).json({
        success: false,
        error: 'El nombre solo puede contener letras'
      });
    }

    if (cleanApellido.length < 2 || !SOLO_LETRAS_REGEX.test(cleanApellido)) {
      return res.status(400).json({
        success: false,
        error: 'El apellido solo puede contener letras'
      });
    }

    if (!/^\d{8,15}$/.test(cleanTel)) {
      return res.status(400).json({
        success: false,
        error: 'El teléfono debe contener únicamente números (al menos 8 dígitos)'
      });
    }

    // Verificar si el email ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'El email ya está registrado'
      });
    }

    // Verificar si el DNI ya existe
    const existingCliente = await prisma.cliente.findUnique({
      where: { dni: cleanDni }
    });

    if (existingCliente) {
      return res.status(400).json({
        success: false,
        error: 'El DNI ya está registrado'
      });
    }

    // Hash de la contraseña
    const passwordHash = await bcrypt.hash(password, 10);

    // Crear usuario
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        rol: 'CLIENTE',
        activo: true
      }
    });

    // Buscar remisería activa (Remises Bruno)
    let targetRemiseriaId = req.body.remiseriaId;
    if (!targetRemiseriaId) {
      const activeRemiseria = await prisma.remiseria.findFirst({
        where: { estado: true }
      });
      targetRemiseriaId = activeRemiseria?.id || null;
    }

    // Crear cliente
    const cliente = await prisma.cliente.create({
      data: {
        nombre: cleanNombre,
        apellido: cleanApellido,
        dni: cleanDni,
        telefono: cleanTel,
        email,
        direccion,
        fechaNacimiento: new Date(fechaNacimiento),
        genero,
        activo: true,
        userId: user.id,
        remiseriaId: targetRemiseriaId
      }
    });

    // Generar tokens
    const jwtSecret = process.env.JWT_SECRET;
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;

    if (!jwtSecret || !jwtRefreshSecret) {
      console.error('JWT secrets not configured');
      return res.status(500).json({
        success: false,
        error: 'Error de configuración del servidor'
      });
    }

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol },
      jwtSecret,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      jwtRefreshSecret,
      { expiresIn: '7d' }
    );

    // Track registration
    await prisma.appUsage.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'CLIENTE_REGISTER',
        details: JSON.stringify({ clienteId: cliente.id }),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null
      }
    });

    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          rol: user.rol,
          cliente: {
            id: cliente.id,
            nombre: cliente.nombre,
            apellido: cliente.apellido,
            dni: cliente.dni,
            telefono: cliente.telefono,
            email: cliente.email,
            direccion: cliente.direccion,
            fechaNacimiento: cliente.fechaNacimiento,
            genero: cliente.genero
          }
        },
        accessToken,
        refreshToken
      },
      message: 'Cliente registrado exitosamente'
    });
  } catch (error) {
    console.error('Error en registro de cliente:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

export const getClienteProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            email: true,
            activo: true,
            createdAt: true
          }
        }
      }
    });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    res.json({
      success: true,
      data: cliente
    });
  } catch (error) {
    console.error('Error obteniendo perfil de cliente:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

function normalizarPreferenciaSexo(raw?: any): 'INDISTINTO' | 'FEMENINO' | 'MASCULINO' {
  const val = String(raw || '').trim().toUpperCase();
  if (val === 'FEMENINO' || val === 'MUJER' || val === 'F') return 'FEMENINO';
  if (val === 'MASCULINO' || val === 'HOMBRE' || val === 'M') return 'MASCULINO';
  return 'INDISTINTO';
}

async function calcularDisponibilidadPorSexo(
  remiseriaId: string | null | undefined,
  preferencia: string
) {
  const pref = normalizarPreferenciaSexo(preferencia);
  const [choferesOnline, viajesActivos] = await Promise.all([
    prisma.chofer.findMany({
      where: {
        ...(remiseriaId ? { remiseriaId } : {}),
        estado: 'ACTIVO',
        isOnline: true,
      },
      select: {
        id: true,
        sexo: true,
        observaciones: true,
      },
    }),
    prisma.viaje.findMany({
      where: {
        ...(remiseriaId ? { remiseriaId } : {}),
        choferId: { not: null },
        OR: [
          { estado: { in: ['EN_CAMINO', 'EN_CURSO'] } },
          { estado: 'ACEPTADO', artEmpresaId: null },
        ],
      },
      select: { choferId: true },
    }),
  ]);

  const ocupadosIds = new Set(
    viajesActivos.map((v) => v.choferId).filter((id): id is string => Boolean(id))
  );

  const estaLibre = (c: { id: string; observaciones: string | null }) => {
    if (ocupadosIds.has(c.id)) return false;
    if (c.observaciones && c.observaciones.startsWith('{')) {
      try {
        if (JSON.parse(c.observaciones).enPausa === true) return false;
      } catch {}
    }
    return true;
  };

  const delSexoPedido = choferesOnline.filter(
    (c) => (c.sexo || 'MASCULINO').toUpperCase() === pref
  );
  const disponiblesAhora = delSexoPedido.filter(estaLibre).length;
  const trabajandoOnline = delSexoPedido.length;
  const otrosLibres = choferesOnline.filter(
    (c) => (c.sexo || 'MASCULINO').toUpperCase() !== pref && estaLibre(c)
  ).length;

  return {
    preferencia: pref,
    disponiblesAhora,
    trabajandoOnline,
    enViajeOPausa: Math.max(0, trabajandoOnline - disponiblesAhora),
    hayOtrosDisponibles: otrosLibres > 0,
    otrosDisponibles: otrosLibres,
  };
}

export const updateClienteProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const {
      nombre,
      apellido,
      telefono,
      email,
      fechaNacimiento,
      direccion,
      genero,
      preferenciaSexoChofer,
      fotoUrl,
      direccionesFrecuentes
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { userId }
    });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    const updateData: any = {};
    if (nombre !== undefined) {
      const cleanNombre = String(nombre).trim();
      if (cleanNombre.length < 2 || !SOLO_LETRAS_REGEX.test(cleanNombre)) {
        return res.status(400).json({
          success: false,
          error: 'El nombre solo puede contener letras',
          message: 'El nombre solo puede contener letras'
        });
      }
      updateData.nombre = cleanNombre;
    }
    if (apellido !== undefined) {
      const cleanApellido = String(apellido).trim();
      if (cleanApellido.length < 2 || !SOLO_LETRAS_REGEX.test(cleanApellido)) {
        return res.status(400).json({
          success: false,
          error: 'El apellido solo puede contener letras',
          message: 'El apellido solo puede contener letras'
        });
      }
      updateData.apellido = cleanApellido;
    }
    if (telefono !== undefined) {
      const cleanTel = String(telefono).replace(/\D/g, '');
      if (!/^\d{8,15}$/.test(cleanTel)) {
        return res.status(400).json({
          success: false,
          error: 'El teléfono debe contener únicamente números (al menos 8 dígitos)',
          message: 'El teléfono debe contener únicamente números (al menos 8 dígitos)'
        });
      }
      updateData.telefono = cleanTel;
    }

    let nuevoEmailValidado: string | null = null;
    if (email !== undefined && String(email).trim() !== '') {
      const cleanEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({
          success: false,
          error: 'Ingresá un correo electrónico válido',
          message: 'Ingresá un correo electrónico válido'
        });
      }
      if (cleanEmail !== cliente.email.toLowerCase()) {
        const [existeUser, existeCliente] = await Promise.all([
          prisma.user.findFirst({
            where: {
              email: { equals: cleanEmail, mode: 'insensitive' },
              NOT: { id: userId }
            }
          }),
          prisma.cliente.findFirst({
            where: {
              email: { equals: cleanEmail, mode: 'insensitive' },
              NOT: { id: cliente.id }
            }
          })
        ]);
        if (existeUser || existeCliente) {
          return res.status(400).json({
            success: false,
            error: 'Ese correo electrónico ya está asociado a otra cuenta',
            message: 'Ese correo electrónico ya está asociado a otra cuenta'
          });
        }
        nuevoEmailValidado = cleanEmail;
        updateData.email = cleanEmail;
      }
    }

    if (fechaNacimiento !== undefined && String(fechaNacimiento).trim() !== '') {
      const rawFecha = String(fechaNacimiento).trim();
      const matchIso = rawFecha.match(/^(\d{4})-(\d{2})-(\d{2})/);
      const parsedDate = matchIso
        ? new Date(`${matchIso[1]}-${matchIso[2]}-${matchIso[3]}T12:00:00.000Z`)
        : new Date(rawFecha);

      if (isNaN(parsedDate.getTime()) || parsedDate.getUTCFullYear() < 1900 || parsedDate > new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Ingresá una fecha de nacimiento válida',
          message: 'Ingresá una fecha de nacimiento válida'
        });
      }
      updateData.fechaNacimiento = parsedDate;
    }

    if (direccion !== undefined) updateData.direccion = String(direccion).trim();
    if (genero !== undefined) updateData.genero = genero;
    if (preferenciaSexoChofer !== undefined) {
      updateData.preferenciaSexoChofer = normalizarPreferenciaSexo(preferenciaSexoChofer);
    }
    if (fotoUrl !== undefined) updateData.fotoUrl = fotoUrl;
    if (direccionesFrecuentes !== undefined) {
      updateData.direccionesFrecuentes =
        typeof direccionesFrecuentes === 'object'
          ? JSON.stringify(direccionesFrecuentes)
          : direccionesFrecuentes;

      // Si el domicilio principal actual es vacío o un placeholder genérico (ej. "Bragado, Buenos Aires" o "Chivilcoy, Buenos Aires"),
      // sincronizarlo automáticamente con la dirección "Casa" o la primera dirección frecuente cargada.
      const dirActual = (updateData.direccion ?? cliente.direccion ?? '').trim().toLowerCase();
      const esPlaceholder =
        !dirActual ||
        dirActual === 'bragado, buenos aires' ||
        dirActual === 'chivilcoy, buenos aires' ||
        dirActual === 'sin especificar';

      if (esPlaceholder && direccion === undefined) {
        try {
          const lista =
            typeof direccionesFrecuentes === 'string'
              ? JSON.parse(direccionesFrecuentes)
              : direccionesFrecuentes;
          if (Array.isArray(lista) && lista.length > 0) {
            const casa =
              lista.find((d: any) => String(d?.alias || '').toLowerCase() === 'casa' && d?.direccion) ||
              lista.find((d: any) => d?.direccion);
            if (casa?.direccion) {
              updateData.direccion = String(casa.direccion).trim();
            }
          }
        } catch {
          // ignorar si no es JSON válido
        }
      }
    }

    // Actualizar campos del cliente (y email de usuario si cambió)
    const updatedCliente = await prisma.$transaction(async (tx) => {
      if (nuevoEmailValidado) {
        await tx.user.update({
          where: { id: userId },
          data: { email: nuevoEmailValidado }
        });
      }
      return tx.cliente.update({
        where: { userId },
        data: updateData
      });
    });

    // Track the action
    await prisma.appUsage.create({
      data: {
        userId,
        userEmail: cliente.email,
        action: 'CLIENTE_UPDATE_PROFILE',
        details: JSON.stringify({ clienteId: cliente.id }),
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null
      }
    });

    res.json({
      success: true,
      data: updatedCliente,
      message: 'Perfil actualizado exitosamente'
    });
  } catch (error) {
    console.error('Error actualizando perfil de cliente:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

export const getClientePinEstado = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado'
      });
    }

    const isDefault123456 = await bcrypt.compare('123456', user.passwordHash);
    const isDefaultCoord = !isDefault123456 && (await bcrypt.compare('RemisDefault123!', user.passwordHash));
    const tienePinPersonalizado = !(isDefault123456 || isDefaultCoord);

    return res.json({
      success: true,
      data: { tienePinPersonalizado }
    });
  } catch (error) {
    console.error('Error consultando estado de PIN del cliente:', error);
    return res.status(500).json({
      success: false,
      error: 'No se pudo consultar el estado del PIN'
    });
  }
};

export const updateClientePin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { pin, confirmarPin } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado',
        message: 'Usuario no autenticado'
      });
    }

    const cleanPin = String(pin || '').replace(/\D/g, '');
    const cleanConfirm = confirmarPin !== undefined ? String(confirmarPin).replace(/\D/g, '') : cleanPin;

    if (!/^\d{4,6}$/.test(cleanPin)) {
      return res.status(400).json({
        success: false,
        error: 'El PIN debe contener 4 dígitos numéricos',
        message: 'El PIN debe contener 4 dígitos numéricos'
      });
    }

    if (cleanPin !== cleanConfirm) {
      return res.status(400).json({
        success: false,
        error: 'Los PIN ingresados no coinciden',
        message: 'Los PIN ingresados no coinciden'
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'Usuario no encontrado',
        message: 'Usuario no encontrado'
      });
    }

    const passwordHash = await bcrypt.hash(cleanPin, 10);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash }
    });

    try {
      await prisma.appUsage.create({
        data: {
          userId,
          userEmail: user.email,
          action: 'CLIENTE_UPDATE_PIN',
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null
        }
      });
    } catch {}

    return res.json({
      success: true,
      data: { tienePinPersonalizado: true },
      message: '¡Tu PIN de ingreso fue guardado exitosamente!'
    });
  } catch (error) {
    console.error('Error actualizando PIN del cliente:', error);
    return res.status(500).json({
      success: false,
      error: 'Error al guardar tu PIN de ingreso',
      message: 'Error al guardar tu PIN de ingreso'
    });
  }
};

export const geocodeCliente = async (req: Request, res: Response) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 3) {
      return res.json({ success: true, data: [] });
    }
    const resultados = await searchNominatimCached(q, 5);
    return res.json({ success: true, data: resultados });
  } catch (error) {
    console.error('Error en geocodeCliente:', error);
    return res.json({ success: true, data: [] });
  }
};

export const getRutaAsfaltada = async (req: Request, res: Response) => {
  try {
    const fromLat = parseFloat(String(req.query.fromLat || ''));
    const fromLon = parseFloat(String(req.query.fromLon || ''));
    const toLat = parseFloat(String(req.query.toLat || ''));
    const toLon = parseFloat(String(req.query.toLon || ''));

    if ([fromLat, fromLon, toLat, toLon].some((n) => isNaN(n))) {
      return res.status(400).json({
        success: false,
        error: 'Coordenadas inválidas',
      });
    }

    const ruta = await calcularRutaAsfaltada(
      [
        { lat: fromLat, lon: fromLon },
        { lat: toLat, lon: toLon },
      ],
      { includeGeometry: true, timeoutMs: 3000 }
    );

    if (!ruta) {
      return res.status(502).json({
        success: false,
        error: 'No se pudo calcular la ruta en este momento',
      });
    }

    return res.json({
      success: true,
      data: ruta,
    });
  } catch (error) {
    console.error('Error en getRutaAsfaltada:', error);
    return res.status(500).json({
      success: false,
      error: 'Error calculando ruta',
    });
  }
};

export const getClienteViajes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const queryClienteId = req.query.clienteId as string | undefined;

    let cliente = await prisma.cliente.findUnique({
      where: { userId }
    });

    if (!cliente && queryClienteId) {
      cliente = await prisma.cliente.findUnique({
        where: { id: queryClienteId }
      });
    }

    if (!cliente) {
      cliente = await prisma.cliente.findFirst({
        where: { activo: true }
      });
    }

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    const viajes = await prisma.viaje.findMany({
      where: { clienteId: cliente.id },
      include: {
        cliente: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            telefono: true,
            fotoUrl: true,
          }
        },
        chofer: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            sexo: true,
            telefono: true,
            fotoUrl: true,
            vehiculo: {
              select: {
                id: true,
                patente: true,
                marca: true,
                modelo: true,
                color: true,
                latitud: true,
                longitud: true,
                ultimaUbicacion: true
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
            color: true,
            latitud: true,
            longitud: true,
            ultimaUbicacion: true
          }
        },
        remiseria: {
          select: {
            id: true,
            nombreFantasia: true,
            direccion: true,
            latitud: true,
            longitud: true,
            valorHoraEspera: true
          }
        }
      },
      orderBy: {
        fecha: 'desc'
      },
      take: 25
    });

    // Si el cliente tiene un viaje PENDIENTE (normal, excluyendo viajes programados de ART),
    // calcular su posición real en la cola de espera para hora pico y disponibilidad según preferencia de sexo
    const viajePendiente = viajes.find((v) => v.estado === 'PENDIENTE' && !v.artEmpresaId);
    let posicionEnCola: number | null = null;
    let disponibilidadSexoChofer: Awaited<ReturnType<typeof calcularDisponibilidadPorSexo>> | null = null;
    if (viajePendiente) {
      const colaPendientes = await prisma.viaje.findMany({
        where: {
          estado: 'PENDIENTE',
          artEmpresaId: null,
          ...(viajePendiente.remiseriaId ? { remiseriaId: viajePendiente.remiseriaId } : {}),
        },
        select: { id: true },
        orderBy: [{ prioridad: 'desc' }, { createdAt: 'asc' }],
      });
      const idx = colaPendientes.findIndex((p) => p.id === viajePendiente.id);
      posicionEnCola = idx !== -1 ? idx + 1 : 1;

      if (
        !viajePendiente.choferId &&
        viajePendiente.preferenciaSexoChofer &&
        viajePendiente.preferenciaSexoChofer !== 'INDISTINTO'
      ) {
        disponibilidadSexoChofer = await calcularDisponibilidadPorSexo(
          viajePendiente.remiseriaId,
          viajePendiente.preferenciaSexoChofer
        );
      }
    }

    const viajesConCola = viajes.map((v) =>
      v.estado === 'PENDIENTE' && !v.artEmpresaId
        ? {
            ...v,
            posicionEnCola,
            ...(v.id === viajePendiente?.id && disponibilidadSexoChofer
              ? { disponibilidadSexoChofer }
              : {}),
          }
        : v
    );

    res.json({
      success: true,
      data: viajesConCola
    });
  } catch (error) {
    console.error('Error obteniendo viajes del cliente:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

export const getClienteReservas = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado'
      });
    }

    const cliente = await prisma.cliente.findUnique({
      where: { userId }
    });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        error: 'Cliente no encontrado'
      });
    }

    const reservas = await prisma.reserva.findMany({
      where: { clienteId: cliente.id },
      include: {
        cliente: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            telefono: true,
            fotoUrl: true,
          }
        },
        chofer: {
          select: {
            nombre: true,
            apellido: true,
            telefono: true
          }
        },
        vehiculo: {
          select: {
            patente: true,
            marca: true,
            modelo: true
          }
        }
      },
      orderBy: {
        fechaInicio: 'desc'
      }
    });

    res.json({
      success: true,
      data: reservas
    });
  } catch (error) {
    console.error('Error obteniendo reservas del cliente:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Solicitar viaje
export const solicitarViaje = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cliente: {
      id: string;
      nombre: string;
      apellido: string;
      telefono?: string | null;
      email?: string | null;
    } | null | undefined =
      req.user?.cliente || (await prisma.cliente.findFirst({ where: { activo: true } }));
    const clienteId = cliente?.id;
    if (!clienteId) {
      return res.status(401).json({
        success: false,
        error: 'Cliente no autenticado'
      });
    }

    const {
      origen,
      destino,
      fechaHora,
      observaciones,
      usarUbicacionActual,
      latitudOrigen,
      longitudOrigen,
      latitudDestino,
      longitudDestino,
      paradas,
      metodoPago,
      pagaCon,
      preferenciaSexoChofer,
      conMascota,
      conSillaRuedas,
      cantidadPasajeros: rawCantidadPasajeros
    } = req.body;

    if (!origen || !destino) {
      return res.status(400).json({
        success: false,
        error: 'Origen y destino son requeridos'
      });
    }

    const calculoPasajeros = calcularVehiculosPorPasajeros(rawCantidadPasajeros);
    if (calculoPasajeros.error) {
      return res.status(400).json({
        success: false,
        error: calculoPasajeros.error
      });
    }
    const { cantidadPasajeros, cantidadVehiculos } = calculoPasajeros;

    // Obtener remisería del cliente o remisería activa
    const clienteActual = await prisma.cliente.findUnique({
      where: { id: clienteId }
    });

    let remiseria = null;
    if (clienteActual?.remiseriaId) {
      remiseria = await prisma.remiseria.findUnique({
        where: { id: clienteActual.remiseriaId }
      });
    }

    if (!remiseria) {
      remiseria =
        (await prisma.remiseria.findFirst({
          where: { estado: true, coordinadores: { some: { activo: true } } }
        })) ||
        (await prisma.remiseria.findFirst({ where: { estado: true } })) ||
        (await prisma.remiseria.findFirst());
    }

    if (!remiseria) {
      return res.status(400).json({
        success: false,
        error: 'No hay ninguna remisería registrada en el sistema'
      });
    }

    // Validación de horario de atención y estado de apertura de la agencia
    const estadoAgencia = checkAgenciaEstado(remiseria);
    if (!estadoAgencia.abierta) {
      return res.status(400).json({
        success: false,
        error: estadoAgencia.mensaje,
        motivoCierre: estadoAgencia.motivo,
        reaperturaEstimada: estadoAgencia.reaperturaEstimada
      });
    }

    // Manejo de método de pago y validación de cuenta corriente
    let metodoPagoFinal: 'EFECTIVO' | 'TRANSFERENCIA' | 'CUENTA_CORRIENTE' = 'EFECTIVO';
    if (metodoPago === 'TRANSFERENCIA') {
      metodoPagoFinal = 'TRANSFERENCIA';
    } else if (metodoPago === 'CUENTA_CORRIENTE') {
      if (!clienteActual?.cuentaCorrienteHabilitada) {
        return res.status(403).json({
          success: false,
          error: 'No tenés habilitada la cuenta corriente. Comunicate con la remisería para activarla.'
        });
      }
      metodoPagoFinal = 'CUENTA_CORRIENTE';
    }

    // Si el cliente tiene cuenta corriente habilitada con tarifa personalizada (similar a ART)
    let customTarifas: { bajadaBandera?: number; valorKm?: number } | undefined = undefined;
    if (metodoPagoFinal === 'CUENTA_CORRIENTE' && clienteActual?.cuentaCorrienteHabilitada && clienteActual.tipoTarifa === 'PERSONALIZADA') {
      customTarifas = {
        bajadaBandera: (clienteActual.tarifaPrecioTramo && clienteActual.tarifaPrecioTramo > 0) ? clienteActual.tarifaPrecioTramo : undefined,
        valorKm: (clienteActual.tarifaValorKm && clienteActual.tarifaValorKm > 0) ? clienteActual.tarifaValorKm : undefined
      };
    }

    // Calcular precio considerando paradas intermedias y tarifas personalizadas
    const cotizacion = await calcularPrecioViaje(
      origen,
      destino,
      latitudOrigen ? parseFloat(latitudOrigen) : undefined,
      longitudOrigen ? parseFloat(longitudOrigen) : undefined,
      latitudDestino ? parseFloat(latitudDestino) : undefined,
      longitudDestino ? parseFloat(longitudDestino) : undefined,
      Array.isArray(paradas) ? paradas : undefined,
      customTarifas
    );
    const precio = cotizacion.precio;

    const clienteNombre = cliente
      ? `${cliente.nombre} ${cliente.apellido}`
      : undefined;

    let pagaConNum: number | null = null;
    let vueltoEstimadoNum: number | null = null;
    if (metodoPagoFinal === 'EFECTIVO' && pagaCon) {
      pagaConNum = parseFloat(pagaCon);
      if (!isNaN(pagaConNum) && pagaConNum > precio) {
        vueltoEstimadoNum = Math.round((pagaConNum - precio) * 100) / 100;
      }
    }

    const preferenciaSexoFinal =
      preferenciaSexoChofer !== undefined
        ? normalizarPreferenciaSexo(preferenciaSexoChofer)
        : normalizarPreferenciaSexo(clienteActual?.preferenciaSexoChofer);

    const conMascotaFinal = Boolean(conMascota);
    const conSillaRuedasFinal = Boolean(conSillaRuedas);
    const grupoViajeId = cantidadVehiculos > 1 ? crypto.randomBytes(10).toString('hex') : null;
    const fechaViaje = fechaHora ? new Date(fechaHora) : new Date();
    const paradasSerializadas = paradas ? (typeof paradas === 'string' ? paradas : JSON.stringify(paradas)) : null;

    const viajeInclude = {
      cliente: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          telefono: true,
          fotoUrl: true,
        }
      },
      chofer: {
        select: {
          id: true,
          nombre: true,
          apellido: true,
          sexo: true,
          telefono: true,
          fotoUrl: true,
          vehiculo: {
            select: {
              id: true,
              patente: true,
              marca: true,
              modelo: true,
              color: true,
              latitud: true,
              longitud: true,
              ultimaUbicacion: true
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
          color: true,
          latitud: true,
          longitud: true,
          ultimaUbicacion: true
        }
      },
      remiseria: {
        select: {
          id: true,
          nombreFantasia: true,
          telefono: true,
          direccion: true,
          latitud: true,
          longitud: true,
          valorHoraEspera: true
        }
      }
    };

    // Generar un único PIN de 4 dígitos compartido para todo el grupo de vehículos
    // (así los acompañantes del 2° o 3° auto usan el mismo código sin confusión)
    const codigoPinGrupo = Math.floor(1000 + Math.random() * 9000).toString();

    // Crear 1, 2 o 3 viajes según la cantidad de pasajeros (máx. 4 por vehículo)
    const viajesCreados = await prisma.$transaction(
      Array.from({ length: cantidadVehiculos }, (_, idx) => {
        const vehiculoNumero = idx + 1;
        const trackingToken = crypto.randomBytes(16).toString('hex');
        const codigoPin = codigoPinGrupo;
        return prisma.viaje.create({
          data: {
            origen,
            destino,
            precio,
            fecha: fechaViaje,
            estado: 'PENDIENTE',
            preferenciaSexoChofer: preferenciaSexoFinal,
            conMascota: conMascotaFinal,
            conSillaRuedas: conSillaRuedasFinal,
            cantidadPasajeros,
            cantidadVehiculos,
            vehiculoNumero,
            grupoViajeId,
            observaciones,
            clienteId,
            clienteNombre,
            clienteTelefono: cliente?.telefono,
            clienteEmail: cliente?.email,
            remiseriaId: remiseria.id,
            origenDetallado: latitudOrigen && longitudOrigen ? `${latitudOrigen},${longitudOrigen}` : undefined,
            destinoDetallado: latitudDestino && longitudDestino ? `${latitudDestino},${longitudDestino}` : undefined,
            distanciaKmConPasajero: cotizacion.distanciaKm,
            trackingToken,
            codigoPin,
            metodoPago: metodoPagoFinal,
            pagaCon: pagaConNum,
            vueltoEstimado: vueltoEstimadoNum,
            paradas: paradasSerializadas
          },
          include: viajeInclude
        });
      })
    );

    const viaje = viajesCreados[0];

    // Notificar en tiempo real por sockets al coordinador y a los choferes por cada vehículo requerido
    try {
      const { getIO } = await import('../lib/socket');
      const io = getIO();
      for (const vCreado of viajesCreados) {
        io.to(remiseria.id).emit('nuevo_viaje_recibido', vCreado);
      }
    } catch (socketErr) {
      console.warn('Socket aviso nuevo viaje:', socketErr);
    }

    // Notificación Push nativa a todos los choferes activos que cumplan la preferencia
    try {
      const { pushNotificationService } = await import('../services/pushNotificationService');
      const etiquetasEspeciales = [
        cantidadVehiculos > 1
          ? `👥 ${cantidadPasajeros} pas. (${cantidadVehiculos} vehículos)`
          : cantidadPasajeros > 1
          ? `👥 ${cantidadPasajeros} pasajeros`
          : null,
        conMascotaFinal ? '🐾 Mascota' : null,
        conSillaRuedasFinal ? '♿ Silla de ruedas' : null,
      ].filter(Boolean).join(' • ');
      const bodyPush = etiquetasEspeciales
        ? `${etiquetasEspeciales} | ${origen} ➔ ${destino} ($${Number(precio).toLocaleString('es-AR')})`
        : `${origen} ➔ ${destino} ($${Number(precio).toLocaleString('es-AR')})`;
      pushNotificationService.enviarAChoferesDeRemiseria(remiseria.id, {
        title: cantidadVehiculos > 1
          ? `🚕 ¡Nuevo pedido grupal (${cantidadVehiculos} vehículos)!`
          : '🚕 ¡Nuevo viaje disponible!',
        body: bodyPush,
        url: '/chofer/app',
        tag: `nuevo-viaje-${grupoViajeId || viaje.id}`,
        data: { viajeId: viaje.id, grupoViajeId, cantidadVehiculos },
      }, undefined, {
        preferenciaSexoChofer: preferenciaSexoFinal,
        conMascota: conMascotaFinal,
        conSillaRuedas: conSillaRuedasFinal,
      }).catch((e) => console.warn('Push error nuevo viaje:', e));
    } catch (pushErr) {
      console.warn('Push aviso nuevo viaje:', pushErr);
    }

    const disponibilidadSexoChofer =
      preferenciaSexoFinal !== 'INDISTINTO'
        ? await calcularDisponibilidadPorSexo(remiseria.id, preferenciaSexoFinal)
        : null;

    // Si hoy es el cumpleaños del pasajero, enviarle saludo especial por el bot de WhatsApp e incluirlo en respuesta
    let saludoCumpleanios: string | undefined = undefined;
    if (esCumpleaniosCliente(clienteActual)) {
      saludoCumpleanios = `🎂 ¡Muy feliz cumpleaños, ${clienteActual?.nombre || 'Pasajero'}! De parte de todo el equipo de Remises Bruno te deseamos un gran día 🎉`;
      whatsappBotService.enviarSaludoCumpleaniosPasajero(clienteActual).catch(() => {});
    }

    const viajesConDisp = disponibilidadSexoChofer
      ? viajesCreados.map((v) => ({ ...v, disponibilidadSexoChofer }))
      : viajesCreados;

    res.json({
      success: true,
      data: viajesConDisp[0],
      viajes: viajesConDisp,
      cantidadPasajeros,
      cantidadVehiculos,
      grupoViajeId,
      disponibilidadSexoChofer,
      saludoCumpleanios,
      message:
        cantidadVehiculos > 1
          ? `Se solicitaron ${cantidadVehiculos} vehículos para ${cantidadPasajeros} pasajeros`
          : 'Viaje solicitado exitosamente'
    });
  } catch (error) {
    if (error instanceof DireccionNoEncontradaError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        message: error.message
      });
    }
    console.error('Error al solicitar viaje:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Calcular precio de viaje
export const calcularPrecio = async (req: Request, res: Response) => {
  try {
    const { origen, destino, latitudOrigen, longitudOrigen, latitudDestino, longitudDestino, paradas, clienteId, metodoPago } = req.body;

    if (!origen || !destino) {
      return res.status(400).json({
        success: false,
        error: 'Origen y destino son requeridos'
      });
    }

    // Buscar remisería activa (Remises Bruno)
    const remiseria = await prisma.remiseria.findFirst({ where: { estado: true } }) || await prisma.remiseria.findFirst();
    let bajadaBandera = remiseria?.bajadaBandera || 3500;
    let valorKm = remiseria?.valorKm || 1200;

    // Resolver clienteId si está autenticado
    let reqClienteId = clienteId || (req as any).user?.cliente?.id;
    if (!reqClienteId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.split(' ')[1];
        const jwt = await import('jsonwebtoken');
        const decoded: any = jwt.verify(token, process.env.JWT_SECRET || 'super-secret-jwt-key-for-appremises-saas-development');
        if (decoded?.id) {
          const cl = await prisma.cliente.findUnique({ where: { userId: decoded.id } });
          if (cl) reqClienteId = cl.id;
        }
      } catch (e) {}
    }

    // Si el cliente tiene cuenta corriente con tarifa personalizada (similar a ART)
    let customTarifas: { bajadaBandera?: number; valorKm?: number } | undefined = undefined;
    if (reqClienteId) {
      const cl = await prisma.cliente.findUnique({ where: { id: reqClienteId } });
      const aplicaTarifaCC = (!metodoPago || metodoPago === 'CUENTA_CORRIENTE') && cl?.cuentaCorrienteHabilitada && cl?.tipoTarifa === 'PERSONALIZADA';
      if (aplicaTarifaCC && cl) {
        if (cl.tarifaPrecioTramo && cl.tarifaPrecioTramo > 0) {
          bajadaBandera = cl.tarifaPrecioTramo;
        }
        if (cl.tarifaValorKm && cl.tarifaValorKm > 0) {
          valorKm = cl.tarifaValorKm;
        }
        customTarifas = { bajadaBandera, valorKm };
      }
    }

    const cotizacion = await calcularPrecioViaje(
      origen,
      destino,
      latitudOrigen ? parseFloat(latitudOrigen) : undefined,
      longitudOrigen ? parseFloat(longitudOrigen) : undefined,
      latitudDestino ? parseFloat(latitudDestino) : undefined,
      longitudDestino ? parseFloat(longitudDestino) : undefined,
      Array.isArray(paradas) ? paradas : undefined,
      customTarifas
    );

    res.json({
      success: true,
      data: {
        origen,
        destino,
        precioEstimado: cotizacion.precio,
        distancia: cotizacion.distanciaKm,
        distanciaViaje: cotizacion.distanciaViajeKm,
        tiempoEstimado: cotizacion.tiempoEstimado,
        tarifaBase: bajadaBandera,
        tarifaPorKm: valorKm,
        tarifaPorMinuto: 0,
        esTarifaDiferenciada: Boolean(customTarifas),
        esOrigenRemoto: cotizacion.esOrigenRemoto,
        kmAproximacion: cotizacion.kmAproximacion,
        tienePeajes: cotizacion.tienePeajes,
        latOrigen: cotizacion.latOrigen,
        lonOrigen: cotizacion.lonOrigen,
        latDestino: cotizacion.latDestino,
        lonDestino: cotizacion.lonDestino
      }
    });
  } catch (error) {
    if (error instanceof DireccionNoEncontradaError) {
      return res.status(400).json({
        success: false,
        error: error.message,
        message: error.message
      });
    }
    console.error('Error al calcular precio:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Crear reserva
export const crearReserva = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clienteId = req.user?.cliente?.id;
    if (!clienteId) {
      return res.status(401).json({
        success: false,
        error: 'Cliente no autenticado'
      });
    }

    const {
      origen,
      destino,
      fechaInicio,
      horaInicio,
      tipoReserva,
      fechaFin,
      diasSemana,
      horaFin,
      observaciones,
      latitudOrigen,
      longitudOrigen,
      latitudDestino,
      longitudDestino,
      preferenciaSexoChofer,
      conMascota,
      conSillaRuedas,
      cantidadPasajeros: rawCantidadPasajeros
    } = req.body;

    if (!origen || !destino || !fechaInicio || !horaInicio || !tipoReserva) {
      return res.status(400).json({
        success: false,
        error: 'Campos requeridos faltantes'
      });
    }

    const calculoPasajeros = calcularVehiculosPorPasajeros(rawCantidadPasajeros);
    if (calculoPasajeros.error) {
      return res.status(400).json({
        success: false,
        error: calculoPasajeros.error
      });
    }
    const { cantidadPasajeros, cantidadVehiculos } = calculoPasajeros;

    // Obtener remisería
    const remiseria =
      (await prisma.remiseria.findFirst({
        where: { estado: true, coordinadores: { some: { activo: true } } }
      })) ||
      (await prisma.remiseria.findFirst({ where: { estado: true } })) ||
      (await prisma.remiseria.findFirst());

    if (!remiseria) {
      return res.status(400).json({
        success: false,
        error: 'No hay ninguna remisería registrada en el sistema'
      });
    }

    // Validación de horario de atención y estado de apertura de la agencia
    const estadoAgencia = checkAgenciaEstado(remiseria);
    if (!estadoAgencia.abierta) {
      return res.status(400).json({
        success: false,
        error: estadoAgencia.mensaje,
        motivoCierre: estadoAgencia.motivo,
        reaperturaEstimada: estadoAgencia.reaperturaEstimada
      });
    }

    // Parsear fechas en zona horaria Argentina (UTC-3) cuando llegan como YYYY-MM-DD
    const fechaInicioDate =
      typeof fechaInicio === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaInicio)
        ? new Date(`${fechaInicio}T${horaInicio || '12:00'}:00-03:00`)
        : new Date(fechaInicio);
    const fechaFinDate = fechaFin
      ? typeof fechaFin === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(fechaFin)
        ? new Date(`${fechaFin}T${horaFin || '23:59'}:00-03:00`)
        : new Date(fechaFin)
      : null;

    const clienteDb = await prisma.cliente.findUnique({
      where: { id: clienteId },
      select: { preferenciaSexoChofer: true }
    });
    const preferenciaSexoReserva =
      preferenciaSexoChofer !== undefined
        ? normalizarPreferenciaSexo(preferenciaSexoChofer)
        : normalizarPreferenciaSexo(clienteDb?.preferenciaSexoChofer);

    // Crear reserva
    const reserva = await prisma.reserva.create({
      data: {
        clienteNombre: `${req.user?.cliente?.nombre} ${req.user?.cliente?.apellido}`,
        clienteTelefono: req.user?.cliente?.telefono || '',
        clienteEmail: req.user?.cliente?.email || '',
        origen,
        destino,
        fechaInicio: fechaInicioDate,
        horaInicio,
        tipo: tipoReserva === 'unica' ? 'UNICA' : 'PERIODICA',
        fechaFin: fechaFinDate,
        diasSemana: diasSemana ? diasSemana.join(',') : null,
        horaFin,
        estado: 'ACTIVA',
        preferenciaSexoChofer: preferenciaSexoReserva,
        conMascota: Boolean(conMascota),
        conSillaRuedas: Boolean(conSillaRuedas),
        cantidadPasajeros,
        cantidadVehiculos,
        observaciones,
        clienteId,
        remiseriaId: remiseria.id
      }
    });

    res.json({
      success: true,
      data: reserva,
      message: 'Reserva creada exitosamente'
    });
  } catch (error) {
    console.error('Error al crear reserva:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Cancelar viaje con motivo y verificación de proximidad (< 10 cuadras = cobro mínimo)
export const cancelarViaje = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clienteId = req.user?.cliente?.id;
    const { id } = req.params;
    const { motivo } = req.body;

    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no autenticado',
        message: 'Usuario no autenticado'
      });
    }

    // Buscar el viaje
    const viaje = await prisma.viaje.findFirst({
      where: clienteId ? { id, clienteId } : { id },
      include: {
        vehiculo: true,
        chofer: {
          include: {
            vehiculo: true
          }
        },
        remiseria: true
      }
    });

    if (!viaje) {
      return res.status(404).json({
        success: false,
        error: 'Viaje no encontrado',
        message: 'Viaje no encontrado'
      });
    }

    if (viaje.estado === 'COMPLETADO' || viaje.estado === 'CANCELADO') {
      return res.status(400).json({
        success: false,
        error: 'No se puede cancelar un viaje completado o ya cancelado',
        message: 'No se puede cancelar un viaje completado o ya cancelado'
      });
    }

    if (viaje.estado === 'EN_CURSO') {
      return res.status(400).json({
        success: false,
        error: 'No se puede cancelar el viaje una vez que el pasajero ya está a bordo',
        message: 'No se puede cancelar el viaje una vez que el pasajero ya está a bordo'
      });
    }

    // Verificar si el auto está a menos de 10 cuadras (1.0 km) del origen
    let debeAbonarMinimo = false;
    let costoCancelacion: number | null = null;
    let distanciaAlOrigenKm: number | null = null;

    if (viaje.estado === 'ACEPTADO' || viaje.estado === 'EN_CAMINO') {
      // Coordenadas del móvil
      const latMovil = viaje.vehiculo?.latitud || viaje.chofer?.vehiculo?.latitud;
      const lonMovil = viaje.vehiculo?.longitud || viaje.chofer?.vehiculo?.longitud;

      // Coordenadas de recogida
      let latOrigen: number | null = null;
      let lonOrigen: number | null = null;

      if (viaje.origenDetallado && viaje.origenDetallado.includes(',')) {
        const parts = viaje.origenDetallado.split(',');
        latOrigen = parseFloat(parts[0]);
        lonOrigen = parseFloat(parts[1]);
      }

      if (viaje.estado === 'EN_CAMINO') {
        // Si el chofer ya avisó que está en la puerta/llegando
        debeAbonarMinimo = true;
      } else if (latMovil && lonMovil && latOrigen && lonOrigen) {
        distanciaAlOrigenKm = calcularDistanciaHaversine(latMovil, lonMovil, latOrigen, lonOrigen);
        // 10 cuadras = 1.0 km
        if (distanciaAlOrigenKm <= 1.0) {
          debeAbonarMinimo = true;
        }
      }

      if (debeAbonarMinimo) {
        costoCancelacion = viaje.remiseria?.bajadaBandera || 3500;
      }
    }

    // Actualizar estado del viaje
    const updatedViaje = await prisma.viaje.update({
      where: { id },
      data: {
        estado: 'CANCELADO',
        motivoCancelacion: motivo || 'Cancelado por el cliente',
        canceladoPor: 'CLIENTE',
        debeAbonarMinimo,
        costoCancelacion,
        canceladoEn: new Date()
      },
      include: {
        cliente: true,
        chofer: true,
        vehiculo: true
      }
    });

    // Si corresponde abonar viaje mínimo (< 10 cuadras o chofer en puerta), registrar deuda pendiente a favor del chofer X
    if (debeAbonarMinimo && costoCancelacion && viaje.choferId) {
      const { registrarDeudaCancelacion } = await import('../services/deudaCancelacionService');
      await registrarDeudaCancelacion({
        remiseriaId: viaje.remiseriaId,
        clienteId: viaje.clienteId,
        clienteTelefono: viaje.clienteTelefono || updatedViaje.cliente?.telefono || null,
        clienteNombre:
          viaje.clienteNombre ||
          (updatedViaje.cliente ? `${updatedViaje.cliente.nombre} ${updatedViaje.cliente.apellido}`.trim() : null),
        viajeOrigenId: viaje.id,
        choferAcreedorId: viaje.choferId,
        monto: costoCancelacion,
        motivo: 'CANCELACION_MENOS_10_CUADRAS',
        observaciones: motivo || 'Cancelado por el cliente con móvil a menos de 10 cuadras'
      });
    }

    // Notificación sonora inmediata al chofer y al coordinador vía WebSockets
    try {
      const { getIO } = await import('../lib/socket');
      const io = getIO();
      io.to(viaje.remiseriaId).emit('viaje_cancelado', {
        viajeId: id,
        motivo: motivo || 'Cancelado por el cliente',
        canceladoPor: 'CLIENTE',
        debeAbonarMinimo,
        costoCancelacion,
        distanciaKm: distanciaAlOrigenKm ? Number(distanciaAlOrigenKm.toFixed(1)) : null,
        viaje: updatedViaje
      });
      io.to(viaje.remiseriaId).emit('viaje_estado_actualizado', {
        viajeId: id,
        estado: 'CANCELADO',
        mensaje: `Viaje cancelado por cliente: ${motivo || 'Sin motivo especificado'}`,
        viaje: updatedViaje
      });
    } catch (socketErr) {
      console.warn('Socket error notificando cancelación:', socketErr);
    }

    res.json({
      success: true,
      data: {
        viaje: updatedViaje,
        debeAbonarMinimo,
        costoCancelacion,
        distanciaKm: distanciaAlOrigenKm ? Number(distanciaAlOrigenKm.toFixed(1)) : null
      },
      message: debeAbonarMinimo
        ? `Viaje cancelado. El móvil se encontraba a menos de 10 cuadras de tu ubicación, por lo que deberás abonar el viaje mínimo ($${costoCancelacion}).`
        : 'Viaje cancelado exitosamente'
    });
  } catch (error) {
    console.error('Error al cancelar viaje:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Calificar viaje y vehículo (1 a 5 estrellas con tags y comentarios)
export const calificarViaje = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clienteId = req.user?.cliente?.id;
    const { id } = req.params;
    const { estrellasChofer, estrellasVehiculo, tags, comentario } = req.body;

    if (!clienteId) {
      return res.status(401).json({
        success: false,
        error: 'Cliente no autenticado'
      });
    }

    const viaje = await prisma.viaje.findFirst({
      where: { id, clienteId },
      include: { calificacion: true }
    });

    if (!viaje) {
      return res.status(404).json({
        success: false,
        error: 'Viaje no encontrado'
      });
    }

    if (viaje.estado !== 'COMPLETADO') {
      return res.status(400).json({
        success: false,
        error: 'Solo se pueden calificar viajes que hayan sido completados'
      });
    }

    if (viaje.calificacion) {
      return res.status(400).json({
        success: false,
        error: 'Este viaje ya fue calificado'
      });
    }

    if (!viaje.choferId) {
      return res.status(400).json({
        success: false,
        error: 'El viaje no tiene un chofer asignado para calificar'
      });
    }

    const calificacion = await prisma.calificacionViaje.create({
      data: {
        viajeId: viaje.id,
        clienteId,
        choferId: viaje.choferId,
        estrellasChofer: Math.min(5, Math.max(1, parseInt(estrellasChofer || '5'))),
        estrellasVehiculo: Math.min(5, Math.max(1, parseInt(estrellasVehiculo || '5'))),
        tags: Array.isArray(tags) ? JSON.stringify(tags) : tags || null,
        comentario: comentario?.trim() || null
      }
    });

    try {
      const { getIO } = await import('../lib/socket');
      const io = getIO();
      io.to(viaje.remiseriaId).emit('viaje_calificado', {
        viajeId: viaje.id,
        choferId: viaje.choferId,
        calificacion
      });
    } catch {}

    res.json({
      success: true,
      data: calificacion,
      message: '¡Muchas gracias por calificar tu viaje!'
    });
  } catch (error) {
    console.error('Error al calificar viaje:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Agregar parada intermedia dinámicamente durante el viaje
export const agregarParadaEnCurso = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clienteId = req.user?.cliente?.id;
    const { id } = req.params;
    const { direccion, lat, lon } = req.body;

    if (!direccion) {
      return res.status(400).json({
        success: false,
        error: 'La dirección de la parada es requerida'
      });
    }

    const viaje = await prisma.viaje.findFirst({
      where: clienteId ? { id, clienteId } : { id }
    });

    if (!viaje) {
      return res.status(404).json({
        success: false,
        error: 'Viaje no encontrado'
      });
    }

    if (!['PENDIENTE', 'ACEPTADO', 'EN_CAMINO', 'EN_CURSO'].includes(viaje.estado)) {
      return res.status(400).json({
        success: false,
        error: 'No se pueden agregar paradas a un viaje finalizado o cancelado'
      });
    }

    let paradasActuales: any[] = [];
    if (viaje.paradas) {
      try {
        paradasActuales = JSON.parse(viaje.paradas);
        if (!Array.isArray(paradasActuales)) paradasActuales = [];
      } catch {
        paradasActuales = [];
      }
    }

    const nuevaParada = {
      id: `parada-${Date.now()}`,
      direccion,
      lat: lat ? parseFloat(lat) : undefined,
      lon: lon ? parseFloat(lon) : undefined,
      completada: false,
      orden: paradasActuales.length + 1
    };

    paradasActuales.push(nuevaParada);

    // Parsear coordenadas para recalcular el precio del viaje
    let latO: number | undefined;
    let lonO: number | undefined;
    let latD: number | undefined;
    let lonD: number | undefined;

    if (viaje.origenDetallado && viaje.origenDetallado.includes(',')) {
      const parts = viaje.origenDetallado.split(',');
      latO = parseFloat(parts[0]);
      lonO = parseFloat(parts[1]);
    }
    if (viaje.destinoDetallado && viaje.destinoDetallado.includes(',')) {
      const parts = viaje.destinoDetallado.split(',');
      latD = parseFloat(parts[0]);
      lonD = parseFloat(parts[1]);
    }

    const remiseria = await prisma.remiseria.findFirst({ where: { estado: true } }) || await prisma.remiseria.findFirst();
    const valorKm = remiseria?.valorKm || 1200;
    const precioBaseAnterior = Number(viaje.precio) - (Number(viaje.costoEspera) || 0);

    const cotizacion = await calcularPrecioViaje(
      viaje.origen,
      viaje.destino,
      latO,
      lonO,
      latD,
      lonD,
      paradasActuales
    );

    // El nuevo precio base debe reflejar el recorrido actualizado o sumar como mínimo la parada añadida
    const costoParadaAdicional = Math.round((valorKm * 1.5) / 100) * 100;
    const nuevoPrecioBase = Math.max(cotizacion.precio, precioBaseAnterior + costoParadaAdicional);
    const precioFinal = Math.round((nuevoPrecioBase + (viaje.costoEspera || 0)) / 100) * 100;

    const updatedViaje = await prisma.viaje.update({
      where: { id },
      data: {
        paradas: JSON.stringify(paradasActuales),
        precio: precioFinal
      },
      include: {
        chofer: true,
        vehiculo: true
      }
    });

    try {
      const { getIO } = await import('../lib/socket');
      const io = getIO();
      io.to(viaje.remiseriaId).emit('parada_agregada', {
        viajeId: id,
        nuevaParada,
        paradas: paradasActuales,
        nuevoPrecio: precioFinal,
        viaje: updatedViaje
      });
    } catch {}

    res.json({
      success: true,
      data: updatedViaje,
      message: 'Parada intermedia agregada exitosamente'
    });
  } catch (error) {
    console.error('Error al agregar parada intermedia:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Chat rápido / mensajería predefinida
export const enviarMensajeChat = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { texto } = req.body;
    const user = req.user;

    if (!texto || !texto.trim()) {
      return res.status(400).json({
        success: false,
        error: 'El texto del mensaje es requerido'
      });
    }

    const viaje = await prisma.viaje.findUnique({
      where: { id },
      include: {
        cliente: true,
        chofer: true
      }
    });

    if (!viaje) {
      return res.status(404).json({
        success: false,
        error: 'Viaje no encontrado'
      });
    }

    if (!['PENDIENTE', 'ACEPTADO', 'EN_CAMINO'].includes(viaje.estado)) {
      return res.status(400).json({
        success: false,
        error: 'El chat solo está disponible hasta que se inicia el viaje.'
      });
    }

    let historial: any[] = [];
    if (viaje.mensajesChat) {
      try {
        historial = JSON.parse(viaje.mensajesChat);
        if (!Array.isArray(historial)) historial = [];
      } catch {
        historial = [];
      }
    }

    const esChofer = user?.rol === 'CHOFER';
    const remitente = esChofer ? 'CHOFER' : 'CLIENTE';
    const remitenteNombre = esChofer
      ? (viaje.chofer ? `${viaje.chofer.nombre} ${viaje.chofer.apellido || ''}`.trim() : 'Chofer')
      : (viaje.cliente ? `${viaje.cliente.nombre} ${viaje.cliente.apellido || ''}`.trim() : (viaje.clienteNombre || 'Pasajero'));

    const nuevoMensaje = {
      id: `msg-${Date.now()}`,
      remitente,
      remitenteNombre,
      texto: texto.trim(),
      timestamp: new Date().toISOString()
    };

    historial.push(nuevoMensaje);

    await prisma.viaje.update({
      where: { id },
      data: {
        mensajesChat: JSON.stringify(historial)
      }
    });

    try {
      const { getIO } = await import('../lib/socket');
      const io = getIO();
      io.to(viaje.remiseriaId).emit('mensaje_chat_recibido', {
        viajeId: id,
        mensaje: nuevoMensaje
      });
    } catch {}

    res.json({
      success: true,
      data: nuevoMensaje,
      message: 'Mensaje enviado'
    });
  } catch (error) {
    console.error('Error al enviar mensaje de chat:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Botón de emergencia / SOS
export const enviarAlertaSOS = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { lat, lon } = req.body;
    const cliente = req.user?.cliente;

    const viaje = await prisma.viaje.findUnique({
      where: { id },
      include: {
        remiseria: true,
        chofer: true,
        vehiculo: true
      }
    });

    if (!viaje) {
      return res.status(404).json({
        success: false,
        error: 'Viaje no encontrado'
      });
    }

    const coords = (lat && lon) ? { lat: parseFloat(lat), lon: parseFloat(lon) } : undefined;
    const clienteNombre = cliente ? `${cliente.nombre} ${cliente.apellido}` : (viaje.clienteNombre || 'Pasajero');
    const clienteTelefono = cliente?.telefono || viaje.clienteTelefono || 'Sin teléfono';

    try {
      const { getIO } = await import('../lib/socket');
      const io = getIO();
      io.to(viaje.remiseriaId).emit('alerta_sos_recibida', {
        viajeId: viaje.id,
        clienteNombre,
        clienteTelefono,
        coords,
        vehiculo: viaje.vehiculo ? `${viaje.vehiculo.marca} ${viaje.vehiculo.modelo} (${viaje.vehiculo.patente})` : 'Vehículo de agencia',
        chofer: viaje.chofer ? `${viaje.chofer.nombre} ${viaje.chofer.apellido}` : 'Chofer asignado',
        timestamp: new Date().toISOString()
      });
    } catch {}

    // Registro de auditoría
    try {
      await prisma.appUsage.create({
        data: {
          userId: req.user?.id || 'anonimo',
          userEmail: req.user?.email || 'anonimo@appremises.com',
          action: 'ALERTA_SOS',
          details: JSON.stringify({ viajeId: viaje.id, coords, clienteNombre, clienteTelefono }),
          ipAddress: req.ip
        }
      });
    } catch {}

    res.json({
      success: true,
      data: {
        telefonoCentral: viaje.remiseria?.telefono || '0800-REMISES',
        telefono911: '911'
      },
      message: 'Alerta SOS emitida a la central de la remisería'
    });
  } catch (error) {
    console.error('Error al emitir alerta SOS:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Obtener datos públicos de tracking en tiempo real
export const getViajeTracking = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: 'Token no proporcionado'
      });
    }

    const viaje = await prisma.viaje.findUnique({
      where: { trackingToken: token },
      include: {
        remiseria: {
          select: {
            nombreFantasia: true,
            telefono: true
          }
        },
        chofer: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            fotoUrl: true,
            telefono: true
          }
        },
        vehiculo: {
          select: {
            id: true,
            patente: true,
            marca: true,
            modelo: true,
            color: true,
            latitud: true,
            longitud: true,
            ultimaUbicacion: true
          }
        }
      }
    });

    if (!viaje) {
      return res.status(404).json({
        success: false,
        error: 'Enlace de seguimiento no encontrado o vencido'
      });
    }

    let paradasList = [];
    if (viaje.paradas) {
      try {
        paradasList = JSON.parse(viaje.paradas);
      } catch {}
    }

    let coordsOrigen: { lat: number; lon: number } | null = null;
    let coordsDestino: { lat: number; lon: number } | null = null;

    if (viaje.origenDetallado?.includes(',')) {
      const parts = viaje.origenDetallado.split(',');
      coordsOrigen = { lat: parseFloat(parts[0]), lon: parseFloat(parts[1]) };
    }
    if (viaje.destinoDetallado?.includes(',')) {
      const parts = viaje.destinoDetallado.split(',');
      coordsDestino = { lat: parseFloat(parts[0]), lon: parseFloat(parts[1]) };
    }

    res.json({
      success: true,
      data: {
        id: viaje.id,
        origen: viaje.origen,
        destino: viaje.destino,
        coordsOrigen,
        coordsDestino,
        paradas: paradasList,
        estado: viaje.estado,
        precio: viaje.precio,
        fecha: viaje.fecha,
        remiseria: viaje.remiseria,
        chofer: viaje.chofer,
        vehiculo: viaje.vehiculo,
        tiempoEsperaSegundos: viaje.tiempoEsperaSegundos,
        costoEspera: viaje.costoEspera,
        enEspera: viaje.enEspera
      }
    });
  } catch (error) {
    console.error('Error al consultar tracking:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Cancelar reserva
export const cancelarReserva = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clienteId = req.user?.cliente?.id;
    const { id } = req.params;

    if (!clienteId) {
      return res.status(401).json({
        success: false,
        error: 'Cliente no autenticado'
      });
    }

    // Verificar que la reserva pertenece al cliente
    const reserva = await prisma.reserva.findFirst({
      where: {
        id,
        clienteId
      }
    });

    if (!reserva) {
      return res.status(404).json({
        success: false,
        error: 'Reserva no encontrada'
      });
    }

    if (reserva.estado === 'COMPLETADA' || reserva.estado === 'CANCELADA') {
      return res.status(400).json({
        success: false,
        error: 'No se puede cancelar una reserva completada o ya cancelada'
      });
    }

    // Actualizar estado de la reserva
    await prisma.reserva.update({
      where: { id },
      data: { estado: 'CANCELADA' }
    });

    res.json({
      success: true,
      message: 'Reserva cancelada exitosamente'
    });
  } catch (error) {
    console.error('Error al cancelar reserva:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Obtener ubicación actual (con soporte a coordenadas reales y geocodificación inversa)
export const getUbicacionActual = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const latParam = req.query.lat as string | undefined;
    const lngParam = req.query.lng as string | undefined;

    const remiseria = await prisma.remiseria.findFirst({
      where: { estado: true },
      select: { latitud: true, longitud: true, direccion: true }
    });

    let lat = latParam ? parseFloat(latParam) : (remiseria?.latitud || -34.8957);
    let lng = lngParam ? parseFloat(lngParam) : (remiseria?.longitud || -60.0189);
    let direccion = remiseria?.direccion || 'Chivilcoy, Buenos Aires';

    if (latParam && lngParam && !isNaN(lat) && !isNaN(lng)) {
      try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`, {
          headers: { 'User-Agent': 'AppRemises/1.0 (cliente@app.com)' }
        });
        const geoData = await geoRes.json() as any;
        if (geoData?.address) {
          const road = geoData.address.road || geoData.address.pedestrian || geoData.address.street;
          const houseNumber = geoData.address.house_number || '';
          const city = geoData.address.city || geoData.address.town || geoData.address.village || 'Chivilcoy';
          if (road) {
            direccion = `${road} ${houseNumber}`.trim() + `, ${city}`;
          } else if (geoData.display_name) {
            direccion = geoData.display_name;
          }
        }
      } catch (geoErr) {
        console.warn('Reverse geocode fallback:', geoErr);
      }
    }

    const ubicacion = {
      lat,
      lng,
      direccion
    };

    res.json({
      success: true,
      data: ubicacion
    });
  } catch (error) {
    console.error('Error al obtener ubicación:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

export class DireccionNoEncontradaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DireccionNoEncontradaError';
  }
}

// Función para calcular distancia en km usando Haversine (10 cuadras = 1.0 km)
export function calcularDistanciaHaversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radio de la Tierra en km
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

// Función auxiliar para calcular precio, distancia y tiempo de viaje con soporte a paradas intermedias
export async function calcularPrecioViaje(
  origen: string,
  destino: string,
  latitudOrigen?: number,
  longitudOrigen?: number,
  latitudDestino?: number,
  longitudDestino?: number,
  paradas?: Array<{ direccion?: string; lat?: number; lon?: number }>,
  customTarifas?: { bajadaBandera?: number; valorKm?: number }
): Promise<{
  precio: number;
  distanciaKm: number;
  distanciaViajeKm: number;
  tiempoEstimado: number;
  esOrigenRemoto: boolean;
  kmAproximacion: number;
  tienePeajes: boolean;
  latOrigen?: number;
  lonOrigen?: number;
  latDestino?: number;
  lonDestino?: number;
}> {
  const remiseria = await prisma.remiseria.findFirst({ where: { estado: true } }) || await prisma.remiseria.findFirst();
  const bajadaBandera = (customTarifas?.bajadaBandera && customTarifas.bajadaBandera > 0)
    ? customTarifas.bajadaBandera
    : (remiseria?.bajadaBandera || 3500);
  const valorKm = (customTarifas?.valorKm && customTarifas.valorKm > 0)
    ? customTarifas.valorKm
    : (remiseria?.valorKm || 1200);
  const valorKmRuta = remiseria?.valorKmRuta && remiseria.valorKmRuta > 0
    ? remiseria.valorKmRuta
    : Math.round(valorKm * 0.75);

  let distanciaKm = 0;
  let tiempoEstimado = 10;
  let calculatedViaRoute = false;
  let rutaTienePeajes: boolean | undefined = undefined;

  // Resolver coordenadas reales si el cliente escribió la dirección sin tocar una sugerencia.
  // NUNCA inventar distancias/precios por hash si una dirección no existe o no se pudo ubicar.
  let latOri = typeof latitudOrigen === 'number' && !isNaN(latitudOrigen) ? latitudOrigen : undefined;
  let lonOri = typeof longitudOrigen === 'number' && !isNaN(longitudOrigen) ? longitudOrigen : undefined;
  let latDes = typeof latitudDestino === 'number' && !isNaN(latitudDestino) ? latitudDestino : undefined;
  let lonDes = typeof longitudDestino === 'number' && !isNaN(longitudDestino) ? longitudDestino : undefined;

  if (latOri === undefined || lonOri === undefined) {
    const resOri = await searchNominatimCached(origen, 1);
    if (resOri && resOri[0] && resOri[0].lat && resOri[0].lon) {
      latOri = parseFloat(resOri[0].lat);
      lonOri = parseFloat(resOri[0].lon);
    }
  }

  if (latDes === undefined || lonDes === undefined) {
    const resDes = await searchNominatimCached(destino, 1);
    if (resDes && resDes[0] && resDes[0].lat && resDes[0].lon) {
      latDes = parseFloat(resDes[0].lat);
      lonDes = parseFloat(resDes[0].lon);
    }
  }

  if (latOri === undefined || lonOri === undefined || isNaN(latOri) || isNaN(lonOri)) {
    throw new DireccionNoEncontradaError(
      'No pudimos ubicar la dirección de origen en el mapa. Seleccioná una opción de la lista o usá tu ubicación GPS.'
    );
  }

  if (latDes === undefined || lonDes === undefined || isNaN(latDes) || isNaN(lonDes)) {
    throw new DireccionNoEncontradaError(
      'No pudimos ubicar la dirección de destino en el mapa. Verificá que esté bien escrita o elegí una sugerencia de la lista.'
    );
  }

  // Armar lista de coordenadas ordenadas: Origen -> Parada 1 -> Parada 2 -> ... -> Destino
  const puntosValidos: Array<{ lat: number; lon: number }> = [
    { lat: latOri, lon: lonOri },
  ];

  if (Array.isArray(paradas)) {
    for (const p of paradas) {
      if (typeof p.lat === 'number' && typeof p.lon === 'number' && !isNaN(p.lat) && !isNaN(p.lon)) {
        puntosValidos.push({ lat: p.lat, lon: p.lon });
      } else if (p.direccion && p.direccion.trim().length >= 3) {
        const resParada = await searchNominatimCached(p.direccion, 1);
        if (resParada && resParada[0] && resParada[0].lat && resParada[0].lon) {
          puntosValidos.push({ lat: parseFloat(resParada[0].lat), lon: parseFloat(resParada[0].lon) });
        }
      }
    }
  }

  puntosValidos.push({ lat: latDes, lon: lonDes });

  if (puntosValidos.length >= 2) {
    const coordsQuery = puntosValidos.map((pt) => `${pt.lon.toFixed(3)},${pt.lat.toFixed(3)}`).join(';');
    const ahora = Date.now();
    const cachedRoute = routeCache.get(coordsQuery);

    // 1. Si está en caché RAM (menos de 1 hora), respuesta inmediata en 0ms
    if (cachedRoute && ahora - cachedRoute.timestamp < 3600000) {
      distanciaKm = cachedRoute.distanciaKm;
      tiempoEstimado = cachedRoute.tiempoEstimado;
      rutaTienePeajes = cachedRoute.tienePeajes;
      calculatedViaRoute = true;
    } else {
      // 2. Calcular ruta evitando caminos de tierra (Valhalla con fallback a OSRM)
      const rutaAsfaltada = await calcularRutaAsfaltada(puntosValidos, {
        includeGeometry: false,
        timeoutMs: 2200,
      });
      if (rutaAsfaltada && rutaAsfaltada.distanciaKm >= 0) {
        distanciaKm = rutaAsfaltada.distanciaKm;
        tiempoEstimado = Math.max(5, rutaAsfaltada.duracionMin);
        rutaTienePeajes = rutaAsfaltada.tienePeajes;
        calculatedViaRoute = true;
        routeCache.set(coordsQuery, {
          distanciaKm,
          tiempoEstimado,
          tienePeajes: rutaAsfaltada.tienePeajes,
          timestamp: ahora,
        });
      }

      // 3. Fallback instantáneo a Haversine acumulado (+30% trama urbana)
      if (!calculatedViaRoute) {
        let distTotal = 0;
        for (let i = 0; i < puntosValidos.length - 1; i++) {
          distTotal += calcularDistanciaHaversine(
            puntosValidos[i].lat,
            puntosValidos[i].lon,
            puntosValidos[i + 1].lat,
            puntosValidos[i + 1].lon
          );
        }
        distanciaKm = Math.round(distTotal * 1.3 * 10) / 10;
        tiempoEstimado = Math.max(6, Math.round(distanciaKm * 2.5));
        calculatedViaRoute = true;
        routeCache.set(coordsQuery, { distanciaKm, tiempoEstimado, timestamp: ahora });
      }
    }
  }

  if (!calculatedViaRoute) {
    throw new DireccionNoEncontradaError(
      'No pudimos calcular la ruta real entre origen y destino. Por favor verificá las direcciones ingresadas.'
    );
  }

  // Si hubo paradas que no tenían coordenadas en el ruteo OSRM, sumar su distancia estimada
  const paradasValidas = Array.isArray(paradas)
    ? paradas.filter((p) => p && typeof p.direccion === 'string' && p.direccion.trim().length > 0)
    : [];
  const cantidadParadas = paradasValidas.length;
  if (calculatedViaRoute && cantidadParadas > 0) {
    const paradasConCoords = puntosValidos.length - 2;
    const paradasSinCoords = Math.max(0, cantidadParadas - Math.max(0, paradasConCoords));
    if (paradasSinCoords > 0) {
      distanciaKm += paradasSinCoords * 2.0;
      distanciaKm = Math.round(distanciaKm * 10) / 10;
      tiempoEstimado += paradasSinCoords * 5;
    }
  }

  // Ajuste por origen fuera del radio urbano de la base (ej. pasajero en Alberti pidiendo móvil desde Chivilcoy)
  const ajusteRemoto = await calcularAjusteOrigenRemoto({
    distanciaViajeKm: distanciaKm,
    latOrigen: latOri,
    lonOrigen: lonOri,
    latDestino: latDes,
    lonDestino: lonDes,
    baseLat: remiseria?.latitud,
    baseLon: remiseria?.longitud,
  });

  const distanciaFacturable = ajusteRemoto.distanciaFacturableKm;

  const { precio: precioBaseCalculado, valorKmAplicado } = calcularPrecioTarifaNormal({
    distanciaFacturableKm: distanciaFacturable,
    bajadaBandera,
    valorKm,
    valorKmRuta,
    esTarifaPersonalizada: Boolean(customTarifas),
  });
  let precioEstimado = precioBaseCalculado;

  // Cada parada intermedia suma recargo por parada (detención/espera corta y desvío mínimo)
  if (cantidadParadas > 0) {
    const recargoParada = Math.round((valorKmAplicado * 1.5) / 100) * 100;
    precioEstimado += cantidadParadas * recargoParada;
  }

  // Mínimo por anillos para viajes cortos con origen alejado de la base (se actualiza solo con bajadaBandera)
  const minimoAnillo = calcularMinimoPorAnillo({
    latOrigen: latOri,
    lonOrigen: lonOri,
    baseLat: remiseria?.latitud,
    baseLon: remiseria?.longitud,
    bajadaBandera,
    anillo2RadioKm: remiseria?.anillo2RadioKm,
    anillo2RecargoPorcentaje: remiseria?.anillo2RecargoPorcentaje,
    anillo3RadioKm: remiseria?.anillo3RadioKm,
    anillo3RecargoPorcentaje: remiseria?.anillo3RecargoPorcentaje,
    esTarifaPersonalizada: Boolean(customTarifas),
  });
  if (precioEstimado < minimoAnillo.precioMinimo) {
    precioEstimado = minimoAnillo.precioMinimo;
  }

  // Redondear siempre en múltiplos de 100
  precioEstimado = Math.round(precioEstimado / 100) * 100;

  const tienePeajes = detectarPeajesEnRecorrido({
    rutaTienePeajes,
    latOrigen: latOri,
    lonOrigen: lonOri,
    latDestino: latDes,
    lonDestino: lonDes,
    distanciaKm: distanciaFacturable,
  });

  return {
    precio: precioEstimado,
    distanciaKm: distanciaFacturable,
    distanciaViajeKm: distanciaKm,
    tiempoEstimado,
    esOrigenRemoto: ajusteRemoto.esOrigenRemoto,
    kmAproximacion: ajusteRemoto.kmAproximacion,
    tienePeajes,
    latOrigen: latOri,
    lonOrigen: lonOri,
    latDestino: latDes,
    lonDestino: lonDes,
  };
} 
// Buscar cliente por DNI
export const buscarClientePorDni = async (req: Request, res: Response) => {
  try {
    const { dni } = req.params;
    const rawTerm = String(dni || '').trim();
    const cleanCodigo = rawTerm.replace(/[^a-zA-Z0-9_-]/g, '');

    if (!cleanCodigo || cleanCodigo.length < 3 || cleanCodigo.length > 20) {
      return res.status(400).json({
        success: false,
        error: 'Ingresá un DNI (7 u 8 dígitos) o un código único de empresa (ej: AMCOR, HOGAR)',
        message: 'Ingresá un DNI (7 u 8 dígitos) o un código único de empresa (ej: AMCOR, HOGAR)'
      });
    }

    const cliente = await prisma.cliente.findFirst({
      where: {
        dni: { equals: cleanCodigo, mode: 'insensitive' }
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
      }
    });

    if (!cliente) {
      return res.status(404).json({
        success: false,
        message: 'Cliente no encontrado'
      });
    }

    // Parsear lugares frecuentes guardados por el cliente en su perfil
    let lugaresFrecuentes: Array<{ alias: string; direccion: string; lat?: number; lon?: number }> = [];
    if (cliente.direccionesFrecuentes) {
      try {
        const parsed =
          typeof cliente.direccionesFrecuentes === 'string'
            ? JSON.parse(cliente.direccionesFrecuentes)
            : cliente.direccionesFrecuentes;
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

    // Buscar viajes del cliente para obtener direcciones frecuentes
    const pastVoyages = await prisma.viaje.findMany({
      where: { clienteId: cliente.id },
      select: {
        origen: true,
        destino: true
      },
      orderBy: {
        fecha: 'desc'
      },
      take: 20
    });

    const uniqueOrigins = Array.from(
      new Set([
        ...(cliente.direccion ? [cliente.direccion] : []),
        ...pastVoyages.map(v => v.origen).filter(Boolean)
      ])
    );
    const uniqueDestinations = Array.from(new Set(pastVoyages.map(v => v.destino).filter(Boolean)));

    res.json({
      success: true,
      data: {
        ...cliente,
        lugaresFrecuentes,
        direccionesFrecuentes: {
          origenes: uniqueOrigins,
          destinos: uniqueDestinations
        }
      },
      message: 'Cliente encontrado'
    });
  } catch (error) {
    console.error('Error buscando cliente por DNI:', error);
    res.status(500).json({
      success: false,
      error: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.',
      message: 'Tuvimos un inconveniente técnico momentáneo. Para no demorar tu viaje, comunicate a nuestros teléfonos fijos: 2346-427637 o 2346-433000.'
    });
  }
};

// Obtener disponibilidad de vehículos y demora estimada en tiempo real para el cliente
interface DisponibilidadCacheEntry {
  data: any;
  timestamp: number;
}
let disponibilidadCache: DisponibilidadCacheEntry | null = null;

export const getDisponibilidad = async (req: Request, res: Response) => {
  try {
    const ahora = Date.now();
    // Micro-cache de 4 segundos para soportar cientos de clientes simultáneos sin saturar DB
    if (disponibilidadCache && ahora - disponibilidadCache.timestamp < 4000) {
      return res.json(disponibilidadCache.data);
    }

    const [choferesOnline, viajesActivos, viajesPendientes, totalVehiculosActivos] = await Promise.all([
      prisma.chofer.findMany({
        where: {
          estado: 'ACTIVO',
          isOnline: true
        },
        select: {
          id: true,
          nombre: true,
          sexo: true,
          aceptaMascotas: true,
          aceptaSillaRuedas: true,
          observaciones: true,
          vehiculoId: true
        }
      }),
      prisma.viaje.findMany({
        where: {
          OR: [
            { estado: { in: ['EN_CAMINO', 'EN_CURSO'] } },
            { estado: 'ACEPTADO', artEmpresaId: null }
          ]
        },
        select: {
          id: true,
          estado: true,
          choferId: true
        }
      }),
      prisma.viaje.count({
        where: {
          estado: 'PENDIENTE',
          artEmpresaId: null
        }
      }),
      prisma.vehiculo.count({
        where: {
          estado: 'ACTIVO'
        }
      })
    ]);

    const choferesOcupadosIds = new Set(
      viajesActivos.map((v) => v.choferId).filter((id): id is string => Boolean(id))
    );

    const estaLibreDisp = (c: { id: string; observaciones?: string | null }) => {
      if (choferesOcupadosIds.has(c.id)) return false;
      if (c.observaciones && c.observaciones.startsWith('{')) {
        try {
          if (JSON.parse(c.observaciones).enPausa === true) return false;
        } catch {}
      }
      return true;
    };

    const choferesLibresList = choferesOnline.filter(estaLibreDisp);
    const autosLibresOnline = choferesLibresList.length;
    const choferesFemeninoOnline = choferesOnline.filter((c) => (c.sexo || 'MASCULINO').toUpperCase() === 'FEMENINO').length;
    const autosDisponiblesFemenino = choferesLibresList.filter((c) => (c.sexo || 'MASCULINO').toUpperCase() === 'FEMENINO').length;
    const choferesMasculinoOnline = choferesOnline.filter((c) => (c.sexo || 'MASCULINO').toUpperCase() === 'MASCULINO').length;
    const autosDisponiblesMasculino = choferesLibresList.filter((c) => (c.sexo || 'MASCULINO').toUpperCase() === 'MASCULINO').length;
    const choferesMascotasOnline = choferesOnline.filter((c) => Boolean(c.aceptaMascotas)).length;
    const autosDisponiblesMascotas = choferesLibresList.filter((c) => Boolean(c.aceptaMascotas)).length;
    const choferesSillaRuedasOnline = choferesOnline.filter((c) => c.aceptaSillaRuedas !== false).length;
    const autosDisponiblesSillaRuedas = choferesLibresList.filter((c) => c.aceptaSillaRuedas !== false).length;

    const autosEnViaje = viajesActivos.length;
    const hayAutosDisponibles = autosLibresOnline > 0;
    const todosOcupados = !hayAutosDisponibles && (autosEnViaje > 0 || choferesOnline.length > 0);

    // Calcular demora aproximada en minutos (solo cuando hay flota conectada/activa)
    let demoraMin: number | null = 3;
    let demoraMax: number | null = 6;

    if (!hayAutosDisponibles) {
      if (viajesActivos.length > 0) {
        // Estimar cuándo se libera el vehículo más próximo a terminar su viaje
        const tiemposRestantes = viajesActivos.map((v) => {
          if (v.estado === 'EN_CURSO') return 8;
          if (v.estado === 'EN_CAMINO') return 12;
          return 15; // ACEPTADO
        });
        const proximoEnLiberarse = Math.min(...tiemposRestantes);
        demoraMin = Math.min(45, proximoEnLiberarse + viajesPendientes * 8);
        demoraMax = demoraMin + 5;
      } else {
        // Sin choferes online en la app: no mostrar demora artificial
        demoraMin = null;
        demoraMax = null;
      }
    }

    const responsePayload = {
      success: true,
      data: {
        hayAutosDisponibles,
        autosDisponibles: autosLibresOnline,
        autosEnViaje,
        choferesConectados: choferesOnline.length,
        totalVehiculosActivos,
        viajesPendientes,
        todosOcupados,
        demoraMin,
        demoraMax,
        choferesFemeninoOnline,
        autosDisponiblesFemenino,
        choferesMasculinoOnline,
        autosDisponiblesMasculino,
        choferesMascotasOnline,
        autosDisponiblesMascotas,
        choferesSillaRuedasOnline,
        autosDisponiblesSillaRuedas
      }
    };

    disponibilidadCache = {
      data: responsePayload,
      timestamp: ahora
    };

    res.json(responsePayload);
  } catch (error) {
    console.error('Error obteniendo disponibilidad de vehículos:', error);
    res.status(500).json({
      success: false,
      error: 'Error al consultar disponibilidad'
    });
  }
};

// Permitir al pasajero cambiar la preferencia de sexo del chofer de un viaje PENDIENTE
// (ej: aceptar cualquier chofer por este viaje si no hay chofer mujer libre)
export const actualizarPreferenciaSexoViaje = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const clienteId = req.user?.cliente?.id;
    const { id } = req.params;
    const { preferenciaSexoChofer } = req.body;

    if (!clienteId) {
      return res.status(401).json({
        success: false,
        error: 'Cliente no autenticado'
      });
    }

    const viaje = await prisma.viaje.findFirst({
      where: { id, clienteId }
    });

    if (!viaje) {
      return res.status(404).json({
        success: false,
        error: 'Viaje no encontrado'
      });
    }

    if (viaje.estado !== 'PENDIENTE' || viaje.choferId) {
      return res.status(400).json({
        success: false,
        error: 'Solo podés modificar esta preferencia mientras el viaje espera asignación'
      });
    }

    const nuevaPref = normalizarPreferenciaSexo(preferenciaSexoChofer);
    const viajeActualizado = await prisma.viaje.update({
      where: { id: viaje.id },
      data: { preferenciaSexoChofer: nuevaPref },
      include: {
        cliente: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            telefono: true,
            fotoUrl: true,
          }
        },
        chofer: {
          select: {
            id: true,
            nombre: true,
            apellido: true,
            sexo: true,
            telefono: true,
            fotoUrl: true,
          }
        },
        vehiculo: true,
        remiseria: true,
      }
    });

    try {
      const { getIO } = await import('../lib/socket');
      const io = getIO();
      io.to(viaje.remiseriaId).emit('nuevo_viaje_recibido', viajeActualizado);
    } catch {}

    try {
      const { pushNotificationService } = await import('../services/pushNotificationService');
      pushNotificationService
        .enviarAChoferesDeRemiseria(
          viaje.remiseriaId,
          {
            title: '🚕 ¡Viaje disponible!',
            body: `${viaje.origen} ➔ ${viaje.destino} ($${Number(viaje.precio).toLocaleString('es-AR')})`,
            url: '/chofer/app',
            tag: `nuevo-viaje-${viaje.id}`,
            data: { viajeId: viaje.id },
          },
          undefined,
          {
            preferenciaSexoChofer: nuevaPref,
            conMascota: viaje.conMascota,
            conSillaRuedas: viaje.conSillaRuedas,
          }
        )
        .catch(() => {});
    } catch {}

    const disponibilidadSexoChofer =
      nuevaPref !== 'INDISTINTO'
        ? await calcularDisponibilidadPorSexo(viaje.remiseriaId, nuevaPref)
        : null;

    res.json({
      success: true,
      data: disponibilidadSexoChofer
        ? { ...viajeActualizado, disponibilidadSexoChofer }
        : viajeActualizado,
      disponibilidadSexoChofer,
      message:
        nuevaPref === 'INDISTINTO'
          ? '¡Listo! Ahora cualquier chofer disponible puede tomar tu viaje.'
          : `Preferencia actualizada a chofer ${nuevaPref === 'FEMENINO' ? 'mujer' : 'hombre'}.`
    });
  } catch (error) {
    console.error('Error actualizando preferencia de sexo del viaje:', error);
    res.status(500).json({
      success: false,
      error: 'No se pudo actualizar la preferencia del viaje'
    });
  }
};
