import express from 'express';
import { coordinatorDashboardController } from '../controllers/coordinatorDashboardController';
import { liquidacionController } from '../controllers/liquidacionController';
import { authenticateToken, requireRoles } from '../middleware/auth';

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// Rutas compartidas con Chofer (geocodificación e historial propio de liquidaciones)
router.get('/geocode', coordinatorDashboardController.geocode);
router.get(
  '/liquidaciones/chofer/historial',
  requireRoles('CHOFER', 'COORDINADOR', 'DUENIO', 'ADMIN'),
  liquidacionController.getHistorialChofer
);

// El resto de las rutas del dashboard son exclusivas de Coordinador, Dueño o Admin
router.use(requireRoles('COORDINADOR', 'DUENIO', 'ADMIN'));

// Obtener viajes en curso
router.get('/viajes/en-curso', coordinatorDashboardController.getViajesEnCurso);

// Obtener viajes sin asignar
router.get('/viajes/sin-asignar', coordinatorDashboardController.getViajesSinAsignar);

// Obtener historial de viajes (finalizados, anulados)
router.get('/viajes/historial', coordinatorDashboardController.getViajesHistorial);

// Asignar chofer y vehículo a un viaje
router.patch('/viajes/:id/asignar', coordinatorDashboardController.asignarViaje);

// Actualizar estado de un viaje
router.patch('/viajes/:id/estado', coordinatorDashboardController.actualizarEstadoViaje);

// Obtener reservas activas
router.get('/reservas', coordinatorDashboardController.getViajesReservados);

// Crear nuevo viaje
router.post('/viajes', coordinatorDashboardController.createViaje);

// Crear nuevo cliente al vuelo
router.post('/clientes', coordinatorDashboardController.createCliente);

// Calcular precio del viaje
router.post('/viajes/calcular-precio', coordinatorDashboardController.calcularPrecio);

// Crear nueva reserva
router.post('/reservas', coordinatorDashboardController.createReserva);

// Actualizar una reserva existente
router.patch('/reservas/:id', coordinatorDashboardController.updateReserva);

// Eliminar / cancelar una reserva
router.delete('/reservas/:id', coordinatorDashboardController.deleteReserva);

// Obtener remisería del coordinador
router.get('/mi-remiseria', coordinatorDashboardController.getMiRemiseria);

// Obtener vehículos en tiempo real
router.get('/vehiculos/tiempo-real', coordinatorDashboardController.getVehiculosTiempoReal);

// Obtener choferes en tiempo real
router.get('/choferes/tiempo-real', coordinatorDashboardController.getChoferesTiempoReal);

// Obtener estadísticas del dashboard
router.get('/stats', coordinatorDashboardController.getDashboardStats);

// Reportes y métricas del coordinador (facturación/viajes por auto y picos por hora)
router.get('/reportes-metricas', coordinatorDashboardController.getReportesMetricas);

// Despacho Óptimo por Lotes (Batch Matching tipo Uber)
router.get('/despacho-optimo', coordinatorDashboardController.getDespachoOptimo);
router.post('/despacho-optimo/aplicar', coordinatorDashboardController.aplicarDespachoOptimo);

// Búsqueda predictiva de clientes por teléfono o nombre
router.get('/clientes/predictivo', coordinatorDashboardController.searchClientesPredictivo);

// Listado rápido de Empresas / Clientes con Cuenta Corriente para Nuevo Viaje (1 clic)
router.get('/clientes/cuentas-corrientes', coordinatorDashboardController.getClientesCuentaCorriente);

// Carga ultrarrápida express de viaje telefónico (< 5s)
router.post('/viajes/express', coordinatorDashboardController.crearViajeExpress);

// Reasignación rápida de móvil en caliente (1 clic)
router.patch('/viajes/:id/reasignar', coordinatorDashboardController.reasignarViaje);

// Auditoría completa de cancelaciones
router.get('/auditoria/cancelaciones', coordinatorDashboardController.getAuditoriaCancelaciones);

// Tarifas dinámicas especiales (Lluvia, Nocturna, Feriado)
router.get('/tarifas', coordinatorDashboardController.getConfiguracionTarifas);
router.patch('/tarifas', coordinatorDashboardController.updateConfiguracionTarifas);

// Estado de Atención de la Central (Apertura / Pausa por tormenta o emergencia)
router.get('/estado-atencion', coordinatorDashboardController.getEstadoAtencionCentral);
router.patch('/estado-atencion', coordinatorDashboardController.updateEstadoAtencionCentral);

// Liquidaciones y Cierre de Caja
router.get('/liquidaciones/resumen-coordinador', liquidacionController.getResumenCoordinador);
router.get('/liquidaciones/duenio/historial', liquidacionController.getHistorialDuenio);
router.get('/liquidaciones/pendientes/:choferId', liquidacionController.getPendientes);
router.post('/liquidaciones/crear', liquidacionController.crear);
router.patch('/liquidaciones/:id/recepcion', requireRoles('DUENIO', 'ADMIN'), liquidacionController.marcarRecepcionDuenio);

export default router;
