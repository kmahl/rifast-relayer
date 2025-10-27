import { Router, type Router as RouterType } from 'express';
import { healthCheck } from '../controllers/index.js';

const router: RouterType = Router();

/**
 * GET /health
 * Health check (no auth required for monitoring)
 */
router.get('/health', healthCheck);

export default router;
