#!/usr/bin/env node

/**
 * Event Stream Logger
 * 
 * Connects to the API events/monitor endpoint and logs all events to a file.
 * Usage: node tools/event-stream-logger.js [output-file]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration
const API_URL = 'http://localhost:3001/api/events/monitor?token=3u8sdj5389fj3kljsf90u';
const DEFAULT_LOG_FILE = path.join(__dirname, '..', 'logs', 'monitorEventStream.log');

// Get output file from command line or use default
const outputFile = process.argv[2] || DEFAULT_LOG_FILE;

// Ensure logs directory exists
const logsDir = path.dirname(outputFile);
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

console.log(`Starting event stream logger...`);
console.log(`API URL: ${API_URL}`);
console.log(`Output file: ${outputFile}`);

// Log function with timestamp
function logEvent(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  
  // Write to file
  fs.appendFileSync(outputFile, logLine);
  
  // Also log to console for monitoring
  process.stdout.write(logLine);
}

// Connect to the event stream
async function connectToEventStream() {
  try {
    logEvent('Connecting to event stream...');
    
    // Use fetch with ReadableStream for Node.js 18+
    const response = await fetch(API_URL);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    logEvent('Connected successfully. Listening for events...');
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) {
        logEvent('Stream ended');
        break;
      }
      
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.trim()) {
          // Parse SSE format (data: {...})
          if (line.startsWith('data: ')) {
            const eventData = line.substring(6);
            try {
              // Try to parse and pretty-print JSON
              const parsed = JSON.parse(eventData);
              logEvent(`EVENT: ${JSON.stringify(parsed, null, 2)}`);
            } catch (e) {
              // If not valid JSON, log as-is
              logEvent(`DATA: ${eventData}`);
            }
          } else if (line.startsWith('event: ') || line.startsWith('id: ') || line.startsWith('retry: ')) {
            logEvent(`SSE: ${line}`);
          }
        }
      }
    }
    
  } catch (error) {
    logEvent(`ERROR: ${error.message}`);
    console.error('Connection failed:', error);
    
    // Retry after 5 seconds
    logEvent('Retrying in 5 seconds...');
    setTimeout(connectToEventStream, 5000);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logEvent('Shutting down event stream logger...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logEvent('Shutting down event stream logger...');
  process.exit(0);
});

// Start the logger
logEvent('Event stream logger started');
connectToEventStream();