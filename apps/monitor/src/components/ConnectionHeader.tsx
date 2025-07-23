"use client";

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Play, Square, X, Target, RefreshCw } from "lucide-react"
import { useMonitorStore } from "@/store"
import { useState, useEffect } from "react"
import Link from "next/link"

// Environment presets - load from environment variable
const getConnectionPresets = () => {
  try {
    const connectionsEnv = process.env.CONNECTIONS;
    if (connectionsEnv) {
      const connections = JSON.parse(connectionsEnv);
      const presets: Record<string, { websocket: string; auth: string; name: string }> = {};
      
      connections.forEach((conn: any) => {
        const name = conn.NAME.toLowerCase();
        presets[name] = {
          websocket: `http://${conn.WS_URL}`,
          auth: conn.AUTH_KEY || '3u8sdj5389fj3kljsf90u',
          name: conn.NAME
        };
      });
      
      return presets;
    }
  } catch (error) {
    console.warn('Failed to parse CONNECTIONS environment variable:', error);
  }
  
  // Fallback to hardcoded presets if env var is not available
  return {
    local: {
      websocket: 'http://localhost:3331',
      auth: '3u8sdj5389fj3kljsf90u',
      name: 'Local Dev'
    },
    railway: {
      websocket: 'wss://redisserver-production.up.railway.app',
      auth: '3u8sdj5389fj3kljsf90u',
      name: 'Railway (Old)'
    },
    railwaynew: {
      websocket: 'wss://emp-job-queue-production.up.railway.app',
      auth: '3u8sdj5389fj3kljsf90u',
      name: 'Railway (New)'
    }
  };
};

const CONNECTION_PRESETS = getConnectionPresets();

export function ConnectionHeader() {
  const { connection, connect, disconnect, setConnection, refreshMonitor, apiVersion, fetchApiVersion } = useMonitorStore();
  const [websocketUrl, setWebsocketUrl] = useState(CONNECTION_PRESETS.local.websocket);
  const [authToken, setAuthToken] = useState(CONNECTION_PRESETS.local.auth);
  const [selectedPreset, setSelectedPreset] = useState('local');
  
  // Check if auto-connect is enabled via environment variable (only in production)
  const autoConnectUrl = process.env.NEXT_PUBLIC_WS_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  const isAutoConnectEnabled = isProduction && !!autoConnectUrl;

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (CONNECTION_PRESETS[preset as keyof typeof CONNECTION_PRESETS]) {
      const config = CONNECTION_PRESETS[preset as keyof typeof CONNECTION_PRESETS];
      setWebsocketUrl(config.websocket);
      setAuthToken(config.auth);
    }
  };

  const handleConnect = () => {
    // Clear any existing connection error
    setConnection({ error: undefined });
    const urlWithAuth = authToken ? `${websocketUrl}?token=${encodeURIComponent(authToken)}` : websocketUrl;
    connect(urlWithAuth);
    // Remember that user wants to be connected
    localStorage.setItem('monitor-auto-connect', 'true');
  };

  const handleDisconnect = () => {
    disconnect();
    // Remember that user manually disconnected
    localStorage.setItem('monitor-auto-connect', 'false');
  };

  const handleForceDisconnect = () => {
    console.log('[Force Disconnect] Emergency disconnect');
    disconnect();
    localStorage.setItem('monitor-auto-connect', 'false');
    // Force reload to clean up any stuck state
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  // Auto-clear connection error after 3 seconds
  useEffect(() => {
    if (connection.error) {
      const timer = setTimeout(() => {
        setConnection({ error: undefined });
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [connection.error, setConnection]);

  // Fetch API version when connected
  useEffect(() => {
    if (connection.isConnected && !apiVersion) {
      fetchApiVersion();
    }
  }, [connection.isConnected, apiVersion, fetchApiVersion]);

  return (
    <header className="h-20 bg-background border-b border-border flex-shrink-0">
      <div className="h-full px-6 flex items-center justify-between">
        {/* Left side - Title and Navigation */}
        <div className="flex items-center gap-6">
          <div>
            <h1 className="text-lg font-bold">Job Queue Monitor</h1>
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">Real-time system monitoring</p>
              {apiVersion && (
                <Badge variant="outline" className="text-xs">
                  API: {apiVersion}
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Link href="/northstar">
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Target className="h-3 w-3" />
                North Star Progress
              </Button>
            </Link>
          </div>
        </div>

        {/* Right side - Connection Controls */}
        <div className="flex items-center gap-4">
          {isAutoConnectEnabled ? (
            /* Auto-connect mode (production only) - show simplified controls */
            <div className="flex items-center gap-2">
              <Label className="text-xs">Auto-connecting to:</Label>
              <code className="text-xs bg-muted px-2 py-1 rounded">{autoConnectUrl}</code>
            </div>
          ) : (
            /* Development mode or no auto-connect URL - show full manual controls */
            <>
              {/* Environment Preset */}
              <div className="flex items-center gap-2">
                <Label htmlFor="preset" className="text-xs">Environment:</Label>
                <Select value={selectedPreset} onValueChange={handlePresetChange}>
                  <SelectTrigger id="preset" className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONNECTION_PRESETS).map(([key, config]) => (
                      <SelectItem key={key} value={key}>
                        {config.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* WebSocket URL */}
              <div className="flex items-center gap-2">
                <Label htmlFor="websocket-url" className="text-xs">URL:</Label>
                <Input
                  id="websocket-url"
                  value={websocketUrl}
                  onChange={(e) => setWebsocketUrl(e.target.value)}
                  placeholder="ws://localhost:3002"
                  className="w-48 h-8"
                />
              </div>

              {/* Auth Token */}
              <div className="flex items-center gap-2">
                <Label htmlFor="auth-token" className="text-xs">Token:</Label>
                <Input
                  id="auth-token"
                  type="password"
                  value={authToken}
                  onChange={(e) => setAuthToken(e.target.value)}
                  placeholder="Enter auth token"
                  className="w-32 h-8"
                />
              </div>
            </>
          )}
          
          {/* Development mode indicator when auto-connect URL is available */}
          {autoConnectUrl && !isProduction && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted-foreground">💻 Dev Mode</span>
            </div>
          )}

          {/* Connection Status and Actions */}
          <div className="flex items-center gap-2">
            <Badge variant={connection.isConnected ? "default" : "destructive"} className="text-xs">
              {connection.isConnected ? "Connected" : "Disconnected"}
            </Badge>
            
            {connection.error ? (
              <div className="text-red-600 text-xs max-w-32 truncate" title={connection.error}>
                {connection.error}
              </div>
            ) : isAutoConnectEnabled ? (
              /* In auto-connect mode, don't show manual connect button */
              <span className="text-xs text-muted-foreground">Auto-managed</span>
            ) : (
              <Button
                onClick={connection.isConnected ? handleDisconnect : handleConnect}
                variant={connection.isConnected ? "destructive" : "default"}
                size="sm"
                className="h-8"
              >
                {connection.isConnected ? (
                  <>
                    <Square className="h-3 w-3 mr-1" />
                    Disconnect
                  </>
                ) : (
                  <>
                    <Play className="h-3 w-3 mr-1" />
                    Connect
                  </>
                )}
              </Button>
            )}
            
            {connection.isConnected && (
              <>
                <Button
                  onClick={refreshMonitor}
                  variant="outline"
                  size="sm"
                  className="h-8"
                  title="Refresh monitor state"
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button
                  onClick={handleForceDisconnect}
                  variant="outline"
                  size="sm"
                  className="h-8 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300"
                  title="Force disconnect and reload page"
                >
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}