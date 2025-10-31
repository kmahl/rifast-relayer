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
  authenticateRequest,
  checkIPWhitelist,
  rateLimitMiddleware
} from './middleware/index.js';
import {
  healthRoutes,
  raffleRoutes,
  systemRoutes,
  adminRoutes,
  complianceRoutes,
  monitoringRoutes
} from './routes/index.js';
import {
  SERVER_CONFIG,
  NETWORK_CONFIG,
  CONTRACT_ADDRESS,
  PRIVATE_KEY,
  ALLOWED_IPS,
  RATE_LIMIT_CONFIG
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

// Apply security middleware to all routes
app.use(authenticateRequest);
app.use(checkIPWhitelist);
app.use(rateLimitMiddleware);

// ============================================
// ROUTES
// ============================================

// Register route handlers
app.use(healthRoutes);
app.use(raffleRoutes);
app.use(systemRoutes);
app.use(adminRoutes);
app.use(complianceRoutes);
app.use(monitoringRoutes);

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
