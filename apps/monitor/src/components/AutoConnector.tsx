"use client";

import { useEffect } from "react";
import { useMonitorStore } from "@/store";

/**
 * Auto-connects to WebSocket if NEXT_PUBLIC_WS_URL is set
 * This component runs on every page and establishes the connection automatically
 */
export function AutoConnector() {
  const { connection, connect } = useMonitorStore();

  useEffect(() => {
    const autoConnectUrl = process.env.NEXT_PUBLIC_WS_URL;
    
    if (autoConnectUrl && !connection.isConnected && !connection.isReconnecting) {
      console.log('[AutoConnector] Auto-connecting to:', autoConnectUrl);
      connect(autoConnectUrl);
    }
  }, [connection.isConnected, connection.isReconnecting, connect]);

  // This component doesn't render anything
  return null;
}