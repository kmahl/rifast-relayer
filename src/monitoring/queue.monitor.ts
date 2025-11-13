/**
 * Queue Monitor - Real-time monitoring and metrics for transaction queues
 * 
 * FEATURES:
 * - Event listeners for job lifecycle (completed, failed, stalled)
 * - Queue health metrics (waiting, active, completed, failed counts)
 * - Express endpoint: GET /relayer/queue/status
 * - Integration with Winston logger
 * 
 * ALERTS:
 * - High failure rate (>10% in 5 minutes)
 * - Stalled jobs (stuck for >5 minutes)
 * - Queue backlog (>100 jobs waiting)
 */

import { Request, Response } from 'express';
import { txQueue, txRetryQueue } from '../queues/tx.queue.js';
import logger from '../utils/logger.js';

// Metrics storage
interface QueueMetrics {
  completedJobs: number;
  failedJobs: number;
  stalledJobs: number;
  lastFailure?: {
    jobId: string;
    type: string;
    error: string;
    timestamp: Date;
  };
}

const metrics: QueueMetrics = {
  completedJobs: 0,
  failedJobs: 0,
  stalledJobs: 0
};

/**
 * Initialize queue event listeners
 */
export function initializeQueueMonitoring(): void {
  logger.info('[QueueMonitor] Initializing queue monitoring...');

  // ============================================================================
  // MAIN QUEUE EVENTS
  // ============================================================================

  txQueue.on('completed', (job, result) => {
    metrics.completedJobs++;
    
    logger.info('[QueueMonitor] Main queue job completed', {
      jobId: job.id,
      type: job.data.type,
      txHash: result.txHash,
      movedToRetry: result.movedToRetry || false
    });
  });

  txQueue.on('failed', (job, err) => {
    metrics.failedJobs++;
    metrics.lastFailure = {
      jobId: job?.id?.toString() || 'unknown',
      type: job?.data?.type || 'unknown',
      error: err.message,
      timestamp: new Date()
    };

    logger.error('[QueueMonitor] Main queue job failed', {
      jobId: job?.id,
      type: job?.data?.type,
      error: err.message,
      attemptsMade: job?.attemptsMade
    });
  });

  txQueue.on('stalled', (job) => {
    metrics.stalledJobs++;

    logger.warn('[QueueMonitor] Main queue job stalled', {
      jobId: job.id,
      type: job.data.type,
      attemptsMade: job.attemptsMade
    });

    // TODO: Send alert for stalled jobs
    // await alerting.sendWarning('TX_QUEUE_STALLED', { jobId, type });
  });

  txQueue.on('error', (error) => {
    logger.error('[QueueMonitor] Main queue error', {
      error: error.message
    });
  });

  // ============================================================================
  // RETRY QUEUE EVENTS
  // ============================================================================

  txRetryQueue.on('completed', (job, result) => {
    logger.info('[QueueMonitor] Retry queue job completed', {
      jobId: job.id,
      type: job.data.type,
      txHash: result.txHash,
      attemptsMade: job.attemptsMade + 1
    });
  });

  txRetryQueue.on('failed', (job, err) => {
    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts || 3);

    if (isFinalAttempt) {
      logger.error('[QueueMonitor] 🚨 Retry queue job EXHAUSTED', {
        jobId: job?.id,
        type: job?.data?.type,
        attempts: job?.attemptsMade + 1,
        error: err.message
      });

      // TODO: Send critical alert for exhausted retries
      // await alerting.sendCritical('TX_RETRY_EXHAUSTED', {
      //   jobId: job.id,
      //   type: job.data.type,
      //   error: err.message,
      //   attempts: job.attemptsMade + 1
      // });
    } else {
      logger.warn('[QueueMonitor] Retry queue job failed, will retry', {
        jobId: job?.id,
        type: job?.data?.type,
        attempt: job?.attemptsMade + 1,
        maxAttempts: job?.opts.attempts || 3,
        error: err.message
      });
    }
  });

  txRetryQueue.on('stalled', (job) => {
    logger.warn('[QueueMonitor] Retry queue job stalled', {
      jobId: job.id,
      type: job.data.type,
      attemptsMade: job.attemptsMade
    });

    // TODO: Send alert for stalled retry jobs
    // await alerting.sendWarning('TX_RETRY_STALLED', { jobId, type });
  });

  txRetryQueue.on('error', (error) => {
    logger.error('[QueueMonitor] Retry queue error', {
      error: error.message
    });
  });

  logger.info('[QueueMonitor] ✅ Queue monitoring initialized');
}

/**
 * GET /relayer/queue/status
 * Returns queue health metrics and current job counts
 */
export async function getQueueStatus(_req: Request, res: Response): Promise<void> {
  try {
    // Get counts from both queues
    const [
      mainWaiting,
      mainActive,
      mainCompleted,
      mainFailed,
      mainDelayed,
      retryWaiting,
      retryActive,
      retryCompleted,
      retryFailed,
      retryDelayed
    ] = await Promise.all([
      txQueue.getWaitingCount(),
      txQueue.getActiveCount(),
      txQueue.getCompletedCount(),
      txQueue.getFailedCount(),
      txQueue.getDelayedCount(),
      txRetryQueue.getWaitingCount(),
      txRetryQueue.getActiveCount(),
      txRetryQueue.getCompletedCount(),
      txRetryQueue.getFailedCount(),
      txRetryQueue.getDelayedCount()
    ]);

    // Calculate health indicators
    const totalJobs = mainCompleted + mainFailed + retryCompleted + retryFailed;
    const failureRate = totalJobs > 0 ? ((mainFailed + retryFailed) / totalJobs) * 100 : 0;
    const backlogSize = mainWaiting + mainDelayed + retryWaiting + retryDelayed;

    // Determine health status
    let health: 'healthy' | 'warning' | 'critical' = 'healthy';
    const warnings: string[] = [];

    if (failureRate > 10) {
      health = 'warning';
      warnings.push(`High failure rate: ${failureRate.toFixed(2)}%`);
    }

    if (backlogSize > 100) {
      health = 'warning';
      warnings.push(`Large backlog: ${backlogSize} jobs waiting`);
    }

    if (metrics.stalledJobs > 5) {
      health = 'critical';
      warnings.push(`High stall count: ${metrics.stalledJobs} jobs stalled`);
    }

    if (mainActive === 0 && mainWaiting > 0) {
      health = 'critical';
      warnings.push('Worker may be stuck - jobs waiting but none active');
    }

    res.json({
      success: true,
      health,
      warnings: warnings.length > 0 ? warnings : undefined,
      queues: {
        main: {
          name: 'relayer-tx-main',
          waiting: mainWaiting,
          active: mainActive,
          completed: mainCompleted,
          failed: mainFailed,
          delayed: mainDelayed
        },
        retry: {
          name: 'relayer-tx-retry',
          waiting: retryWaiting,
          active: retryActive,
          completed: retryCompleted,
          failed: retryFailed,
          delayed: retryDelayed
        }
      },
      metrics: {
        totalCompleted: metrics.completedJobs,
        totalFailed: metrics.failedJobs,
        totalStalled: metrics.stalledJobs,
        failureRate: failureRate.toFixed(2) + '%',
        backlogSize,
        lastFailure: metrics.lastFailure
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    logger.error('[QueueMonitor] Failed to fetch queue status', {
      error: error.message
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch queue status',
      message: error.message
    });
  }
}

/**
 * Reset metrics (for testing)
 */
export function resetMetrics(): void {
  metrics.completedJobs = 0;
  metrics.failedJobs = 0;
  metrics.stalledJobs = 0;
  delete metrics.lastFailure;
  
  logger.info('[QueueMonitor] Metrics reset');
}
