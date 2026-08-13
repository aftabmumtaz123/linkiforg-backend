import { Router } from 'express';
import {
  createDownloadJob,
  getJob,
  getDownloadUrl,
} from '../controllers/downloadController.js';

const router = Router();

router.post('/download', createDownloadJob);
router.get('/jobs/:jobId', getJob);
router.get('/jobs/:jobId/download', getDownloadUrl);

router.get("/testing", (req, res) => {
  res.json({ message: "Testing route is working!" });
});

export default router;
