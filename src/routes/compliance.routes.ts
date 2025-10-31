import { Router, type Router as RouterType } from 'express';
import {
  addToBlocklist,
  addToBlocklistBatch,
  removeFromBlocklist,
  getBlockStatus
} from '../controllers/index.js';

const router: RouterType = Router();

/**
 * POST /blocklist/add
 * Block a single address with a reason
 */
router.post('/blocklist/add', addToBlocklist);

/**
 * POST /blocklist/add-batch
 * Block up to 100 addresses in one transaction
 */
router.post('/blocklist/add-batch', addToBlocklistBatch);

/**
 * POST /blocklist/remove
 * Remove a blocked address
 */
router.post('/blocklist/remove', removeFromBlocklist);

/**
 * GET /blocklist/:address
 * Inspect block status for a wallet address
 */
router.get('/blocklist/:address', getBlockStatus);

export default router;
