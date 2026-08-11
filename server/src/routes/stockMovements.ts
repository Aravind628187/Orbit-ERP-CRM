import { Router } from 'express';
import { listStockMovements } from '../controllers/stockMovementController.js';
import { allowRoles } from '../middleware/auth.js';
import { asyncHandler } from '../utils/http.js';
const router=Router();router.use(allowRoles('Admin','Warehouse'));router.get('/',asyncHandler(listStockMovements));export default router;
