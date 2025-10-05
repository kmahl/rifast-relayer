# 🔐 RIFAST Relayer Service

**Isolated transaction signing service for RIFAST platform.**

## 📋 Purpose

The Relayer Service is a security-focused microservice that holds the `ADMIN_PRIVATE_KEY` and executes blockchain transactions on behalf of the main backend. This architectural separation ensures that even if the main backend is compromised, the private key remains secure.

## 🏗️ Architecture

```
┌──────────────────┐           ┌──────────────────┐
│  BACKEND         │           │  RELAYER         │
│  (Railway)       │           │  (Separate)      │
│                  │           │                  │
│  • No keys ✅    │──HTTP────▶│  • ADMIN_PRIVATE │
│  • PostgreSQL    │  Request  │    _KEY here ✅  │
│  • API REST      │           │  • Only signs TX │
│  • WebSockets    │           │  • Minimal code  │
│  • Business      │◀──────────│  • Isolated      │
│    Logic         │  txHash   │                  │
└──────────────────┘           └──────────────────┘
                                       ↓ TX
                                 [Blockchain BSC]
```

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd relayer
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your values
```

**Required variables:**
- `ADMIN_PRIVATE_KEY`: The private key with owner permissions on RifasPlatform contract
- `RELAYER_API_KEY`: Shared secret between backend and relayer (generate with `openssl rand -hex 32`)
- `RPC_URL`: Blockchain RPC endpoint
- `CONTRACT_ADDRESS`: RifasPlatform contract address

### 3. Copy Contract ABI

```bash
# From contracts directory after compilation
cp ../contracts/artifacts/contracts/RifasPlatform.sol/RifasPlatform.json abi/
```

### 4. Run Development Server

```bash
pnpm run dev
```

### 5. Run Production

```bash
pnpm run build
pnpm start
```

## 📡 API Endpoints

All endpoints require `X-API-Key` header with the `RELAYER_API_KEY`.

### POST /create-raffle

Create a new raffle on-chain.

**Request:**
```json
{
  "templateId": "12345",
  "ticketPrice": "1.0",
  "maxTickets": 100,
  "minTickets": 5,
  "durationSeconds": 86400
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "nonce": 42
}
```

### POST /execute-refund

Execute refund batch for an expired raffle.

**Request:**
```json
{
  "raffleId": 123
}
```

**Response:**
```json
{
  "success": true,
  "txHash": "0x...",
  "receipt": {
    "blockNumber": 12345,
    "gasUsed": "150000"
  }
}
```

### GET /health

Health check endpoint (no authentication required).

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "timestamp": "2025-10-05T12:00:00.000Z",
  "signer": "0x..."
}
```

## 🔒 Security Features

### 1. API Key Authentication
Every request must include `X-API-Key` header matching `RELAYER_API_KEY`.

### 2. IP Whitelisting (Optional)
Set `ALLOWED_IPS` environment variable to restrict access to specific IPs:
```bash
ALLOWED_IPS=127.0.0.1,192.168.1.100
```

### 3. Rate Limiting
Default: 10 requests per minute per IP. Configure with `RATE_LIMIT_PER_MINUTE`.

### 4. Security Headers
Helmet.js adds security headers automatically.

### 5. Request Logging
Morgan logs all HTTP requests for audit trail.

## 🧪 Testing Locally

```bash
# Terminal 1: Start relayer
cd relayer
pnpm run dev

# Terminal 2: Test with curl
curl -X POST http://localhost:3001/create-raffle \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "templateId": "123",
    "ticketPrice": "1.0",
    "maxTickets": 100,
    "minTickets": 5,
    "durationSeconds": 86400
  }'
```

## 🚢 Deployment

### Railway

1. Create new project in Railway
2. Add environment variables from `.env.example`
3. Deploy from `relayer/` directory
4. Update `RELAYER_URL` in backend `.env`

### Fly.io (Free Tier)

```bash
cd relayer
fly launch
fly secrets set ADMIN_PRIVATE_KEY=0x...
fly secrets set RELAYER_API_KEY=...
fly deploy
```

## 📊 Monitoring

### Logs
```bash
# Railway
railway logs

# Fly.io
fly logs
```

### Metrics
- Monitor `/health` endpoint for uptime
- Check transaction success rate
- Track gas usage per operation

## 🆘 Troubleshooting

### Issue: "Cannot find module 'express'"
```bash
pnpm install
```

### Issue: "Contract ABI not found"
```bash
cp ../contracts/artifacts/contracts/RifasPlatform.sol/RifasPlatform.json abi/
```

### Issue: "Unauthorized" error
Check that `X-API-Key` header matches `RELAYER_API_KEY` in both backend and relayer.

### Issue: "IP not whitelisted"
Either add your IP to `ALLOWED_IPS` or remove the whitelist for development.

## 📝 Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ADMIN_PRIVATE_KEY` | ✅ | Owner private key | `0x123...` |
| `RELAYER_API_KEY` | ✅ | Shared secret with backend | `abc123...` |
| `RPC_URL` | ✅ | Blockchain RPC endpoint | `https://bsc-testnet...` |
| `CONTRACT_ADDRESS` | ✅ | RifasPlatform address | `0x9fe...` |
| `NODE_ENV` | ❌ | Environment | `development` |
| `PORT` | ❌ | Server port | `3001` |
| `HOST` | ❌ | Server host | `0.0.0.0` |
| `ALLOWED_IPS` | ❌ | IP whitelist (comma-separated) | `127.0.0.1` |
| `RATE_LIMIT_PER_MINUTE` | ❌ | Rate limit | `10` |
| `LOG_LEVEL` | ❌ | Logging level | `info` |

## 🔐 Security Best Practices

1. **Never commit `.env` file** - Added to `.gitignore`
2. **Rotate API keys regularly** - Change `RELAYER_API_KEY` monthly
3. **Use IP whitelist in production** - Restrict to backend server IP only
4. **Monitor transaction logs** - Check for unusual patterns
5. **Enable rate limiting** - Prevent abuse
6. **Keep dependencies updated** - Run `pnpm update` regularly
7. **Deploy in private VPC** - Isolate from public internet

## 📚 Further Reading

- [P1.2 Implementation Documentation](../docs-private/P1.2-COMPLETADO.md)
- [RIFAST Architecture](../docs-private/SIMPLIFIED_ARCHITECTURE.md)
- [Security Checklist](../docs-private/SECURITY_CHECKLIST.md)

## 📄 License

MIT
