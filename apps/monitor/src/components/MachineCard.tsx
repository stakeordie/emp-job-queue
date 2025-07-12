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
import { useState, memo, useEffect, useRef } from "react";
import { Monitor, Server, Activity, AlertTriangle, X, RefreshCw } from "lucide-react";

interface MachineCardProps {
  machine: Machine;
  workers: Worker[];
  onDelete?: (machineId: string) => void;
}

interface PM2Service {
  name: string;
  status: string;
  pid: number;
  memory: number;
  cpu: number;
  uptime: number;
  restarts: number;
}

export const MachineCard = memo(function MachineCard({ machine, workers, onDelete }: MachineCardProps) {
  const [showLogs, setShowLogs] = useState(false);
  const [pm2Services, setPm2Services] = useState<PM2Service[]>([]);
  const [serviceLogs, setServiceLogs] = useState<Record<string, string>>({});
  const [loadingLogs, setLoadingLogs] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState("overview");
  const [streamingIntervals, setStreamingIntervals] = useState<Record<string, NodeJS.Timeout>>({});
  const scrollRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const getStatusColor = (status: Machine['status']) => {
    switch (status) {
      case 'ready': return 'default';
      case 'starting': return 'secondary';
      case 'stopping': return 'destructive';
      case 'offline': return 'outline';
      default: return 'outline';
    }
  };

  const getStatusIcon = (status: Machine['status']) => {
    switch (status) {
      case 'ready': return <Activity className="h-4 w-4" />;
      case 'starting': return <Monitor className="h-4 w-4 animate-pulse" />;
      case 'stopping': return <AlertTriangle className="h-4 w-4" />;
      case 'offline': return <Server className="h-4 w-4" />;
      default: return <Server className="h-4 w-4" />;
    }
  };

  const isActive = machine.status === 'ready' && workers.length > 0;
  const isEmpty = workers.length === 0;
  const totalJobs = workers.reduce((sum, w) => sum + w.total_jobs_completed, 0);
  const totalFailures = workers.reduce((sum, w) => sum + w.total_jobs_failed, 0);
  const activeJobs = workers.filter(w => w.current_jobs.length > 0).length;

  // Extract health check URL from machine health_url
  const getHealthUrl = () => {
    if (machine.health_url) {
      return machine.health_url.replace('/health', '');
    }
    
    // Fallback for local development - assume local machine on port 9092
    if (machine.machine_id === 'basic-machine-local') {
      return 'http://localhost:9092';
    }
    
    return null;
  };

  // Fetch PM2 services list
  const fetchPM2Services = async () => {
    const healthUrl = getHealthUrl();
    console.log('Machine health_url:', machine.health_url);
    console.log('Extracted health URL:', healthUrl);
    
    if (!healthUrl) {
      console.log('No health URL available');
      return;
    }
    
    try {
      const url = `${healthUrl}/pm2/list`;
      console.log('Fetching PM2 services from:', url);
      const response = await fetch(url);
      console.log('PM2 services response:', response.status, response.ok);
      
      if (response.ok) {
        const services = await response.json();
        console.log('PM2 services data:', services);
        setPm2Services(services);
      } else {
        console.error('PM2 services fetch failed:', response.status, await response.text());
      }
    } catch (error) {
      console.error('Failed to fetch PM2 services:', error);
    }
  };

  // Fetch logs for a specific service
  const fetchServiceLogs = async (serviceName: string, isInitial = false) => {
    const healthUrl = getHealthUrl();
    if (!healthUrl) return;
    
    if (isInitial) {
      setLoadingLogs(prev => ({ ...prev, [serviceName]: true }));
    }
    
    try {
      const response = await fetch(`${healthUrl}/pm2/logs?service=${serviceName}&lines=100`);
      if (response.ok) {
        const logs = await response.text();
        setServiceLogs(prev => ({ ...prev, [serviceName]: logs }));
        
        // Auto-scroll to bottom after setting logs
        setTimeout(() => {
          const scrollElement = scrollRefs.current[serviceName];
          if (scrollElement) {
            scrollElement.scrollTop = scrollElement.scrollHeight;
          }
        }, 50);
      }
    } catch (error) {
      console.error(`Failed to fetch logs for ${serviceName}:`, error);
    } finally {
      if (isInitial) {
        setLoadingLogs(prev => ({ ...prev, [serviceName]: false }));
      }
    }
  };

  // Start streaming logs for a service
  const startStreaming = (serviceName: string) => {
    // Clear any existing interval
    if (streamingIntervals[serviceName]) {
      clearInterval(streamingIntervals[serviceName]);
    }
    
    // Initial fetch
    fetchServiceLogs(serviceName, true);
    
    // Set up streaming interval (refresh every 2 seconds)
    const interval = setInterval(() => {
      fetchServiceLogs(serviceName, false);
    }, 2000);
    
    setStreamingIntervals(prev => ({ ...prev, [serviceName]: interval }));
  };

  // Stop streaming logs for a service
  const stopStreaming = (serviceName: string) => {
    if (streamingIntervals[serviceName]) {
      clearInterval(streamingIntervals[serviceName]);
      setStreamingIntervals(prev => {
        const { [serviceName]: removed, ...rest } = prev;
        return rest;
      });
    }
  };

  // Stop all streaming when modal closes
  const stopAllStreaming = () => {
    Object.values(streamingIntervals).forEach(interval => clearInterval(interval));
    setStreamingIntervals({});
  };

  // Load PM2 data when modal opens and clean up when it closes
  useEffect(() => {
    if (showLogs && machine.status === 'ready') {
      fetchPM2Services();
    } else if (!showLogs) {
      // Clean up when modal closes
      stopAllStreaming();
      setServiceLogs({});
      setPm2Services([]);
      setActiveTab('overview');
    }
  }, [showLogs, machine.status]);

  // Handle tab changes - start/stop streaming
  useEffect(() => {
    if (!showLogs) return;
    
    if (activeTab !== 'overview') {
      // Stop streaming for other services
      pm2Services.forEach(service => {
        if (service.name !== activeTab) {
          stopStreaming(service.name);
        }
      });
      
      // Start streaming for the active service
      startStreaming(activeTab);
    } else {
      // Stop all streaming when on overview tab
      pm2Services.forEach(service => stopStreaming(service.name));
    }
    
    // Cleanup function
    return () => {
      if (activeTab !== 'overview') {
        stopStreaming(activeTab);
      }
    };
  }, [showLogs, activeTab, pm2Services.length]);

  return (
    <>
      <Card className={`
        transition-all duration-300 ease-in-out cursor-pointer
        ${isActive ? 'border-green-500 bg-green-50' : ''}
        ${machine.status === 'starting' ? 'border-blue-500 bg-blue-50 border-dashed' : ''}
        ${machine.status === 'offline' ? 'border-gray-300 bg-gray-50' : ''}
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
              {machine.status === 'offline' && onDelete && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(machine.machine_id);
                  }}
                  className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                  title="Delete offline machine"
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
                  {machine.status === 'starting' ? 'Starting workers...' : 'No workers'}
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
        <DialogContent className="max-w-[95vw] w-[95vw] max-h-[90vh] h-[90vh] sm:max-w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon(machine.status)}
              {machine.machine_id} - Service Logs
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  fetchPM2Services();
                  if (activeTab !== 'overview') {
                    // Force refresh the active tab
                    stopStreaming(activeTab);
                    startStreaming(activeTab);
                  }
                }}
                className="ml-auto"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="flex flex-col gap-4 mb-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Service Logs</h3>
                  <div className="flex items-center gap-2">
                    <Badge variant={getStatusColor(machine.status)}>
                      {machine.status}
                    </Badge>
                    {machine.started_at && (
                      <span className="text-sm text-muted-foreground">
                        Started: {new Date(machine.started_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="overflow-x-auto">
                  <TabsList className="inline-flex w-max gap-1 min-w-full">
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    {pm2Services.map(service => (
                      <TabsTrigger key={service.name} value={service.name} className="flex items-center gap-2 whitespace-nowrap">
                        <div className={`w-2 h-2 rounded-full ${
                          service.status === 'online' ? 'bg-green-500' : 
                          service.status === 'stopping' ? 'bg-yellow-500' : 'bg-red-500'
                        }`} />
                        {service.name}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>
              </div>

              <div className="flex-1 overflow-hidden">
                <TabsContent value="overview" className="h-full">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 h-full">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">PM2 Services</h3>
                      <ScrollArea className="h-[300px] border rounded p-3">
                        {pm2Services.length === 0 ? (
                          <div className="text-center text-muted-foreground py-8">
                            <Server className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No PM2 services found</p>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {pm2Services.map(service => (
                              <div key={service.name} className="flex items-center justify-between p-2 border rounded">
                                <div className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${
                                    service.status === 'online' ? 'bg-green-500' : 
                                    service.status === 'stopping' ? 'bg-yellow-500' : 'bg-red-500'
                                  }`} />
                                  <span className="font-mono text-sm">{service.name}</span>
                                  <Badge variant="outline" className="text-xs">
                                    {service.status}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  PID: {service.pid} | Memory: {Math.round(service.memory / 1024 / 1024)}MB | Restarts: {service.restarts}
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

                {pm2Services.map(service => (
                  <TabsContent key={service.name} value={service.name} className="h-full">
                    <div className="h-full flex flex-col">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-semibold">{service.name} Logs</h3>
                        <div className="flex items-center gap-2">
                          <Badge variant={service.status === 'online' ? 'default' : 'destructive'}>
                            {service.status}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            PID: {service.pid} | Memory: {Math.round(service.memory / 1024 / 1024)}MB
                          </span>
                        </div>
                      </div>
                      <ScrollArea className="flex-1 border rounded">
                        <div 
                          ref={(el) => { scrollRefs.current[service.name] = el; }}
                          className="p-3 h-full overflow-y-auto"
                          style={{ maxHeight: 'calc(90vh - 300px)' }}
                        >
                          {loadingLogs[service.name] ? (
                            <div className="text-center text-muted-foreground py-8">
                              <RefreshCw className="h-8 w-8 mx-auto mb-2 opacity-50 animate-spin" />
                              <p>Loading logs...</p>
                            </div>
                          ) : serviceLogs[service.name] ? (
                            <>
                              <div className="flex items-center justify-between mb-2 sticky top-0 bg-background z-10 pb-2">
                                <span className="text-xs text-muted-foreground">
                                  Live logs (refreshes every 2s)
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {streamingIntervals[service.name] ? '🔴 Live' : '⏸️ Paused'}
                                </span>
                              </div>
                              <pre className="font-mono text-xs whitespace-pre-wrap leading-relaxed">
                                {serviceLogs[service.name]}
                              </pre>
                            </>
                          ) : (
                            <div className="text-center text-muted-foreground py-8">
                              <Monitor className="h-8 w-8 mx-auto mb-2 opacity-50" />
                              <p>No logs available</p>
                            </div>
                          )}
                        </div>
                      </ScrollArea>
                    </div>
                  </TabsContent>
                ))}
              </div>
            </Tabs>
          </div>

          <div className="flex justify-end pt-4">
            <Button variant="outline" onClick={() => setShowLogs(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});