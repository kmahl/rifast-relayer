/**
 * Environment Variables Validation
 * 
 * CRITICAL: No fallback values in production
 * If a required env var is missing, the process MUST crash immediately
 * This prevents silent failures and mixed environments
 */

import dotenv from 'dotenv';
import logger from '../utils/logger.js';

// Load .env file FIRST (before any validation)
dotenv.config();

interface EnvironmentConfig {
  // Critical: Admin wallet with contract ownership
  adminPrivateKey: string;
  
  // Critical: Relayer API authentication
  relayerApiKey: string;
  
  // Critical: Redis for transaction queue
  redisUrl: string;
  
  // Critical: Blockchain RPC endpoint
  rpcUrl: string;
  
  // Critical: Smart contract address
  contractAddress: string;
  
  // Environment
  nodeEnv: 'development' | 'production' | 'test';
  
  // Server config
  port: number;
  host: string;
  
  // Security
  allowedIps: string[];
  rateLimitPerMinute: number;
  
  // Logging
  logLevel: string;
}

/**
 * Get required environment variable or crash
 */
function getRequiredEnv(key: string): string {
  const value = process.env[key];
  
  if (!value || value.trim() === '') {
    logger.error(`❌ FATAL: Missing required environment variable: ${key}`);
    logger.error(`   Set ${key} in .env file or environment`);
    process.exit(1);
  }
  
  return value.trim();
}

/**
 * Get optional environment variable with explicit default
 */
function getOptionalEnv(key: string, defaultValue: string): string {
  const value = process.env[key];
  
  if (!value || value.trim() === '') {
    logger.warn(`⚠️  Using default for ${key}: ${defaultValue}`);
    return defaultValue;
  }
  
  return value.trim();
}

/**
 * Validate and load all environment variables
 * Crashes immediately if critical vars are missing
 */
export function loadEnvironment(): EnvironmentConfig {
  logger.info('🔧 Loading environment configuration...');
  
  // Critical variables - MUST be set, no defaults
  const adminPrivateKey = getRequiredEnv('ADMIN_PRIVATE_KEY');
  const relayerApiKey = getRequiredEnv('RELAYER_API_KEY');
  const redisUrl = getRequiredEnv('REDIS_URL');
  const rpcUrl = getRequiredEnv('RPC_URL');
  const contractAddress = getRequiredEnv('CONTRACT_ADDRESS');
  
  // Validate private key format (0x + 64 hex chars)
  if (!/^0x[a-fA-F0-9]{64}$/.test(adminPrivateKey)) {
    logger.error('❌ FATAL: ADMIN_PRIVATE_KEY must be 0x followed by 64 hex characters');
    process.exit(1);
  }
  
  // Validate contract address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(contractAddress)) {
    logger.error('❌ FATAL: CONTRACT_ADDRESS must be 0x followed by 40 hex characters');
    process.exit(1);
  }
  
  // Validate Redis URL format
  if (!redisUrl.startsWith('redis://')) {
    logger.error('❌ FATAL: REDIS_URL must start with redis://');
    process.exit(1);
  }
  
  // Optional variables with explicit defaults
  const nodeEnv = getOptionalEnv('NODE_ENV', 'development') as 'development' | 'production' | 'test';
  const port = parseInt(getOptionalEnv('PORT', '3002'), 10);
  const host = getOptionalEnv('HOST', '0.0.0.0');
  const logLevel = getOptionalEnv('LOG_LEVEL', 'info');
  const allowedIpsStr = getOptionalEnv('ALLOWED_IPS', '');
  const rateLimitStr = getOptionalEnv('RATE_LIMIT_PER_MINUTE', '10');
  
  // Parse allowed IPs
  const allowedIps = allowedIpsStr
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
  
  const rateLimitPerMinute = parseInt(rateLimitStr, 10);
  
  const config: EnvironmentConfig = {
    adminPrivateKey,
    relayerApiKey,
    redisUrl,
    rpcUrl,
    contractAddress,
    nodeEnv,
    port,
    host,
    allowedIps,
    rateLimitPerMinute,
    logLevel,
  };
  
  // Log loaded config (NEVER log sensitive values)
  logger.info('✅ Environment configuration loaded', {
    nodeEnv: config.nodeEnv,
    port: config.port,
    host: config.host,
    redisUrl: config.redisUrl,
    rpcUrl: config.rpcUrl.substring(0, 30) + '...',
    contractAddress: config.contractAddress,
    allowedIps: config.allowedIps.length > 0 ? config.allowedIps : 'disabled (allow all)',
    rateLimitPerMinute: config.rateLimitPerMinute,
    logLevel: config.logLevel,
    adminPrivateKey: '***REDACTED***',
    relayerApiKey: '***REDACTED***'
  });
  
  // Warn if sensitive defaults are used in production
  if (nodeEnv === 'production') {
    if (allowedIps.length === 0) {
      logger.warn('⚠️  WARNING: ALLOWED_IPS is empty in PRODUCTION - all IPs can access relayer!');
    }
    if (rateLimitPerMinute > 100) {
      logger.warn('⚠️  WARNING: RATE_LIMIT_PER_MINUTE is high in PRODUCTION');
    }
  }
  
  return config;
}

// Export singleton instance
export const env = loadEnvironment();
