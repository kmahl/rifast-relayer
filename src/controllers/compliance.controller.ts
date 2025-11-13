import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { contract } from '../index.js';
import { enqueueTransaction } from '../queues/tx.queue.js';
import logger from '../utils/logger.js';

interface BlocklistEntry {
  address: string;
  reason: string;
}

/**
 * POST /blocklist/add
 * Enqueue single address blocking
 */
export async function addToBlocklist(req: Request, res: Response): Promise<void> {
  try {
    const { address, reason } = req.body as BlocklistEntry;

    if (!address || !ethers.isAddress(address)) {
      res.status(400).json({
        success: false,
        error: 'Invalid address',
        message: 'Provide a valid wallet address to block'
      });
      return;
    }

    if (!reason || reason.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Reason required',
        message: 'Provide a public reason for the block action'
      });
      return;
    }

    const normalizedAddress = ethers.getAddress(address);
    const sanitizedReason = reason.trim();

    logger.warn('🚫 Enqueueing address blocking', {
      address: normalizedAddress,
      reason: sanitizedReason
    });

    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('add-to-blocklist', {
      type: 'add-to-blocklist',
      address: normalizedAddress,
      reason: sanitizedReason
    });

    logger.warn('✅ Address blocking enqueued', {
      jobId: job.id,
      address: normalizedAddress
    });

    res.json({
      success: true,
      jobId: job.id,
      address: normalizedAddress,
      message: 'Transaction queued - worker will process'
    });
  } catch (error: any) {
    logger.error('❌ Failed to enqueue address blocking', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Blocklist update failed',
      message: error.message
    });
  }
}

/**
 * POST /blocklist/add-batch
 * Enqueue batch blocking of up to 100 addresses
 */
export async function addToBlocklistBatch(req: Request, res: Response): Promise<void> {
  try {
    const { entries } = req.body as { entries: BlocklistEntry[] };

    if (!Array.isArray(entries) || entries.length === 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid payload',
        message: 'Provide an entries array with at least one item'
      });
      return;
    }

    if (entries.length > 100) {
      res.status(400).json({
        success: false,
        error: 'Batch too large',
        message: 'Maximum 100 addresses per batch'
      });
      return;
    }

    const normalizedAddresses: string[] = [];
    const reasons: string[] = [];

    for (const entry of entries) {
      if (!entry.address || !ethers.isAddress(entry.address)) {
        res.status(400).json({
          success: false,
          error: 'Invalid address',
          message: `Invalid address in batch: ${entry.address ?? 'undefined'}`
        });
        return;
      }

      if (!entry.reason || entry.reason.trim().length === 0) {
        res.status(400).json({
          success: false,
          error: 'Reason required',
          message: `Missing reason for address ${entry.address}`
        });
        return;
      }

      normalizedAddresses.push(ethers.getAddress(entry.address));
      reasons.push(entry.reason.trim());
    }

    logger.warn('🚫 Enqueueing batch address blocking', {
      count: normalizedAddresses.length
    });

    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('add-to-blocklist-batch', {
      type: 'add-to-blocklist-batch',
      addresses: normalizedAddresses,
      reasons
    });

    logger.warn('✅ Batch blocking enqueued', {
      jobId: job.id,
      count: normalizedAddresses.length
    });

    res.json({
      success: true,
      jobId: job.id,
      blockedCount: normalizedAddresses.length,
      message: 'Transaction queued - worker will process'
    });
  } catch (error: any) {
    logger.error('❌ Failed to enqueue batch blocking', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Blocklist batch failed',
      message: error.message
    });
  }
}

/**
 * POST /blocklist/remove
 * Enqueue address removal from blocklist
 */
export async function removeFromBlocklist(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.body as { address: string };

    if (!address || !ethers.isAddress(address)) {
      res.status(400).json({
        success: false,
        error: 'Invalid address',
        message: 'Provide a valid wallet address to unblock'
      });
      return;
    }

    const normalizedAddress = ethers.getAddress(address);

    logger.info('✅ Enqueueing address unblocking', {
      address: normalizedAddress
    });

    // Enqueue job (worker will process and send TX)
    const job = await enqueueTransaction('remove-from-blocklist', {
      type: 'remove-from-blocklist',
      address: normalizedAddress
    });

    logger.info('✅ Address unblocking enqueued', {
      jobId: job.id,
      address: normalizedAddress
    });

    res.json({
      success: true,
      jobId: job.id,
      address: normalizedAddress,
      message: 'Transaction queued - worker will process'
    });
  } catch (error: any) {
    logger.error('❌ Failed to enqueue address unblocking', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Blocklist removal failed',
      message: error.message
    });
  }
}

/**
 * GET /blocklist/:address
 * Retrieve block status and public reason for an address
 */
export async function getBlockStatus(req: Request, res: Response): Promise<void> {
  try {
    const { address } = req.params;

    if (!address || !ethers.isAddress(address)) {
      res.status(400).json({
        success: false,
        error: 'Invalid address',
        message: 'Provide a valid wallet address to query'
      });
      return;
    }

    const normalizedAddress = ethers.getAddress(address);
    const [isBlocked, reason] = await contract.getBlockStatus(normalizedAddress);

    res.json({
      success: true,
      address: normalizedAddress,
      isBlocked,
      reason
    });
  } catch (error: any) {
    logger.error('❌ Failed to fetch block status', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Unable to fetch block status',
      message: error.message
    });
  }
}
