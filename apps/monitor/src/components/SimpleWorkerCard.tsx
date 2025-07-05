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

  const isProcessing = worker.status === 'processing' || worker.status === 'busy';
  
  return (
    <>
      <div
        onClick={() => setShowDetails(true)}
        className={`
          w-[200px] h-[40px] px-3 py-2 rounded border cursor-pointer
          flex items-center justify-center
          transition-all duration-300 ease-in-out
          ${isProcessing 
            ? 'bg-blue-500 text-white border-blue-600 animate-pulse' 
            : 'bg-white hover:bg-gray-50 border-gray-200'
          }
        `}
      >
        <span className="text-sm font-medium truncate">
          {worker.id}
        </span>
      </div>

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{worker.id}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium mb-1">Status</p>
              <Badge variant={
                worker.status === 'idle' ? 'default' : 
                worker.status === 'processing' || worker.status === 'busy' ? 'secondary' :
                worker.status === 'error' || worker.status === 'offline' ? 'destructive' : 
                'outline'
              }>
                {worker.status}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Capabilities</p>
              <div className="space-y-1 text-sm text-muted-foreground">
                <p>GPU: {worker.capabilities.gpu_model}</p>
                <p>Memory: {worker.capabilities.gpu_memory_gb}GB</p>
                {worker.capabilities.cpu_cores && <p>CPU Cores: {worker.capabilities.cpu_cores}</p>}
                {worker.capabilities.ram_gb && <p>RAM: {worker.capabilities.ram_gb}GB</p>}
              </div>
            </div>

            {(worker.capabilities?.services || []).length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1">Services</p>
                <div className="flex flex-wrap gap-1">
                  {worker.capabilities.services.map((service) => (
                    <Badge key={service} variant="outline" className="text-xs">
                      {service}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {worker.current_job_id && (
              <div>
                <p className="text-sm font-medium mb-1">Current Job</p>
                <p className="text-sm font-mono text-muted-foreground">
                  {worker.current_job_id}
                </p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium mb-1">Statistics</p>
              <div className="flex gap-4 text-sm text-muted-foreground">
                <span>Completed: {worker.jobs_completed}</span>
                <span>Failed: {worker.jobs_failed}</span>
              </div>
            </div>

            {worker.machine_id && (
              <div>
                <p className="text-sm font-medium mb-1">Machine ID</p>
                <p className="text-sm text-muted-foreground">{worker.machine_id}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
});