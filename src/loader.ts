/**
 * Entry point loader - Ensures .env is loaded before any other imports
 * This file MUST be imported/executed first
 */

import dotenv from 'dotenv';

// Load .env file BEFORE any other module imports
dotenv.config();

// Now import and start the main application
import('./index.js');
