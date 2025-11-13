import { Request, Response } from 'express';
import { enqueueTransaction } from '../queues/tx.queue.js';
import logger from '../utils/logger.js';

/**
 * POST /withdraw-fees
 * Enqueue platform fee withdrawal
 */
export async function withdrawFees(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('💰 Enqueueing platform fee withdrawal');
    
    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('withdraw-fees', {
      type: 'withdraw-fees'
    });
    
    logger.info('✅ Fee withdrawal enqueued', {
      jobId: job.id
    });
    
    res.json({
      success: true,
      jobId: job.id,
      message: 'Transaction queued - worker will process'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to enqueue fee withdrawal:', {
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
 * Enqueue raffle archiving (cleanup completed/cancelled raffles)
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
    
    logger.info('🗄️  Enqueueing raffle archiving:', { count: raffleIds.length, raffleIds });
    
    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('archive-raffles', {
      type: 'archive-raffles',
      raffleIds
    });
    
    logger.info('✅ Raffle archiving enqueued', {
      jobId: job.id,
      count: raffleIds.length
    });
    
    res.json({
      success: true,
      jobId: job.id,
      message: 'Transaction queued - worker will process',
      raffleCount: raffleIds.length
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to enqueue raffle archiving:', {
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
