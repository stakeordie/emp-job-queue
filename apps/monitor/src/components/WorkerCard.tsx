import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Worker } from "@/types/worker";

interface WorkerCardProps {
  worker: Worker;
}

export function WorkerCard({ worker }: WorkerCardProps) {
  const getStatusColor = (status: Worker['status']) => {
    switch (status) {
      case 'idle':
        return '#22c55e'; // green
      case 'busy':
        return '#f59e0b'; // amber
      case 'processing':
        return '#3b82f6'; // blue
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
      case 'processing':
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
      key={worker.id} 
      className="p-2 border-l-4 h-fit" 
      style={{
        borderLeftColor: getStatusColor(worker.status)
      }}
    >
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium truncate" title={worker.id}>
            {worker.id}
          </h3>
          <Badge variant={getStatusVariant(worker.status)} className="text-xs px-1 py-0">
            {worker.status}
          </Badge>
        </div>
        
        <div className="space-y-1 text-xs">
          <div>
            <p className="text-muted-foreground text-xs">GPU: {worker.capabilities.gpu_model}</p>
            <p className="text-muted-foreground text-xs">VRAM: {worker.capabilities.gpu_memory_gb}GB</p>
          </div>
          
          {(worker.capabilities?.services || []).length > 0 && (
            <div className="flex flex-wrap gap-0.5">
              {(worker.capabilities?.services || []).map((service) => (
                <Badge key={service} variant="outline" className="text-xs px-1 py-0 h-4">
                  {service}
                </Badge>
              ))}
            </div>
          )}
          
          {worker.current_job_id && (
            <div>
              <p className="text-muted-foreground text-xs">Job:</p>
              <p className="font-mono text-xs truncate" title={worker.current_job_id}>
                {worker.current_job_id.substring(0, 8)}...
              </p>
            </div>
          )}
          
          <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t">
            <span>✓ {worker.jobs_completed}</span>
            <span>✗ {worker.jobs_failed}</span>
            {worker.machine_id && <span>M: {worker.machine_id}</span>}
          </div>
        </div>
      </div>
    </Card>
  );
}