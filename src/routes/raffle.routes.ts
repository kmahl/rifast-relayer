import { Router, type Router as RouterType } from 'express';
import {
  createRaffle,
  executeRaffle,
  cancelRaffle,
  executeRefund
} from '../controllers/index.js';

const router: RouterType = Router();

/**
 * POST /create-raffle
 * Create a new raffle on-chain
 */
router.post('/create-raffle', createRaffle);

/**
 * POST /execute-raffle
 * Execute an expired raffle that meets minimum tickets
 */
router.post('/execute-raffle', executeRaffle);

/**
 * POST /cancel-raffle
 * Cancel an empty raffle (0 tickets)
 */
router.post('/cancel-raffle', cancelRaffle);

/**
 * POST /execute-refund
 * Execute refund batch for expired raffles
 */
router.post('/execute-refund', executeRefund);

export default router;
