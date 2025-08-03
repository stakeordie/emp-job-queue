"use client";

import { useEffect } from "react";
import { useMonitorStore } from "@/store";

/**
 * Auto-connects to WebSocket based on NEXT_PUBLIC_CONNECTIONS configuration
 * - Single connection object: Auto-connects immediately (locked mode)
 * - Array of connections: Manual selection required (dropdown mode)
 * - Legacy NEXT_PUBLIC_WS_URL: Only in production mode
 */
export function AutoConnector() {
  const { connection, connect } = useMonitorStore();

  useEffect(() => {
    // Skip if already connected or connecting
    if (connection.isConnected || connection.isReconnecting) {
      return;
    }

    // Check for NEXT_PUBLIC_CONNECTIONS first
    const connectionsEnv = process.env.NEXT_PUBLIC_CONNECTIONS;
    if (connectionsEnv) {
      try {
        const connections = JSON.parse(connectionsEnv);
        
        // Only auto-connect if it's a single connection object (not an array)
        if (!Array.isArray(connections) && connections.NAME && connections.WS_URL) {
          const protocol = connections.is_ssl ? 'wss://' : 'ws://';
          const websocketUrl = `${protocol}${connections.WS_URL}`;
          const authToken = connections.AUTH_KEY || '3u8sdj5389fj3kljsf90u';
          const urlWithAuth = `${websocketUrl}?token=${encodeURIComponent(authToken)}`;
          
          console.log('[AutoConnector] Auto-connecting to single connection:', connections.NAME);
          connect(urlWithAuth);
          
          // Remember auto-connect preference
          localStorage.setItem('monitor-auto-connect', 'true');
          return;
        } else if (Array.isArray(connections)) {
          console.log('[AutoConnector] Multiple connections configured - manual selection required');
          return;
        }
      } catch (error) {
        console.warn('[AutoConnector] Failed to parse NEXT_PUBLIC_CONNECTIONS:', error);
      }
    }

    // Fallback to legacy NEXT_PUBLIC_WS_URL behavior (production only)
    const autoConnectUrl = process.env.NEXT_PUBLIC_WS_URL;
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (isProduction && autoConnectUrl) {
      console.log('[AutoConnector] Auto-connecting to legacy URL:', autoConnectUrl, '(production mode)');
      connect(autoConnectUrl);
    } else if (!isProduction && autoConnectUrl) {
      console.log('[AutoConnector] Skipping legacy auto-connect in development mode. URL available:', autoConnectUrl);
    }
  }, [connection.isConnected, connection.isReconnecting, connect]);

  // This component doesn't render anything
  return null;
}