import { Router } from 'express';
import { login, me } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
import { loginRateLimit } from '../middleware/rateLimit.js';
const router=Router();router.post('/login',loginRateLimit,asyncHandler(login));router.get('/me',authenticate,me);export default router;
