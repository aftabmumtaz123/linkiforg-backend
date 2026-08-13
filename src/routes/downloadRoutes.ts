import { Router } from 'express';
import {
  createDownloadJob,
  getJob,
  getDownloadUrl,
  mediaInfo,
} from '../controllers/downloadController.js';

const router = Router();

router.post('/download', createDownloadJob);
router.post('/info', mediaInfo);
router.get('/jobs/:jobId', getJob);
router.get('/jobs/:jobId/download', getDownloadUrl);

router.get('/testing', (_req, res) => {
  res.json({ success: true, message: 'Testing route is working!' });
});

export default router;
