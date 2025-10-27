import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { contract } from '../index.js';

/**
 * GET /health
 * Health check endpoint (no auth required for monitoring)
 */
export function healthCheck(_req: Request, res: Response): void {
  const signer = contract.runner as ethers.Wallet;
  
  res.json({ 
    success: true, 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    signer: signer.address
  });
}
