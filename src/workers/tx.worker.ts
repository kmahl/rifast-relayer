/**
 * Transaction Worker - Processes blockchain transactions from queues
 * 
 * ARCHITECTURE:
 * - Concurrency: 1 (single job at a time, prevents nonce collision)
 * - Main queue: Immediate processing, fail → retry queue
 * - Retry queue: Exponential backoff (5s, 10s, 20s)
 * 
 * NONCE STRATEGY:
 * - Single concurrency = Ethers.js manages nonces automatically
 * - No manual nonce tracking needed
 * - Ethers calls getNonce('pending') internally (includes pending TXs)
 * 
 * ERROR HANDLING:
 * - Main queue failure → Move to retry queue (doesn't block FIFO)
 * - Retry queue failure → Log and mark as failed (manual intervention)
 */

import { Job } from 'bull';
import { ethers } from 'ethers';
import { txQueue, txRetryQueue, moveToRetryQueue, TransactionJob } from '../queues/tx.queue.js';
import { contract } from '../index.js';
import logger from '../utils/logger.js';

/**
 * Process job from MAIN queue
 * - Single attempt
 * - On failure: move to retry queue (doesn't block other jobs)
 */
async function processMainQueueJob(job: Job<TransactionJob>): Promise<any> {
  const { type, ...data } = job.data;
  
  logger.info('[TxWorker] Processing main queue job', {
    jobId: job.id,
    type,
    attempt: job.attemptsMade + 1
  });
  
  try {
    const result = await executeTransaction(type, data);
    
    logger.info('[TxWorker] ✅ Main queue job completed', {
      jobId: job.id,
      type,
      txHash: result.txHash
    });
    
    return { success: true, ...result };
    
  } catch (error: any) {
    logger.error('[TxWorker] ❌ Main queue job failed, moving to retry', {
      jobId: job.id,
      type,
      error: error.message,
      code: error.code
    });
    
    // Move to retry queue (doesn't block main queue)
    // Pass full job.data (includes type property)
    await moveToRetryQueue(type, job.data, job.id!, error.message);
    
    // Mark as "completed" in main queue (prevents blocking)
    return {
      success: false,
      movedToRetry: true,
      error: error.message
    };
  }
}

/**
 * Process job from RETRY queue
 * - 3 attempts with exponential backoff
 * - On final failure: log and alert (manual intervention required)
 */
async function processRetryQueueJob(job: Job<TransactionJob>): Promise<any> {
  const { type, ...data } = job.data;
  
  logger.info('[TxWorker] Processing retry queue job', {
    jobId: job.id,
    type,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts
  });
  
  try {
    const result = await executeTransaction(type, data);
    
    logger.info('[TxWorker] ✅ Retry queue job succeeded', {
      jobId: job.id,
      type,
      attempt: job.attemptsMade + 1,
      txHash: result.txHash
    });
    
    return { success: true, wasRetry: true, ...result };
    
  } catch (error: any) {
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);
    
    if (isFinalAttempt) {
      logger.error('[TxWorker] 🚨 Retry queue job FAILED PERMANENTLY', {
        jobId: job.id,
        type,
        attempts: job.attemptsMade + 1,
        error: error.message,
        code: error.code,
        data
      });
      
      // TODO: Send alert (email, Slack, PagerDuty)
      // await alerting.sendCriticalAlert('TX_RETRY_EXHAUSTED', { jobId, type, error });
    }
    
    // Re-throw to trigger Bull's retry mechanism
    throw error;
  }
}

/**
 * Execute blockchain transaction based on job type
 * - Ethers.js manages nonce automatically (no manual tracking)
 * - Returns txHash and other relevant data
 */
async function executeTransaction(type: string, data: any): Promise<any> {
  switch (type) {
    case 'create-raffle':
      return await executeCreateRaffle(data);
    
    case 'execute-raffle':
      return await executeExecuteRaffle(data);
    
    case 'cancel-raffle':
      return await executeCancelRaffle(data);
    
    case 'execute-refund':
      return await executeRefundBatch(data);
    
    case 'pause-contract':
      return await executePauseContract();
    
    case 'unpause-contract':
      return await executeUnpauseContract();
    
    case 'add-to-blocklist':
      return await executeAddToBlocklist(data);
    
    case 'add-to-blocklist-batch':
      return await executeAddToBlocklistBatch(data);
    
    case 'remove-from-blocklist':
      return await executeRemoveFromBlocklist(data);
    
    case 'withdraw-fees':
      return await executeWithdrawFees();
    
    case 'archive-raffles':
      return await executeArchiveRaffles(data);
    
    default:
      throw new Error(`Unknown transaction type: ${type}`);
  }
}

// ============================================================================
// TRANSACTION EXECUTORS
// ============================================================================

async function executeCreateRaffle(data: any): Promise<any> {
  const { templateId, referenceId, ticketPrice, maxTickets, minTickets, durationSeconds } = data;
  
  const tx = await contract.createRaffle(
    BigInt(templateId),
    BigInt(referenceId),
    ethers.parseUnits(ticketPrice, 18),
    BigInt(maxTickets),
    BigInt(minTickets),
    BigInt(durationSeconds)
  );
  
  // Wait for confirmation to prevent nonce collision in Hardhat automining
  await tx.wait();
  
  return {
    txHash: tx.hash,
    referenceId: referenceId.toString()
  };
}

async function executeExecuteRaffle(data: any): Promise<any> {
  const { raffleId } = data;
  
  // Estimate gas for complex VRF request
  const gasEstimate = await contract.executeRaffle.estimateGas(BigInt(raffleId));
  const gasLimit = gasEstimate * 120n / 100n; // +20% buffer
  
  const tx = await contract.executeRaffle(BigInt(raffleId), { gasLimit });
  
  // Wait for confirmation to prevent nonce collision
  await tx.wait();
  
  return {
    txHash: tx.hash,
    raffleId: raffleId.toString()
  };
}

async function executeCancelRaffle(data: any): Promise<any> {
  const { raffleId } = data;
  
  const gasEstimate = await contract.cancelRaffle.estimateGas(BigInt(raffleId));
  const gasLimit = gasEstimate * 120n / 100n;
  
  const tx = await contract.cancelRaffle(BigInt(raffleId), { gasLimit });
  
  // Wait for confirmation to prevent nonce collision
  await tx.wait();
  
  return {
    txHash: tx.hash,
    raffleId: raffleId.toString()
  };
}

async function executeRefundBatch(data: any): Promise<any> {
  const { raffleId } = data;
  
  const gasEstimate = await contract.executeRefundBatch.estimateGas(BigInt(raffleId));
  const gasLimit = gasEstimate * 120n / 100n;
  
  const tx = await contract.executeRefundBatch(BigInt(raffleId), { gasLimit });
  
  // Wait for confirmation to prevent nonce collision
  await tx.wait();
  
  return {
    txHash: tx.hash,
    raffleId: raffleId.toString()
  };
}

async function executePauseContract(): Promise<any> {
  const tx = await contract.pause();
  
  // Wait for confirmation (critical operation)
  await tx.wait();
  
  return {
    txHash: tx.hash,
    confirmed: true
  };
}

async function executeUnpauseContract(): Promise<any> {
  const tx = await contract.unpause();
  
  // Wait for confirmation (critical operation)
  await tx.wait();
  
  return {
    txHash: tx.hash,
    confirmed: true
  };
}

async function executeAddToBlocklist(data: any): Promise<any> {
  const { address, reason } = data;
  
  const tx = await contract.addToBlocklist(address, reason);
  
  // Wait for confirmation (security operation)
  await tx.wait();
  
  return {
    txHash: tx.hash,
    address,
    confirmed: true
  };
}

async function executeAddToBlocklistBatch(data: any): Promise<any> {
  const { addresses, reasons } = data;
  
  const tx = await contract.addToBlocklistBatch(addresses, reasons);
  
  // Wait for confirmation (security operation)
  await tx.wait();
  
  return {
    txHash: tx.hash,
    count: addresses.length,
    confirmed: true
  };
}

async function executeRemoveFromBlocklist(data: any): Promise<any> {
  const { address } = data;
  
  const tx = await contract.removeFromBlocklist(address);
  
  // Wait for confirmation (security operation)
  await tx.wait();
  
  return {
    txHash: tx.hash,
    address,
    confirmed: true
  };
}

async function executeWithdrawFees(): Promise<any> {
  const tx = await contract.withdrawPlatformFees();
  
  // Wait for confirmation (financial operation)
  await tx.wait();
  
  return {
    txHash: tx.hash,
    confirmed: true
  };
}

async function executeArchiveRaffles(data: any): Promise<any> {
  const { raffleIds } = data;
  
  const tx = await contract.archiveRaffles(raffleIds);
  
  // Wait for confirmation to prevent nonce collision
  await tx.wait();
  
  return {
    txHash: tx.hash,
    count: raffleIds.length
  };
}

/**
 * Start processing both queues
 */
export function startTransactionWorker(): void {
  logger.info('[TxWorker] Starting transaction worker', {
    concurrency: 1,
    mainQueue: 'relayer-tx-main',
    retryQueue: 'relayer-tx-retry'
  });
  
  // Process main queue (concurrency=1, no nonce collision)
  txQueue.process(1, processMainQueueJob);
  
  // Process retry queue (concurrency=1, same reason)
  txRetryQueue.process(1, processRetryQueueJob);
  
  logger.info('[TxWorker] ✅ Transaction worker started successfully');
}

/**
 * Graceful shutdown - wait for active jobs to complete
 */
export async function stopTransactionWorker(): Promise<void> {
  logger.info('[TxWorker] Stopping transaction worker...');
  
  await Promise.all([
    txQueue.close(),
    txRetryQueue.close()
  ]);
  
  logger.info('[TxWorker] ✅ Transaction worker stopped gracefully');
}
