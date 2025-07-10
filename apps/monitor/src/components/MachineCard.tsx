import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SimpleWorkerCard } from "@/components/SimpleWorkerCard";
import { Machine, Worker } from "@/types";
import { useState, memo } from "react";
import { Monitor, Server, Activity, AlertTriangle, X } from "lucide-react";

interface MachineCardProps {
  machine: Machine;
  workers: Worker[];
  onDelete?: (machineId: string) => void;
}

export const MachineCard = memo(function MachineCard({ machine, workers, onDelete }: MachineCardProps) {
  const [showLogs, setShowLogs] = useState(false);

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
        <DialogContent className="sm:max-w-[600px] sm:max-h-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon(machine.status)}
              {machine.machine_id} Logs
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant={getStatusColor(machine.status)}>
                {machine.status}
              </Badge>
              {machine.started_at && (
                <span className="text-sm text-muted-foreground">
                  Started: {new Date(machine.started_at).toLocaleString()}
                </span>
              )}
            </div>

            <ScrollArea className="h-[300px] w-full border rounded p-3">
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

            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setShowLogs(false)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});