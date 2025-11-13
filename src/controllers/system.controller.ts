import { Request, Response } from 'express';
import { enqueueTransaction } from '../queues/tx.queue.js';
import logger from '../utils/logger.js';

/**
 * POST /pause-system
 * Enqueue standard pause (graceful, no emergency event)
 */
export async function pauseSystem(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('⏸️  Enqueueing standard pause');
    
    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('pause-contract', {
      type: 'pause-contract'
    });
    
    logger.info('✅ Pause enqueued', {
      jobId: job.id
    });
    
    res.json({
      success: true,
      jobId: job.id,
      message: 'Transaction queued - worker will process'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to enqueue pause:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Pause failed',
      message: error.message
    });
  }
}

/**
 * POST /unpause-system
 * Enqueue standard unpause (resume normal operations)
 */
export async function unpauseSystem(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('▶️  Enqueueing standard unpause');
    
    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('unpause-contract', {
      type: 'unpause-contract'
    });
    
    logger.info('✅ Unpause enqueued', {
      jobId: job.id
    });
    
    res.json({
      success: true,
      jobId: job.id,
      message: 'Transaction queued - worker will process'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to enqueue unpause:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Unpause failed',
      message: error.message
    });
  }
}

/**
 * POST /emergency-pause
 * Emergency pause with event logging (security incident)
 */
export async function emergencyPause(_req: Request, res: Response): Promise<void> {
  try {
    logger.warn('🚨 EMERGENCY PAUSE requested');
    
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('latest');
    const tx = await contract.emergencyPause({ nonce });
    
    logger.warn('⏸️  Emergency pause transaction sent:', {
      txHash: tx.hash,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.warn('🚨 SYSTEM EMERGENCY PAUSED', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      message: 'System emergency paused - all user operations halted',
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString()
      }
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to emergency pause:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Emergency pause failed',
      message: error.message
    });
  }
}

/**
 * POST /emergency-unpause
 * Emergency unpause after incident resolved
 */
export async function emergencyUnpause(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('✅ Emergency unpause requested');
    
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('latest');
    const tx = await contract.emergencyUnpause({ nonce });
    
    logger.info('▶️  Emergency unpause transaction sent:', {
      txHash: tx.hash,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.info('✅ EMERGENCY MODE LIFTED', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      message: 'Emergency mode lifted - system resumed',
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString()
      }
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to emergency unpause:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Emergency unpause failed',
      message: error.message
    });
  }
}
