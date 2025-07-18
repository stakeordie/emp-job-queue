"use client";

import { useEffect } from "react";
import { useMonitorStore } from "@/store";

/**
 * Auto-connects to WebSocket if NEXT_PUBLIC_WS_URL is set and NODE_ENV=production
 * In development mode, manual connection controls are always shown for flexibility
 * This component runs on every page and establishes the connection automatically in production
 */
export function AutoConnector() {
  const { connection, connect } = useMonitorStore();

  useEffect(() => {
    const autoConnectUrl = process.env.NEXT_PUBLIC_WS_URL;
    const isProduction = process.env.NODE_ENV === 'production';
    
    // Only auto-connect in production environment
    if (isProduction && autoConnectUrl && !connection.isConnected && !connection.isReconnecting) {
      console.log('[AutoConnector] Auto-connecting to:', autoConnectUrl, '(production mode)');
      connect(autoConnectUrl);
    } else if (!isProduction && autoConnectUrl) {
      console.log('[AutoConnector] Skipping auto-connect in development mode. URL available:', autoConnectUrl);
    }
  }, [connection.isConnected, connection.isReconnecting, connect]);

  // This component doesn't render anything
  return null;
}