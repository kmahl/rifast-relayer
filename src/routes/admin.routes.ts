import { Router, type Router as RouterType } from 'express';
import {
  withdrawFees,
  archiveRaffles
} from '../controllers/index.js';
import { checkAdminIP, sensitiveLimiter, logSensitiveOperation } from '../middleware/sensitive.middleware.js';

const router: RouterType = Router();

// Apply sensitive operation protection to ALL admin routes
router.use(checkAdminIP);
router.use(sensitiveLimiter);

/**
 * POST /withdraw-fees
 * Withdraw accumulated platform fees
 */
router.post('/withdraw-fees',
  logSensitiveOperation('withdraw-fees'),
  withdrawFees
);

/**
 * POST /archive-raffles
 * Archive completed/cancelled raffles (cleanup)
 */
router.post('/archive-raffles',
  logSensitiveOperation('archive-raffles'),
  archiveRaffles
);

export default router;
