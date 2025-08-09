import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Worker } from "@/types/worker";
import { useMonitorStore } from "@/store";

interface WorkerCardProps {
  worker: Worker;
}

export function WorkerCard({ worker }: WorkerCardProps) {
  const { blinkingWorkers } = useMonitorStore();
  const isBlinking = blinkingWorkers.has(worker.worker_id);
  const getStatusColor = (status: Worker['status']) => {
    switch (status) {
      case 'idle':
        return '#22c55e'; // green
      case 'busy':
        return '#f59e0b'; // amber
      // case 'processing': // removed processing status
      //   return '#3b82f6'; // blue
      case 'error':
        return '#ef4444'; // red
      case 'offline':
        return '#6b7280'; // gray
      default:
        return '#6b7280'; // gray
    }
  };

  const getStatusVariant = (status: Worker['status']) => {
    switch (status) {
      case 'idle':
        return 'default' as const;
      case 'busy':
        return 'secondary' as const;
      case 'error':
      case 'offline':
        return 'destructive' as const;
      default:
        return 'outline' as const;
    }
  };

  return (
    <Card 
key={worker.worker_id} 
      className={`p-2 border-l-4 h-fit ${isBlinking ? 'worker-status-blink' : ''}`} 
      style={{
        borderLeftColor: getStatusColor(worker.status)
      }}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium truncate" title={worker.worker_id}>
            {worker.worker_id}
          </h3>
          <Badge variant={getStatusVariant(worker.status)} className="text-xs px-1 py-0">
            {worker.status}
          </Badge>
        </div>
        
        <div className="space-y-1 text-xs">
          <div>
            <p className="text-muted-foreground text-xs">GPU: {worker.capabilities?.hardware?.gpu_model || 'Unknown'}</p>
            <p className="text-muted-foreground text-xs">VRAM: {worker.capabilities?.hardware?.gpu_memory_gb || 'Unknown'}GB</p>
          </div>
          
          {(worker.capabilities?.services || []).length > 0 && (
            <div className="flex flex-wrap gap-0.5">
              {(worker.capabilities?.services || []).map((service: string) => (
                <Badge key={service} variant="outline" className="text-xs px-1 py-0 h-4">
                  {service}
                </Badge>
              ))}
            </div>
          )}
          
          {worker.current_jobs && worker.current_jobs.length > 0 && (
            <div>
              <p className="text-muted-foreground text-xs">Job:</p>
              <p className="font-mono text-xs truncate" title={worker.current_jobs[0]}>
                {worker.current_jobs[0]?.substring(0, 8)}...
              </p>
            </div>
          )}
          
          <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>✓ {worker.total_jobs_completed}</span>
            <span>✗ {worker.total_jobs_failed}</span>
            {worker.capabilities?.machine_id && <span>M: {worker.capabilities.machine_id}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}