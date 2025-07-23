import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react"
import { Job } from "@/types/job"
import { Worker, WorkerStatus } from "@/types/worker"

interface JobDetailsModalProps {
  job: Job | null;
  workers: Worker[];
  isOpen: boolean;
  onClose: () => void;
}

export function JobDetailsModal({ job, workers, isOpen, onClose }: JobDetailsModalProps) {
  if (!job) return null;

  const checkWorkerMatch = (worker: Worker, job: Job): boolean => {
    const capabilities = worker.capabilities;
    const requirements = job.requirements || {};
    
    // Primary service check - worker must support the job type
    const workerServices = new Set(capabilities.services || []);
    if (!workerServices.has(job.job_type)) {
      return false;
    }
    
    // GPU Memory check
    if (requirements.gpu_memory_gb && capabilities.hardware?.gpu_memory_gb && capabilities.hardware.gpu_memory_gb < requirements.gpu_memory_gb) {
      return false;
    }
    
    // CPU cores check
    if (requirements.cpu_cores && capabilities.hardware?.ram_gb && capabilities.hardware.ram_gb < requirements.cpu_cores) {
      return false;
    }
    
    // RAM check
    if (requirements.ram_gb && capabilities.hardware?.ram_gb && capabilities.hardware.ram_gb < requirements.ram_gb) {
      return false;
    }
    
    // GPU model check
    if (requirements.gpu_model && requirements.gpu_model !== 'all') {
      if (capabilities.hardware?.gpu_model && capabilities.hardware.gpu_model.toLowerCase() !== requirements.gpu_model.toLowerCase()) {
        return false;
      }
    }
    
    // Customer access check
    if (requirements.customer_access) {
      if (requirements.customer_access === 'strict' && capabilities.customer_access?.isolation !== 'strict') {
        return false;
      }
      if (requirements.customer_access === 'loose' && capabilities.customer_access?.isolation === 'none') {
        return false;
      }
    }
    
    // Models check - worker must have all required models
    if (requirements.models && requirements.models.length > 0) {
      const workerModels = capabilities.models === 'all' ? new Set() : new Set(Object.values(capabilities.models || {}).flat());
      if (capabilities.models !== 'all' && !requirements.models.every(model => workerModels.has(model))) {
        return false;
      }
    }
    
    // Additional service types check - worker must support at least one required service
    if (requirements.service_types && requirements.service_types.length > 0) {
      if (!requirements.service_types.some(service => workerServices.has(service))) {
        return false;
      }
    }
    
    return true;
  };

  const matchingWorkers = workers.filter(worker => checkWorkerMatch(worker, job));

  const idleMatchingWorkers = matchingWorkers.filter(w => w.status === WorkerStatus.IDLE);
  const busyMatchingWorkers = matchingWorkers.filter(w => w.status === WorkerStatus.BUSY);

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Job Details</DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="h-full max-h-[calc(80vh-120px)]">
          <div className="space-y-6 pr-4">
            {/* Job Info */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Job Information</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium">ID</p>
                  <p className="text-sm text-muted-foreground font-mono">{job.id}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Type</p>
                  <p className="text-sm text-muted-foreground">{job.job_type}</p>
                </div>
                <div>
                  <p className="text-sm font-medium">Status</p>
                  <Badge variant={job.status === 'pending' ? 'outline' : 'default'}>
                    {job.status}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm font-medium">Priority</p>
                  {job.workflow_priority !== undefined ? (
                    <div className="space-y-1">
                      <p className="text-sm text-blue-600 font-medium">
                        {job.workflow_priority} (workflow override)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Original job priority: {job.priority}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{job.priority}</p>
                  )}
                </div>
                {job.workflow_id && (
                  <>
                    <div>
                      <p className="text-sm font-medium">🔗 Workflow</p>
                      <p className="text-sm text-purple-600 font-mono font-medium">{job.workflow_id}</p>
                      {job.step_number !== undefined && (
                        <p className="text-xs text-muted-foreground">Step {job.step_number}</p>
                      )}
                    </div>
                    {job.workflow_datetime && (
                      <div>
                        <p className="text-sm font-medium">⏱️ Workflow Created</p>
                        <p className="text-sm text-green-600 font-medium">
                          {new Date(job.workflow_datetime).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <p className="text-sm font-medium">Created</p>
                  <p className="text-sm text-muted-foreground">
                    {new Date(job.created_at).toLocaleString()}
                  </p>
                </div>
                {job.customer_id && (
                  <div>
                    <p className="text-sm font-medium">Customer</p>
                    <p className="text-sm text-muted-foreground">{job.customer_id}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Requirements */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">Requirements</h3>
              <div className="grid grid-cols-2 gap-3">
                {/* Primary Service Requirement - Always present */}
                <div className="col-span-2">
                  <span className="text-sm font-medium">Service Type:</span>
                  <div className="flex gap-1 mt-1">
                    <Badge variant="default" className="text-xs">
                      {job.job_type}
                    </Badge>
                  </div>
                </div>

                {/* Hardware Requirements */}
                {job.requirements?.gpu_memory_gb && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">VRAM Required:</span>
                    <span className="text-sm text-muted-foreground">{job.requirements.gpu_memory_gb}GB</span>
                  </div>
                )}
                {job.requirements?.cpu_cores && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">CPU Cores:</span>
                    <span className="text-sm text-muted-foreground">{job.requirements.cpu_cores}</span>
                  </div>
                )}
                {job.requirements?.ram_gb && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">RAM:</span>
                    <span className="text-sm text-muted-foreground">{job.requirements.ram_gb}GB</span>
                  </div>
                )}
                {job.requirements?.gpu_model && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">GPU Model:</span>
                    <span className="text-sm text-muted-foreground">{job.requirements.gpu_model}</span>
                  </div>
                )}
                {job.requirements?.customer_access && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Customer Access:</span>
                    <Badge variant="outline" className="text-xs">
                      {job.requirements.customer_access}
                    </Badge>
                  </div>
                )}

                {/* Additional Service Types */}
                {job.requirements?.service_types && job.requirements.service_types.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-sm font-medium">Additional Services:</span>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {job.requirements.service_types.map(service => (
                        <Badge key={service} variant="secondary" className="text-xs">
                          {service}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Required Models */}
                {job.requirements?.models && job.requirements.models.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-sm font-medium">Required Models:</span>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {job.requirements.models.map(model => (
                        <Badge key={model} variant="secondary" className="text-xs">
                          {model}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Show message if only primary service requirement exists */}
                {!job.requirements && (
                  <div className="col-span-2">
                    <p className="text-sm text-muted-foreground">Only requires a worker that supports {job.job_type}</p>
                  </div>
                )}
              </div>
            </div>

            <Separator />

            {/* Matching Workers */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-muted-foreground">Matching Workers</h3>
                <div className="flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-500" />
                    {idleMatchingWorkers.length} idle
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3 text-yellow-500" />
                    {busyMatchingWorkers.length} busy
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    {workers.length - matchingWorkers.length} incompatible
                  </span>
                </div>
              </div>

              {matchingWorkers.length === 0 ? (
                <div className="p-4 border rounded-lg bg-red-50 dark:bg-red-950">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <p className="text-sm text-red-700 dark:text-red-300">
                      No workers match this job&apos;s requirements!
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {matchingWorkers.map(worker => (
                    <div 
                      key={worker.worker_id} 
                      className={`p-3 border rounded-lg ${
                        worker.status === WorkerStatus.IDLE 
                          ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' 
                          : 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant={worker.status === WorkerStatus.IDLE ? 'default' : 'secondary'}>
                            {worker.status}
                          </Badge>
                          <p className="text-sm font-medium">{worker.worker_id}</p>
                          {worker.capabilities.machine_id && (
                            <p className="text-xs text-muted-foreground">({worker.capabilities.machine_id})</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{worker.capabilities.hardware?.gpu_memory_gb || 'N/A'}GB</span>
                          <span>•</span>
                          <span>{worker.capabilities.hardware?.gpu_model || 'N/A'}</span>
                          <span>•</span>
                          <span>{worker.capabilities.services?.join(', ') || 'N/A'}</span>
                        </div>
                      </div>
                      {worker.current_jobs.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Currently processing: {worker.current_jobs.join(', ')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {workers.length - matchingWorkers.length > 0 && (
                <details className="mt-3">
                  <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                    Show {workers.length - matchingWorkers.length} incompatible workers
                  </summary>
                  <div className="mt-2 space-y-2">
                    {workers.filter(w => !matchingWorkers.includes(w)).map(worker => (
                      <div key={worker.worker_id} className="p-3 border rounded-lg bg-gray-50 dark:bg-gray-950">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{worker.status}</Badge>
                            <p className="text-sm font-medium">{worker.worker_id}</p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{worker.capabilities.hardware?.gpu_memory_gb || 'N/A'}GB</span>
                            <span>•</span>
                            <span>{worker.capabilities.hardware?.gpu_model || 'N/A'}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            {/* Payload (collapsed by default) */}
            <details className="space-y-2">
              <summary className="text-sm font-semibold text-muted-foreground cursor-pointer hover:text-foreground">
                Payload
              </summary>
              <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto">
                {JSON.stringify(job.payload, null, 2)}
              </pre>
            </details>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}