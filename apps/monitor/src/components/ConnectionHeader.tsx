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
import { Play, Square, X, RefreshCw } from "lucide-react"
import { useMonitorStore } from "@/store"
import { useState, useEffect } from "react"

// Environment presets - load from environment variable
const getConnectionPresets = () => {
  try {
    const connectionsEnv = process.env.NEXT_PUBLIC_CONNECTIONS;
    if (connectionsEnv) {
      const connections = JSON.parse(connectionsEnv);
      const presets: Record<string, { websocket: string; auth: string; name: string }> = {};
      
      // Handle both single object and array of objects
      const connectionList = Array.isArray(connections) ? connections : [connections];
      
      // Validate that each connection has the required fields
      connectionList.forEach((conn: unknown) => {
        if (conn && typeof conn === 'object' && 'NAME' in conn && 'WS_URL' in conn) {
          const connObj = conn as { NAME: string; WS_URL: string; is_ssl?: boolean; AUTH_KEY?: string };
          const name = connObj.NAME.toLowerCase();
          const protocol = connObj.is_ssl ? 'wss://' : 'ws://';
          presets[name] = {
            websocket: `${protocol}${connObj.WS_URL}`,
            auth: connObj.AUTH_KEY || '3u8sdj5389fj3kljsf90u',
            name: connObj.NAME
          };
        } else {
          console.warn('Invalid connection object:', conn);
        }
      });
      
      if (Object.keys(presets).length > 0) {
        return { presets, isSingleConnection: !Array.isArray(connections) };
      }
    }
  } catch (error) {
    console.warn('Failed to parse NEXT_PUBLIC_CONNECTIONS environment variable:', error);
  }
  
  // No CONNECTIONS environment variable - return null
  return null;
};

const CONNECTION_CONFIG = getConnectionPresets();

export function ConnectionHeader() {
  const { connection, connect, disconnect, setConnection, refreshMonitor, apiVersion, fetchApiVersion } = useMonitorStore();
  
  // Initialize state with defaults first (hooks must always be called)
  const hasConfig = !!CONNECTION_CONFIG;
  const presets = hasConfig ? CONNECTION_CONFIG.presets : {};
  const isSingleConnection = hasConfig ? CONNECTION_CONFIG.isSingleConnection : false;
  const presetKeys = Object.keys(presets);
  const firstPreset = presetKeys[0] || '';
  
  const [websocketUrl, setWebsocketUrl] = useState(presets[firstPreset]?.websocket || '');
  const [authToken, setAuthToken] = useState(presets[firstPreset]?.auth || '');
  const [selectedPreset, setSelectedPreset] = useState(firstPreset);
  
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
  
  // Handle different connection states
  if (!hasConfig) {
    // No CONNECTIONS environment variable - show error
    return (
      <div className="bg-red-50 border-b border-red-200 px-6 py-4">
        <div className="text-red-800 text-center">
          <p className="font-medium">No CONNECTIONS environment variable configured</p>
          <p className="text-sm">Please set the NEXT_PUBLIC_CONNECTIONS environment variable with connection configuration.</p>
        </div>
      </div>
    );
  }
  
  // Check if auto-connect is enabled via environment variable
  const autoConnectUrl = process.env.NEXT_PUBLIC_WS_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  
  // Hide selector if NEXT_PUBLIC_WS_URL in production OR if single connection
  const isAutoConnectEnabled = (isProduction && !!autoConnectUrl) || isSingleConnection;

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (presets[preset]) {
      const config = presets[preset];
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
        </div>

        {/* Right side - Connection Controls */}
        <div className="flex items-center gap-4">
          {isAutoConnectEnabled ? (
            /* Auto-connect mode - show simplified controls */
            <div className="flex items-center gap-2">
              <Label className="text-xs">Auto-connecting to:</Label>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {autoConnectUrl || (isSingleConnection ? presets[firstPreset]?.websocket : 'Unknown')}
              </code>
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
                    {Object.entries(presets).map(([key, config]) => (
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