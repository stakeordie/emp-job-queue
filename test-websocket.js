#!/usr/bin/env node

const WebSocket = require('ws');

// Test the monitor WebSocket connection
const testMonitorConnection = () => {
  const timestamp = Date.now();
  const monitorId = `monitor-id-${timestamp}`;
  const monitorUrl = `ws://localhost:3331/ws/monitor/${monitorId}?token=3u8sdj5389fj3kljsf90u`;
  
  console.log(`[Test] Connecting monitor to: ${monitorUrl}`);
  
  const monitorWs = new WebSocket(monitorUrl);
  
  monitorWs.on('open', () => {
    console.log('[Test] Monitor connected successfully');
    
    // Send subscription message
    const subscriptionMessage = {
      type: 'subscribe',
      monitor_id: monitorId,
      topics: ['workers', 'machines', 'jobs', 'system_stats', 'heartbeat'],
      timestamp: Date.now()
    };
    
    monitorWs.send(JSON.stringify(subscriptionMessage));
    console.log('[Test] Sent subscription:', subscriptionMessage.topics);
    
    // Request full state sync
    const syncRequest = {
      type: 'request_full_state',
      monitor_id: monitorId,
      timestamp: Date.now()
    };
    
    monitorWs.send(JSON.stringify(syncRequest));
    console.log('[Test] Requested full state sync');
  });
  
  monitorWs.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('[Test] Monitor received message:', message.type);
      if (message.type === 'full_state_snapshot') {
        console.log('[Test] Full state data:', message.data);
      }
    } catch (error) {
      console.error('[Test] Error parsing monitor message:', error);
    }
  });
  
  monitorWs.on('close', () => {
    console.log('[Test] Monitor connection closed');
  });
  
  monitorWs.on('error', (error) => {
    console.error('[Test] Monitor error:', error);
  });
  
  // Close after 5 seconds
  setTimeout(() => {
    console.log('[Test] Closing connections...');
    monitorWs.close();
  }, 5000);
};

testMonitorConnection();