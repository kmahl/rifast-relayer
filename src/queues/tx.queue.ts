/**
 * Transaction Queue System - FIFO processing with delayed retry pattern
 * 
 * ARCHITECTURE:
 * - txQueue (main): FIFO strict, single attempt, immediate processing
 * - txRetryQueue (retry): Delayed retry with exponential backoff
 * 
 * PATTERN:
 * 1. Job enters txQueue → processed immediately
 * 2. If fails → moved to txRetryQueue (delayed 5s)
 * 3. Main queue continues processing next job (not blocked)
 * 
 * NONCE STRATEGY:
 * - Worker has concurrency=1 (single job at a time)
 * - Ethers.js automatically manages nonces via getNonce('pending')
 * - No manual nonce tracking needed
 */

import Bull, { Queue, JobOptions } from 'bull';
import logger from '../utils/logger.js';
import { env } from '../config/env.js';

// Redis configuration - Validated at startup (no fallback)
// Shared with backend but different queue names:
// - Backend uses: 'blockchain-blocks'
// - Relayer uses: 'relayer-tx-main', 'relayer-tx-retry'
// Bull separates by queue name (no collision)
const REDIS_URL = env.redisUrl;

/**
 * Main transaction queue - FIFO strict processing
 * - Single attempt (no blocking retries)
 * - Failures moved to retry queue
 * - High throughput, never blocked
 */
export const txQueue: Queue = new Bull('relayer-tx-main', REDIS_URL, {
  defaultJobOptions: {
    attempts: 1,              // Single attempt on main queue
    removeOnComplete: 100,    // Keep last 100 completed jobs for monitoring
    removeOnFail: false,      // Keep failed jobs for retry queue migration
    timeout: 60000            // 60s timeout per job (blockchain TX + confirmation)
  },
  settings: {
    lockDuration: 30000,      // Lock job for 30s while processing
    maxStalledCount: 3,       // Retry max 3 times if worker crashes mid-processing
    stalledInterval: 5000     // Check for stalled jobs every 5s
  }
});

/**
 * Retry queue - Delayed processing with exponential backoff
 * - 3 attempts with increasing delays (5s, 10s, 20s)
 * - Processes failed jobs from main queue
 * - Separate processing (doesn't block main queue)
 */
export const txRetryQueue: Queue = new Bull('relayer-tx-retry', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,              // 3 retry attempts
    backoff: {
      type: 'exponential',    // Exponential backoff: delay * 2^attempt
      delay: 5000             // Base delay: 5s, then 10s, then 20s
    },
    removeOnComplete: 100,    // Keep last 100 completed retries
    removeOnFail: 500,        // Keep last 500 failed jobs for debugging
    timeout: 60000            // 60s timeout per retry
  },
  settings: {
    lockDuration: 30000,
    maxStalledCount: 2        // Less aggressive retry for already-failed jobs
  }
});

// Type definitions for job data

export interface CreateRaffleJob {
  type: 'create-raffle';
  templateId: string | number | bigint;
  referenceId: string | number | bigint;
  ticketPrice: string;
  maxTickets: number;
  minTickets: number;
  durationSeconds: number;
}

export interface ExecuteRaffleJob {
  type: 'execute-raffle';
  raffleId: number | string;
}

export interface CancelRaffleJob {
  type: 'cancel-raffle';
  raffleId: number | string;
}

export interface ExecuteRefundJob {
  type: 'execute-refund';
  raffleId: number | string;
}

export interface PauseContractJob {
  type: 'pause-contract';
}

export interface UnpauseContractJob {
  type: 'unpause-contract';
}

export interface AddToBlocklistJob {
  type: 'add-to-blocklist';
  address: string;
  reason: string;
}

export interface AddToBlocklistBatchJob {
  type: 'add-to-blocklist-batch';
  addresses: string[];
  reasons: string[];
}

export interface RemoveFromBlocklistJob {
  type: 'remove-from-blocklist';
  address: string;
}

export interface WithdrawFeesJob {
  type: 'withdraw-fees';
}

export interface ArchiveRafflesJob {
  type: 'archive-raffles';
  raffleIds: number[];
}

export type TransactionJob = 
  | CreateRaffleJob
  | ExecuteRaffleJob
  | CancelRaffleJob
  | ExecuteRefundJob
  | PauseContractJob
  | UnpauseContractJob
  | AddToBlocklistJob
  | AddToBlocklistBatchJob
  | RemoveFromBlocklistJob
  | WithdrawFeesJob
  | ArchiveRafflesJob;

/**
 * Helper: Add job to main queue
 */
export async function enqueueTransaction(
  jobType: string,
  jobData: any,
  options?: JobOptions
): Promise<Bull.Job> {
  // Add job WITHOUT job name (handler is generic)
  // The job type is in jobData.type
  const job = await txQueue.add(jobData, options);
  
  logger.info('[TxQueue] Job enqueued', {
    jobId: job.id,
    type: jobType,
    data: jobData
  });
  
  return job;
}

/**
 * Helper: Move failed job to retry queue
 */
export async function moveToRetryQueue(
  jobType: string,
  jobData: any,
  originalJobId: string | number,
  error: string
): Promise<Bull.Job> {
  // Add job WITHOUT job name (handler is generic)
  const job = await txRetryQueue.add(jobData, {
    delay: 5000,  // Wait 5s before first retry
    jobId: `retry-${originalJobId}`
  });
  
  logger.warn('[TxQueue] Job moved to retry queue', {
    originalJobId,
    retryJobId: job.id,
    type: jobType,
    error
  });
  
  return job;
}

// Log queue initialization
logger.info('[TxQueue] Queues initialized', {
  environment: env.nodeEnv,
  redisUrl: env.redisUrl,
  mainQueue: 'relayer-tx-main',
  retryQueue: 'relayer-tx-retry'
});
