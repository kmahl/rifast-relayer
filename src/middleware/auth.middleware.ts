import { Request, Response, NextFunction } from 'express';
import { RELAYER_API_KEY } from '../config/app.config.js';
import logger from '../utils/logger.js';

/**
 * Middleware: API Key Authentication
 * Validates X-API-Key header matches configured RELAYER_API_KEY
 */
export function authenticateRequest(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey || apiKey !== RELAYER_API_KEY) {
    logger.warn('🚫 Unauthorized request - invalid or missing API key', {
      ip: req.ip,
      path: req.path
    });
    
    res.status(401).json({ 
      success: false, 
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
    return;
  }
  
  next();
}
