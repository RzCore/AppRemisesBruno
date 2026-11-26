import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types';

const UMBRAL_LARGA_DISTANCIA_KM = 20;
const COMISION_AGENCIA_CORTA_PCT = 20;
const COMISION_AGENCIA_LARGA_PCT = 15;
const COMISION_CHOFER_NO_PROP_PCT = 30;

interface CalculoLiquidacionResult {
  totalRecaudado: number;
  totalEfectivoViajes: number;
  totalTransferenciaViajes: number;
  totalTransferenciaAgencia: number;
  totalTransferenciaPropia: number;
  totalCuentaCorrienteViajes: number;
  totalCortaDistancia: number;
  totalLargaDistancia: number;
  cantidadCortaDistancia: number;
  cantidadLargaDistancia: number;
  comisionAgencia20: number;
  comisionAgencia15: number;
  comisionChofer: number;
  comisionAgencia: number;
  gananciaPropietario: number;
  saldoNeto: number;
  saldoAFavorChofer: number;
  montoARendirChofer: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function calcularLiquidacionViajes(
  viajes: Array<{
    precio: any;
    metodoPago?: string | null;
    destinoTransferencia?: string | null;
    distanciaKmConPasajero?: number | null;
  }>,
  esPropietario: boolean,
  combustible = 0
): CalculoLiquidacionResult {
  let totalRecaudado = 0;
  let totalEfectivoViajes = 0;
  let totalTransferenciaViajes = 0;
  let totalTransferenciaAgencia = 0;
  let totalTransferenciaPropia = 0;
  let totalCuentaCorrienteViajes = 0;
  let totalCortaDistancia = 0;
  let totalLargaDistancia = 0;
  let cantidadCortaDistancia = 0;
  let cantidadLargaDistancia = 0;

  let comisionChofer = 0;
  let comisionAgencia = 0;
  let comisionAgencia20 = 0;
  let comisionAgencia15 = 0;
  let gananciaPropietarioBruta = 0;

  for (const v of viajes) {
    const precio = Number(v.precio) || 0;
    const km = Number(v.distanciaKmConPasajero) || 0;
    const esLargaDistancia = km >= UMBRAL_LARGA_DISTANCIA_KM;
    const agenciaPct = esLargaDistancia ? COMISION_AGENCIA_LARGA_PCT : COMISION_AGENCIA_CORTA_PCT;

    totalRecaudado += precio;

    if (esLargaDistancia) {
      totalLargaDistancia += precio;
      cantidadLargaDistancia += 1;
    } else {
      totalCortaDistancia += precio;
      cantidadCortaDistancia += 1;
    }

    if (v.metodoPago === 'TRANSFERENCIA') {
      totalTransferenciaViajes += precio;
      if (v.destinoTransferencia === 'CUENTA_PROPIA') {
        totalTransferenciaPropia += precio;
      } else {
        totalTransferenciaAgencia += precio;
      }
    } else if (v.metodoPago === 'CUENTA_CORRIENTE') {
      totalCuentaCorrienteViajes += precio;
    } else {
      totalEfectivoViajes += precio;
    }

    const comAgenciaViaje = (precio * agenciaPct) / 100;
    comisionAgencia += comAgenciaViaje;
    if (esLargaDistancia) {
      comisionAgencia15 += comAgenciaViaje;
    } else {
      comisionAgencia20 += comAgenciaViaje;
    }

    if (esPropietario) {
      // Propietario: 80% (< 20 km) | 85% (>= 20 km)
      comisionChofer += precio - comAgenciaViaje;
    } else {
      // Comisionista: 30% chofer siempre; 20% agencia / 50% dueño (< 20 km) | 15% agencia / 55% dueño (>= 20 km)
      const comChoferViaje = (precio * COMISION_CHOFER_NO_PROP_PCT) / 100;
      comisionChofer += comChoferViaje;
      gananciaPropietarioBruta += precio - comChoferViaje - comAgenciaViaje;
    }
  }

  const combustibleVal = esPropietario ? 0 : Math.max(0, Number(combustible) || 0);
  const gananciaPropietario = esPropietario
    ? 0
    : Math.max(0, gananciaPropietarioBruta - combustibleVal);

  // El chofer cobró directamente: viajes en EFECTIVO + viajes en TRANSFERENCIA a su CUENTA_PROPIA.
  // Los viajes en TRANSFERENCIA a CUENTA_AGENCIA y CUENTA_CORRIENTE van a la cuenta de la agencia.
  // saldoNeto = (totalEfectivoViajes + totalTransferenciaPropia) - comisionChofer - combustibleVal
  const saldoNeto = round2(totalEfectivoViajes + totalTransferenciaPropia - comisionChofer - combustibleVal);
  const saldoAFavorChofer = saldoNeto < 0 ? round2(Math.abs(saldoNeto)) : 0;
  const montoARendirChofer = saldoNeto > 0 ? round2(saldoNeto) : 0;

  return {
    totalRecaudado: round2(totalRecaudado),
    totalEfectivoViajes: round2(totalEfectivoViajes),
    totalTransferenciaViajes: round2(totalTransferenciaViajes),
    totalTransferenciaAgencia: round2(totalTransferenciaAgencia),
    totalTransferenciaPropia: round2(totalTransferenciaPropia),
    totalCuentaCorrienteViajes: round2(totalCuentaCorrienteViajes),
    totalCortaDistancia: round2(totalCortaDistancia),
    totalLargaDistancia: round2(totalLargaDistancia),
    cantidadCortaDistancia,
    cantidadLargaDistancia,
    comisionAgencia20: round2(comisionAgencia20),
    comisionAgencia15: round2(comisionAgencia15),
    comisionChofer: round2(comisionChofer),
    comisionAgencia: round2(comisionAgencia),
    gananciaPropietario: round2(gananciaPropietario),
    saldoNeto,
    saldoAFavorChofer,
    montoARendirChofer
  };
}

export const liquidacionController = {
  // Obtener viajes pendientes de liquidar para un chofer
  async getPendientes(req: AuthenticatedRequest, res: Response) {
    try {
      const { choferId } = req.params;
      const { rol, id: userId } = req.user!;

      // Obtener el chofer con su remisería
      const chofer = await prisma.chofer.findUnique({
        where: { id: choferId },
        include: { remiseria: true }
      });

      if (!chofer) {
        return res.status(404).json({
          success: false,
          message: 'Chofer no encontrado'
        });
      }

      // Validar acceso
      if (rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId },
          include: { remiserias: { select: { remiseriaId: true } } }
        });
        const remiseriaIds = duenio?.remiserias.map(r => r.remiseriaId) || [];
        if (!remiseriaIds.includes(chofer.remiseriaId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver las liquidaciones de este chofer'
          });
        }
      } else if (rol === 'COORDINADOR') {
        const coordinador = await prisma.coordinador.findFirst({
          where: { userId }
        });
        if (coordinador?.remiseriaId !== chofer.remiseriaId) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para ver las liquidaciones de este chofer'
          });
        }
      } else {
        return res.status(403).json({
          success: false,
          message: 'No autorizado'
        });
      }

      // Obtener viajes completados del chofer que no estén liquidados, última liquidación y último turno
      const [viajes, ultimaLiquidacion, ultimoTurno] = await Promise.all([
        prisma.viaje.findMany({
          where: {
            choferId: chofer.id,
            estado: 'COMPLETADO',
            liquidacionId: null
          },
          include: {
            cliente: {
              select: {
                id: true,
                nombre: true,
                apellido: true,
                telefono: true
              }
            },
            artEmpresa: {
              select: {
                id: true,
                nombre: true
              }
            }
          },
          orderBy: {
            fecha: 'desc'
          }
        }),
        prisma.liquidacion.findFirst({
          where: { choferId: chofer.id },
          orderBy: { fecha: 'desc' },
          select: { fecha: true }
        }),
        prisma.turnoChofer.findFirst({
          where: { choferId: chofer.id },
          orderBy: { fechaInicio: 'desc' }
        })
      ]);

      // Determinar la ventana de gastos pendientes de liquidar (los cargados por el chofer en el turno / cierre)
      const inicioHoy = new Date();
      inicioHoy.setHours(0, 0, 0, 0);

      let filtroFechaGastos: { gt?: Date; gte?: Date };
      if (ultimaLiquidacion?.fecha) {
        filtroFechaGastos = { gt: ultimaLiquidacion.fecha };
      } else {
        const candidatosInicio: Date[] = [];
        if (ultimoTurno?.fechaInicio) candidatosInicio.push(new Date(ultimoTurno.fechaInicio));
        if (viajes.length > 0) {
          const primerViaje = viajes[viajes.length - 1];
          if (primerViaje?.fecha) candidatosInicio.push(new Date(primerViaje.fecha));
        }
        const desde =
          candidatosInicio.length > 0
            ? new Date(Math.min(...candidatosInicio.map((d) => d.getTime())))
            : inicioHoy;
        filtroFechaGastos = { gte: desde };
      }

      const gastosTurno = await prisma.gastoChofer.findMany({
        where: {
          choferId: chofer.id,
          fecha: filtroFechaGastos
        },
        orderBy: { fecha: 'desc' }
      });

      const totalCombustibleCargado = round2(
        gastosTurno
          .filter((g) => g.tipo === 'COMBUSTIBLE')
          .reduce((sum, g) => sum + Number(g.monto || 0), 0)
      );
      const totalOtrosGastosCargados = round2(
        gastosTurno
          .filter((g) => g.tipo !== 'COMBUSTIBLE')
          .reduce((sum, g) => sum + Number(g.monto || 0), 0)
      );

      // Calcular totales y comisiones viaje por viaje (< 20 km: 20% agencia | >= 20 km: 15% agencia)
      // incluyendo automáticamente el combustible registrado por el chofer en el turno/cierre
      const calcSinCombustible = calcularLiquidacionViajes(viajes, chofer.esPropietario, 0);
      const calc = calcularLiquidacionViajes(viajes, chofer.esPropietario, totalCombustibleCargado);

      res.json({
        success: true,
        data: {
          chofer: {
            id: chofer.id,
            nombre: chofer.nombre,
            apellido: chofer.apellido,
            numeroChofer: chofer.numeroChofer,
            esPropietario: chofer.esPropietario,
            esFranquero: chofer.esFranquero,
            comisionPorcentaje: chofer.comisionPorcentaje,
            comisionDuenioAuto: chofer.remiseria.comisionDuenioAuto
          },
          viajes,
          gastos: {
            total: round2(totalCombustibleCargado + totalOtrosGastosCargados),
            totalCombustible: totalCombustibleCargado,
            totalOtrosGastos: totalOtrosGastosCargados,
            items: gastosTurno.map((g) => ({
              id: g.id,
              tipo: g.tipo,
              subtipoCombustible: g.subtipoCombustible,
              monto: Number(g.monto || 0),
              descripcion: g.descripcion,
              fecha: g.fecha
            }))
          },
          ultimoTurno: ultimoTurno
            ? {
                id: ultimoTurno.id,
                activo: ultimoTurno.activo,
                fechaInicio: ultimoTurno.fechaInicio,
                fechaFin: ultimoTurno.fechaFin,
                kmTotalConectado: Number((ultimoTurno.kmTotalConectado || 0).toFixed(1)),
                kmConPasajero: Number((ultimoTurno.kmConPasajero || 0).toFixed(1)),
                kmSinPasajero: Number((ultimoTurno.kmSinPasajero || 0).toFixed(1)),
                odometroInicio: ultimoTurno.odometroInicio,
                odometroFin: ultimoTurno.odometroFin
              }
            : null,
          resumen: {
            totalRecaudado: calc.totalRecaudado,
            totalEfectivo: calc.totalEfectivoViajes,
            totalTransferencia: calc.totalTransferenciaViajes,
            totalTransferenciaAgencia: calc.totalTransferenciaAgencia,
            totalTransferenciaPropia: calc.totalTransferenciaPropia,
            totalCuentaCorriente: calc.totalCuentaCorrienteViajes,
            totalCortaDistancia: calc.totalCortaDistancia,
            totalLargaDistancia: calc.totalLargaDistancia,
            cantidadCortaDistancia: calc.cantidadCortaDistancia,
            cantidadLargaDistancia: calc.cantidadLargaDistancia,
            comisionAgencia20: calc.comisionAgencia20,
            comisionAgencia15: calc.comisionAgencia15,
            comisionChofer: calc.comisionChofer,
            comisionAgencia: calc.comisionAgencia,
            combustible: chofer.esPropietario ? 0 : totalCombustibleCargado,
            totalCombustibleCargado,
            totalOtrosGastos: totalOtrosGastosCargados,
            gananciaPropietarioBruta: calcSinCombustible.gananciaPropietario,
            gananciaPropietario: calc.gananciaPropietario,
            saldoNeto: calc.saldoNeto,
            saldoAFavorChofer: calc.saldoAFavorChofer,
            montoARendirChofer: calc.montoARendirChofer
          }
        }
      });
    } catch (error) {
      console.error('Error al obtener liquidaciones pendientes:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Crear la liquidación (cierre de caja)
  async crear(req: AuthenticatedRequest, res: Response) {
    try {
      const {
        choferId,
        combustible,
        observaciones,
        metodoPagoChofer,
        montoEfectivo,
        montoTransferencia,
        quienPagaSaldoAFavor
      } = req.body;
      const { rol, id: userId } = req.user!;

      if (!choferId) {
        return res.status(400).json({
          success: false,
          message: 'El id del chofer es requerido'
        });
      }

      const combustibleVal = combustible !== undefined ? parseFloat(combustible) : 0;

      // Obtener el chofer con su remisería
      const chofer = await prisma.chofer.findUnique({
        where: { id: choferId },
        include: { remiseria: true }
      });

      if (!chofer) {
        return res.status(404).json({
          success: false,
          message: 'Chofer no encontrado'
        });
      }

      // Validar acceso
      if (rol === 'DUENIO') {
        const duenio = await prisma.duenio.findUnique({
          where: { userId },
          include: { remiserias: { select: { remiseriaId: true } } }
        });
        const remiseriaIds = duenio?.remiserias.map(r => r.remiseriaId) || [];
        if (!remiseriaIds.includes(chofer.remiseriaId)) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para realizar liquidaciones para este chofer'
          });
        }
      } else if (rol === 'COORDINADOR') {
        const coordinador = await prisma.coordinador.findFirst({
          where: { userId }
        });
        if (coordinador?.remiseriaId !== chofer.remiseriaId) {
          return res.status(403).json({
            success: false,
            message: 'No tienes permisos para realizar liquidaciones para este chofer'
          });
        }
      } else {
        return res.status(403).json({
          success: false,
          message: 'No autorizado'
        });
      }

      // Obtener los viajes pendientes
      const viajes = await prisma.viaje.findMany({
        where: {
          choferId: chofer.id,
          estado: 'COMPLETADO',
          liquidacionId: null
        }
      });

      if (viajes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No hay viajes completados pendientes de liquidación para este chofer'
        });
      }

      const calc = calcularLiquidacionViajes(viajes, chofer.esPropietario, combustibleVal);

      // Validar medio de pago del chofer y/o saldo a favor
      const metodosPagoValidos = ['EFECTIVO', 'TRANSFERENCIA', 'AMBOS'];
      let metodoPagoFinal: string | null = null;
      let montoEfectivoFinal = 0;
      let montoTransferenciaFinal = 0;
      let quienPagaFinal: string | null = null;

      if (calc.montoARendirChofer > 0) {
        const metodo = metodoPagoChofer || 'EFECTIVO';
        if (!metodosPagoValidos.includes(metodo)) {
          return res.status(400).json({
            success: false,
            message: 'Medio de pago inválido. Debe ser EFECTIVO, TRANSFERENCIA o AMBOS.'
          });
        }
        metodoPagoFinal = metodo;

        if (metodo === 'EFECTIVO') {
          montoEfectivoFinal = calc.montoARendirChofer;
          montoTransferenciaFinal = 0;
        } else if (metodo === 'TRANSFERENCIA') {
          montoEfectivoFinal = 0;
          montoTransferenciaFinal = calc.montoARendirChofer;
        } else {
          const efec = Number(montoEfectivo) || 0;
          const transf = Number(montoTransferencia) || 0;
          if (efec < 0 || transf < 0) {
            return res.status(400).json({
              success: false,
              message: 'Los montos de efectivo y transferencia no pueden ser negativos.'
            });
          }
          if (Math.abs((efec + transf) - calc.montoARendirChofer) > 1) {
            return res.status(400).json({
              success: false,
              message: `La suma de Efectivo ($${efec}) + Transferencia ($${transf}) debe coincidir con el monto a rendir ($${calc.montoARendirChofer}).`
            });
          }
          montoEfectivoFinal = round2(efec);
          montoTransferenciaFinal = round2(transf);
        }
      } else if (calc.saldoAFavorChofer > 0) {
        const quien = quienPagaSaldoAFavor || (rol === 'DUENIO' ? 'PAGADO_DUENIO' : 'PENDIENTE_DUENIO');
        if (!['COORDINADOR', 'PENDIENTE_DUENIO', 'PAGADO_DUENIO'].includes(quien)) {
          return res.status(400).json({
            success: false,
            message: 'Debe indicar si el saldo a favor lo paga el COORDINADOR, el DUENIO o queda PENDIENTE_DUENIO.'
          });
        }
        quienPagaFinal = quien;

        if (quien === 'COORDINADOR' || quien === 'PAGADO_DUENIO') {
          const metodo = metodoPagoChofer || 'EFECTIVO';
          if (!metodosPagoValidos.includes(metodo)) {
            return res.status(400).json({
              success: false,
              message: 'Medio de pago inválido.'
            });
          }
          metodoPagoFinal = metodo;
          if (metodo === 'EFECTIVO') {
            montoEfectivoFinal = calc.saldoAFavorChofer;
            montoTransferenciaFinal = 0;
          } else if (metodo === 'TRANSFERENCIA') {
            montoEfectivoFinal = 0;
            montoTransferenciaFinal = calc.saldoAFavorChofer;
          } else {
            const efec = Number(montoEfectivo) || 0;
            const transf = Number(montoTransferencia) || 0;
            if (Math.abs((efec + transf) - calc.saldoAFavorChofer) > 1) {
              return res.status(400).json({
                success: false,
                message: `La suma de Efectivo + Transferencia debe coincidir con el saldo a favor ($${calc.saldoAFavorChofer}).`
              });
            }
            montoEfectivoFinal = round2(efec);
            montoTransferenciaFinal = round2(transf);
          }
        }
      }

      const cerradoDirectoPorDuenio = rol === 'DUENIO' && quienPagaFinal !== 'PENDIENTE_DUENIO';

      // Registrar la liquidación y relacionar los viajes en una transacción
      const liquidacion = await prisma.$transaction(async (tx) => {
        const liq = await tx.liquidacion.create({
          data: {
            choferId: chofer.id,
            coordinadorId: userId, // ID del usuario autenticado (dueño o coordinador) en la tabla 'User'
            totalRecaudado: calc.totalRecaudado,
            combustible: chofer.esPropietario ? 0 : combustibleVal,
            comisionChofer: calc.comisionChofer,
            comisionAgencia: calc.comisionAgencia,
            gananciaPropietario: calc.gananciaPropietario,
            totalEfectivoViajes: calc.totalEfectivoViajes,
            totalTransferenciaViajes: calc.totalTransferenciaViajes,
            totalTransferenciaAgencia: calc.totalTransferenciaAgencia,
            totalTransferenciaPropia: calc.totalTransferenciaPropia,
            totalCuentaCorrienteViajes: calc.totalCuentaCorrienteViajes,
            saldoNeto: calc.saldoNeto,
            saldoAFavorChofer: calc.saldoAFavorChofer,
            quienPagaSaldoAFavor: quienPagaFinal,
            metodoPagoChofer: metodoPagoFinal,
            montoEfectivo: montoEfectivoFinal,
            montoTransferencia: montoTransferenciaFinal,
            observaciones: observaciones || null,
            dineroRecibido: cerradoDirectoPorDuenio,
            metodoEntregaDuenio: cerradoDirectoPorDuenio
              ? (metodoPagoFinal === 'TRANSFERENCIA' ? 'TRANSFERENCIA' : 'CHOFER_MANO')
              : null,
            fechaRecepcionDuenio: cerradoDirectoPorDuenio ? new Date() : null
          }
        });

        // Actualizar todos los viajes asociados
        await tx.viaje.updateMany({
          where: {
            id: { in: viajes.map(v => v.id) }
          },
          data: {
            liquidacionId: liq.id
          }
        });

        return liq;
      });

      // Registrar log de auditoría
      await prisma.appUsage.create({
        data: {
          userId,
          userEmail: req.user!.email,
          action: 'CREATE_LIQUIDACION',
          details: JSON.stringify({
            liquidacionId: liquidacion.id,
            choferId: chofer.id,
            totalRecaudado: calc.totalRecaudado,
            comisionChofer: calc.comisionChofer,
            comisionAgencia: calc.comisionAgencia,
            combustibleVal,
            gananciaPropietario: calc.gananciaPropietario,
            saldoNeto: calc.saldoNeto,
            saldoAFavorChofer: calc.saldoAFavorChofer,
            quienPagaSaldoAFavor: quienPagaFinal,
            metodoPagoChofer: metodoPagoFinal,
            montoEfectivo: montoEfectivoFinal,
            montoTransferencia: montoTransferenciaFinal
          }),
          ipAddress: req.ip,
          userAgent: req.get('User-Agent') || null
        }
      });

      res.status(201).json({
        success: true,
        data: liquidacion,
        message: 'Cierre de caja y liquidación registrados correctamente'
      });
    } catch (error) {
      console.error('Error al registrar liquidación:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Obtener resumen de lo recaudado por el coordinador en su turno (hoy)
  async getResumenCoordinador(req: AuthenticatedRequest, res: Response) {
    try {
      const { id: userId } = req.user!;

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const liquidaciones = await prisma.liquidacion.findMany({
        where: {
          coordinadorId: userId,
          fecha: {
            gte: startOfToday
          }
        },
        include: {
          chofer: {
            select: {
              nombre: true,
              apellido: true,
              numeroChofer: true,
              esPropietario: true,
              esFranquero: true
            }
          }
        },
        orderBy: {
          fecha: 'desc'
        }
      });

      const totalRecaudado = liquidaciones.reduce((sum, l) => sum + l.totalRecaudado, 0);
      const totalComisionAgencia = liquidaciones.reduce((sum, l) => sum + l.comisionAgencia, 0);
      const totalGananciaPropietario = liquidaciones.reduce((sum, l) => sum + l.gananciaPropietario, 0);
      const totalCombustible = liquidaciones.reduce((sum, l) => sum + l.combustible, 0);

      const totalEfectivoCobrado = liquidaciones
        .filter(l => l.saldoNeto > 0)
        .reduce((sum, l) => sum + (l.montoEfectivo || 0), 0);
      const totalTransferenciaCobrada = liquidaciones
        .filter(l => l.saldoNeto > 0)
        .reduce((sum, l) => sum + (l.montoTransferencia || 0), 0);
      const totalPagadoSaldoAFavorCaja = liquidaciones
        .filter(l => l.saldoAFavorChofer > 0 && l.quienPagaSaldoAFavor === 'COORDINADOR')
        .reduce((sum, l) => sum + l.saldoAFavorChofer, 0);
      const totalEfectivoPagadoCaja = liquidaciones
        .filter(l => l.saldoAFavorChofer > 0 && l.quienPagaSaldoAFavor === 'COORDINADOR')
        .reduce((sum, l) => sum + (l.montoEfectivo || 0), 0);
      const totalSaldoAFavorPendienteDuenio = liquidaciones
        .filter(l => l.saldoAFavorChofer > 0 && l.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO')
        .reduce((sum, l) => sum + l.saldoAFavorChofer, 0);
      const netoEfectivoEnCaja = round2(totalEfectivoCobrado - totalEfectivoPagadoCaja);

      res.json({
        success: true,
        data: {
          liquidaciones,
          resumen: {
            totalRecaudado: round2(totalRecaudado),
            totalComisionAgencia: round2(totalComisionAgencia),
            totalGananciaPropietario: round2(totalGananciaPropietario),
            totalCombustible: round2(totalCombustible),
            totalEfectivoCobrado: round2(totalEfectivoCobrado),
            totalTransferenciaCobrada: round2(totalTransferenciaCobrada),
            totalPagadoSaldoAFavorCaja: round2(totalPagadoSaldoAFavorCaja),
            totalSaldoAFavorPendienteDuenio: round2(totalSaldoAFavorPendienteDuenio),
            netoEfectivoEnCaja
          }
        }
      });
    } catch (error) {
      console.error('Error al obtener resumen de coordinador:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Historial de todas las liquidaciones para el dueño
  async getHistorialDuenio(req: AuthenticatedRequest, res: Response) {
    try {
      const { id: userId } = req.user!;

      const duenio = await prisma.duenio.findUnique({
        where: { userId },
        include: { remiserias: { select: { remiseriaId: true } } }
      });

      if (!duenio) {
        return res.status(404).json({
          success: false,
          message: 'Dueño no encontrado'
        });
      }

      const remiseriaIds = duenio.remiserias.map(r => r.remiseriaId);

      const liquidaciones = await prisma.liquidacion.findMany({
        where: {
          chofer: {
            remiseriaId: { in: remiseriaIds }
          }
        },
        include: {
          chofer: {
            select: {
              id: true,
              nombre: true,
              apellido: true,
              numeroChofer: true,
              esPropietario: true,
              esFranquero: true,
              vehiculo: {
                select: {
                  id: true,
                  patente: true,
                  marca: true,
                  modelo: true,
                  propietario: true
                }
              }
            }
          },
          viajes: {
            select: {
              id: true,
              precio: true,
              fecha: true,
              origen: true,
              destino: true,
              metodoPago: true,
              destinoTransferencia: true,
              distanciaKmConPasajero: true,
              clienteNombre: true,
              cliente: {
                select: {
                  id: true,
                  nombre: true,
                  apellido: true,
                  telefono: true
                }
              },
              artEmpresa: {
                select: {
                  id: true,
                  nombre: true
                }
              },
              vehiculo: {
                select: {
                  id: true,
                  patente: true,
                  marca: true,
                  modelo: true,
                  propietario: true
                }
              }
            },
            orderBy: {
              fecha: 'desc'
            }
          },
          coordinador: {
            select: {
              email: true,
              coordinador: {
                select: {
                  nombre: true
                }
              },
              duenio: {
                select: {
                  nombre: true
                }
              }
            }
          }
        },
        orderBy: {
          fecha: 'desc'
        }
      });

      res.json({
        success: true,
        data: liquidaciones
      });
    } catch (error) {
      console.error('Error al obtener historial para dueño:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Historial de liquidaciones del propio chofer
  async getHistorialChofer(req: AuthenticatedRequest, res: Response) {
    try {
      const choferId = req.user?.chofer?.id;

      if (!choferId) {
        return res.status(400).json({
          success: false,
          message: 'El usuario no tiene un chofer asociado'
        });
      }

      const liquidaciones = await prisma.liquidacion.findMany({
        where: {
          choferId
        },
        include: {
          coordinador: {
            select: {
              id: true,
              email: true,
              rol: true,
              coordinador: {
                select: {
                  id: true,
                  nombre: true,
                  email: true
                }
              },
              duenio: {
                select: {
                  id: true,
                  nombre: true,
                  telefono: true
                }
              }
            }
          },
          viajes: {
            select: {
              id: true,
              origen: true,
              destino: true,
              precio: true,
              fecha: true,
              metodoPago: true,
              clienteNombre: true
            },
            orderBy: {
              fecha: 'desc'
            }
          }
        },
        orderBy: {
          fecha: 'desc'
        }
      });

      res.json({
        success: true,
        data: liquidaciones
      });
    } catch (error) {
      console.error('Error al obtener historial para chofer:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  },

  // Marcar recepción de dinero por parte del Dueño
  async marcarRecepcionDuenio(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const { id: userId, rol } = req.user!;
      const { dineroRecibido, metodoEntregaDuenio, notasRecepcion } = req.body;

      if (rol !== 'DUENIO') {
        return res.status(403).json({
          success: false,
          message: 'Solo el dueño puede confirmar la recepción del dinero'
        });
      }

      const duenio = await prisma.duenio.findUnique({
        where: { userId },
        include: { remiserias: { select: { remiseriaId: true } } }
      });

      if (!duenio) {
        return res.status(404).json({
          success: false,
          message: 'Dueño no encontrado'
        });
      }

      const remiseriaIds = duenio.remiserias.map(r => r.remiseriaId);

      const liquidacion = await prisma.liquidacion.findUnique({
        where: { id },
        include: {
          chofer: {
            select: { remiseriaId: true }
          }
        }
      });

      if (!liquidacion) {
        return res.status(404).json({
          success: false,
          message: 'Liquidación no encontrada'
        });
      }

      if (!remiseriaIds.includes(liquidacion.chofer.remiseriaId)) {
        return res.status(403).json({
          success: false,
          message: 'No tienes permisos para modificar esta liquidación'
        });
      }

      const recibido = Boolean(dineroRecibido);
      const metodosValidos = ['COORDINADOR', 'CHOFER_MANO', 'TRANSFERENCIA'];

      if (recibido && !metodosValidos.includes(metodoEntregaDuenio)) {
        return res.status(400).json({
          success: false,
          message: 'Debes seleccionar un método de entrega válido (Coordinador, Chofer en mano o Transferencia)'
        });
      }

      // Si es una liquidación con saldo a favor del chofer pendiente del dueño, también actualizar su estado de pago
      let quienPagaSaldoAFavorUpdate: string | undefined;
      if (liquidacion.saldoAFavorChofer > 0) {
        if (recibido && liquidacion.quienPagaSaldoAFavor === 'PENDIENTE_DUENIO') {
          quienPagaSaldoAFavorUpdate = 'PAGADO_DUENIO';
        } else if (!recibido && liquidacion.quienPagaSaldoAFavor === 'PAGADO_DUENIO') {
          quienPagaSaldoAFavorUpdate = 'PENDIENTE_DUENIO';
        }
      }

      const updated = await prisma.liquidacion.update({
        where: { id },
        data: {
          dineroRecibido: recibido,
          metodoEntregaDuenio: recibido ? metodoEntregaDuenio : null,
          fechaRecepcionDuenio: recibido ? new Date() : null,
          notasRecepcion: recibido ? (notasRecepcion?.trim() || null) : null,
          ...(quienPagaSaldoAFavorUpdate ? { quienPagaSaldoAFavor: quienPagaSaldoAFavorUpdate } : {})
        }
      });

      res.json({
        success: true,
        data: updated,
        message: recibido ? 'Recepción de dinero confirmada' : 'Marca de recepción removida'
      });
    } catch (error) {
      console.error('Error al actualizar recepción de liquidación:', error);
      res.status(500).json({
        success: false,
        message: 'Error interno del servidor'
      });
    }
  }
};
