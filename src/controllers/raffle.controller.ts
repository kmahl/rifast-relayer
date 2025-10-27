import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { contract } from '../index.js';
import logger from '../utils/logger.js';

/**
 * Request interfaces
 */
export interface CreateRaffleRequest {
  referenceId: string | number | bigint;
  templateId: string | number | bigint;
  ticketPrice: string;
  maxTickets: number;
  minTickets: number;
  durationSeconds: number;
}

export interface ExecuteRaffleRequest {
  raffleId: number | string;
}

export interface CancelRaffleRequest {
  raffleId: number | string;
}

export interface ExecuteRefundRequest {
  raffleId: number | string;
}

/**
 * POST /create-raffle
 * Create a new raffle on-chain
 */
export async function createRaffle(req: Request, res: Response): Promise<void> {
  try {
    const { referenceId, templateId, ticketPrice, maxTickets, minTickets, durationSeconds } = req.body as CreateRaffleRequest;
    
    // Validation
    if (!referenceId || !templateId || !ticketPrice || !maxTickets || !minTickets || !durationSeconds) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['referenceId', 'templateId', 'ticketPrice', 'maxTickets', 'minTickets', 'durationSeconds']
      });
      return;
    }
    
    logger.info('📝 Creating raffle on-chain...', {
      referenceId: referenceId.toString(),
      templateId: templateId.toString(),
      ticketPrice,
      maxTickets,
      minTickets,
      durationSeconds
    });
    
    // Get fresh nonce from pending pool
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    
    // Send transaction (fire and forget - blockchain events will update DB)
    const tx = await contract.createRaffle(
      BigInt(templateId),
      BigInt(referenceId),
      ethers.parseUnits(ticketPrice, 18),
      BigInt(maxTickets),
      BigInt(minTickets),
      BigInt(durationSeconds),
      { nonce }
    );
    
    logger.info('✅ Raffle creation tx sent (not waiting for confirmation):', {
      txHash: tx.hash,
      nonce,
      referenceId: referenceId.toString()
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      nonce,
      referenceId: referenceId.toString(),
      message: 'Transaction sent - blockchain events will update database'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to create raffle:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Transaction failed',
      message: error.message,
      code: error.code
    });
  }
}

/**
 * POST /execute-raffle
 * Execute an expired raffle that meets minimum tickets
 */
export async function executeRaffle(req: Request, res: Response): Promise<void> {
  try {
    const { raffleId } = req.body as ExecuteRaffleRequest;
    
    if (!raffleId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: raffleId'
      });
      return;
    }
    
    logger.info('🎲 Execute raffle requested', {
      raffleId: raffleId.toString()
    });
    
    // Get fresh nonce from pending pool
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    
    // Estimate gas
    const gasEstimate = await contract.executeRaffle.estimateGas(BigInt(raffleId));
    const gasLimit = gasEstimate * 120n / 100n;
    
    // Send transaction (fire and forget - blockchain events will update DB)
    const tx = await contract.executeRaffle(BigInt(raffleId), {
      gasLimit,
      nonce
    });
    
    logger.info('✅ Execute raffle tx sent (not waiting for confirmation):', {
      raffleId: raffleId.toString(),
      txHash: tx.hash,
      nonce
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      raffleId: raffleId.toString(),
      message: 'Transaction sent - blockchain events will update database'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to execute raffle:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Execute raffle failed',
      message: error.message
    });
  }
}

/**
 * POST /cancel-raffle
 * Cancel an empty raffle (0 tickets)
 */
export async function cancelRaffle(req: Request, res: Response): Promise<void> {
  try {
    const { raffleId } = req.body as CancelRaffleRequest;
    
    if (!raffleId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: raffleId'
      });
      return;
    }
    
    logger.info('🚫 Cancel raffle requested', {
      raffleId: raffleId.toString()
    });
    
    // Get fresh nonce from pending pool
    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    
    // Estimate gas
    const gasEstimate = await contract.cancelRaffle.estimateGas(BigInt(raffleId));
    const gasLimit = gasEstimate * 120n / 100n;
    
    // Send transaction (fire and forget - blockchain events will update DB)
    const tx = await contract.cancelRaffle(BigInt(raffleId), {
      gasLimit,
      nonce
    });
    
    logger.info('✅ Cancel raffle tx sent (not waiting for confirmation):', {
      raffleId: raffleId.toString(),
      txHash: tx.hash,
      nonce
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      raffleId: raffleId.toString(),
      message: 'Transaction sent - blockchain events will update database'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to cancel raffle:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Cancel raffle failed',
      message: error.message
    });
  }
}

/**
 * POST /execute-refund
 * Execute refund batch for expired raffles
 */
export async function executeRefund(req: Request, res: Response): Promise<void> {
  try {
    const { raffleId } = req.body as ExecuteRefundRequest;
    
    // Validation
    if (!raffleId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: raffleId'
      });
      return;
    }
    
    logger.info('💸 Executing refund batch...', {
      raffleId: raffleId.toString()
    });
    
    // Estimate gas first
    const gasEstimate = await contract.executeRefundBatch.estimateGas(BigInt(raffleId));
    const gasLimit = gasEstimate * 120n / 100n; // +20% buffer
    
    logger.debug('⛽ Gas estimate:', {
      estimate: gasEstimate.toString(),
      limit: gasLimit.toString()
    });
    
    // Send transaction (fire and forget)
    const tx = await contract.executeRefundBatch(BigInt(raffleId), {
      gasLimit
    });
    
    logger.info('✅ Refund batch tx sent (not waiting for confirmation):', {
      txHash: tx.hash,
      raffleId: raffleId.toString()
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      raffleId: raffleId.toString(),
      message: 'Transaction sent - blockchain events will update database'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to execute refund:', {
      error: error.message,
      code: error.code,
      reason: error.reason
    });
    res.status(500).json({
      success: false,
      error: 'Transaction failed',
      message: error.message,
      code: error.code,
      reason: error.reason
    });
  }
}
