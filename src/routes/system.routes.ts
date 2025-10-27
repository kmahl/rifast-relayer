import { Router, type Router as RouterType } from 'express';
import {
  pauseSystem,
  unpauseSystem,
  emergencyPause,
  emergencyUnpause
} from '../controllers/index.js';

const router: RouterType = Router();

/**
 * POST /pause-system
 * Emergency pause - stops all raffle operations
 */
router.post('/pause-system', pauseSystem);

/**
 * POST /unpause-system
 * Resume normal operations after pause
 */
router.post('/unpause-system', unpauseSystem);

/**
 * POST /emergency-pause
 * Emergency pause with event logging (security incident)
 */
router.post('/emergency-pause', emergencyPause);

/**
 * POST /emergency-unpause
 * Emergency unpause after incident resolved
 */
router.post('/emergency-unpause', emergencyUnpause);

export default router;
