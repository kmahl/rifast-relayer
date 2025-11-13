import { Request, Response } from 'express';
import { enqueueTransaction } from '../queues/tx.queue.js';
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
 * Enqueue raffle creation (processed by worker)
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
    
    logger.info('📝 Enqueueing raffle creation...', {
      referenceId: referenceId.toString(),
      templateId: templateId.toString(),
      ticketPrice,
      maxTickets,
      minTickets,
      durationSeconds
    });
    
    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('create-raffle', {
      type: 'create-raffle',
      referenceId,
      templateId,
      ticketPrice,
      maxTickets,
      minTickets,
      durationSeconds
    });
    
    logger.info('✅ Raffle creation enqueued', {
      jobId: job.id,
      referenceId: referenceId.toString()
    });
    
    res.json({
      success: true,
      jobId: job.id,
      referenceId: referenceId.toString(),
      message: 'Transaction queued - worker will process'
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
 * Enqueue raffle execution (VRF request)
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
    
    logger.info('🎲 Enqueueing raffle execution...', {
      raffleId: raffleId.toString()
    });
    
    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('execute-raffle', {
      type: 'execute-raffle',
      raffleId
    });
    
    logger.info('✅ Raffle execution enqueued', {
      jobId: job.id,
      raffleId: raffleId.toString()
    });
    
    res.json({
      success: true,
      jobId: job.id,
      raffleId: raffleId.toString(),
      message: 'Transaction queued - worker will process'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to enqueue raffle execution:', {
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
 * Enqueue raffle cancellation (0 tickets only)
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
    
    logger.info('🚫 Enqueueing raffle cancellation...', {
      raffleId: raffleId.toString()
    });
    
    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('cancel-raffle', {
      type: 'cancel-raffle',
      raffleId
    });
    
    logger.info('✅ Raffle cancellation enqueued', {
      jobId: job.id,
      raffleId: raffleId.toString()
    });
    
    res.json({
      success: true,
      jobId: job.id,
      raffleId: raffleId.toString(),
      message: 'Transaction queued - worker will process'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to enqueue raffle cancellation:', {
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
 * Enqueue refund batch execution for expired raffles
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
    
    logger.info('💸 Enqueueing refund batch execution...', {
      raffleId: raffleId.toString()
    });
    
    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('execute-refund', {
      type: 'execute-refund',
      raffleId
    });
    
    logger.info('✅ Refund batch execution enqueued', {
      jobId: job.id,
      raffleId: raffleId.toString()
    });
    
    res.json({
      success: true,
      jobId: job.id,
      raffleId: raffleId.toString(),
      message: 'Transaction queued - worker will process'
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to enqueue refund execution:', {
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
