import { Request, Response } from 'express';
import { contract } from '../index.js';
import logger from '../utils/logger.js';

/**
 * GET /accounting-invariant
 * Fetch accounting invariant status from contract
 */
export async function getAccountingInvariant(_req: Request, res: Response): Promise<void> {
  try {
    const [isValid, contractBalance, reservedFunds, platformFees] = await contract.checkAccountingInvariant();

    res.json({
      success: true,
      data: {
        isValid,
        contractBalance: contractBalance.toString(),
        reservedFunds: reservedFunds.toString(),
        platformFees: platformFees.toString()
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to fetch accounting invariant', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'ACCOUNTING_INVARIANT_FAILED',
      message: error.message
    });
  }
}

/**
 * GET /token-decimals
 * Return token decimals used by USDT contract
 */
export async function getTokenDecimals(_req: Request, res: Response): Promise<void> {
  try {
    const decimals = await contract.getTokenDecimals();

    res.json({
      success: true,
      data: {
        decimals: Number(decimals)
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to fetch token decimals', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'TOKEN_DECIMALS_FAILED',
      message: error.message
    });
  }
}

interface ScanRafflesRequest {
  startId: number | string;
  endId: number | string;
}

/**
 * POST /scan-raffles
 * Scan contract storage for raffles in range (owner-only view)
 */
export async function scanRaffles(req: Request<{}, {}, ScanRafflesRequest>, res: Response): Promise<void> {
  try {
    const { startId, endId } = req.body;

    if (startId === undefined || endId === undefined) {
      res.status(400).json({
        success: false,
        error: 'MISSING_RANGE',
        message: 'startId and endId are required'
      });
      return;
    }

    const start = BigInt(startId);
    const end = BigInt(endId);

    if (end <= start) {
      res.status(400).json({
        success: false,
        error: 'INVALID_RANGE',
        message: 'endId must be greater than startId'
      });
      return;
    }

    const [ids, statuses] = await contract.scanRaffles(start, end);

    res.json({
      success: true,
      data: {
        ids: ids.map((id: bigint) => id.toString()),
        statuses: statuses.map((status: number) => Number(status))
      }
    });
  } catch (error: any) {
    logger.error('❌ Failed to scan raffles', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'SCAN_RAFFLES_FAILED',
      message: error.message
    });
  }
}
