import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest } from '../types';

export const CATEGORIAS_GASTO_REMISERIA = [
  'SUELDO_COORDINADOR',
  'SUELDO_OTRO',
  'ALQUILER',
  'LUZ',
  'AGUA',
  'GAS',
  'INTERNET',
  'TELEFONO',
  'WHATSAPP',
  'SISTEMA',
  'IMPUESTOS',
  'CONTADOR',
  'SEGURO',
  'MANTENIMIENTO_LOCAL',
  'PUBLICIDAD',
  'COMISIONES_BANCARIAS',
  'INSUMOS_OFICINA',
  'FLOTA_PROPIA',
  'OTRO'
] as const;

export const METODOS_PAGO_GASTO = [
  'EFECTIVO',
  'TRANSFERENCIA',
  'DEBITO',
  'CREDITO',
  'MERCADOPAGO',
  'CHEQUE',
  'OTRO'
] as const;

async function resolveRemiseriaId(req: AuthenticatedRequest): Promise<string | null> {
  const userId = req.user?.id;
  const rol = req.user?.rol;

  if (req.query.remiseriaId && typeof req.query.remiseriaId === 'string') {
    return req.query.remiseriaId;
  }
  if (req.body?.remiseriaId && typeof req.body.remiseriaId === 'string') {
    return req.body.remiseriaId;
  }

  if (rol === 'DUENIO' && userId) {
    const duenio = await prisma.duenio.findFirst({
      where: { userId },
      include: {
        remiserias: {
          select: { remiseriaId: true }
        }
      }
    });
    if (duenio && duenio.remiserias.length > 0) {
      return duenio.remiserias[0].remiseriaId;
    }
  }

  const first = await prisma.remiseria.findFirst({ select: { id: true } });
  return first?.id || null;
}

function parseFechaLocal(valor?: string | null): Date | null {
  if (!valor) return null;
  const str = String(valor).trim();
  if (!str) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    // Guardar al mediodía UTC para evitar corrimientos de día en UTC-3
    return new Date(`${str}T12:00:00.000Z`);
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function getPeriodoMesFromDate(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export const gastoRemiseriaController = {
  // Listar gastos con filtros y resumen completo
  async listar(req: AuthenticatedRequest, res: Response) {
    try {
      const remiseriaId = await resolveRemiseriaId(req);
      if (!remiseriaId) {
        return res.status(400).json({
          success: false,
          message: 'No se encontró una remisería asociada'
        });
      }

      const {
        desde,
        hasta,
        categoria,
        estado,
        metodoPago,
        esRecurrente,
        coordinadorId,
        periodoMes,
        q
      } = req.query;

      const where: any = { remiseriaId };

      if (periodoMes && typeof periodoMes === 'string' && /^\d{4}-\d{2}$/.test(periodoMes)) {
        where.periodoMes = periodoMes;
      } else if (desde || hasta) {
        where.fecha = {};
        if (desde && typeof desde === 'string') {
          where.fecha.gte = new Date(`${desde}T00:00:00.000Z`);
        }
        if (hasta && typeof hasta === 'string') {
          where.fecha.lte = new Date(`${hasta}T23:59:59.999Z`);
        }
      }

      if (categoria && typeof categoria === 'string' && categoria !== 'TODAS') {
        where.categoria = categoria;
      }

      if (estado && typeof estado === 'string' && estado !== 'TODOS') {
        where.estado = estado;
      }

      if (metodoPago && typeof metodoPago === 'string' && metodoPago !== 'TODOS') {
        where.metodoPago = metodoPago;
      }

      if (esRecurrente === 'true') {
        where.esRecurrente = true;
      } else if (esRecurrente === 'false') {
        where.esRecurrente = false;
      }

      if (coordinadorId && typeof coordinadorId === 'string' && coordinadorId !== 'TODOS') {
        where.coordinadorId = coordinadorId;
      }

      if (q && typeof q === 'string' && q.trim().length > 0) {
        const term = q.trim();
        where.OR = [
          { concepto: { contains: term, mode: 'insensitive' } },
          { proveedor: { contains: term, mode: 'insensitive' } },
          { numeroComprobante: { contains: term, mode: 'insensitive' } },
          { observaciones: { contains: term, mode: 'insensitive' } }
        ];
      }

      const gastos = await prisma.gastoRemiseria.findMany({
        where,
        include: {
          coordinador: {
            select: {
              id: true,
              nombre: true,
              email: true
            }
          }
        },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }]
      });

      const hoyInicio = new Date();
      hoyInicio.setHours(0, 0, 0, 0);

      let totalGeneral = 0;
      let totalPagado = 0;
      let totalPendiente = 0;
      let totalVencido = 0;
      let totalRecurrente = 0;
      let cantidadPendientes = 0;
      let cantidadVencidos = 0;

      const mapCategoria = new Map<string, { categoria: string; total: number; cantidad: number }>();
      const mapMetodo = new Map<string, { metodoPago: string; total: number; cantidad: number }>();
      const mapCoord = new Map<string, { coordinadorId: string; nombre: string; total: number; cantidad: number }>();

      for (const g of gastos) {
        const monto = Number(g.monto || 0);
        totalGeneral += monto;

        if (g.estado === 'PAGADO') {
          totalPagado += monto;
        } else {
          totalPendiente += monto;
          cantidadPendientes += 1;
          if (g.fechaVencimiento && new Date(g.fechaVencimiento) < hoyInicio) {
            totalVencido += monto;
            cantidadVencidos += 1;
          }
        }

        if (g.esRecurrente) {
          totalRecurrente += monto;
        }

        const catEntry = mapCategoria.get(g.categoria) || { categoria: g.categoria, total: 0, cantidad: 0 };
        catEntry.total += monto;
        catEntry.cantidad += 1;
        mapCategoria.set(g.categoria, catEntry);

        const metEntry = mapMetodo.get(g.metodoPago) || { metodoPago: g.metodoPago, total: 0, cantidad: 0 };
        metEntry.total += monto;
        metEntry.cantidad += 1;
        mapMetodo.set(g.metodoPago, metEntry);

        if (g.coordinadorId && g.coordinador) {
          const cEntry = mapCoord.get(g.coordinadorId) || {
            coordinadorId: g.coordinadorId,
            nombre: g.coordinador.nombre,
            total: 0,
            cantidad: 0
          };
          cEntry.total += monto;
          cEntry.cantidad += 1;
          mapCoord.set(g.coordinadorId, cEntry);
        }
      }

      const porCategoria = Array.from(mapCategoria.values())
        .map((c) => ({
          ...c,
          total: Math.round(c.total * 100) / 100,
          porcentaje: totalGeneral > 0 ? Math.round((c.total / totalGeneral) * 1000) / 10 : 0
        }))
        .sort((a, b) => b.total - a.total);

      const porMetodoPago = Array.from(mapMetodo.values())
        .map((m) => ({
          ...m,
          total: Math.round(m.total * 100) / 100
        }))
        .sort((a, b) => b.total - a.total);

      const porCoordinador = Array.from(mapCoord.values())
        .map((c) => ({
          ...c,
          total: Math.round(c.total * 100) / 100
        }))
        .sort((a, b) => b.total - a.total);

      return res.json({
        success: true,
        data: {
          gastos,
          resumen: {
            totalGeneral: Math.round(totalGeneral * 100) / 100,
            totalPagado: Math.round(totalPagado * 100) / 100,
            totalPendiente: Math.round(totalPendiente * 100) / 100,
            totalVencido: Math.round(totalVencido * 100) / 100,
            totalRecurrente: Math.round(totalRecurrente * 100) / 100,
            cantidadGastos: gastos.length,
            cantidadPendientes,
            cantidadVencidos,
            porCategoria,
            porMetodoPago,
            porCoordinador
          }
        },
        message: 'Gastos de la remisería obtenidos exitosamente'
      });
    } catch (error) {
      console.error('Error al listar gastos de remisería:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno al obtener los gastos de la remisería'
      });
    }
  },

  // Crear un nuevo gasto
  async crear(req: AuthenticatedRequest, res: Response) {
    try {
      const remiseriaId = await resolveRemiseriaId(req);
      if (!remiseriaId) {
        return res.status(400).json({
          success: false,
          message: 'No se encontró la remisería asociada'
        });
      }

      const {
        categoria,
        concepto,
        proveedor,
        monto,
        fecha,
        fechaVencimiento,
        estado,
        metodoPago,
        numeroComprobante,
        esRecurrente,
        diaVencimientoMensual,
        periodoMes,
        coordinadorId,
        observaciones
      } = req.body;

      if (!concepto || !String(concepto).trim()) {
        return res.status(400).json({
          success: false,
          message: 'El concepto del gasto es obligatorio'
        });
      }

      const montoNum = Number(monto);
      if (!Number.isFinite(montoNum) || montoNum <= 0) {
        return res.status(400).json({
          success: false,
          message: 'El monto debe ser un número mayor a 0'
        });
      }

      const categoriaFinal = String(categoria || 'OTRO').toUpperCase();
      const fechaFinal = parseFechaLocal(fecha) || new Date();
      const fechaVencFinal = parseFechaLocal(fechaVencimiento);
      const estadoFinal = String(estado || 'PAGADO').toUpperCase() === 'PENDIENTE' ? 'PENDIENTE' : 'PAGADO';
      const metodoFinal = String(metodoPago || 'EFECTIVO').toUpperCase();
      const periodoFinal =
        periodoMes && /^\d{4}-\d{2}$/.test(String(periodoMes))
          ? String(periodoMes)
          : getPeriodoMesFromDate(fechaFinal);

      let coordIdFinal: string | null = null;
      if (coordinadorId && typeof coordinadorId === 'string' && coordinadorId.trim()) {
        const coord = await prisma.coordinador.findFirst({
          where: { id: coordinadorId.trim(), remiseriaId },
          select: { id: true }
        });
        if (coord) coordIdFinal = coord.id;
      }

      const diaVencNum =
        diaVencimientoMensual !== undefined && diaVencimientoMensual !== null && diaVencimientoMensual !== ''
          ? Math.min(31, Math.max(1, parseInt(String(diaVencimientoMensual), 10)))
          : fechaVencFinal
          ? fechaVencFinal.getUTCDate()
          : null;

      const nuevoGasto = await prisma.gastoRemiseria.create({
        data: {
          remiseriaId,
          coordinadorId: coordIdFinal,
          categoria: categoriaFinal,
          concepto: String(concepto).trim(),
          proveedor: proveedor ? String(proveedor).trim() : null,
          monto: Math.round(montoNum * 100) / 100,
          fecha: fechaFinal,
          fechaVencimiento: fechaVencFinal,
          estado: estadoFinal,
          metodoPago: metodoFinal,
          numeroComprobante: numeroComprobante ? String(numeroComprobante).trim() : null,
          esRecurrente: Boolean(esRecurrente),
          diaVencimientoMensual: Boolean(esRecurrente) ? diaVencNum : null,
          periodoMes: periodoFinal,
          observaciones: observaciones ? String(observaciones).trim() : null
        },
        include: {
          coordinador: {
            select: { id: true, nombre: true, email: true }
          }
        }
      });

      return res.status(201).json({
        success: true,
        data: nuevoGasto,
        message: 'Gasto registrado exitosamente'
      });
    } catch (error) {
      console.error('Error al crear gasto de remisería:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno al registrar el gasto'
      });
    }
  },

  // Actualizar un gasto existente
  async actualizar(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const remiseriaId = await resolveRemiseriaId(req);

      const existente = await prisma.gastoRemiseria.findFirst({
        where: { id, ...(remiseriaId ? { remiseriaId } : {}) }
      });

      if (!existente) {
        return res.status(404).json({
          success: false,
          message: 'Gasto no encontrado'
        });
      }

      const {
        categoria,
        concepto,
        proveedor,
        monto,
        fecha,
        fechaVencimiento,
        estado,
        metodoPago,
        numeroComprobante,
        esRecurrente,
        diaVencimientoMensual,
        periodoMes,
        coordinadorId,
        observaciones
      } = req.body;

      const dataUpdate: any = {};

      if (categoria !== undefined) dataUpdate.categoria = String(categoria).toUpperCase();
      if (concepto !== undefined) {
        if (!String(concepto).trim()) {
          return res.status(400).json({ success: false, message: 'El concepto no puede estar vacío' });
        }
        dataUpdate.concepto = String(concepto).trim();
      }
      if (proveedor !== undefined) dataUpdate.proveedor = proveedor ? String(proveedor).trim() : null;
      if (monto !== undefined) {
        const montoNum = Number(monto);
        if (!Number.isFinite(montoNum) || montoNum <= 0) {
          return res.status(400).json({ success: false, message: 'El monto debe ser mayor a 0' });
        }
        dataUpdate.monto = Math.round(montoNum * 100) / 100;
      }
      if (fecha !== undefined) {
        const parsed = parseFechaLocal(fecha);
        if (parsed) {
          dataUpdate.fecha = parsed;
          if (!periodoMes) {
            dataUpdate.periodoMes = getPeriodoMesFromDate(parsed);
          }
        }
      }
      if (fechaVencimiento !== undefined) {
        dataUpdate.fechaVencimiento = fechaVencimiento ? parseFechaLocal(fechaVencimiento) : null;
      }
      if (estado !== undefined) {
        dataUpdate.estado = String(estado).toUpperCase() === 'PENDIENTE' ? 'PENDIENTE' : 'PAGADO';
      }
      if (metodoPago !== undefined) {
        dataUpdate.metodoPago = String(metodoPago).toUpperCase();
      }
      if (numeroComprobante !== undefined) {
        dataUpdate.numeroComprobante = numeroComprobante ? String(numeroComprobante).trim() : null;
      }
      if (esRecurrente !== undefined) {
        dataUpdate.esRecurrente = Boolean(esRecurrente);
      }
      if (diaVencimientoMensual !== undefined) {
        dataUpdate.diaVencimientoMensual =
          diaVencimientoMensual === null || diaVencimientoMensual === ''
            ? null
            : Math.min(31, Math.max(1, parseInt(String(diaVencimientoMensual), 10)));
      }
      if (periodoMes !== undefined && /^\d{4}-\d{2}$/.test(String(periodoMes))) {
        dataUpdate.periodoMes = String(periodoMes);
      }
      if (coordinadorId !== undefined) {
        dataUpdate.coordinadorId = coordinadorId && String(coordinadorId).trim() ? String(coordinadorId).trim() : null;
      }
      if (observaciones !== undefined) {
        dataUpdate.observaciones = observaciones ? String(observaciones).trim() : null;
      }

      const actualizado = await prisma.gastoRemiseria.update({
        where: { id },
        data: dataUpdate,
        include: {
          coordinador: {
            select: { id: true, nombre: true, email: true }
          }
        }
      });

      return res.json({
        success: true,
        data: actualizado,
        message: 'Gasto actualizado exitosamente'
      });
    } catch (error) {
      console.error('Error al actualizar gasto de remisería:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno al actualizar el gasto'
      });
    }
  },

  // Marcar como PAGADO o PENDIENTE rápidamente
  async cambiarEstado(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const remiseriaId = await resolveRemiseriaId(req);

      const existente = await prisma.gastoRemiseria.findFirst({
        where: { id, ...(remiseriaId ? { remiseriaId } : {}) }
      });

      if (!existente) {
        return res.status(404).json({
          success: false,
          message: 'Gasto no encontrado'
        });
      }

      const { estado, metodoPago, numeroComprobante, fecha } = req.body;
      const nuevoEstado =
        estado !== undefined
          ? String(estado).toUpperCase() === 'PENDIENTE'
            ? 'PENDIENTE'
            : 'PAGADO'
          : existente.estado === 'PAGADO'
          ? 'PENDIENTE'
          : 'PAGADO';

      const dataUpdate: any = { estado: nuevoEstado };
      if (metodoPago) dataUpdate.metodoPago = String(metodoPago).toUpperCase();
      if (numeroComprobante !== undefined) {
        dataUpdate.numeroComprobante = numeroComprobante ? String(numeroComprobante).trim() : null;
      }
      if (fecha) {
        const parsed = parseFechaLocal(fecha);
        if (parsed) dataUpdate.fecha = parsed;
      }

      const actualizado = await prisma.gastoRemiseria.update({
        where: { id },
        data: dataUpdate,
        include: {
          coordinador: {
            select: { id: true, nombre: true, email: true }
          }
        }
      });

      return res.json({
        success: true,
        data: actualizado,
        message: nuevoEstado === 'PAGADO' ? 'Gasto marcado como pagado' : 'Gasto marcado como pendiente'
      });
    } catch (error) {
      console.error('Error al cambiar estado del gasto:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno al actualizar el estado del gasto'
      });
    }
  },

  // Eliminar un gasto
  async eliminar(req: AuthenticatedRequest, res: Response) {
    try {
      const { id } = req.params;
      const remiseriaId = await resolveRemiseriaId(req);

      const existente = await prisma.gastoRemiseria.findFirst({
        where: { id, ...(remiseriaId ? { remiseriaId } : {}) }
      });

      if (!existente) {
        return res.status(404).json({
          success: false,
          message: 'Gasto no encontrado'
        });
      }

      await prisma.gastoRemiseria.delete({ where: { id } });

      return res.json({
        success: true,
        message: 'Gasto eliminado exitosamente'
      });
    } catch (error) {
      console.error('Error al eliminar gasto de remisería:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno al eliminar el gasto'
      });
    }
  },

  // Generar gastos fijos / recurrentes para un mes objetivo (ej. "2026-11")
  async generarRecurrentesMes(req: AuthenticatedRequest, res: Response) {
    try {
      const remiseriaId = await resolveRemiseriaId(req);
      if (!remiseriaId) {
        return res.status(400).json({
          success: false,
          message: 'No se encontró la remisería asociada'
        });
      }

      const ahora = new Date();
      const mesObjetivo =
        req.body?.mes && /^\d{4}-\d{2}$/.test(String(req.body.mes))
          ? String(req.body.mes)
          : `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}`;

      const [anioStr, mesStr] = mesObjetivo.split('-');
      const anio = parseInt(anioStr, 10);
      const mesNum = parseInt(mesStr, 10); // 1-12
      const ultimoDiaMes = new Date(Date.UTC(anio, mesNum, 0)).getUTCDate();

      // Buscar todos los gastos marcados como recurrentes en esta remisería (más recientes primero)
      const todosRecurrentes = await prisma.gastoRemiseria.findMany({
        where: {
          remiseriaId,
          esRecurrente: true
        },
        orderBy: [{ fecha: 'desc' }, { createdAt: 'desc' }]
      });

      if (todosRecurrentes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Todavía no tenés gastos marcados como fijos/recurrentes. Marcá "Gasto fijo mensual" al cargar alquiler, luz, sueldos, WhatsApp, sistema, etc.'
        });
      }

      // Gastos ya existentes en el mes objetivo para no duplicar
      const existentesMes = await prisma.gastoRemiseria.findMany({
        where: {
          remiseriaId,
          periodoMes: mesObjetivo
        },
        select: {
          categoria: true,
          concepto: true,
          coordinadorId: true
        }
      });

      const claveExistente = new Set(
        existentesMes.map((e) => `${e.categoria}::${e.concepto.trim().toLowerCase()}::${e.coordinadorId || ''}`)
      );

      // Tomar la última versión de cada gasto recurrente único
      const plantillas = new Map<string, (typeof todosRecurrentes)[number]>();
      for (const g of todosRecurrentes) {
        const key = `${g.categoria}::${g.concepto.trim().toLowerCase()}::${g.coordinadorId || ''}`;
        if (!plantillas.has(key)) {
          plantillas.set(key, g);
        }
      }

      const creados: any[] = [];
      for (const [key, plantilla] of plantillas.entries()) {
        if (claveExistente.has(key)) continue;

        const diaVenc = Math.min(
          ultimoDiaMes,
          Math.max(1, plantilla.diaVencimientoMensual || (plantilla.fechaVencimiento ? plantilla.fechaVencimiento.getUTCDate() : 10))
        );
        const fechaVenc = new Date(Date.UTC(anio, mesNum - 1, diaVenc, 12, 0, 0));
        const fechaGasto = new Date(Date.UTC(anio, mesNum - 1, 1, 12, 0, 0));

        const nuevo = await prisma.gastoRemiseria.create({
          data: {
            remiseriaId,
            coordinadorId: plantilla.coordinadorId,
            categoria: plantilla.categoria,
            concepto: plantilla.concepto,
            proveedor: plantilla.proveedor,
            monto: plantilla.monto,
            fecha: fechaGasto,
            fechaVencimiento: fechaVenc,
            estado: 'PENDIENTE',
            metodoPago: plantilla.metodoPago,
            esRecurrente: true,
            diaVencimientoMensual: diaVenc,
            periodoMes: mesObjetivo,
            observaciones: plantilla.observaciones
          },
          include: {
            coordinador: {
              select: { id: true, nombre: true, email: true }
            }
          }
        });
        creados.push(nuevo);
      }

      if (creados.length === 0) {
        return res.json({
          success: true,
          data: { creados: [], cantidad: 0 },
          message: `Todos los gastos fijos mensuales ya estaban cargados para ${mesObjetivo}`
        });
      }

      return res.status(201).json({
        success: true,
        data: { creados, cantidad: creados.length },
        message: `Se generaron ${creados.length} gastos fijos pendientes para ${mesObjetivo}`
      });
    } catch (error) {
      console.error('Error al generar gastos recurrentes:', error);
      return res.status(500).json({
        success: false,
        message: 'Error interno al generar los gastos fijos del mes'
      });
    }
  }
};
