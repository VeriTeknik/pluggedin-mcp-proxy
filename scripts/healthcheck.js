#!/usr/bin/env node
/**
 * Docker HEALTHCHECK script
 * Verifies the server is responding on the /health endpoint
 */

const http = require('http');

const port = process.env.PORT || 8081;
const url = `http://localhost:${port}/health`;

http.get(url, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      if (json.status === 'ok') {
        process.exit(0); // Success
      } else {
        console.error(`Health check failed: status is ${json.status}`);
        process.exit(1); // Failure
      }
    } catch (error) {
      console.error(`Health check failed: invalid JSON response`);
      process.exit(1); // Failure
    }
  });
}).on('error', (error) => {
  console.error(`Health check failed: ${error.message}`);
  process.exit(1); // Failure
});
