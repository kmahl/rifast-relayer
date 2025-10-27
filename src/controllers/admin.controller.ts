import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { contract } from '../index.js';
import logger from '../utils/logger.js';

/**
 * POST /withdraw-fees
 * Withdraw accumulated platform fees
 */
export async function withdrawFees(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('💰 Platform fee withdrawal requested');
    
    // Get fresh nonce from pending pool
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    
    // withdrawPlatformFees() doesn't take parameters - sends all to owner
    const tx = await contract.withdrawPlatformFees({ nonce });
    
    logger.info('💸 Withdrawal transaction sent:', {
      txHash: tx.hash,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.info('✅ Fees withdrawn successfully', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString()
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      message: 'Platform fees withdrawn to owner',
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString()
      }
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to withdraw fees:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Withdrawal failed',
      message: error.message
    });
  }
}

/**
 * POST /archive-raffles
 * Archive completed/cancelled raffles (cleanup)
 * Body: { raffleIds: number[] }
 */
export async function archiveRaffles(req: Request, res: Response): Promise<void> {
  try {
    const { raffleIds } = req.body;
    
    if (!raffleIds || !Array.isArray(raffleIds) || raffleIds.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid request',
        message: 'raffleIds must be a non-empty array'
      });
      return;
    }
    
    logger.info('🗄️  Archive raffles requested:', { count: raffleIds.length, raffleIds });
    
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    const tx = await contract.archiveRaffles(raffleIds, { nonce });
    
    logger.info('📦 Archive transaction sent:', {
      txHash: tx.hash,
      raffleCount: raffleIds.length,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.info('✅ Raffles archived successfully', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString(),
      archivedCount: raffleIds.length
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      message: `${raffleIds.length} raffle(s) archived successfully`,
      archivedRaffles: raffleIds,
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString()
      }
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to archive raffles:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Archive failed',
      message: error.message
    });
  }
}
