'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, Monitor, Users, Zap, ChevronDown, ChevronRight } from 'lucide-react';
import { useMonitorStore } from '@/store';
import { websocketService } from '@/services/websocket';

interface ConnectionData {
  monitor_connections: Array<{
    id: string;
    monitor_id: string;
    client_id: string;
    subscribed_topics: string[];
    connected_at: string;
  }>;
  client_connections: Array<{
    id: string;
    client_id: string;
    ip_address: string;
    user_agent?: string;
    connected_at: string;
  }>;
  websocket_connections: Array<{
    id: string;
    client_id: string;
    subscribed_jobs: string[];
    connected_at: string;
  }>;
  stats: {
    monitor_connections: number;
    client_websocket_connections: number;
    total_connections: number;
  };
  timestamp: string;
}

export function ConnectionsPanel() {
  const { connection } = useMonitorStore();
  const [connections, setConnections] = useState<ConnectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const fetchConnections = useCallback(async () => {
    // Only fetch if connected
    if (!connection.isConnected) {
      setLoading(false);
      setConnections(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      // Get API URL from websocket service (same logic as fetchApiVersion in store)
      const websocketUrl = websocketService.getUrl();
      
      // Convert WebSocket URL to HTTP URL for the API
      let apiUrl = 'http://localhost:3331';
      if (websocketUrl) {
        const url = new URL(websocketUrl);
        apiUrl = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
      }
      
      const response = await fetch(`${apiUrl}/api/connections`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      setConnections(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch connections');
    } finally {
      setLoading(false);
    }
  }, [connection.isConnected]);

  useEffect(() => {
    // Only fetch when connected
    if (connection.isConnected) {
      fetchConnections();
      const interval = setInterval(fetchConnections, 5000); // Refresh every 5 seconds
      return () => clearInterval(interval);
    } else {
      // Clear data when disconnected
      setConnections(null);
      setLoading(false);
    }
  }, [connection.isConnected, fetchConnections]);

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString();
    } catch {
      return 'Unknown';
    }
  };

  const formatDuration = (timestamp: string) => {
    try {
      const now = new Date();
      const connectedAt = new Date(timestamp);
      const diffMs = now.getTime() - connectedAt.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMins / 60);
      
      if (diffHours > 0) {
        return `${diffHours}h ${diffMins % 60}m`;
      } else if (diffMins > 0) {
        return `${diffMins}m`;
      } else {
        return '<1m';
      }
    } catch {
      return 'Unknown';
    }
  };

  if (loading && !connections) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Connections
          </CardTitle>
          <CardDescription>Loading connection information...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Connections
          </CardTitle>
          <CardDescription className="text-red-500">Error: {error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchConnections} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader 
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Connections
              </CardTitle>
              <CardDescription>
                {connections?.stats.total_connections || 0} total connections
                {connections && (
                  <span className="ml-2">
                    ({connections.stats.monitor_connections} monitors, {connections.client_connections.length} clients, {connections.stats.client_websocket_connections} websockets)
                  </span>
                )}
              </CardDescription>
            </div>
          </div>
          <Button 
            onClick={(e) => {
              e.stopPropagation();
              fetchConnections();
            }} 
            variant="outline" 
            size="sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>
      {isOpen && (
        <CardContent className="space-y-4 pt-0">
        {/* Monitor Connections */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Monitor className="w-4 h-4" />
            Monitor Connections ({connections?.stats.monitor_connections || 0})
          </h4>
          {connections?.monitor_connections.length ? (
            <div className="space-y-2">
              {connections.monitor_connections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                  <div>
                    <div className="font-mono text-xs">{conn.monitor_id}</div>
                    <div className="text-gray-500 text-xs">
                      Connected: {formatTime(conn.connected_at)}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {conn.subscribed_topics.map((sub) => (
                      <Badge key={sub} variant="secondary" className="text-xs">
                        {sub}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">No monitor connections</div>
          )}
        </div>

        {/* Client Connections */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            Client Connections ({connections?.client_connections.length || 0})
          </h4>
          {connections?.client_connections.length ? (
            <div className="space-y-2">
              {connections.client_connections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                  <div className="flex-1">
                    <div className="font-mono text-xs">{conn.client_id}</div>
                    <div className="text-gray-500 text-xs">
                      IP: {conn.ip_address} | Connected: {formatTime(conn.connected_at)} ({formatDuration(conn.connected_at)} ago)
                    </div>
                    {conn.user_agent && (
                      <div className="text-gray-400 text-xs mt-1 truncate max-w-md" title={conn.user_agent}>
                        {conn.user_agent.length > 60 ? `${conn.user_agent.substring(0, 60)}...` : conn.user_agent}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Badge variant="secondary" className="text-xs">
                      EmProps Client
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">No client connections</div>
          )}
        </div>

        {/* WebSocket Connections */}
        <div>
          <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            WebSocket Connections ({connections?.stats.client_websocket_connections || 0})
          </h4>
          {connections?.websocket_connections.length ? (
            <div className="space-y-2">
              {connections.websocket_connections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded">
                  <div className="flex-1">
                    <div className="font-mono text-xs">{conn.client_id}</div>
                    <div className="text-gray-500 text-xs">
                      Subscribed jobs: {conn.subscribed_jobs.length > 0 ? conn.subscribed_jobs.length : 'None'}
                    </div>
                    {conn.subscribed_jobs.length > 0 && (
                      <div className="text-gray-400 text-xs mt-1 max-w-md truncate">
                        {conn.subscribed_jobs.slice(0, 2).join(', ')}{conn.subscribed_jobs.length > 2 ? '...' : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">
                      {conn.subscribed_jobs.length} jobs
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">No WebSocket connections</div>
          )}
        </div>

        {/* Last Updated */}
        <div className="text-xs text-gray-500 pt-2 border-t">
          Last updated: {connections?.timestamp ? formatTime(connections.timestamp) : 'Unknown'}
        </div>
        </CardContent>
      )}
    </Card>
  );
}