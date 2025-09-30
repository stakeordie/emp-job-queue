"use client";

import { Worker } from "@/types/worker";
import { useState } from "react";
import { useMonitorStore } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

interface SimpleWorkerCardProps {
  worker: Worker;
}

export function SimpleWorkerCard({ worker }: SimpleWorkerCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const { blinkingWorkers, jobs } = useMonitorStore();

  // Determine if worker is busy (has claimed a job)
  const isBusy = worker.status === 'busy' || worker.current_jobs?.length > 0;
  
  // Determine if worker is actively processing (has a job that's in_progress)
  const activeJobs = worker.current_jobs?.map(jobId => 
    jobs.find(job => job.id === jobId && job.status === 'in_progress')
  ).filter(Boolean) || [];
  const isActivelyProcessing = activeJobs.length > 0;
  
  const isBlinking = blinkingWorkers.has(worker.worker_id);
  
  // Debug logging for state changes
  console.log(`🔍 SimpleWorkerCard render - Worker: ${worker.worker_id}, Status: ${worker.status}, IsBusy: ${isBusy}, IsActivelyProcessing: ${isActivelyProcessing}, IsBlinking: ${isBlinking}`);
  
  if (isActivelyProcessing) {
    console.log(`🎯 Worker ${worker.worker_id} is actively processing job(s):`, activeJobs.map(j => j?.id));
  }
  
  return (
    <>
      <div
        onClick={() => setShowDetails(true)}
        className={`
          w-full px-3 py-2 rounded border cursor-pointer
          transition-all duration-300 ease-in-out
          bg-white hover:bg-gray-50 border-gray-200
          ${isBusy ? 'worker-busy-outline' : ''}
          ${isActivelyProcessing ? 'worker-processing-pulse' : ''}
        `}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium truncate">
                {worker.worker_id}
              </span>
              {worker.capabilities?.metadata?.version ? (
                <span className="text-xs text-muted-foreground">
                  {String(worker.capabilities.metadata.version)}
                </span>
              ) : null}
            </div>
            {isActivelyProcessing ? (
              <Badge variant="default" className="text-xs bg-yellow-500">
                Processing
              </Badge>
            ) : isBusy ? (
              <Badge variant="secondary" className="text-xs bg-blue-500">
                Busy
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1">
            {worker.capabilities?.services?.map((service: string) => {
              const connectorStatus = worker.connector_statuses?.[service];
              const status = connectorStatus?.status;
              
              // Determine badge variant and color based on connector status
              const getBadgeConfig = (status?: string) => {
                switch (status) {
                  case 'active':
                    return { variant: 'default' as const, color: 'bg-green-500', label: 'Active' };
                  case 'inactive':
                    return { variant: 'secondary' as const, color: 'bg-blue-500', label: 'Idle' };
                  case 'waiting_for_service':
                    return { variant: 'secondary' as const, color: 'bg-yellow-500', label: 'Waiting' };
                  case 'connecting':
                    return { variant: 'secondary' as const, color: 'bg-orange-500', label: 'Connecting' };
                  case 'error':
                    return { variant: 'destructive' as const, color: 'bg-red-500', label: 'Error' };
                  default:
                    return { variant: 'outline' as const, color: 'bg-gray-400', label: 'Unknown' };
                }
              };
              
              const config = getBadgeConfig(status);
              
              return (
                <Badge
                  key={service}
                  variant={config.variant}
                  className="text-xs px-2 py-0.5 h-5"
                  title={connectorStatus?.error_message || `Status: ${status || 'unknown'} (${config.label})`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full mr-1 ${config.color}`} />
                  {service}
                </Badge>
              );
            })}
          </div>
        </div>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{worker.worker_id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Status</p>
              <Badge variant={
                worker.status === 'idle' ? 'default' : 
                worker.status === 'busy' ? 'secondary' :
                worker.status === 'error' || worker.status === 'offline' ? 'destructive' : 
                'outline'
              }>
                {worker.status}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Capabilities</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>GPU: {worker.capabilities?.hardware?.gpu_model || 'Unknown'}</p>
                <p>VRAM: {(worker.capabilities?.hardware?.gpu_memory_gb || 'Unknown')}GB</p>
                {worker.capabilities?.hardware?.ram_gb && <p>RAM: {worker.capabilities.hardware.ram_gb}GB</p>}
                {worker.capabilities?.metadata?.version ? (
                  <p>Version: {String(worker.capabilities.metadata.version)}</p>
                ) : null}
              </div>
            </div>

            {(worker.capabilities?.services || []).length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Services</p>
                <div className="flex flex-wrap gap-1">
                  {worker.capabilities?.services?.map((service: string) => {
                    const connectorStatus = worker.connector_statuses?.[service];
                    const status = connectorStatus?.status;
                    
                    // Determine badge variant and color based on connector status
                    const getBadgeConfig = (status?: string) => {
                      switch (status) {
                        case 'active':
                          return { variant: 'default' as const, color: 'bg-green-500', label: 'Active' };
                        case 'inactive':
                          return { variant: 'secondary' as const, color: 'bg-blue-500', label: 'Idle' };
                        case 'error':
                          return { variant: 'destructive' as const, color: 'bg-red-500', label: 'Error' };
                        default:
                          return { variant: 'outline' as const, color: 'bg-gray-400', label: 'Unknown' };
                      }
                    };
                    
                    const config = getBadgeConfig(status);
                    
                    return (
                      <Badge 
                        key={service} 
                        variant={config.variant}
                        className="text-xs"
                        title={connectorStatus?.error_message || `Status: ${status || 'unknown'} (${config.label})`}
                      >
                        <div className={`w-2 h-2 rounded-full mr-1 ${config.color}`} />
                        {service}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            )}

            {worker.current_jobs && worker.current_jobs.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Current Jobs</p>
                <div className="space-y-1">
                  {worker.current_jobs.map((jobId: string) => (
                    <p key={jobId} className="text-sm font-mono text-muted-foreground">
                      {jobId}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-1">Statistics</p>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Completed: {worker.total_jobs_completed}</span>
                <span>Failed: {worker.total_jobs_failed}</span>
              </div>
            </div>

            {worker.capabilities?.machine_id && (
              <div>
                <p className="text-sm font-medium mb-1">Machine ID</p>
                <p className="text-sm text-muted-foreground">{worker.capabilities?.machine_id}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}