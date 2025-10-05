import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

// ============================================
// CONFIGURATION VALIDATION
// ============================================

const requiredEnvVars = [
  'ADMIN_PRIVATE_KEY',
  'RELAYER_API_KEY',
  'RPC_URL',
  'CONTRACT_ADDRESS'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar] || process.env[envVar] === '0x...' || process.env[envVar]!.length < 10) {
    console.error(`❌ Missing or invalid required environment variable: ${envVar}`);
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT || '3001');
const HOST = process.env.HOST || '0.0.0.0';
const RELAYER_API_KEY = process.env.RELAYER_API_KEY!;
const ALLOWED_IPS = process.env.ALLOWED_IPS?.split(',').map(ip => ip.trim()).filter(Boolean) || [];
const RATE_LIMIT_PER_MINUTE = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10');

// ============================================
// BLOCKCHAIN SETUP
// ============================================

let provider: ethers.JsonRpcProvider;
let signer: ethers.Wallet;
let contract: ethers.Contract;

try {
  provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  signer = new ethers.Wallet(process.env.ADMIN_PRIVATE_KEY!, provider);
  
  // Load contract ABI
  const abiPath = path.join(__dirname, '../abi/RifasPlatform.json');
  if (!fs.existsSync(abiPath)) {
    console.error(`❌ Contract ABI not found at ${abiPath}`);
    console.error('   Please copy from backend/src/contracts/artifacts/RifasPlatform.json');
    process.exit(1);
  }
  
  const contractArtifact = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));
  const contractABI = contractArtifact.abi || contractArtifact; // Handle both artifact and raw ABI formats
  contract = new ethers.Contract(process.env.CONTRACT_ADDRESS!, contractABI, signer);
  
  console.log('✅ Blockchain connection initialized');
  console.log(`   RPC: ${process.env.RPC_URL}`);
  console.log(`   Contract: ${process.env.CONTRACT_ADDRESS}`);
  console.log(`   Signer: ${signer.address}`);
} catch (error: any) {
  console.error('❌ Failed to initialize blockchain connection:', error.message);
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
  
  if (entry.count >= RATE_LIMIT_PER_MINUTE) {
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
      message: `Rate limit exceeded. Max ${RATE_LIMIT_PER_MINUTE} requests per minute.`
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
  templateId: string | number | bigint;
  ticketPrice: string;
  maxTickets: number;
  minTickets: number;
  durationSeconds: number;
}

app.post('/create-raffle', async (req: Request, res: Response) => {
  try {
    const { templateId, ticketPrice, maxTickets, minTickets, durationSeconds } = req.body as CreateRaffleRequest;
    
    // Validation
    if (!templateId || !ticketPrice || !maxTickets || !minTickets || !durationSeconds) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['templateId', 'ticketPrice', 'maxTickets', 'minTickets', 'durationSeconds']
      });
      return;
    }
    
    console.log('📝 Creating raffle on-chain...', {
      templateId: templateId.toString(),
      ticketPrice,
      maxTickets,
      minTickets,
      durationSeconds
    });
    
    // Get fresh nonce from pending pool
    const nonce = await signer.getNonce('pending');
    
    // Send transaction
    const tx = await contract.createRaffle(
      BigInt(templateId),
      ethers.parseUnits(ticketPrice, 18),
      BigInt(maxTickets),
      BigInt(minTickets),
      BigInt(durationSeconds),
      { nonce }
    );
    
    console.log('✅ Raffle creation tx sent:', {
      txHash: tx.hash,
      nonce
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      nonce
    });
    
  } catch (error: any) {
    console.error('❌ Failed to create raffle:', error);
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
    
    console.log('💸 Executing refund batch...', {
      raffleId: raffleId.toString()
    });
    
    // Estimate gas first
    const gasEstimate = await contract.executeRefundBatch.estimateGas(BigInt(raffleId));
    const gasLimit = gasEstimate * 120n / 100n; // +20% buffer
    
    console.log('⛽ Gas estimate:', {
      estimate: gasEstimate.toString(),
      limit: gasLimit.toString()
    });
    
    // Send transaction
    const tx = await contract.executeRefundBatch(BigInt(raffleId), {
      gasLimit
    });
    
    console.log('✅ Refund batch tx sent:', {
      txHash: tx.hash,
      raffleId: raffleId.toString()
    });
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    console.log('✅ Refund batch confirmed:', {
      txHash: receipt?.hash,
      blockNumber: receipt?.blockNumber,
      gasUsed: receipt?.gasUsed.toString()
    });
    
    res.json({
      success: true,
      txHash: tx.hash,
      receipt: {
        blockNumber: receipt?.blockNumber,
        gasUsed: receipt?.gasUsed.toString()
      }
    });
    
  } catch (error: any) {
    console.error('❌ Failed to execute refund:', error);
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
// ERROR HANDLER
// ============================================

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('💥 Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: err.message
  });
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, HOST, () => {
  console.log('');
  console.log('🚀 RIFAST Relayer Service Started');
  console.log('==================================');
  console.log(`📍 Listening on: http://${HOST}:${PORT}`);
  console.log(`🔐 API Key: ${RELAYER_API_KEY.substring(0, 10)}...`);
  console.log(`🛡️  IP Whitelist: ${ALLOWED_IPS.length > 0 ? ALLOWED_IPS.join(', ') : 'Disabled (allow all)'}`);
  console.log(`⚡ Rate Limit: ${RATE_LIMIT_PER_MINUTE} req/min`);
  console.log(`🌐 RPC: ${process.env.RPC_URL}`);
  console.log(`📜 Contract: ${process.env.CONTRACT_ADDRESS}`);
  console.log(`👤 Signer: ${signer.address}`);
  console.log('==================================');
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('⚠️  SIGINT received, shutting down gracefully...');
  process.exit(0);
});
