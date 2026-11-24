import { Router } from 'express';
import {
  login,
  register,
  registerCliente,
  refreshToken,
  validateToken,
  forgotPassword,
  resetPassword,
  changePassword,
  verificarDni,
  loginCliente,
  solicitarCodigoCliente,
  verificarCodigoCliente,
  registroExpressCliente
} from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';
import { body } from 'express-validator';

const router = Router();

// Validaciones
const loginValidation = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
];

const registerValidation = [
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres'),
  body('nombre').notEmpty().withMessage('El nombre es requerido'),
  body('telefono').notEmpty().withMessage('El teléfono es requerido')
];

// Rutas generales
router.post('/login', loginValidation, login);
router.post('/register', registerValidation, register);
router.post('/register-cliente', registerCliente);
router.post('/refresh', refreshToken);
router.get('/validate', validateToken);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/change-password', authenticateToken, changePassword);

// Rutas exclusivas para login y acceso de Clientes (DNI, Teléfono, PIN o WhatsApp OTP)
router.post('/cliente/login', loginCliente);
router.post('/cliente/solicitar-codigo', solicitarCodigoCliente);
router.post('/cliente/verificar-codigo', verificarCodigoCliente);
router.post('/cliente/registro-express', registroExpressCliente);

// Verificación de identidad oficial con ARCA (ex-AFIP) / ANSES por DNI
router.get('/verificar-dni/:dni', verificarDni);

export default router;
