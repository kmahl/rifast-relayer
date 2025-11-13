/**
 * Sensitive Operations Middleware
 * 
 * Extra protection for critical administrative operations:
 * - Emergency pause/unpause
 * - Fee withdrawals
 * - Blocklist management
 * 
 * SECURITY LAYERS:
 * 1. API Key validation (from auth middleware)
 * 2. Admin IP whitelist (stricter than normal)
 * 3. Rate limiting (1 req/5min per operation)
 * 4. Detailed audit logging
 * 5. Immediate alerts on execution
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import logger from '../utils/logger.js';

// Admin IPs allowed for sensitive operations
const ADMIN_IPS = (process.env.ADMIN_IPS || '').split(',').filter(ip => ip.trim());

/**
 * Validate that request comes from admin IP
 */
export function checkAdminIP(req: Request, res: Response, next: NextFunction): void {
  // Skip in development if no IPs configured
  if (ADMIN_IPS.length === 0 && process.env.NODE_ENV === 'development') {
    logger.warn('[SensitiveOps] ⚠️  Admin IP whitelist disabled (development mode)');
    return next();
  }

  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';

  if (!ADMIN_IPS.includes(clientIP)) {
    logger.error('[SensitiveOps] 🚫 Unauthorized admin IP attempt', {
      clientIP,
      endpoint: req.path,
      allowedIPs: ADMIN_IPS
    });

    // TODO: Send critical alert
    // await alerting.sendCritical('UNAUTHORIZED_ADMIN_ACCESS', { clientIP, endpoint: req.path });

    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Access denied - Admin IP required'
    });
    return;
  }

  logger.info('[SensitiveOps] ✅ Admin IP validated', {
    clientIP,
    endpoint: req.path
  });

  next();
}

/**
 * Rate limiter for sensitive operations (1 req/5min)
 */
export const sensitiveLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 1, // 1 request per window
  message: {
    success: false,
    error: 'Too many requests',
    message: 'Sensitive operation rate limit exceeded (1 per 5 minutes)'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('[SensitiveOps] ⚠️  Rate limit exceeded', {
      ip: req.ip,
      endpoint: req.path
    });

    res.status(429).json({
      success: false,
      error: 'Too many requests',
      message: 'Sensitive operation rate limit exceeded (1 per 5 minutes)'
    });
  }
});

/**
 * Log sensitive operation execution
 */
export function logSensitiveOperation(operationType: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    logger.warn('[SensitiveOps] 🔒 Sensitive operation initiated', {
      type: operationType,
      ip: req.ip,
      endpoint: req.path,
      body: req.body,
      timestamp: new Date().toISOString()
    });

    // TODO: Send alert notification
    // await alerting.sendWarning('SENSITIVE_OP_INITIATED', {
    //   type: operationType,
    //   ip: req.ip,
    //   timestamp: new Date()
    // });

    next();
  };
}
