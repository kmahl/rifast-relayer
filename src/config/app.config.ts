/**
 * ⚙️ RELAYER APPLICATION CONFIGURATION
 * All environment variables validated on startup (fail-fast)
 */

// ============================================
// SERVER CONFIGURATION
// ============================================

export const SERVER_CONFIG = {
  port: parseInt(process.env.PORT || '3001', 10),
  host: process.env.HOST || '0.0.0.0'
};

// ============================================
// SECURITY CONFIGURATION
// ============================================

function validateApiKey(): string {
  const apiKey = process.env.RELAYER_API_KEY;
  if (!apiKey) {
    throw new Error('RELAYER_API_KEY is required');
  }
  return apiKey;
}

export const RELAYER_API_KEY = validateApiKey();

// IP Whitelist (optional - empty array means allow all)
export const ALLOWED_IPS: string[] = process.env.ALLOWED_IPS
  ? process.env.ALLOWED_IPS.split(',').map(ip => ip.trim())
  : [];

// ============================================
// RATE LIMITING CONFIGURATION
// ============================================

export const RATE_LIMIT_CONFIG = {
  requestsPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10', 10)
};

// ============================================
// NETWORK CONFIGURATION
// ============================================

type NetworkEnvironment = 'local' | 'testnet' | 'production';

interface NetworkConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
}

function getNetworkEnvironment(): NetworkEnvironment {
  const env = process.env.NETWORK_ENV?.toLowerCase();
  
  if (env === 'production' || env === 'mainnet') return 'production';
  if (env === 'testnet' || env === 'test') return 'testnet';
  return 'local';
}

const NETWORKS: Record<NetworkEnvironment, NetworkConfig> = {
  local: {
    chainId: 31337,
    name: 'hardhat',
    rpcUrl: 'http://127.0.0.1:8545'
  },
  testnet: {
    chainId: 97,
    name: 'bsc-testnet',
    rpcUrl: process.env.BSC_TESTNET_RPC_URL || ''
  },
  production: {
    chainId: 56,
    name: 'bsc',
    rpcUrl: process.env.BSC_RPC_URL || ''
  }
};

export const NETWORK_ENV = getNetworkEnvironment();
export const NETWORK_CONFIG = NETWORKS[NETWORK_ENV];

// Validate RPC URL for non-local networks
if (NETWORK_ENV !== 'local' && !NETWORK_CONFIG.rpcUrl) {
  throw new Error(`Missing RPC URL for ${NETWORK_ENV}. Set BSC_TESTNET_RPC_URL or BSC_RPC_URL`);
}

// ============================================
// CONTRACT CONFIGURATION
// ============================================

function getContractAddress(): string {
  if (NETWORK_ENV === 'production') {
    return process.env.CONTRACT_ADDRESS_MAINNET || process.env.CONTRACT_ADDRESS || '';
  }
  if (NETWORK_ENV === 'testnet') {
    return process.env.CONTRACT_ADDRESS_TESTNET || process.env.CONTRACT_ADDRESS || '';
  }
  return process.env.CONTRACT_ADDRESS || '';
}

export const CONTRACT_ADDRESS = getContractAddress();

if (!CONTRACT_ADDRESS) {
  throw new Error(`Missing CONTRACT_ADDRESS for ${NETWORK_ENV} network`);
}

function getPrivateKey(): string {
  const key = process.env.PRIVATE_KEY;
  if (!key) {
    throw new Error('PRIVATE_KEY is required for relayer wallet');
  }
  return key;
}

export const PRIVATE_KEY = getPrivateKey();

// ============================================
// STARTUP LOG
// ============================================

console.log('✅ Relayer configuration loaded:', {
  network: NETWORK_ENV,
  chainId: NETWORK_CONFIG.chainId,
  contractAddress: CONTRACT_ADDRESS,
  port: SERVER_CONFIG.port,
  rateLimit: `${RATE_LIMIT_CONFIG.requestsPerMinute}/min`,
  ipWhitelist: ALLOWED_IPS.length > 0 ? `${ALLOWED_IPS.length} IPs` : 'disabled'
});
