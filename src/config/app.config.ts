/**
 * ⚙️ RELAYER APPLICATION CONFIGURATION
 * All environment variables validated on startup (fail-fast)
 * 
 * IMPORTANT: Use env.ts for all config - NO fallback values
 */

import { env } from './env.js';

// ============================================
// RE-EXPORT VALIDATED ENV VARS
// ============================================

export const SERVER_CONFIG = {
  port: env.port,
  host: env.host
};

export const RELAYER_API_KEY = env.relayerApiKey;
export const ALLOWED_IPS = env.allowedIps;

export const RATE_LIMIT_CONFIG = {
  requestsPerMinute: env.rateLimitPerMinute
};

export const NETWORK_CONFIG = {
  chainId: 31337, // Hardhat local
  name: env.nodeEnv === 'production' ? 'bsc' : 'hardhat',
  rpcUrl: env.rpcUrl
};

export const CONTRACT_ADDRESS = env.contractAddress;
export const PRIVATE_KEY = env.adminPrivateKey;

// ============================================
// STARTUP LOG
// ============================================

console.log('✅ Relayer configuration loaded:', {
  network: NETWORK_CONFIG.name,
  chainId: NETWORK_CONFIG.chainId,
  contractAddress: CONTRACT_ADDRESS,
  port: SERVER_CONFIG.port,
  rateLimit: `${RATE_LIMIT_CONFIG.requestsPerMinute}/min`,
  ipWhitelist: ALLOWED_IPS.length > 0 ? `${ALLOWED_IPS.length} IPs` : 'disabled'
});
