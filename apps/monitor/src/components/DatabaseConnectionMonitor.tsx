'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Database, Timer, Users } from 'lucide-react';
import { websocketService } from '@/services/websocket';

interface DatabaseConnection {
  application_name: string;
  client_addr: string;
  usename: string;
  connections: number;
  states: string | null;
  max_idle_time: string;
}

interface DatabaseSummary {
  total_connections: number;
  max_connections: number;
  active_connections: number;
  idle_connections: number;
  idle_in_transaction: number;
}

interface PotentialLeak {
  pid: number;
  usename: string;
  application_name: string;
  state: string;
  client_addr: string;
  idle_duration: string;
  query_preview: string;
}

interface DatabaseMonitorData {
  available: boolean;
  timestamp: string;
  summary: DatabaseSummary;
  connections_by_app: DatabaseConnection[];
  potential_leaks: PotentialLeak[];
  pool_usage: number;
  source?: string;
}

export default function DatabaseConnectionMonitor() {
  const [pgBouncerData, setPgBouncerData] = useState<DatabaseMonitorData | null>(null);
  const [postgresData, setPostgresData] = useState<DatabaseMonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const websocketUrl = websocketService.getUrl();
        let apiBaseUrl = 'http://localhost:3331';
        if (websocketUrl) {
          const url = new URL(websocketUrl);
          apiBaseUrl = `${url.protocol === 'wss:' ? 'https:' : 'http:'}//${url.host}`;
        }

        const [pgBouncerResponse, postgresResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/api/system/db-connections`),
          fetch(`${apiBaseUrl}/api/system/postgres-connections`)
        ]);

        const pgBouncerResult = await pgBouncerResponse.json();
        const postgresResult = await postgresResponse.json();

        if (pgBouncerResponse.ok && pgBouncerResult.available) {
          setPgBouncerData(pgBouncerResult);
        } else {
          setPgBouncerData(null);
        }

        if (postgresResponse.ok && postgresResult.available) {
          setPostgresData(postgresResult);
        } else {
          setPostgresData(null);
        }

        if (!pgBouncerResult.available && !postgresResult.available) {
          setError('Database monitoring not available - check configuration');
        } else {
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch database data');
        setPgBouncerData(null);
        setPostgresData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  const getUsageColor = (usage: number) => {
    if (usage >= 90) return 'text-red-500';
    if (usage >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getConnectionStateColor = (states: string | null) => {
    if (!states) return 'bg-gray-100 text-gray-800';
    if (states.includes('idle in transaction')) return 'bg-red-100 text-red-800';
    if (states.includes('active')) return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  const renderConnectionPool = (poolData: DatabaseMonitorData | null, title: string, subtitle: string) => {
    if (!poolData) return null;

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            {title}
          </CardTitle>
          <CardDescription>{subtitle}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className={`text-2xl font-bold ${getUsageColor(poolData.pool_usage)}`}>
                {poolData.summary.total_connections}/{poolData.summary.max_connections}
              </div>
              <div className="text-sm text-muted-foreground">
                Total ({poolData.pool_usage}% used)
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">
                {poolData.summary.active_connections}
              </div>
              <div className="text-sm text-muted-foreground">Active</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">
                {poolData.summary.idle_connections}
              </div>
              <div className="text-sm text-muted-foreground">Idle</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600">
                {poolData.summary.idle_in_transaction}
              </div>
              <div className="text-sm text-muted-foreground">Idle in TX</div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">Loading database monitoring...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Database Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!pgBouncerData && !postgresData) return null;

  const primaryData = pgBouncerData || postgresData;

  return (
    <div className="space-y-6">
      {/* PgBouncer Pool */}
      {renderConnectionPool(pgBouncerData, "PgBouncer Connection Pool", "Client connections to PgBouncer")}

      {/* Direct PostgreSQL Pool */}
      {renderConnectionPool(postgresData, "PostgreSQL Connection Pool", "Direct connections to PostgreSQL database")}

      {/* Connections by Application */}
      {primaryData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Connections by Application
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {primaryData.connections_by_app.map((conn, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="font-medium">
                      {conn.application_name || 'Unknown App'}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {conn.usename}@{conn.client_addr}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getConnectionStateColor(conn.states)}>
                      {conn.states || 'unknown'}
                    </Badge>
                    <div className="text-right">
                      <div className="font-bold">{conn.connections}</div>
                      <div className="text-xs text-muted-foreground">connections</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Potential Connection Leaks */}
      {primaryData && primaryData.potential_leaks.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              Potential Connection Leaks ({primaryData.potential_leaks.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {primaryData.potential_leaks.map((leak, index) => (
                <div key={index} className="p-3 border border-red-200 rounded-lg bg-red-50">
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-red-800">
                      {leak.application_name || 'Unknown App'} (PID: {leak.pid})
                    </div>
                    <Badge variant="destructive">
                      {leak.state}
                    </Badge>
                  </div>
                  <div className="text-sm text-red-700">
                    <div className="flex items-center gap-2 mb-1">
                      <Timer className="h-4 w-4" />
                      Idle for: {leak.idle_duration}
                    </div>
                    <div className="text-xs font-mono bg-red-100 p-2 rounded">
                      {leak.query_preview || 'No query preview'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground text-center">
        Last updated: {primaryData ? new Date(primaryData.timestamp).toLocaleTimeString() : 'Never'}
      </div>
    </div>
  );
}