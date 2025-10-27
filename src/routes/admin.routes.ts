import { Router, type Router as RouterType } from 'express';
import {
  withdrawFees,
  archiveRaffles
} from '../controllers/index.js';

const router: RouterType = Router();

/**
 * POST /withdraw-fees
 * Withdraw accumulated platform fees
 */
router.post('/withdraw-fees', withdrawFees);

/**
 * POST /archive-raffles
 * Archive completed/cancelled raffles (cleanup)
 */
router.post('/archive-raffles', archiveRaffles);

export default router;
