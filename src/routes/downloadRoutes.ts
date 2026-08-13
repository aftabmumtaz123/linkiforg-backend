import { Router } from 'express';
import { downloadController, infoController } from '../controllers/downloadController.js';
import { downloadRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/info', downloadRateLimiter, infoController);
router.post('/download', downloadRateLimiter, downloadController);

export default router;
