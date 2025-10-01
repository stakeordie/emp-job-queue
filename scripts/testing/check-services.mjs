#!/usr/bin/env node
/**
 * Standalone service checker - shows what ensureServicesRunning() detects
 * WITHOUT actually shutting down or restarting anything
 */

import { execSync } from 'child_process';

// Check if Redis is running
async function isRedisRunning() {
  try {
    const result = execSync('redis-cli -h localhost -p 6379 PING', { encoding: 'utf-8', timeout: 2000 });
    return result.trim() === 'PONG';
  } catch {
    return false;
  }
}

// Check if API is running
async function isAPIRunning() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('http://localhost:3331', { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

// Check if Webhook service is running
async function isWebhookRunning() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('http://localhost:3332/health', { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

// Check if Monitor is running
async function isMonitorRunning() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('http://localhost:3333', { signal: controller.signal });
    clearTimeout(timeoutId);
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

// Check if Telemetry Collector is running
async function isTelemetryRunning() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    const response = await fetch('http://localhost:43189/v1/traces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resourceSpans: [] }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

// Check if Docker containers are running
function areDockerContainersRunning() {
  try {
    const result = execSync('docker ps --format "{{.Names}}" | grep -E "^(api-|webhook-)"', {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return result.trim().length > 0;
  } catch {
    return false;
  }
}

async function main() {
  const profile = process.argv[2] || 'testrunner';

  console.log(`\n🔧 Service Check for profile: ${profile}\n`);
  console.log(`📋 Checking mode...\n`);

  const isDocker = profile.includes('docker');
  const dockerRunning = areDockerContainersRunning();

  console.log(`   Profile type:          ${isDocker ? 'Docker' : 'Local'}`);
  console.log(`   Docker containers:     ${dockerRunning ? 'Running' : 'Not running'}\n`);

  console.log(`📋 Checking services...\n`);

  const redis = await isRedisRunning();
  const api = await isAPIRunning();
  const webhook = await isWebhookRunning();
  const monitor = await isMonitorRunning();
  const telemetry = await isTelemetryRunning();

  console.log(`   Redis:     ${redis ? '✅' : '❌'}`);
  console.log(`   API:       ${api ? '✅' : '❌'}`);
  console.log(`   Webhook:   ${webhook ? '✅' : '❌'}`);
  console.log(`   Monitor:   ${monitor ? '✅' : '❌'}`);
  console.log(`   Telemetry: ${telemetry ? '✅' : '❌'}\n`);

  const allRunning = redis && api && webhook && monitor && telemetry;

  // Check for mode mismatch
  const modeMismatch = (isDocker && !dockerRunning && (api || webhook)) ||
                       (!isDocker && dockerRunning);

  console.log(`📊 Analysis:\n`);
  console.log(`   All services healthy:  ${allRunning ? '✅ YES' : '❌ NO'}`);
  console.log(`   Mode mismatch:         ${modeMismatch ? '⚠️  YES' : '✅ NO'}\n`);

  const needsRestart = !allRunning || modeMismatch;

  if (!needsRestart) {
    console.log(`✅ All dashboard services running correctly for profile: ${profile}`);
    console.log(`   → Test would proceed WITHOUT restarting\n`);
  } else {
    console.log(`⚠️  Services need restart:`);
    if (!allRunning) {
      console.log(`   - Reason: Not all services are healthy`);
    }
    if (modeMismatch) {
      console.log(`   - Reason: Mode mismatch detected`);
    }
    console.log(`   → Test would SHUTDOWN and RESTART dashboard\n`);
  }
}

main().catch(console.error);
