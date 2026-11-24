import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { prisma } from '../lib/prisma';
import { ApiResponse, LoginRequest, RegisterRequest } from '../types';
import { JwtPayload } from 'jsonwebtoken';
import { sendPasswordResetEmail } from '../lib/mailer';
import { identityVerificationService } from '../services/identityVerificationService';

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
      include: { 
        duenio: {
          include: {
            remiserias: {
              include: {
                remiseria: true
              }
            }
          }
        },
        coordinador: {
          include: {
            remiseria: {
              select: {
                id: true,
                nombreFantasia: true,
                razonSocial: true,
                telefono: true,
                direccion: true
              }
            }
          }
        },
        cliente: {
          include: {
            remiseria: {
              select: {
                id: true,
                nombreFantasia: true,
                razonSocial: true,
                telefono: true,
                direccion: true,
                valorKm: true,
                bajadaBandera: true
              }
            }
          }
        },
        chofer: {
          include: {
            vehiculo: true,
            remiseria: {
              select: {
                id: true,
                nombreFantasia: true,
                razonSocial: true
              }
            }
          }
        }
      }
    });

    if (!user || !user.activo) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

    // Verificar contraseña
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Credenciales inválidas'
      });
    }

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

    // Track login activity
    await prisma.appUsage.create({
      data: {
        userId: user.id,
        userEmail: user.email,
        action: 'LOGIN',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent') || null
      }
    });

    const response: ApiResponse = {
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          rol: user.rol,
          duenio: user.duenio,
          coordinador: user.coordinador,
          cliente: user.cliente,
          chofer: user.chofer
        },
        accessToken,
        refreshToken
      },
      message: 'Login exitoso'
    };

    res.json(response);
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, telefono }: RegisterRequest = req.body;

    // Verificar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'El email ya está registrado'
      });
    }

    // Encriptar contraseña
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

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

    // Crear usuario y dueño en una transacción
    const result = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          rol: 'DUENIO'
        }
      });

      const duenio = await tx.duenio.create({
        data: {
          nombre,
          telefono,
          userId: user.id
        }
      });

      return { user, duenio };
    });

    // Generar tokens después de crear el usuario
    const accessToken = jwt.sign(
      { id: result.user.id, email: result.user.email, rol: result.user.rol },
      jwtSecret,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { id: result.user.id },
      jwtRefreshSecret,
      { expiresIn: '7d' }
    );

    const response: ApiResponse = {
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          rol: result.user.rol,
          duenio: result.duenio
        },
        accessToken,
        refreshToken
      },
      message: 'Usuario registrado exitosamente'
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

export const registerCliente = async (req: Request, res: Response) => {
  try {
    const { email, password, nombre, apellido, dni, telefono, direccion, fechaNacimiento, fotoUrl } = req.body;

    // Verificar si el usuario ya existe
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
      where: { dni }
    });

    if (existingCliente) {
      return res.status(400).json({
        success: false,
        error: 'El DNI ya está registrado'
      });
    }

    // Encriptar contraseña
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

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

    // Crear usuario y cliente en una transacción
    const result = await prisma.$transaction(async (tx: any) => {
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          rol: 'CLIENTE'
        }
      });

      // Asignar a la remisería activa (Remises Bruno)
      let targetRemiseriaId = req.body.remiseriaId;
      if (!targetRemiseriaId) {
        const activeRemiseria = await tx.remiseria.findFirst({
          where: { estado: true }
        });
        targetRemiseriaId = activeRemiseria?.id || null;
      }

      const cliente = await tx.cliente.create({
        data: {
          nombre,
          apellido,
          dni,
          telefono,
          email,
          direccion,
          fechaNacimiento: new Date(fechaNacimiento),
          fotoUrl: fotoUrl || null,
          userId: user.id,
          remiseriaId: targetRemiseriaId
        }
      });

      return { user, cliente };
    });

    // Generar tokens después de crear el usuario
    const accessToken = jwt.sign(
      { id: result.user.id, email: result.user.email, rol: result.user.rol },
      jwtSecret,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { id: result.user.id },
      jwtRefreshSecret,
      { expiresIn: '7d' }
    );

    const response: ApiResponse = {
      success: true,
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          rol: result.user.rol,
          cliente: result.cliente
        },
        accessToken,
        refreshToken
      },
      message: 'Cliente registrado exitosamente'
    };

    res.status(201).json(response);
  } catch (error) {
    console.error('Error en registro de cliente:', error);
    res.status(500).json({
      success: false,
      error: 'Error interno del servidor'
    });
  }
};

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token requerido'
      });
    }

    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET;
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtRefreshSecret || !jwtSecret) {
      console.error('JWT secrets not configured');
      return res.status(500).json({
        success: false,
        error: 'Error de configuración del servidor'
      });
    }

    // Soporte para sesión de Demo Fallback ÚNICAMENTE en desarrollo local
    if (refreshToken === 'demo-refresh-token' && process.env.NODE_ENV !== 'production') {
      return res.json({
        success: true,
        data: {
          accessToken: 'demo-access-token'
        }
      });
    }

    // Verificar refresh token
    const decoded = jwt.verify(refreshToken, jwtRefreshSecret) as { id: string };

    
    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: { 
        duenio: true, 
        cliente: true, 
        coordinador: true,
        chofer: {
          include: {
            vehiculo: true
          }
        }
      }
    });

    if (!user || !user.activo) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado o inactivo'
      });
    }

    // Generar nuevo access token
    const newAccessToken = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol },
      jwtSecret,
      { expiresIn: '24h' }
    );

    const response: ApiResponse = {
      success: true,
      data: {
        accessToken: newAccessToken
      },
      message: 'Token renovado exitosamente'
    };

    res.json(response);
  } catch (error) {
    console.error('Error en refresh token:', error);
    res.status(401).json({
      success: false,
      error: 'Refresh token inválido'
    });
  }
}; 

// Validar token
export const validateToken = async (req: Request, res: Response) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Token no proporcionado' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
    
    // Buscar el usuario en la base de datos
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      include: {
        duenio: true,
        coordinador: true,
        cliente: true,
        chofer: {
          include: {
            vehiculo: true
          }
        }
      }
    });

    if (!user || !user.activo) {
      return res.status(401).json({ 
        success: false, 
        error: 'Usuario no encontrado o inactivo' 
      });
    }

    // Retornar información del usuario sin la contraseña
    const { passwordHash, ...userWithoutPassword } = user;
    
    res.json({
      success: true,
      data: {
        user: userWithoutPassword,
        valid: true
      }
    });
  } catch (error) {
    console.error('Error validando token:', error);
    res.status(401).json({ 
      success: false, 
      error: 'Token inválido' 
    });
  }
}; 

// Solicitar recuperación de contraseña
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'El email es requerido' });
    }

    // Buscar usuario (respuesta genérica por seguridad)
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && user.activo) {
      // Generar token seguro
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora

      // Guardar token en BD
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetPasswordToken: token,
          resetPasswordExpires: expires,
        },
      });

      // Armar URL del frontend interno (Choferes, Coordinador, Dueño)
      const reqOrigin = req.headers.origin;
      const isAllowedOrigin =
        reqOrigin &&
        (/^https:\/\/([a-z0-9-]+\.)?brunoremises\.com\.ar$/i.test(reqOrigin) ||
          /^http:\/\/localhost:\d+$/i.test(reqOrigin));
      const frontendUrl =
        (isAllowedOrigin ? reqOrigin : null) ||
        process.env.FRONTEND_INTERNO_URL ||
        process.env.FRONTEND_URL ||
        'http://localhost:3002';
      const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

      // Enviar email
      await sendPasswordResetEmail(email, resetUrl);
    }

    // Siempre responder igual (no revelar si el email existe)
    res.json({
      success: true,
      message: 'Si el email existe en nuestro sistema, recibirás un link para restablecer tu contraseña.',
    });
  } catch (error) {
    console.error('Error en forgotPassword:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

// Restablecer contraseña con token
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, error: 'Token y contraseña son requeridos' });
    }

    if (password.length < 6) {
      return res.status(400).json({ success: false, error: 'La contraseña debe tener al menos 6 caracteres' });
    }

    // Buscar usuario con token válido y no expirado
    const user = await prisma.user.findFirst({
      where: {
        resetPasswordToken: token,
        resetPasswordExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        error: 'El link de recuperación es inválido o ha expirado.',
      });
    }

    // Hashear nueva contraseña y limpiar token
    const passwordHash = await bcrypt.hash(password, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    res.json({ success: true, message: 'Contraseña restablecida exitosamente. Ya podés iniciar sesión.' });
  } catch (error) {
    console.error('Error en resetPassword:', error);
    res.status(500).json({ success: false, error: 'Error interno del servidor' });
  }
};

/**
 * Consulta y valida la identidad de un titular ante ARCA (ex-AFIP) / ANSES
 * por su número de DNI para registro de choferes, clientes y dueños
 */
export const verificarDni = async (req: Request, res: Response) => {
  try {
    const { dni } = req.params;

    if (!dni) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro DNI es requerido'
      });
    }

    const resultado = await identityVerificationService.verificarPorDni(dni);

    return res.json({
      success: true,
      data: resultado,
      message: resultado.mensaje || 'Identidad verificada exitosamente'
    });
  } catch (error: any) {
    console.error('Error en verificarDni:', error);
    return res.status(400).json({
      success: false,
      error: error.message || 'Error al verificar el DNI ante el padrón oficial'
    });
  }
};

// Almacén en memoria de códigos OTP temporales de acceso para clientes
const clienteOtpMap = new Map<string, { code: string; expiresAt: number; clienteId?: string; telefono?: string }>();

/**
 * Login exclusivo para clientes (por DNI, Teléfono o Email + PIN / Password)
 */
export const loginCliente = async (req: Request, res: Response) => {
  try {
    const { identificador, pin, password } = req.body;
    if (!identificador) {
      return res.status(400).json({ success: false, error: 'El DNI o teléfono es requerido' });
    }

    const rawId = String(identificador).trim();
    const cleanDigits = rawId.replace(/\D/g, '');

    // Buscar cliente por DNI, teléfono o email
    const cliente = await prisma.cliente.findFirst({
      where: {
        OR: [
          ...(cleanDigits.length >= 7 ? [{ dni: cleanDigits }] : []),
          ...(cleanDigits.length >= 6 ? [{ telefono: cleanDigits }, { telefono: { contains: cleanDigits.slice(-8) } }] : []),
          ...(rawId.includes('@') ? [{ email: rawId.toLowerCase() }] : []),
        ],
      },
      include: {
        user: true,
        remiseria: {
          select: {
            id: true,
            nombreFantasia: true,
            telefono: true,
            direccion: true,
            valorKm: true,
            bajadaBandera: true,
          },
        },
      },
    });

    if (!cliente || !cliente.user) {
      return res.status(404).json({
        success: false,
        code: 'CLIENTE_NO_ENCONTRADO',
        error: 'No encontramos ninguna cuenta asociada a este DNI o teléfono. ¿Deseás registrarte?',
      });
    }

    const claveIngresada = pin || password;
    if (!claveIngresada) {
      return res.status(400).json({
        success: false,
        error: 'Debe ingresar su PIN de acceso o solicitar código por WhatsApp',
      });
    }

    const isMatch = await bcrypt.compare(String(claveIngresada), cliente.user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'PIN o contraseña incorrecta. Podés ingresar solicitando un código por WhatsApp.',
      });
    }

    const jwtSecret = process.env.JWT_SECRET || 'secret';
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

    const accessToken = jwt.sign(
      { id: cliente.user.id, email: cliente.user.email, rol: cliente.user.rol },
      jwtSecret,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { id: cliente.user.id, email: cliente.user.email, rol: cliente.user.rol },
      jwtRefreshSecret,
      { expiresIn: '7d' }
    );

    const authPayload = {
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: cliente.user.id,
        email: cliente.user.email,
        rol: cliente.user.rol,
        cliente,
      },
    };

    return res.json({
      success: true,
      message: '¡Bienvenido a Remises Bruno!',
      data: authPayload,
      ...authPayload,
    });
  } catch (error: any) {
    console.error('Error en loginCliente:', error);
    return res.status(500).json({ success: false, error: 'Error al procesar el ingreso de cliente' });
  }
};

/**
 * Solicitar código OTP de 4 dígitos por WhatsApp para login sin contraseña
 */
export const solicitarCodigoCliente = async (req: Request, res: Response) => {
  try {
    const { identificador } = req.body;
    if (!identificador) {
      return res.status(400).json({ success: false, error: 'DNI o teléfono requerido' });
    }

    const rawId = String(identificador).trim();
    const cleanDigits = rawId.replace(/\D/g, '');

    // Buscar cliente existente
    const cliente = await prisma.cliente.findFirst({
      where: {
        OR: [
          ...(cleanDigits.length >= 7 ? [{ dni: cleanDigits }] : []),
          ...(cleanDigits.length >= 6 ? [{ telefono: cleanDigits }, { telefono: { contains: cleanDigits.slice(-8) } }] : []),
        ],
      },
    });

    let targetPhone = cliente?.telefono || cleanDigits;
    if (!targetPhone || targetPhone.length < 8) {
      return res.status(400).json({
        success: false,
        error: 'No se pudo identificar un número de teléfono válido para enviar el código por WhatsApp',
      });
    }

    // Generar código de 4 dígitos
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const cleanPhoneKey = targetPhone.replace(/\D/g, '');
    clienteOtpMap.set(cleanPhoneKey, {
      code,
      expiresAt: Date.now() + 5 * 60 * 1000,
      clienteId: cliente?.id,
      telefono: targetPhone,
    });
    // También guardamos por DNI si existe
    if (cliente?.dni) {
      clienteOtpMap.set(cliente.dni, {
        code,
        expiresAt: Date.now() + 5 * 60 * 1000,
        clienteId: cliente.id,
        telefono: targetPhone,
      });
    }

    const { whatsappService } = await import('../services/whatsappService');
    const msg =
      `🔒 *Remises Bruno - Código de Acceso*\n` +
      `━━━━━━━━━━━━━━━━━━━\n` +
      `Tu código para acceder a la app es: *${code}*\n\n` +
      `⏱️ Es válido por 5 minutos. No lo compartas con nadie.`;

    await whatsappService.enviarTexto(targetPhone, msg);

    const ultimosDigitos = targetPhone.slice(-4);
    return res.json({
      success: true,
      message: `Código enviado a tu WhatsApp terminado en ***${ultimosDigitos}`,
      telefonoEnmascarado: `***${ultimosDigitos}`,
    });
  } catch (error: any) {
    console.error('Error en solicitarCodigoCliente:', error);
    return res.status(500).json({ success: false, error: 'Error al enviar código por WhatsApp' });
  }
};

/**
 * Verificar código OTP de WhatsApp e iniciar sesión
 */
export const verificarCodigoCliente = async (req: Request, res: Response) => {
  try {
    const { identificador, codigo } = req.body;
    if (!identificador || !codigo) {
      return res.status(400).json({ success: false, error: 'Identificador y código son requeridos' });
    }

    const rawId = String(identificador).trim();
    const cleanDigits = rawId.replace(/\D/g, '');
    const cleanCode = String(codigo).trim();

    // Verificar en el mapa de OTPs
    let entry = clienteOtpMap.get(cleanDigits) || (cleanDigits.length >= 8 ? clienteOtpMap.get(cleanDigits.slice(-8)) : undefined);
    if (!entry) {
      // Si no se encontró directo, buscar si el identificador es un DNI o teléfono de cliente registrado
      const c = await prisma.cliente.findFirst({
        where: {
          OR: [
            ...(cleanDigits.length >= 7 ? [{ dni: cleanDigits }] : []),
            ...(cleanDigits.length >= 6 ? [{ telefono: cleanDigits }, { telefono: { contains: cleanDigits.slice(-8) } }] : []),
          ],
        },
      });
      if (c) {
        if (c.dni && clienteOtpMap.has(c.dni)) {
          entry = clienteOtpMap.get(c.dni);
        } else if (c.telefono) {
          const pKey = c.telefono.replace(/\D/g, '');
          entry = clienteOtpMap.get(pKey) || (pKey.length >= 8 ? clienteOtpMap.get(pKey.slice(-8)) : undefined);
        }
      }
    }

    if (!entry) {
      return res.status(400).json({ success: false, error: 'El código expiró o no fue solicitado. Por favor pedí uno nuevo.' });
    }

    if (Date.now() > entry.expiresAt) {
      clienteOtpMap.delete(cleanDigits);
      return res.status(400).json({ success: false, error: 'El código ha expirado. Por favor solicitá uno nuevo.' });
    }

    if (entry.code !== cleanCode) {
      return res.status(400).json({ success: false, error: 'Código incorrecto. Verificá los 4 dígitos.' });
    }

    // Código válido -> eliminarlo
    clienteOtpMap.delete(cleanDigits);
    if (entry.telefono) {
      clienteOtpMap.delete(entry.telefono.replace(/\D/g, ''));
    }

    // Buscar el cliente para loguearlo
    let cliente = entry.clienteId
      ? await prisma.cliente.findUnique({
          where: { id: entry.clienteId },
          include: { user: true, remiseria: true },
        })
      : await prisma.cliente.findFirst({
          where: {
            OR: [
              ...(cleanDigits.length >= 7 ? [{ dni: cleanDigits }] : []),
              ...(cleanDigits.length >= 6 ? [{ telefono: cleanDigits }, { telefono: { contains: cleanDigits.slice(-8) } }] : []),
            ],
          },
          include: { user: true, remiseria: true },
        });

    if (!cliente || !cliente.user) {
      return res.status(404).json({
        success: false,
        code: 'REGISTRO_PENDIENTE',
        message: 'Código verificado, completá tu nombre para ingresar.',
      });
    }

    const jwtSecret = process.env.JWT_SECRET || 'secret';
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

    const accessToken = jwt.sign(
      { id: cliente.user.id, email: cliente.user.email, rol: cliente.user.rol },
      jwtSecret,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { id: cliente.user.id, email: cliente.user.email, rol: cliente.user.rol },
      jwtRefreshSecret,
      { expiresIn: '7d' }
    );

    const authPayload = {
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: cliente.user.id,
        email: cliente.user.email,
        rol: cliente.user.rol,
        cliente,
      },
    };

    return res.json({
      success: true,
      message: 'Ingreso exitoso',
      data: authPayload,
      ...authPayload,
    });
  } catch (error: any) {
    console.error('Error en verificarCodigoCliente:', error);
    return res.status(500).json({ success: false, error: 'Error al verificar código' });
  }
};

/**
 * Registro express de nuevo cliente (DNI, Nombre, Teléfono y PIN opcional)
 */
export const registroExpressCliente = async (req: Request, res: Response) => {
  try {
    const { dni, nombre, apellido, telefono, pin } = req.body;
    if (!dni || !nombre || !telefono) {
      return res.status(400).json({ success: false, error: 'DNI, Nombre y Teléfono son requeridos' });
    }

    const cleanDni = String(dni).replace(/\D/g, '').trim();
    const cleanTel = String(telefono).replace(/\D/g, '').trim();
    const cleanNom = String(nombre).trim();
    const cleanApe = String(apellido || '').trim();

    // Verificar si ya existe cliente con ese DNI
    let clienteExistente = await prisma.cliente.findUnique({
      where: { dni: cleanDni },
      include: { user: true, remiseria: true },
    });

    const clave = pin && String(pin).length >= 4 ? String(pin) : '123456';
    const passwordHash = await bcrypt.hash(clave, 10);
    const jwtSecret = process.env.JWT_SECRET || 'secret';
    const jwtRefreshSecret = process.env.JWT_REFRESH_SECRET || 'refresh_secret';

    if (clienteExistente) {
      // Si ya existía, actualizar clave si envió pin
      if (clienteExistente.user && pin) {
        await prisma.user.update({
          where: { id: clienteExistente.user.id },
          data: { passwordHash },
        });
      }
      const accessToken = jwt.sign(
        { id: clienteExistente.user.id, email: clienteExistente.user.email, rol: clienteExistente.user.rol },
        jwtSecret,
        { expiresIn: '24h' }
      );
      const refreshToken = jwt.sign(
        { id: clienteExistente.user.id, email: clienteExistente.user.email, rol: clienteExistente.user.rol },
        jwtRefreshSecret,
        { expiresIn: '7d' }
      );
      const payloadExistente = {
        token: accessToken,
        accessToken,
        refreshToken,
        user: {
          id: clienteExistente.user.id,
          email: clienteExistente.user.email,
          rol: clienteExistente.user.rol,
          cliente: clienteExistente,
        },
      };
      return res.json({
        success: true,
        message: 'Cuenta vinculada exitosamente',
        data: payloadExistente,
        ...payloadExistente,
      });
    }

    const remiseriaActiva = await prisma.remiseria.findFirst({ where: { estado: true } });
    const dummyEmail = `${cleanDni}@cliente.brunoremises.com.ar`;

    const user = await prisma.user.create({
      data: {
        email: dummyEmail,
        passwordHash,
        rol: 'CLIENTE',
      },
    });

    const nuevoCliente = await prisma.cliente.create({
      data: {
        nombre: cleanNom,
        apellido: cleanApe,
        dni: cleanDni,
        telefono: cleanTel,
        email: dummyEmail,
        direccion: 'Bragado, Buenos Aires',
        fechaNacimiento: new Date('1990-01-01'),
        userId: user.id,
        remiseriaId: remiseriaActiva?.id || null,
      },
      include: {
        remiseria: true,
      },
    });

    const accessToken = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol },
      jwtSecret,
      { expiresIn: '24h' }
    );
    const refreshToken = jwt.sign(
      { id: user.id, email: user.email, rol: user.rol },
      jwtRefreshSecret,
      { expiresIn: '7d' }
    );

    const authPayloadNuevo = {
      token: accessToken,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        rol: user.rol,
        cliente: nuevoCliente,
      },
    };

    return res.json({
      success: true,
      message: '¡Registro completado! Bienvenido a Remises Bruno',
      data: authPayloadNuevo,
      ...authPayloadNuevo,
    });
  } catch (error: any) {
    console.error('Error en registroExpressCliente:', error);
    return res.status(500).json({ success: false, error: 'Error al registrar cliente' });
  }
};