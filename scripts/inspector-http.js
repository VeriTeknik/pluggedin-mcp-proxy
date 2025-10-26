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

// Wait a bit for server to start, then launch inspector
setTimeout(() => {
  console.log('🔍 Launching MCP Inspector...');
  console.log(`🌐 Connecting to: http://localhost:${port}/mcp`);

  const inspectorProcess = spawn('npx', [
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
    inspectorProcess.kill('SIGINT');
    serverProcess.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    inspectorProcess.kill('SIGTERM');
    serverProcess.kill('SIGTERM');
    process.exit(0);
  });
}, 2000); // Wait 2 seconds for server to start

// Handle server exit
serverProcess.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`❌ Server process exited with code ${code}`);
    process.exit(code);
  }
});
