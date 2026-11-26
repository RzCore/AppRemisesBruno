import { Router } from 'express';
import { reportesController } from '../controllers/reportesController';
import { authenticateToken, requireRoles } from '../middleware/auth';

const router = Router();

// Aplicar middleware de autenticación y rol a todas las rutas de reportes
router.use(authenticateToken);
router.use(requireRoles('DUENIO', 'COORDINADOR', 'ADMIN'));

// Rutas de reportes para el Rol de DUEÑO
router.get('/mis-remiserias', reportesController.getMisRemiserias);
router.get('/diario', reportesController.getDiario);
router.get('/semanal', reportesController.getSemanal);
router.get('/mensual', reportesController.getMensual);
router.get('/choferes', reportesController.getChoferes);

export default router;
