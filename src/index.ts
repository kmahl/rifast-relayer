import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Note: .env is loaded by loader.ts before this file imports
import logger from './utils/logger.js';
import {
  SERVER_CONFIG,
  RELAYER_API_KEY,
  ALLOWED_IPS,
  RATE_LIMIT_CONFIG,
  NETWORK_CONFIG,
  CONTRACT_ADDRESS,
  PRIVATE_KEY
} from './config/app.config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// BLOCKCHAIN SETUP
// ============================================

let provider: ethers.JsonRpcProvider;
let signer: ethers.Wallet;
export let contract: ethers.Contract; // Export for executor

try {
  provider = new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl);
  signer = new ethers.Wallet(PRIVATE_KEY, provider);
  
  // Load contract ABI
  const abiPath = path.join(__dirname, '../abi/RifasPlatform.json');
  if (!fs.existsSync(abiPath)) {
    console.error(`❌ Contract ABI not found at ${abiPath}`);
    console.error('   Please copy from backend/src/contracts/artifacts/RifasPlatform.json');
    process.exit(1);
  }
  
  const contractArtifact = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));
  const contractABI = contractArtifact.abi || contractArtifact; // Handle both artifact and raw ABI formats
  contract = new ethers.Contract(CONTRACT_ADDRESS, contractABI, signer);
  
  logger.info('✅ Blockchain connection initialized');
  logger.info(`   Network: ${NETWORK_CONFIG.name} (Chain ID: ${NETWORK_CONFIG.chainId})`);
  logger.info(`   RPC: ${NETWORK_CONFIG.rpcUrl}`);
  logger.info(`   Contract: ${CONTRACT_ADDRESS}`);
  logger.info(`   Signer: ${signer.address}`);
} catch (error: any) {
  logger.error('❌ Failed to initialize blockchain connection:', { error: error.message });
  process.exit(1);
}

// ============================================
// EXPRESS APP SETUP
// ============================================

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(morgan('combined')); // HTTP request logging

// ============================================
// RATE LIMITING (Simple in-memory)
// ============================================

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateLimitEntry>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(ip);
  
  if (!entry || entry.resetAt < now) {
    // Reset or create new entry
    rateLimitStore.set(ip, {
      count: 1,
      resetAt: now + 60_000 // 1 minute
    });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_CONFIG.requestsPerMinute) {
    return false; // Rate limit exceeded
  }
  
  entry.count++;
  return true;
}

// Cleanup old rate limit entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(ip);
    }
  }
}, 5 * 60_000);

// ============================================
// MIDDLEWARE: AUTHENTICATION
// ============================================

function authenticateRequest(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'] as string;
  
  if (!apiKey || apiKey !== RELAYER_API_KEY) {
    res.status(401).json({ 
      success: false, 
      error: 'Unauthorized',
      message: 'Invalid or missing API key'
    });
    return;
  }
  
  next();
}

// ============================================
// MIDDLEWARE: IP WHITELIST
// ============================================

function checkIPWhitelist(req: Request, res: Response, next: NextFunction): void {
  if (ALLOWED_IPS.length === 0) {
    // No whitelist configured, allow all
    next();
    return;
  }
  
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  
  if (!ALLOWED_IPS.includes(clientIP)) {
    console.warn(`🚫 Rejected request from unauthorized IP: ${clientIP}`);
    res.status(403).json({ 
      success: false, 
      error: 'Forbidden',
      message: 'IP not whitelisted'
    });
    return;
  }
  
  next();
}

// ============================================
// MIDDLEWARE: RATE LIMITING
// ============================================

function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const clientIP = req.ip || req.socket.remoteAddress || 'unknown';
  
  if (!checkRateLimit(clientIP)) {
    console.warn(`⚠️ Rate limit exceeded for IP: ${clientIP}`);
    res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Max ${RATE_LIMIT_CONFIG.requestsPerMinute} requests per minute.`
    });
    return;
  }
  
  next();
}

// Apply middleware to all routes
app.use(authenticateRequest);
app.use(checkIPWhitelist);
app.use(rateLimitMiddleware);

// ============================================
// ROUTES
// ============================================

// Health check (no auth required for monitoring)
app.get('/health', (_req, res) => {
  res.json({ 
    success: true, 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    signer: signer.address
  });
});

// ============================================
// POST /create-raffle
// Create a new raffle on-chain
// ============================================

interface CreateRaffleRequest {
  referenceId: string | number | bigint;
  templateId: string | number | bigint;
  ticketPrice: string;
  maxTickets: number;
  minTickets: number;
  durationSeconds: number;
}

app.post('/create-raffle', async (req: Request, res: Response) => {
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
});

// ============================================
// POST /execute-refund
// Execute refund batch for expired raffles
// ============================================

interface ExecuteRefundRequest {
  raffleId: number | string;
}

app.post('/execute-refund', async (req: Request, res: Response) => {
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
});

// ============================================
// POST /pause-system
// Emergency pause - stops all raffle operations
// ============================================

app.post('/pause-system', async (_req: Request, res: Response) => {
  try {
    logger.warn('🚨 EMERGENCY PAUSE requested');
    
    // Get fresh nonce from pending pool
    const nonce = await signer.getNonce('pending');
    
    const tx = await contract.emergencyPause({ nonce });
    
    logger.warn('⏸️  Pause transaction sent:', {
      txHash: tx.hash,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.warn('🛑 SYSTEM PAUSED', {
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
});

// ============================================
// POST /unpause-system
// Resume normal operations after pause
// ============================================

app.post('/unpause-system', async (_req: Request, res: Response) => {
  try {
    logger.info('▶️  UNPAUSE requested');
    
    // Get fresh nonce from pending pool
    const nonce = await signer.getNonce('pending');
    
    const tx = await contract.emergencyUnpause({ nonce });
    
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
});

// ============================================
// POST /withdraw-fees
// Withdraw accumulated platform fees
// ============================================

app.post('/withdraw-fees', async (_req: Request, res: Response) => {
  try {
    logger.info('💰 Platform fee withdrawal requested');
    
    // Get fresh nonce from pending pool
    const nonce = await signer.getNonce('pending');
    
    // withdrawPlatformFees() doesn't take parameters - sends all to owner
    const tx = await contract.withdrawPlatformFees({ nonce });
    
    logger.info('💸 Withdrawal transaction sent:', {
      txHash: tx.hash,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.info('✅ Fees withdrawn successfully', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString()
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      message: 'Platform fees withdrawn to owner',
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString()
      }
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to withdraw fees:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Withdrawal failed',
      message: error.message
    });
  }
});

// ============================================
// POST /force-execute
// Force execute a raffle (admin override)
// ============================================

// ============================================
// RAFFLE EXECUTION ENDPOINTS
// ============================================

/**
 * POST /execute-raffle
 * Execute an expired raffle that meets minimum tickets
 */
interface ExecuteRaffleRequest {
  raffleId: number | string;
}

app.post('/execute-raffle', async (req: Request, res: Response) => {
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
});

/**
 * POST /cancel-raffle
 * Cancel an empty raffle (0 tickets)
 */
interface CancelRaffleRequest {
  raffleId: number | string;
}

app.post('/cancel-raffle', async (req: Request, res: Response) => {
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
});

/**
 * POST /force-execute
 * Force execute a raffle (admin only)
 */
interface ForceExecuteRequest {
  raffleId: number | string;
}

app.post('/force-execute', async (req: Request, res: Response) => {
  try {
    const { raffleId } = req.body as ForceExecuteRequest;
    
    if (!raffleId) {
      res.status(400).json({
        success: false,
        error: 'Missing required field: raffleId'
      });
      return;
    }
    
    logger.warn('⚠️  FORCE EXECUTE requested', {
      raffleId: raffleId.toString()
    });
    
    // Get fresh nonce from pending pool
    const nonce = await signer.getNonce('pending');
    
    // Estimate gas
    const gasEstimate = await contract.executeRaffle.estimateGas(BigInt(raffleId));
    const gasLimit = gasEstimate * 120n / 100n;
    
    const tx = await contract.executeRaffle(BigInt(raffleId), {
      gasLimit,
      nonce
    });
    
    logger.info('🎲 Force execute tx sent:', {
      raffleId: raffleId.toString(),
      txHash: tx.hash,
      nonce
    });
    
    const receipt = await tx.wait();
    
    logger.info('✅ Raffle force executed', {
      raffleId: raffleId.toString(),
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      raffleId: raffleId.toString(),
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString()
      }
    });
    
  } catch (error: any) {
    logger.error('❌ Failed to force execute raffle:', {
      error: error.message,
      code: error.code
    });
    res.status(500).json({
      success: false,
      error: 'Force execute failed',
      message: error.message
    });
  }
});

// ============================================
// ERROR HANDLER
// ============================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('💥 Unhandled error:', { error: err.message, stack: err.stack });
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// ============================================
// START SERVER & EXECUTOR
// ============================================

const server = app.listen(SERVER_CONFIG.port, SERVER_CONFIG.host, () => {
  logger.info('🚀 RIFAST Relayer Service Started');
  logger.info('==================================');
  logger.info(`📍 Listening on: http://${SERVER_CONFIG.host}:${SERVER_CONFIG.port}`);
  logger.info(`🛡️  IP Whitelist: ${ALLOWED_IPS.length > 0 ? ALLOWED_IPS.join(', ') : 'Disabled (allow all)'}`);
  logger.info(`⚡ Rate Limit: ${RATE_LIMIT_CONFIG.requestsPerMinute} req/min`);
  logger.info(`🌐 Network: ${NETWORK_CONFIG.name} (Chain ID: ${NETWORK_CONFIG.chainId})`);
  logger.info(`📜 Contract: ${CONTRACT_ADDRESS}`);
  logger.info(`👤 Signer: ${signer.address}`);
  logger.info('==================================');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.warn('⚠️  SIGTERM received, shutting down gracefully...');
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.warn('⚠️  SIGINT received, shutting down gracefully...');
  
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});
