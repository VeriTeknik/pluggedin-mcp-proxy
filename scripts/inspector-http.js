#!/usr/bin/env node

import { spawn, execFile } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Starting Streamable HTTP MCP Server with Inspector...');

// Load environment variables from .env.local
const envPath = join(__dirname, '..', '.env.local');
let envVars = {};

// Secure environment variable parser
function parseEnvFile(content) {
  const envVars = {};
  const lines = content.split('\n');

  for (const line of lines) {
    // Skip empty lines and comments
    if (!line.trim() || line.trim().startsWith('#')) continue;

    // Find first = sign for key-value split
    const equalIndex = line.indexOf('=');
    if (equalIndex === -1) continue;

    const key = line.substring(0, equalIndex).trim();
    let value = line.substring(equalIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Basic validation: only allow alphanumeric keys with underscores
    if (/^[A-Z0-9_]+$/.test(key)) {
      envVars[key] = value;
    }
  }

  return envVars;
}

try {
  const envContent = readFileSync(envPath, 'utf8');
  envVars = parseEnvFile(envContent);
  console.log('✅ Loaded environment variables from .env.local');
} catch (error) {
  console.warn('⚠️  Could not load .env.local file, continuing without API key...');
}

// Validate and sanitize environment variables
const sanitizedApiKey = envVars.PLUGGEDIN_API_KEY ? String(envVars.PLUGGEDIN_API_KEY).trim() : '';
const sanitizedApiUrl = envVars.PLUGGEDIN_API_BASE_URL ? String(envVars.PLUGGEDIN_API_BASE_URL).trim() : '';

const port = 12006;

/**
 * Poll the server's health endpoint until it's ready
 * @param {number} port - Server port
 * @param {number} maxWaitMs - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} - True if server is ready
 */
async function waitForServer(port, maxWaitMs = 10000) {
  const startTime = Date.now();
  const pollInterval = 500; // Check every 500ms
  let attempts = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    try {
      // Try to connect to the health endpoint
      const response = await fetch(`http://localhost:${port}/health`);
      if (response.ok) {
        console.log(`✅ Server is ready! (took ${Date.now() - startTime}ms, ${attempts} attempts)`);
        return true;
      }
    } catch (error) {
      // Server not ready yet, continue polling
      // Errors are expected while server is starting
    }

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error(`Server did not start within ${maxWaitMs}ms after ${attempts} attempts`);
}

// Start the HTTP server
console.log(`📡 Starting MCP server on http://localhost:${port}...`);
const serverProcess = spawn('node', [
  'dist/index.js',
  '--transport', 'streamable-http',
  '--port', String(port)
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLUGGEDIN_API_KEY: sanitizedApiKey,
    PLUGGEDIN_API_BASE_URL: sanitizedApiUrl
  }
});

// Keep inspector process reference in outer scope for signal handlers
let inspectorProcess = null;

// Wait for server to be ready, then launch inspector
waitForServer(port).then(() => {
  console.log('🔍 Launching MCP Inspector...');
  console.log(`🌐 Connecting to: http://localhost:${port}/mcp`);

  inspectorProcess = spawn('npx', [
    '@modelcontextprotocol/inspector',
    `http://localhost:${port}/mcp`
  ], {
    stdio: 'inherit'
  });

  // Handle inspector exit
  inspectorProcess.on('close', (code) => {
    console.log(`\n📝 Inspector closed with code ${code}`);
    console.log('🛑 Stopping HTTP server...');
    serverProcess.kill('SIGTERM');
    process.exit(code);
  });

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping inspector and server...');
    if (inspectorProcess) inspectorProcess.kill('SIGINT');
    serverProcess.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    if (inspectorProcess) inspectorProcess.kill('SIGTERM');
    serverProcess.kill('SIGTERM');
    process.exit(0);
  });
}).catch(error => {
  console.error(`❌ ${error.message}`);
  console.error('💡 Make sure the server builds successfully: npm run build');
  serverProcess.kill('SIGTERM');
  process.exit(1);
});

// Handle server exit
serverProcess.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Server process exited with code ${code}`);
    process.exit(code);
  }
});
