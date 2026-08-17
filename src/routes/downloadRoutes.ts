import { Router } from 'express';
import {
  createDownloadJob,
  directDownload,
  downloadJobFile,
  getDownloadUrl,
  getJob,
  mediaInfo,
} from '../controllers/downloadController.js';

const router = Router();

router.post('/download', createDownloadJob);
router.post('/download/direct', directDownload);
router.post('/info', mediaInfo);
router.get('/jobs/:jobId', getJob);
router.get('/jobs/:jobId/download', getDownloadUrl);
router.get('/jobs/:jobId/file', downloadJobFile);
router.get('/testing', (_req, res) => {
  res.json({ success: true, message: 'Testing route is working!' });
});

export default router;
