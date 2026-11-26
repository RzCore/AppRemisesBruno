import express from 'express';
import { vehiculoController } from '../controllers/vehiculoController';
import { authenticateToken, requireRoles } from '../middleware/auth';

const router = express.Router();

// Aplicar middleware de autenticación a todas las rutas
router.use(authenticateToken);

// Obtener todos los vehículos
router.get('/', vehiculoController.getAll);

// Obtener vehículos por remisería
router.get('/remiseria/:remiseriaId', vehiculoController.getByRemiseria);

// Obtener vehículo por ID
router.get('/:id', vehiculoController.getById);

// Crear vehículo
router.post('/', requireRoles('DUENIO', 'COORDINADOR', 'ADMIN'), vehiculoController.create);

// Actualizar vehículo
router.put('/:id', requireRoles('DUENIO', 'COORDINADOR', 'ADMIN'), vehiculoController.update);

// Baja lógica del vehículo
router.delete('/:id', requireRoles('DUENIO', 'COORDINADOR', 'ADMIN'), vehiculoController.delete);

// Cambiar estado del vehículo
router.patch('/:id/status', requireRoles('DUENIO', 'COORDINADOR', 'ADMIN'), vehiculoController.updateStatus);

export default router; 