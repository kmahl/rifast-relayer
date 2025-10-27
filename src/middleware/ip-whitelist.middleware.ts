import { Request, Response, NextFunction } from 'express';
import { ALLOWED_IPS } from '../config/app.config.js';
import logger from '../utils/logger.js';

/**
 * Middleware: IP Whitelist
 * Checks if request IP is in allowed list (if configured)
 * If ALLOWED_IPS is empty, allows all IPs
 */
export function checkIPWhitelist(req: Request, res: Response, next: NextFunction): void {
  if (ALLOWED_IPS.length === 0) {
    // No whitelist configured, allow all
    next();
    return;
  }
  
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  
  if (!ALLOWED_IPS.includes(clientIP)) {
    logger.warn('🚫 Rejected request from unauthorized IP', {
      ip: clientIP,
      path: req.path
    });
    
    res.status(403).json({ 
      success: false, 
      error: 'Forbidden',
      message: 'IP not whitelisted'
    });
    return;
  }
  
  next();
}
