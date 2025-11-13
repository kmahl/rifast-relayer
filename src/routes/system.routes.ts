import { Router, type Router as RouterType } from 'express';
import {
  pauseSystem,
  unpauseSystem,
  emergencyPause,
  emergencyUnpause
} from '../controllers/index.js';
import { checkAdminIP, sensitiveLimiter, logSensitiveOperation } from '../middleware/sensitive.middleware.js';

const router: RouterType = Router();

// Apply sensitive operation protection to ALL system routes
router.use(checkAdminIP);
router.use(sensitiveLimiter);

/**
 * POST /pause-system
 * Emergency pause - stops all raffle operations
 */
router.post('/pause-system', 
  logSensitiveOperation('pause'),
  pauseSystem
);

/**
 * POST /unpause-system
 * Resume normal operations after pause
 */
router.post('/unpause-system',
  logSensitiveOperation('unpause'),
  unpauseSystem
);

/**
 * POST /emergency-pause
 * Emergency pause with event logging (security incident)
 */
router.post('/emergency-pause',
  logSensitiveOperation('emergency-pause'),
  emergencyPause
);

/**
 * POST /emergency-unpause
 * Emergency unpause after incident resolved
 */
router.post('/emergency-unpause',
  logSensitiveOperation('emergency-unpause'),
  emergencyUnpause
);

export default router;
