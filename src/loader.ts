/**
 * Entry point loader - Validates environment before starting
 * This file MUST be imported/executed first
 * 
 * Order of operations:
 * 1. Load .env file
 * 2. Validate all required env vars (fail-fast if missing)
 * 3. Import and start the application
 */

import dotenv from 'dotenv';

// Load .env file BEFORE any other module imports
dotenv.config();

// Validate environment variables (crashes if required vars missing)
import './config/env.js';

// Now import and start the main application
import('./index.js');
