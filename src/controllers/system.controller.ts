import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { contract } from '../index.js';
import logger from '../utils/logger.js';

/**
 * POST /pause-system
 * Gracefully pause contract without emitting emergency event
 */
export async function pauseSystem(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('⏸️  Standard pause requested');
    
    // Get fresh nonce from pending pool
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    
    const tx = await contract.pause({ nonce });
    
    logger.info('⏸️  Pause transaction sent:', {
      txHash: tx.hash,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.info('🛑 System paused', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      message: 'System paused successfully'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to pause system:', {
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
 * Resume normal operations after standard pause
 */
export async function unpauseSystem(_req: Request, res: Response): Promise<void> {
  try {
    logger.info('▶️  Standard unpause requested');
    
    // Get fresh nonce from pending pool
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    
    const tx = await contract.unpause({ nonce });
    
    logger.info('▶️  Unpause transaction sent:', {
      txHash: tx.hash,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.info('✅ SYSTEM RESUMED', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      message: 'System unpaused successfully'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to unpause system:', {
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
    const nonce = await signer.getNonce('pending');
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
    const nonce = await signer.getNonce('pending');
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
