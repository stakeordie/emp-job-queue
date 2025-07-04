import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { WorkerCard } from "@/components/WorkerCard";
import { Worker } from "@/types/worker";

interface MachineCardProps {
  machineId: string;
  workers: Worker[];
}

export function MachineCard({ machineId, workers }: MachineCardProps) {
  const getMachineStatus = () => {
    const statuses = workers.map(w => w.status);
    if (statuses.some(s => s === 'busy')) return 'active';
    if (statuses.some(s => s === 'idle')) return 'idle';
    if (statuses.some(s => s === 'error')) return 'error';
    return 'offline';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return '#3b82f6'; // blue
      case 'idle': return '#22c55e'; // green  
      case 'error': return '#ef4444'; // red
      case 'offline': return '#6b7280'; // gray
      default: return '#6b7280';
    }
  };

  const getStatusVariant = (status: string) => {
    switch (status) {
      case 'active': return 'secondary' as const;
      case 'idle': return 'default' as const;
      case 'error': 
      case 'offline': return 'destructive' as const;
      default: return 'outline' as const;
    }
  };

  const machineStatus = getMachineStatus();
  const totalJobs = workers.reduce((sum, w) => sum + w.jobs_completed, 0);
  const totalFailures = workers.reduce((sum, w) => sum + w.jobs_failed, 0);
  const activeJobs = workers.filter(w => w.current_job_id).length;

  return (
    <Card 
      className="border-l-4 space-y-2"
      style={{ borderLeftColor: getStatusColor(machineStatus) }}
    >
      <CardHeader className="pb-2 py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-semibold">
            Machine: {machineId}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={getStatusVariant(machineStatus)} className="text-xs">
              {machineStatus}
            </Badge>
            <div className="text-xs text-muted-foreground">
              {workers.length} GPU{workers.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>Active Jobs: {activeJobs}</span>
          <span>✓ {totalJobs}</span>
          <span>✗ {totalFailures}</span>
        </div>
      </CardHeader>

      <CardContent className="pt-0 pb-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {workers.map((worker) => (
            <div key={worker.id} className="min-w-0">
              <WorkerCard worker={worker} />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}