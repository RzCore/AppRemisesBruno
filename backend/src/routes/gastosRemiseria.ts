import { Router } from 'express';
import { gastoRemiseriaController } from '../controllers/gastoRemiseriaController';
import { authenticateToken, requireRoles } from '../middleware/auth';

const router = Router();

// Exclusivo para Dueño o Admin
router.use(authenticateToken);
router.use(requireRoles('DUENIO', 'ADMIN'));

router.get('/', gastoRemiseriaController.listar);
router.post('/', gastoRemiseriaController.crear);
router.post('/generar-recurrentes', gastoRemiseriaController.generarRecurrentesMes);
router.put('/:id', gastoRemiseriaController.actualizar);
router.patch('/:id/estado', gastoRemiseriaController.cambiarEstado);
router.delete('/:id', gastoRemiseriaController.eliminar);

export default router;
