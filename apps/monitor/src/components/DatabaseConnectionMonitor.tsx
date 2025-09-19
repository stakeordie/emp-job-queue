'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Database, Timer, Users, HardDrive, Activity, Zap } from 'lucide-react';
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

interface DatabaseMetrics {
  size: string;
  size_bytes: number;
  tables_size_bytes: number;
  table_count: number;
  index_count: number;
}

interface QueryMetrics {
  calls: number;
  total_exec_time: number;
  mean_exec_time: number;
  rows: number;
  query_preview: string;
}

interface SlowQuery {
  pid: number;
  usename: string;
  application_name: string;
  state: string;
  query_start: string;
  duration_seconds: string;
  query_preview: string;
}

interface PerformanceMetrics {
  pg_stat_statements_available: boolean;
  top_queries: QueryMetrics[];
  slow_queries: SlowQuery[];
}

interface DatabaseMonitorData {
  available: boolean;
  timestamp: string;
  summary: DatabaseSummary;
  connections_by_app: DatabaseConnection[];
  potential_leaks: PotentialLeak[];
  pool_usage: number;
  source?: string;
  database_metrics?: DatabaseMetrics;
  performance_metrics?: PerformanceMetrics;
}

export default function DatabaseConnectionMonitor() {
  const [postgresData, setPostgresData] = useState<DatabaseMonitorData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL;

        const postgresResponse = await fetch(`${apiBaseUrl}/api/system/postgres-connections`);
        const postgresResult = await postgresResponse.json();

        if (postgresResponse.ok && postgresResult.available) {
          setPostgresData(postgresResult);
          setError(null);
        } else {
          setPostgresData(null);
          setError('Database monitoring not available - check configuration');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch database data');
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

  if (!postgresData) return null;

  const primaryData = postgresData;

  return (
    <div className="space-y-6">
      {/* PostgreSQL Connection Pool */}
      {renderConnectionPool(postgresData, "Neon PostgreSQL Pool", "Direct connections to Neon database")}

      {/* Neon Database Metrics */}
      {primaryData?.database_metrics && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Database Storage & Structure
            </CardTitle>
            <CardDescription>Database size and structural metrics from Neon</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {primaryData.database_metrics.size}
                </div>
                <div className="text-sm text-muted-foreground">Total Size</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {Math.round(primaryData.database_metrics.tables_size_bytes / 1024 / 1024)}MB
                </div>
                <div className="text-sm text-muted-foreground">Tables Size</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {primaryData.database_metrics.table_count}
                </div>
                <div className="text-sm text-muted-foreground">Tables</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">
                  {primaryData.database_metrics.index_count}
                </div>
                <div className="text-sm text-muted-foreground">Indexes</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-teal-600">
                  {Math.round((primaryData.database_metrics.tables_size_bytes / primaryData.database_metrics.size_bytes) * 100)}%
                </div>
                <div className="text-sm text-muted-foreground">Data Ratio</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Query Performance Metrics */}
      {primaryData?.performance_metrics && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top Queries Card */}
          {primaryData.performance_metrics.pg_stat_statements_available && primaryData.performance_metrics.top_queries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Top Queries by Execution Time
                </CardTitle>
                <CardDescription>Most resource-intensive queries (pg_stat_statements)</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {primaryData.performance_metrics.top_queries.map((query, index) => (
                    <div key={index} className="p-3 border rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {query.calls} calls
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {Math.round(query.mean_exec_time * 100) / 100}ms avg
                          </Badge>
                        </div>
                        <div className="text-sm font-medium">
                          {Math.round(query.total_exec_time)}ms total
                        </div>
                      </div>
                      <div className="text-xs font-mono bg-gray-100 p-2 rounded truncate">
                        {query.query_preview}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Slow Queries Card */}
          {primaryData.performance_metrics.slow_queries.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-yellow-600">
                  <Zap className="h-5 w-5" />
                  Long-Running Queries ({primaryData.performance_metrics.slow_queries.length})
                </CardTitle>
                <CardDescription>Active queries running longer than 10 seconds</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {primaryData.performance_metrics.slow_queries.map((query, index) => (
                    <div key={index} className="p-3 border border-yellow-200 rounded-lg bg-yellow-50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-yellow-800">
                          {query.application_name || 'Unknown'} (PID: {query.pid})
                        </div>
                        <Badge variant="secondary">
                          {query.duration_seconds}
                        </Badge>
                      </div>
                      <div className="text-sm text-yellow-700 mb-1">
                        User: {query.usename}
                      </div>
                      <div className="text-xs font-mono bg-yellow-100 p-2 rounded">
                        {query.query_preview}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* pg_stat_statements not available notice */}
          {!primaryData.performance_metrics.pg_stat_statements_available && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-gray-600">
                  <Activity className="h-5 w-5" />
                  Query Performance Monitoring
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-6 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                  <div className="font-medium mb-2">pg_stat_statements Extension Not Available</div>
                  <div className="text-sm">
                    Enable the pg_stat_statements extension in Neon to see detailed query performance metrics.
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Connections by Application - Grouped */}
      {primaryData && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5" />
            <h2 className="text-xl font-semibold">Connections by Application</h2>
          </div>

          {(() => {
            // Group connections by application name
            const groupedConnections = primaryData.connections_by_app.reduce((acc, conn) => {
              const appName = conn.application_name || 'Unknown App';
              if (!acc[appName]) {
                acc[appName] = [];
              }
              acc[appName].push(conn);
              return acc;
            }, {} as Record<string, DatabaseConnection[]>);

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {Object.entries(groupedConnections).map(([appName, connections]) => {
                  const totalConnections = connections.reduce((sum, conn) => sum + conn.connections, 0);
                  const uniqueUsers = [...new Set(connections.map(conn => conn.usename))];
                  const uniqueAddresses = [...new Set(connections.map(conn => conn.client_addr))];
                  const allStates = connections.map(conn => conn.states).filter(Boolean);

                  return (
                    <Card key={appName} className="h-fit">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-medium truncate" title={appName}>
                          {appName}
                        </CardTitle>
                        <CardDescription className="text-sm">
                          {totalConnections} connection{totalConnections !== 1 ? 's' : ''}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* Summary Stats */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div className="text-center p-2 bg-blue-50 rounded">
                            <div className="font-bold text-lg text-blue-700">{totalConnections}</div>
                            <div className="text-xs text-blue-600">connections</div>
                          </div>
                          <div className="text-center p-2 bg-gray-50 rounded">
                            <div className="font-bold text-lg">{connections.length}</div>
                            <div className="text-xs text-muted-foreground">instances</div>
                          </div>
                        </div>

                        {/* Connection Details */}
                        <div className="space-y-2">
                          {connections.map((conn, index) => (
                            <div key={index} className="p-2 border rounded text-sm">
                              <div className="flex items-center justify-between">
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium truncate">
                                    {conn.usename}@{conn.client_addr}
                                  </div>
                                  {conn.states && (
                                    <Badge
                                      variant="outline"
                                      className={`${getConnectionStateColor(conn.states)} text-xs mt-1`}
                                    >
                                      {conn.states}
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-right ml-2">
                                  <div className="font-bold">{conn.connections}</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Quick Stats */}
                        <div className="text-xs text-muted-foreground pt-2 border-t">
                          <div>Users: {uniqueUsers.join(', ')}</div>
                          <div>IPs: {uniqueAddresses.join(', ')}</div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            );
          })()}
        </div>
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