#!/usr/bin/env node

const WebSocket = require('ws');

const host = '108.53.57.130';
const port = '53647';
const username = 'sd';
const password = 'UbjpkE6kwM';

// Test both URL formats
const urls = [
  `ws://${host}:${port}/ws`,
  `ws://${username}:${password}@${host}:${port}/ws`,
  `ws://${encodeURIComponent(username)}:${encodeURIComponent(password)}@${host}:${port}/ws`
];

console.log('🔌 Testing WebSocket connection to ComfyUI...\n');

async function testWebSocket(url, description) {
  console.log(`\n📡 Testing ${description}:`);
  console.log(`   URL: ${url}`);
  
  return new Promise((resolve) => {
    let ws;
    const timeout = setTimeout(() => {
      console.log('   ❌ Connection timeout after 10s');
      if (ws) ws.close();
      resolve(false);
    }, 10000);

    try {
      ws = new WebSocket(url, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
        },
        handshakeTimeout: 5000
      });

      ws.on('open', () => {
        console.log('   ✅ WebSocket connected successfully!');
        
        // Send a test message
        const testMessage = JSON.stringify({
          type: 'ping',
          timestamp: Date.now()
        });
        ws.send(testMessage);
        console.log('   📤 Sent test message:', testMessage);
        
        // Listen for a few messages
        let messageCount = 0;
        ws.on('message', (data) => {
          messageCount++;
          console.log(`   📥 Received message ${messageCount}:`, data.toString().substring(0, 100));
          
          if (messageCount >= 3) {
            clearTimeout(timeout);
            ws.close();
            resolve(true);
          }
        });
        
        // Close after 5 seconds if no messages
        setTimeout(() => {
          console.log(`   📊 Received ${messageCount} messages total`);
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        }, 5000);
      });

      ws.on('error', (error) => {
        console.log('   ❌ WebSocket error:', error.message);
        clearTimeout(timeout);
        resolve(false);
      });

      ws.on('close', (code, reason) => {
        console.log(`   🔚 WebSocket closed: code=${code}, reason=${reason}`);
      });

    } catch (error) {
      console.log('   ❌ Failed to create WebSocket:', error.message);
      clearTimeout(timeout);
      resolve(false);
    }
  });
}

async function testHttpConnection() {
  console.log('\n🌐 Testing HTTP connection first:');
  const httpUrl = `http://${host}:${port}/system_stats`;
  console.log(`   URL: ${httpUrl}`);
  
  try {
    // Use native http module since fetch might not be available
    const http = require('http');
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    
    return new Promise((resolve) => {
      const options = {
        hostname: host,
        port: port,
        path: '/system_stats',
        method: 'GET',
        headers: {
          'Authorization': `Basic ${auth}`
        }
      };
      
      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('   ✅ HTTP connection successful!');
            try {
              const parsed = JSON.parse(data);
              console.log('   📊 System stats:', JSON.stringify(parsed, null, 2).substring(0, 200) + '...');
            } catch (e) {
              console.log('   📊 Response:', data.substring(0, 200) + '...');
            }
            resolve(true);
          } else {
            console.log(`   ❌ HTTP request failed: ${res.statusCode} ${res.statusMessage}`);
            resolve(false);
          }
        });
      });
      
      req.on('error', (error) => {
        console.log('   ❌ HTTP connection failed:', error.message);
        resolve(false);
      });
      
      req.end();
    });
  } catch (error) {
    console.log('   ❌ HTTP connection failed:', error.message);
    return false;
  }
}

async function main() {
  // First test HTTP
  const httpOk = await testHttpConnection();
  
  if (!httpOk) {
    console.log('\n⚠️  HTTP connection failed - ComfyUI might not be accessible');
  }
  
  // Test WebSocket connections
  let connected = false;
  
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const description = i === 0 ? 'without auth in URL' : 
                       i === 1 ? 'with plain auth in URL' : 
                                'with encoded auth in URL';
    
    const success = await testWebSocket(url, description);
    if (success) {
      connected = true;
      console.log('\n✅ Found working WebSocket configuration!');
      console.log(`   Working URL: ${url}`);
      break;
    }
  }
  
  if (!connected) {
    console.log('\n❌ Could not establish WebSocket connection');
    console.log('\nPossible issues:');
    console.log('1. WebSocket endpoint might be on a different port');
    console.log('2. Authentication might be required differently');
    console.log('3. ComfyUI WebSocket might not be exposed externally');
    console.log('4. Firewall/proxy blocking WebSocket connections');
    
    // Test without authentication
    console.log('\n🔧 Testing without authentication...');
    const noAuthUrl = `ws://${host}:${port}/ws`;
    const noAuthWs = new WebSocket(noAuthUrl);
    
    noAuthWs.on('open', () => {
      console.log('✅ Connected without authentication! The URL encoding might be the issue.');
      noAuthWs.close();
    });
    
    noAuthWs.on('error', (error) => {
      console.log('❌ Still failed without auth:', error.message);
    });
  }
}

main().catch(console.error);