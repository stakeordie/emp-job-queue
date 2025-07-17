import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SimpleWorkerCard } from "@/components/SimpleWorkerCard";
import { Machine, Worker } from "@/types";
import { useState, memo, useEffect, useCallback } from "react";
import { Monitor, Server, Activity, AlertTriangle, X, RefreshCw, RotateCcw } from "lucide-react";
import { LazyLog, ScrollFollow } from "@melloware/react-logviewer";

interface MachineCardProps {
  machine: Machine;
  workers: Worker[];
  onDelete?: (machineId: string) => void;
  onRestart?: (machineId: string) => void;
}

export const MachineCard = memo(function MachineCard({ machine, workers, onDelete, onRestart }: MachineCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const getStatusColor = (status: Machine['status']) => {
    switch (status) {
      case 'ready': return 'default';
      case 'starting': return 'secondary';
      case 'stopping': return 'destructive';
      case 'offline': return 'outline';
      case 'disconnected': return 'destructive';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: Machine['status']) => {
    switch (status) {
      case 'ready': return <Activity className="h-4 w-4" />;
      case 'starting': return <Monitor className="h-4 w-4 animate-pulse" />;
      case 'stopping': return <AlertTriangle className="h-4 w-4" />;
      case 'offline': return <Server className="h-4 w-4" />;
      case 'disconnected': return <X className="h-4 w-4" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  const isActive = machine.status === 'ready' && workers.length > 0;
  const isEmpty = workers.length === 0;
  const totalJobs = workers.reduce((sum, w) => sum + w.total_jobs_completed, 0);
  const totalFailures = workers.reduce((sum, w) => sum + w.total_jobs_failed, 0);
  const activeJobs = workers.filter(w => w.current_jobs.length > 0).length;

  // Extract health check URL from machine health_url
  const getHealthUrl = useCallback(() => {
    if (machine.health_url) {
      return machine.health_url.replace('/health', '');
    }
    
    // Fallback for local development - assume local machine on port 9092
    if (machine.machine_id === 'basic-machine-local') {
      return 'http://localhost:9092';
    }
    
    return null;
  }, [machine.health_url, machine.machine_id]);


  // Build log stream URL for react-logviewer
  const getLogUrl = (serviceName: string, logType?: string) => {
    const healthUrl = getHealthUrl();
    if (!healthUrl || !serviceName) return null;
    
    // Use ComfyUI-specific logs for ComfyUI services
    if (serviceName.includes('.comfyui')) {
      // Extract GPU number from worker ID (e.g., "basic-machine-local-worker-0.comfyui" -> "0")
      const match = serviceName.match(/worker-(\d+)\.comfyui/);
      const gpu = match ? match[1] : '0';
      const type = logType || 'server';
      return `${healthUrl}/comfyui/logs?gpu=${gpu}&type=${type}&lines=1000`;
    }
    
    // Use PM2 logs for other services
    return `${healthUrl}/pm2/logs?service=${serviceName}&lines=1000&stream=true`;
  };

  // Restart machine
  const restartMachine = async () => {
    const healthUrl = getHealthUrl();
    if (!healthUrl) {
      console.error('No health URL available for restart');
      return;
    }

    try {
      console.log('Restarting machine:', machine.machine_id);
      const response = await fetch(`${healthUrl}/restart/machine`, {
        method: 'POST'
      });
      
      if (response.ok) {
        console.log('Machine restart initiated successfully');
        // Optionally call parent callback
        if (onRestart) {
          onRestart(machine.machine_id);
        }
      } else {
        console.error('Failed to restart machine:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Error restarting machine:', error);
    }
  };

  // Restart PM2 service
  const restartService = async (serviceName: string) => {
    const healthUrl = getHealthUrl();
    if (!healthUrl) {
      console.error('No health URL available for service restart');
      return;
    }

    try {
      console.log('Restarting service:', serviceName);
      const response = await fetch(`${healthUrl}/restart/service?service=${serviceName}`, {
        method: 'POST'
      });
      
      if (response.ok) {
        console.log(`Service ${serviceName} restarted successfully`);
        // Service restarted successfully
      } else {
        console.error(`Failed to restart service ${serviceName}:`, response.status, await response.text());
      }
    } catch (error) {
      console.error(`Error restarting service ${serviceName}:`, error);
    }
  };

  // Reset active tab when modal closes
  useEffect(() => {
    if (!showLogs) {
      setActiveTab('overview');
    }
  }, [showLogs]);

  return (
    <>
      <Card className={`
        transition-all duration-300 ease-in-out cursor-pointer
        ${isActive ? 'border-green-500 bg-green-50' : ''}
        ${machine.status === 'starting' ? 'border-blue-500 bg-blue-50 border-dashed' : ''}
        ${machine.status === 'offline' ? 'border-gray-300 bg-gray-50' : ''}
        ${machine.status === 'disconnected' ? 'border-red-300 bg-red-50' : ''}
        hover:shadow-md
      `}
      onClick={() => setShowLogs(true)}
      >
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              {getStatusIcon(machine.status)}
              {machine.machine_id}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={getStatusColor(machine.status)}>
                {machine.status}
              </Badge>
              {machine.status === 'ready' && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    restartMachine();
                  }}
                  className="h-6 w-6 p-0 hover:bg-blue-100 hover:text-blue-600"
                  title="Restart machine"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              )}
              {(machine.status === 'offline' || machine.status === 'disconnected') && onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(machine.machine_id);
                  }}
                  className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                  title={`Delete ${machine.status} machine`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          {machine.host_info && (
            <div className="text-sm text-muted-foreground">
              {machine.host_info.hostname && (
                <span>{machine.host_info.hostname}</span>
              )}
              {machine.host_info.gpu_count && (
                <span className="ml-2">• {machine.host_info.gpu_count} GPU{machine.host_info.gpu_count > 1 ? 's' : ''}</span>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Active Jobs: {activeJobs}</span>
            <span>✓ {totalJobs}</span>
            <span>✗ {totalFailures}</span>
          </div>
        </CardHeader>

        <CardContent>
          {isEmpty ? (
            <div className="flex items-center justify-center h-24 text-muted-foreground">
              <div className="text-center">
                <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  {machine.status === 'starting' ? 'Starting workers...' : 
                   machine.status === 'disconnected' ? 'Connection lost (30s timeout)' : 'No workers'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Workers ({workers.length})</span>
                <div className="flex gap-1">
                  {workers.map(worker => (
                    <div
                      key={worker.worker_id}
                      className={`w-2 h-2 rounded-full ${
                        worker.status === 'busy' ? 'bg-blue-500 animate-pulse' :
                        worker.status === 'idle' ? 'bg-green-500' :
                        worker.status === 'error' ? 'bg-red-500' :
                        'bg-gray-400'
                      }`}
                    />
                  ))}
                </div>
              </div>
              
              <div className="grid gap-2">
                {workers.map(worker => (
                  <div key={worker.worker_id} onClick={(e) => e.stopPropagation()}>
                    <SimpleWorkerCard worker={worker} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-[98vw] w-[98vw] max-h-[95vh] h-[95vh] sm:max-w-[98vw] p-0 flex flex-col">
          <DialogHeader className="px-6 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg">
              {getStatusIcon(machine.status)}
              {machine.machine_id} - Service Logs
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  // Logs will auto-refresh via react-logviewer
                }}
                className="ml-auto"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden px-6 py-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="shrink-0 space-y-2 mb-2">
                <div className="overflow-x-auto">
                  <TabsList className="inline-flex w-max gap-1 min-w-full h-8">
                    <TabsTrigger value="overview" className="text-xs py-1 px-2">Overview</TabsTrigger>
                    {machine.services && Object.entries(machine.services).map(([serviceName, service]) => (
                      <TabsTrigger key={serviceName} value={serviceName} className="flex items-center gap-1 whitespace-nowrap text-xs py-1 px-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          service.status === 'active' && service.health === 'healthy' ? 'bg-blue-500' : 
                          service.status === 'active' && service.health === 'unhealthy' ? 'bg-yellow-500' : 
                          service.status === 'inactive' ? 'bg-red-500' : 'bg-gray-500'
                        }`} />
                        {serviceName}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="overview" className="h-full">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Services</h3>
                      <ScrollArea className="h-[300px] border rounded p-3">
                        {(!machine.services || Object.keys(machine.services).length === 0) ? (
                          <div className="text-center text-muted-foreground py-8">
                            <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No services found</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {Object.entries(machine.services).map(([serviceName, service]) => (
                              <div key={serviceName} className="flex items-center justify-between p-2 border rounded">
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${
                                    service.status === 'active' && service.health === 'healthy' ? 'bg-blue-500' : 
                                    service.status === 'active' && service.health === 'unhealthy' ? 'bg-yellow-500' : 
                                    service.status === 'inactive' ? 'bg-red-500' : 'bg-gray-500'
                                  }`} />
                                  <span className="font-mono text-sm">{serviceName}</span>
                                  <Badge variant={
                                    service.status === 'active' && service.health === 'healthy' ? 'default' : 
                                    service.status === 'active' && service.health === 'unhealthy' ? 'secondary' : 
                                    'destructive'
                                  } className="text-xs">
                                    {service.status}
                                  </Badge>
                                  <Badge variant="outline" className="text-xs">
                                    {service.health}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  PM2: {service.pm2_status}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                    
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Machine Logs</h3>
                      <ScrollArea className="h-[300px] border rounded p-3">
                        {machine.logs.length === 0 ? (
                          <div className="text-center text-muted-foreground py-8">
                            <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No logs available</p>
                          </div>
                        ) : (
                          <div className="space-y-1 font-mono text-sm">
                            {machine.logs.map(log => (
                              <div key={log.id} className="flex gap-2">
                                <span className="text-muted-foreground shrink-0">
                                  {new Date(log.timestamp).toLocaleTimeString()}
                                </span>
                                <Badge 
                                  variant={
                                    log.level === 'error' ? 'destructive' :
                                    log.level === 'warn' ? 'secondary' :
                                    'outline'
                                  }
                                  className="text-xs shrink-0"
                                >
                                  {log.level}
                                </Badge>
                                <span className={`
                                  ${log.level === 'error' ? 'text-red-600' : ''}
                                  ${log.level === 'warn' ? 'text-yellow-600' : ''}
                                  ${log.level === 'info' ? 'text-blue-600' : ''}
                                  ${log.level === 'debug' ? 'text-gray-500' : ''}
                                `}>
                                  {log.message}
                                </span>
                                {log.worker_id && (
                                  <Badge variant="outline" className="text-xs">
                                    {log.worker_id}
                                  </Badge>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </ScrollArea>
                    </div>
                  </div>
                </TabsContent>

                {machine.services && Object.entries(machine.services).map(([serviceName, service]) => (
                  <TabsContent key={serviceName} value={serviceName} className="h-full">
                    <div className="h-full flex flex-col">
                      <div className="flex items-center justify-between mb-1 shrink-0">
                        <h3 className="text-sm font-medium">{serviceName}</h3>
                        <div className="flex items-center gap-2 text-xs">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => restartService(serviceName)}
                            className="h-5 w-5 p-0 hover:bg-blue-100 hover:text-blue-600"
                            title={`Restart ${serviceName} service`}
                          >
                            <RotateCcw className="h-2.5 w-2.5" />
                          </Button>
                          <Badge variant={
                            service.status === 'active' && service.health === 'healthy' ? 'default' : 
                            service.status === 'active' && service.health === 'unhealthy' ? 'secondary' : 
                            'destructive'
                          } className="text-xs py-0 px-1">
                            {service.status}
                          </Badge>
                          <Badge variant="outline" className="text-xs py-0 px-1">
                            {service.health}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            PM2: {service.pm2_status}
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 border rounded h-full">
                        {serviceName.includes('comfyui') ? (
                          // ComfyUI services get sub-tabs for different log types
                          <Tabs defaultValue="server" className="h-full flex flex-col">
                            <div className="border-b px-2 pt-2">
                              <TabsList className="grid w-full grid-cols-3">
                                <TabsTrigger value="server" className="text-xs">Server</TabsTrigger>
                                <TabsTrigger value="output" className="text-xs">Output</TabsTrigger>
                                <TabsTrigger value="error" className="text-xs">Error</TabsTrigger>
                              </TabsList>
                            </div>
                            {['server', 'output', 'error'].map((logType) => (
                              <TabsContent key={logType} value={logType} className="flex-1 m-0 p-0">
                                {getLogUrl(serviceName, logType) ? (
                                  <ScrollFollow
                                    startFollowing={true}
                                    render={({ follow, onScroll }) => {
                                      const logUrl = getLogUrl(serviceName, logType);
                                      if (!logUrl) return null;
                                      
                                      return (
                                        <LazyLog
                                          url={logUrl}
                                          stream
                                          follow={follow}
                                          onScroll={onScroll}
                                          enableSearch={false}
                                          selectableLines={false}
                                          style={{
                                            backgroundColor: 'hsl(var(--background))',
                                            color: 'hsl(var(--foreground))',
                                            fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                            fontSize: '13px',
                                            lineHeight: '1.4'
                                          }}
                                          formatPart={(text) => {
                                            // Simple ANSI color stripping and basic formatting
                                            return text.replace(/\x1b\[[0-9;]*m/g, '');
                                          }}
                                        />
                                      );
                                    }}
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full text-muted-foreground">
                                    <div className="text-center">
                                      <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                      <p>{logType} logs not available</p>
                                    </div>
                                  </div>
                                )}
                              </TabsContent>
                            ))}
                          </Tabs>
                        ) : (
                          // Other services use standard PM2 logs
                          getLogUrl(serviceName) ? (
                            <ScrollFollow
                              startFollowing={true}
                              render={({ follow, onScroll }) => {
                                const logUrl = getLogUrl(serviceName);
                                if (!logUrl) return null;
                                
                                return (
                                  <LazyLog
                                    url={logUrl}
                                    stream
                                    follow={follow}
                                    onScroll={onScroll}
                                    enableSearch={false}
                                    selectableLines={false}
                                    style={{
                                      backgroundColor: 'hsl(var(--background))',
                                      color: 'hsl(var(--foreground))',
                                      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                                      fontSize: '13px',
                                      lineHeight: '1.4'
                                    }}
                                    formatPart={(text) => {
                                      // Simple ANSI color stripping and basic formatting
                                      return text.replace(/\x1b\[[0-9;]*m/g, '');
                                    }}
                                  />
                                );
                              }}
                            />
                          ) : (
                            <div className="flex items-center justify-center h-full text-muted-foreground">
                              <div className="text-center">
                                <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>Log URL not available</p>
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>

          <div className="flex justify-end pt-4 px-6 pb-4 border-t shrink-0">
            <Button variant="outline" onClick={() => setShowLogs(false)} size="sm">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});