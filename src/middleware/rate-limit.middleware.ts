import { Request, Response, NextFunction } from 'express';
import { RATE_LIMIT_CONFIG } from '../config/app.config.js';
import logger from '../utils/logger.js';

/**
 * Rate limit entry structure
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * In-memory rate limit store
 * Key: IP address, Value: { count, resetAt }
 */
const rateLimitStore = new Map<string, RateLimitEntry>();

/**
 * Check if IP is within rate limit
 * @param ip - Client IP address
 * @returns true if within limit, false if exceeded
 */
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  
  if (!entry || entry.resetAt < now) {
    // Reset or create new entry
    rateLimitStore.set(ip, {
      count: 1,
      resetAt: now + 60_000 // 1 minute
    });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_CONFIG.requestsPerMinute) {
    return false; // Rate limit exceeded
  }
  
  entry.count++;
  return true;
}

/**
 * Cleanup old rate limit entries every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(ip);
    }
  }
}, 5 * 60_000);

/**
 * Middleware: Rate Limiting
 * Enforces configured requests per minute limit per IP
 */
export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  
  if (!checkRateLimit(clientIP)) {
    logger.warn('⚠️ Rate limit exceeded', {
      ip: clientIP,
      path: req.path,
      limit: RATE_LIMIT_CONFIG.requestsPerMinute
    });
    
    res.status(429).json({
      success: false,
      error: 'Too Many Requests'
    });
    return;
  }
  
  next();
}
