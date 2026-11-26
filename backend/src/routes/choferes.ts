import express from 'express';
import { choferController } from '../controllers/choferController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Rutas públicas de auto-registro de choferes (antes de authenticateToken)
router.get('/remiserias-disponibles', choferController.getRemiseriasDisponibles);
router.post('/registro', choferController.registroPublico);

// Aplicar middleware de autenticación a todas las rutas protegidas
router.use(authenticateToken);

// Rutas de la App del Chofer (deben ir antes de /:id)
router.get('/mi-estado', choferController.getMiEstado);
router.get('/mis-viajes', choferController.getMisViajes);
router.get('/vehiculos-disponibles', choferController.getVehiculosDisponibles);
router.patch('/mi-perfil', choferController.updateMiPerfil);
router.patch('/online-status', choferController.updateOnlineStatus);
router.post('/viajes/:viajeId/aceptar', choferController.aceptarViaje);
router.post('/viajes/:viajeId/rechazar', choferController.rechazarViaje);
router.patch('/viajes/:viajeId/estado', choferController.actualizarEstadoViaje);
router.post('/viajes/:viajeId/calificar-pasajero', choferController.calificarPasajero);
router.post('/viajes/:viajeId/avisar-llegando', choferController.avisarLlegando);
router.post('/viajes/:viajeId/paradas', choferController.agregarParada);
router.post('/viajes/:viajeId/espera', choferController.controlarEspera);
router.post('/viajes/:viajeId/chat', choferController.enviarMensajeChat);
router.post('/viajes/:viajeId/pasajero-ausente', choferController.reportarPasajeroAusente);
router.post('/deudas-cancelacion/:deudaId/cobrar', choferController.cobrarDeudaCancelacion);
router.post('/viaje-calle', choferController.crearViajeCalle);

// Rutas de Turno y Tracking de Kilometraje
router.get('/turno/activo', choferController.getTurnoActivo);
router.get('/turno/resumen-cierre', choferController.getResumenCierreTurno);
router.get('/turnos', choferController.getMisTurnos);
router.post('/turno/iniciar', choferController.iniciarTurno);
router.post('/turno/finalizar', choferController.finalizarTurno);
router.patch('/turno/actualizar-km', choferController.actualizarKmTurno);
router.post('/turno/pausa', choferController.togglePausa);

// Parada Virtual de Base (Turnero)
router.post('/parada-virtual/anotarse', choferController.anotarseParadaVirtual);
router.post('/parada-virtual/salir', choferController.salirParadaVirtual);
router.get('/parada-virtual/estado', choferController.getEstadoParadaVirtual);

// Rutas de Gastos y Finanzas del Chofer
router.get('/gastos', choferController.getMisGastos);
router.post('/gastos', choferController.crearGasto);
router.delete('/gastos/:gastoId', choferController.eliminarGasto);
router.get('/resumen-financiero', choferController.getResumenFinanciero);

// Lectura de choferes (Dueño, Admin y Coordinador)
router.get('/', choferController.getAll);
router.get('/remiseria/:remiseriaId', choferController.getByRemiseria);
router.get('/:id', choferController.getById);

// Asignación de vehículo (Dueño, Admin y Coordinador)
router.patch('/:id/asignar-vehiculo', choferController.asignarVehiculo);

// Gestión de choferes exclusiva del Dueño / Admin (y aprobación/rechazo)
router.post('/', choferController.create);
router.put('/:id', choferController.update);
router.delete('/:id', choferController.delete);
router.patch('/:id/toggle-status', choferController.toggleStatus);
router.patch('/:id/aprobar', choferController.aprobarChofer);
router.patch('/:id/rechazar', choferController.rechazarChofer);

export default router;
