import { Router, type Router as RouterType } from 'express';
import {
  getAccountingInvariant,
  getTokenDecimals,
  scanRaffles
} from '../controllers/index.js';

const router: RouterType = Router();

router.get('/accounting-invariant', getAccountingInvariant);
router.get('/token-decimals', getTokenDecimals);
router.post('/scan-raffles', scanRaffles);

export default router;
