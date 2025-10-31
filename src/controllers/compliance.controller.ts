import { Request, Response } from 'express';
import { ethers } from 'ethers';
import { contract } from '../index.js';
import logger from '../utils/logger.js';

interface BlocklistEntry {
  address: string;
  reason: string;
}

/**
 * POST /blocklist/add
 * Block a single address with a public reason
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

    logger.warn('🚫 Blocking address', {
      address: normalizedAddress,
      reason: sanitizedReason
    });

    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    const tx = await contract.addToBlocklist(normalizedAddress, sanitizedReason, { nonce });

    const receipt = await tx.wait();

    logger.warn('✅ Address blocked', {
      address: normalizedAddress,
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber
    });

    res.json({
      success: true,
      txHash: tx.hash,
      address: normalizedAddress,
      message: 'Address added to blocklist',
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed?.toString()
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to block address', {
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
 * Block up to 100 addresses in a single transaction
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

    logger.warn('🚫 Blocking batch of addresses', {
      count: normalizedAddresses.length
    });

    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    const tx = await contract.addToBlocklistBatch(normalizedAddresses, reasons, { nonce });

    const receipt = await tx.wait();

    logger.warn('✅ Blocklist batch processed', {
      count: normalizedAddresses.length,
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber
    });

    res.json({
      success: true,
      txHash: tx.hash,
      blockedCount: normalizedAddresses.length,
      message: 'Addresses added to blocklist',
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed?.toString()
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to process blocklist batch', {
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
 * Remove an address from the blocklist
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

    logger.info('✅ Removing address from blocklist', {
      address: normalizedAddress
    });

    const signer = contract.runner as ethers.Wallet;
    const nonce = await signer.getNonce('pending');
    const tx = await contract.removeFromBlocklist(normalizedAddress, { nonce });

    const receipt = await tx.wait();

    logger.info('✅ Address unblocked', {
      address: normalizedAddress,
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber
    });

    res.json({
      success: true,
      txHash: tx.hash,
      address: normalizedAddress,
      message: 'Address removed from blocklist',
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed?.toString()
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to remove blocklist entry', {
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
