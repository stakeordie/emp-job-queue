"use client";

import { Worker } from "@/types/worker";
import { useState, memo } from "react";
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

export const SimpleWorkerCard = memo(function SimpleWorkerCard({ worker }: SimpleWorkerCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  const isProcessing = worker.status === 'busy';
  
  return (
    <>
      <div
        onClick={() => setShowDetails(true)}
        className={`
          w-full px-3 py-2 rounded border cursor-pointer
          transition-all duration-300 ease-in-out
          ${isProcessing 
            ? 'bg-blue-500 text-white border-blue-600 animate-pulse' 
            : 'bg-white hover:bg-gray-50 border-gray-200'
          }
        `}
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium truncate">
            {worker.worker_id}
          </span>
          <div className="flex items-center gap-1">
            {worker.capabilities?.services?.map((service: string) => {
              const connectorStatus = worker.connector_statuses?.[service];
              const isHealthy = connectorStatus?.status === 'active';
              const hasError = connectorStatus?.status === 'error';
              
              return (
                <div
                  key={service}
                  className={`
                    w-2 h-2 rounded-full
                    ${isHealthy ? 'bg-green-500' : hasError ? 'bg-red-500' : 'bg-gray-400'}
                  `}
                  title={`${service}: ${connectorStatus?.status || 'unknown'}`}
                />
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
              </div>
            </div>

            {(worker.capabilities?.services || []).length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Services</p>
                <div className="flex flex-wrap gap-1">
                  {worker.capabilities?.services?.map((service: string) => {
                    const connectorStatus = worker.connector_statuses?.[service];
                    const isHealthy = connectorStatus?.status === 'active';
                    const hasError = connectorStatus?.status === 'error';
                    
                    return (
                      <Badge 
                        key={service} 
                        variant={isHealthy ? "default" : hasError ? "destructive" : "outline"} 
                        className="text-xs"
                        title={connectorStatus?.error_message || `Status: ${connectorStatus?.status || 'unknown'}`}
                      >
                        <div className={`w-2 h-2 rounded-full mr-1 ${
                          isHealthy ? 'bg-green-500' : hasError ? 'bg-red-500' : 'bg-gray-400'
                        }`} />
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
});