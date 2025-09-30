"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
// AlertDialog imports temporarily removed due to React 19 compatibility issues
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
// } from "@/components/ui/alert-dialog"
import { SimpleProgress } from "@/components/ui/simple-progress"
import { RefreshCw, X, Bug } from "lucide-react"
import { MachineCard } from "@/components/MachineCard"
import { JobDetailsModal } from "@/components/JobDetailsModal"
import { JobSubmissionPanel } from "@/components/JobSubmissionPanel"
import { ConnectionHeader } from "@/components/ConnectionHeader"
import { AutoConnector } from "@/components/AutoConnector"
import { Pagination } from "@/components/Pagination"
import { ConnectionsPanel } from "@/components/ConnectionsPanel"
import { useMonitorStore } from "@/store"
import { useState, useMemo, useEffect } from "react"
import type { Job } from "@/types/job"
import { WorkerStatus, WorkerInfo } from "@/types/worker"
import Link from "next/link"

// Environment presets moved to ConnectionHeader

interface HomeProps {
  isJobPanelOpen: boolean;
}

function Home({ isJobPanelOpen }: HomeProps) {
  const { jobs, workers, machines, syncJobState, cancelJob, finishedJobsPagination, setFinishedJobsPagination, refreshJobsOnly } = useMonitorStore();
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Format timestamp to relative time
  const formatRelativeTime = (timestamp: number | undefined): string => {
    if (!timestamp) return 'Unknown';
    
    const now = Date.now();
    const diff = now - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    if (seconds > 0) return `${seconds}s ago`;
    return 'Just now';
  };

  // Connection logic moved to ConnectionHeader

  const handleSyncJob = (jobId: string) => {
    syncJobState(jobId);
  };

  const handleCancelJob = (jobId: string) => {
    setCancelJobId(jobId);
  };

  const confirmCancelJob = () => {
    if (cancelJobId) {
      cancelJob(cancelJobId);
      setCancelJobId(null);
    }
  };

  // const handleDeleteMachine = (machineId: string) => {
  //   setDeleteMachineId(machineId);
  // };

  // const confirmDeleteMachine = () => {
  //   if (deleteMachineId) {
  //     deleteMachine(deleteMachineId);
  //     setDeleteMachineId(null);
  //   }
  // };

  // Memoize job counts to avoid recalculating on every render
  const jobCounts = useMemo(() => {
    const counts = {
      active: jobs.filter(job => job.status === 'in_progress' || job.status === 'assigned' || job.status === 'accepted').length,
      pending: jobs.filter(job => job.status === 'pending').length,
      completed: finishedJobsPagination.totalCount || jobs.filter(job => job.status === 'completed').length,
      failed: jobs.filter(job => job.status === 'failed').length,
    };
    return counts;
  }, [jobs, finishedJobsPagination.totalCount]);

  // Memoize filtered and sorted job lists
  const activeJobsList = useMemo(() => 
    jobs.filter(job => job.status === 'in_progress' || job.status === 'assigned' || job.status === 'accepted'),
    [jobs]
  );

  const pendingJobsList = useMemo(() => 
    jobs
      .filter(job => job.status === 'pending')
      .sort((a, b) => {
        // Sort by workflow-aware priority (same as Redis function)
        // Primary: workflow_priority > job.priority (higher first)
        const priorityA = a.workflow_priority || a.priority;
        const priorityB = b.workflow_priority || b.priority;
        if (priorityA !== priorityB) {
          return priorityB - priorityA;
        }
        
        // Secondary: workflow_datetime > created_at (older first = FIFO)
        const datetimeA = a.workflow_datetime ? new Date(a.workflow_datetime).getTime() : new Date(a.created_at).getTime();
        const datetimeB = b.workflow_datetime ? new Date(b.workflow_datetime).getTime() : new Date(b.created_at).getTime();
        return datetimeA - datetimeB;
      }),
    [jobs]
  );

  // Completed jobs (server-side pagination)
  const completedJobsList = useMemo(() => 
    jobs
      .filter(job => job.status === 'completed')
      .sort((a, b) => {
        // Sort by completion time (most recent first)
        const timeA = new Date(a.completed_at || a.created_at).getTime();
        const timeB = new Date(b.completed_at || b.created_at).getTime();
        return timeB - timeA;
      }),
    [jobs]
  );
  
  // Failed jobs (local, not paginated)
  const failedJobsList = useMemo(() => 
    jobs
      .filter(job => job.status === 'failed')
      .sort((a, b) => {
        // Sort by failure time (most recent first)
        const timeA = new Date(a.failed_at || a.created_at).getTime();
        const timeB = new Date(b.failed_at || b.created_at).getTime();
        return timeB - timeA;
      })
      .slice(0, 10), // Show only 10 most recent failed jobs
    [jobs]
  );

  // Use server pagination data for page calculations
  const totalFinishedPages = Math.ceil(finishedJobsPagination.totalCount / finishedJobsPagination.pageSize);
  const currentFinishedPage = finishedJobsPagination.page;
  
  // Handle page change for finished jobs
  const handleFinishedJobsPageChange = (page: number) => {
    setFinishedJobsPagination({ page });
    refreshJobsOnly(); // Only refresh job data, preserve worker/machine state
  };

  return (
    <main className={`flex-1 p-6 space-y-6 overflow-y-auto transition-all duration-300 ease-in-out ${
      isJobPanelOpen ? 'w-full' : 'w-full'
    }`}>
      {/* Auto-connect if NEXT_PUBLIC_WS_URL is set */}
      <AutoConnector />

      {/* Page Title */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Job Queue Monitor</h1>
      </div>

      {/* Job Statistics - Now in main monitor */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{jobCounts.active}</div>
            <div className="text-sm text-muted-foreground">Active Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{jobCounts.pending}</div>
            <div className="text-sm text-muted-foreground">Pending Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{jobCounts.completed}</div>
            <div className="text-sm text-muted-foreground">Completed Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{jobCounts.failed}</div>
            <div className="text-sm text-muted-foreground">Failed Jobs</div>
          </CardContent>
        </Card>
      </div>

      {/* Connections Panel */}
      <ConnectionsPanel />

      {/* Machines */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Machines ({machines.length})
          </h2>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Total Workers: {workers.length}</span>
            <span>Active Jobs: {jobCounts.active}</span>
            <span>Completed: {jobCounts.completed}</span>
            <span>Failed: {jobCounts.failed}</span>
          </div>
        </div>
        
        {machines.length === 0 ? (
          <Card className="p-8">
            <p className="text-muted-foreground text-center">No machines connected. Start some machines to see them here.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {machines.map((machine) => {
              // Defensive check to prevent errors
              if (!machine || !machine.machine_id) {
                console.error('[UI] Invalid machine object - missing required fields:', {
                  machine_exists: !!machine,
                  machine_id: machine?.machine_id,
                  machine_type: typeof machine,
                  machine_keys: machine ? Object.keys(machine) : 'null/undefined',
                  full_machine: machine
                });
                return null;
              }
              
              // Create worker skeletons from structure, then look up their status
              const machineWorkers = (machine.workers || []).map(workerId => {
                // Look up actual worker status from global workers array
                const workerStatus = workers.find(w => w.worker_id === workerId);
                
                if (workerStatus) {
                  return workerStatus;
                }
                
                // Get worker info from machine structure
                const structureWorker = machine.structure?.workers?.[workerId];
                const services = structureWorker?.services || [];
                
                // Return worker skeleton from structure with actual capabilities
                return {
                  worker_id: workerId,
                  status: WorkerStatus.OFFLINE,
                  capabilities: { 
                    worker_id: workerId,
                    services: services, 
                    models: {}, // Models will be populated when worker connects
                    metadata: {
                      gpu_id: structureWorker?.gpu_id
                    },
                    performance: { concurrent_jobs: 1, quality_levels: ['balanced'] }
                  },
                  connected_at: new Date().toISOString(),
                  last_heartbeat: new Date().toISOString(),
                  current_jobs: [],
                  total_jobs_completed: 0,
                  total_jobs_failed: 0,
                  average_processing_time: 0,
                  uptime: 0
                } as WorkerInfo;
              });
              return (
                <MachineCard 
                  key={machine.machine_id} 
                  machine={machine} 
                  workers={machineWorkers} 
                  onDelete={undefined}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content - Job Monitoring */}
      <div className="space-y-6">
          {/* Job Queues - Two Column Layout */}
          <div className="grid grid-cols-2 gap-4">
            {/* Active Jobs (Left) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Active Jobs ({jobCounts.active})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                {activeJobsList.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">No active jobs</p>
                ) : (
                  <div className="space-y-2">
                    {activeJobsList.map((job, index) => {
                      // Debug logging to catch object rendering issues
                      if (typeof job !== 'object' || job === null) {
                        console.error('[UI] Invalid job object in activeJobsList:', {
                          job_type: typeof job,
                          job_value: job,
                          index: index
                        });
                        return null;
                      }
                      
                      // Check for unexpected nested objects that might cause React child errors
                      // Skip known legitimate object fields like payload, requirements, result, etc.
                      const knownObjectFields = ['payload', 'requirements', 'result', 'error_details', 'metadata'];
                      Object.entries(job).forEach(([key, value]) => {
                        if (typeof value === 'object' && value !== null && !Array.isArray(value) && !knownObjectFields.includes(key)) {
                          console.warn('[UI] Found unexpected nested object in job data:', {
                            job_id: job.id,
                            field: key,
                            value_type: typeof value,
                            value: value
                          });
                        }
                      });
                      
                      return (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-lg font-bold text-muted-foreground w-8">{index + 1}</span>
                        <Badge variant={
                          job.status === 'in_progress' || job.status === 'assigned' || job.status === 'accepted' ? 'secondary' : 'outline'
                        }>
                          {job.status}
                        </Badge>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{job.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.job_type} | 
                            {job.workflow_priority !== undefined ? (
                              <span className="text-blue-600 font-medium">
                                Priority: {job.workflow_priority} (workflow override from {job.priority})
                              </span>
                            ) : (
                              <span>Priority: {job.priority}</span>
                            )}
                            {job.workflow_id && (
                              <span className="text-purple-600 font-medium">
                                {` | 🔗 Workflow: ${job.workflow_id}`}
                                {(job.current_step || job.step_number) !== undefined && job.total_steps ? ` (Step ${(job.current_step || job.step_number)} of ${job.total_steps})` : ''}
                                {(job.current_step || job.step_number) !== undefined && !job.total_steps && ` (step ${(job.current_step || job.step_number)})`}
                              </span>
                            )}
                            {job.workflow_datetime && (
                              <span className="text-green-600">
                                {` | ⏱️ ${formatRelativeTime(job.workflow_datetime)} (${new Date(job.workflow_datetime).toLocaleString()})`}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        {/* Progress Display */}
                        <div className="text-right text-xs text-muted-foreground space-y-1 min-w-[160px]">
                          {job.worker_id && <p>Worker: {job.worker_id}</p>}
                          {job.progress !== undefined && (
                            <div className="space-y-1">
                              <div className="flex justify-between items-center">
                                <span className="text-xs">Progress:</span>
                                <span className="text-xs font-medium">{job.progress}%</span>
                              </div>
                              <SimpleProgress value={job.progress} className="w-full h-1.5" />
                              {job.progress_message && (
                                <p className="text-xs text-blue-600 truncate" title={job.progress_message}>
                                  {job.progress_message}
                                </p>
                              )}
                              {job.current_step && job.total_steps && (
                                <p className="text-xs">
                                  Step: {job.current_step} / {job.total_steps}
                                </p>
                              )}
                              {job.estimated_completion && (
                                <p className="text-xs text-green-600">
                                  ETA: {job.estimated_completion}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSyncJob(job.id)}
                            className="h-7 w-7 p-0"
                            title="Sync job state"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(`/workflow-debug?workflow-id=${encodeURIComponent(job.workflow_id || job.id)}`, '_blank')}
                            className="h-7 w-7 p-0 hover:bg-blue-50 hover:border-blue-200"
                            title="Debug workflow"
                          >
                            <Bug className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCancelJob(job.id)}
                            className="h-7 w-7 p-0 hover:bg-red-50 hover:border-red-200"
                            title="Cancel job"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                      );
                    })}
                </div>
              )}
            </CardContent>
          </Card>

            {/* Pending Jobs (Right) */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Pending Jobs ({jobCounts.pending})
                </CardTitle>
              </CardHeader>
              <CardContent className="max-h-96 overflow-y-auto">
                {pendingJobsList.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8 text-sm">No pending jobs</p>
                ) : (
                  <div className="space-y-2">
                    {pendingJobsList.map((job, index) => (
                      <div 
                        key={job.id} 
                        className="flex items-center justify-between p-3 border rounded cursor-pointer hover:bg-accent/50 transition-colors"
                        onClick={() => setSelectedJob(job)}
                      >
                        <div className="flex items-center gap-3 flex-1">
                          <span className="text-lg font-bold text-muted-foreground w-8">{index + 1}</span>
                          <Badge variant="outline">
                            {job.status}
                          </Badge>
                          <div className="flex-1">
                            <p className="font-medium text-sm">{job.id}</p>
                            <p className="text-xs text-muted-foreground">
                              {job.job_type} | Priority: {job.priority}
                              {job.workflow_id && ` | Workflow: ${job.workflow_id}`}
                              {job.workflow_priority !== undefined && ` | W.Priority: ${job.workflow_priority}`}
                              {job.workflow_datetime && ` | ${new Date(job.workflow_datetime).toLocaleTimeString()}`}
                              {(job.current_step || job.step_number) !== undefined && job.total_steps && ` | Step: ${(job.current_step || job.step_number)} of ${job.total_steps}`}
                              {(job.current_step || job.step_number) !== undefined && !job.total_steps && ` | Step: ${(job.current_step || job.step_number)}`}
                            </p>
                            <p className="text-xs text-muted-foreground" title={new Date(job.created_at).toLocaleString()}>
                              📅 Created: {formatRelativeTime(job.created_at)} ({new Date(job.created_at).toLocaleString()})
                            </p>
                          </div>
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancelJob(job.id);
                            }}
                            title="Cancel job"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Finished Jobs */}
          <Card>
            <CardHeader>
              <CardTitle>
                Completed Jobs ({finishedJobsPagination.totalCount || completedJobsList.length})
                {totalFinishedPages > 1 && (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    Page {currentFinishedPage} of {totalFinishedPages}
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 overflow-y-auto">
              {completedJobsList.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No completed jobs yet.</p>
              ) : (
                <div className="space-y-2">
                  {completedJobsList.map((job, index) => (
                    <div 
                      key={job.id} 
                      className="flex items-center justify-between p-2 border rounded text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => setSelectedJob(job)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-muted-foreground w-6">{index + 1}</span>
                        <Badge variant="default">
                          {job.status}
                        </Badge>
                        <div>
                          <p className="font-medium">{job.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.job_type} | 
                            {job.workflow_priority !== undefined ? (
                              <span className="text-blue-600 font-medium">
                                Priority: {job.workflow_priority} (workflow override from {job.priority})
                              </span>
                            ) : (
                              <span>Priority: {job.priority}</span>
                            )}
                            {job.workflow_id && (
                              <span className="text-purple-600 font-medium">
                                {` | 🔗 Workflow: ${job.workflow_id}`}
                                {(job.current_step || job.step_number) !== undefined && job.total_steps ? ` (Step ${(job.current_step || job.step_number)} of ${job.total_steps})` : ''}
                                {(job.current_step || job.step_number) !== undefined && !job.total_steps && ` (step ${(job.current_step || job.step_number)})`}
                              </span>
                            )}
                            {job.workflow_datetime && (
                              <span className="text-green-600">
                                {` | ⏱️ ${formatRelativeTime(job.workflow_datetime)} (${new Date(job.workflow_datetime).toLocaleString()})`}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {job.completed_at && (
                          <div>
                            <p className="font-medium text-green-600">
                              {formatRelativeTime(job.completed_at)}
                            </p>
                            <p className="text-gray-400" title={new Date(job.completed_at).toLocaleString()}>
                              {new Date(job.completed_at).toLocaleTimeString()}
                            </p>
                          </div>
                        )}
                        {job.worker_id && <p className="mt-1">Worker: {job.worker_id}</p>}
                        {!job.result && <p className="text-yellow-600 mt-1">No result</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            
            {/* Pagination Controls - Always visible at bottom */}
            {totalFinishedPages > 1 && (
              <div className="p-3 border-t bg-muted/20">
                <Pagination
                  currentPage={currentFinishedPage}
                  totalPages={totalFinishedPages}
                  onPageChange={handleFinishedJobsPageChange}
                  className="justify-center"
                />
              </div>
            )}
          </Card>

          {/* Failed Jobs */}
          <Card>
            <CardHeader>
              <CardTitle>Failed Jobs ({jobCounts.failed})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 overflow-y-auto">
              {failedJobsList.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No failed jobs yet.</p>
              ) : (
                <div className="space-y-2">
                  {failedJobsList.map((job, index) => (
                    <div 
                      key={job.id} 
                      className="flex items-center justify-between p-2 border rounded text-sm cursor-pointer hover:bg-accent/50 transition-colors"
                      onClick={() => setSelectedJob(job)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-muted-foreground w-6">{index + 1}</span>
                        <Badge variant="destructive">
                          {job.status}
                        </Badge>
                        <div>
                          <p className="font-medium">{job.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.job_type} | 
                            {job.workflow_priority !== undefined ? (
                              <span className="text-blue-600 font-medium">
                                Priority: {job.workflow_priority} (workflow override from {job.priority})
                              </span>
                            ) : (
                              <span>Priority: {job.priority}</span>
                            )}
                            {job.workflow_id && (
                              <span className="text-purple-600 font-medium">
                                {` | 🔗 Workflow: ${job.workflow_id}`}
                                {(job.current_step || job.step_number) !== undefined && job.total_steps ? ` (Step ${(job.current_step || job.step_number)} of ${job.total_steps})` : ''}
                                {(job.current_step || job.step_number) !== undefined && !job.total_steps && ` (step ${(job.current_step || job.step_number)})`}
                              </span>
                            )}
                            {job.workflow_datetime && (
                              <span className="text-green-600">
                                {` | ⏱️ ${formatRelativeTime(job.workflow_datetime)} (${new Date(job.workflow_datetime).toLocaleString()})`}
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground" title={new Date(job.created_at).toLocaleString()}>
                            📅 Created: {formatRelativeTime(job.created_at)} ({new Date(job.created_at).toLocaleString()})
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {job.worker_id && <p>Worker: {job.worker_id}</p>}
                        {job.error && <p className="text-red-500">Error: {job.error}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      {/* Cancel Job Confirmation Dialog */}
      {/* TODO: Fix AlertDialog React 19 compatibility issue */}
      {cancelJobId && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm">
          <div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg rounded-lg">
            <div className="flex flex-col space-y-2 text-center sm:text-left">
              <h2 className="text-lg font-semibold">Cancel Job</h2>
              <p className="text-sm text-muted-foreground">
                Are you sure you want to cancel job &quot;{cancelJobId}&quot;? This action cannot be undone.
                The job will be marked as failed and removed from the queue.
              </p>
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
              <button
                onClick={() => setCancelJobId(null)}
                className="mt-2 sm:mt-0 px-4 py-2 text-sm border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-md"
              >
                Keep Job
              </button>
              <button
                onClick={confirmCancelJob}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-md"
              >
                Cancel Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Machine Confirmation Dialog */}
      {/* <AlertDialog open={!!deleteMachineId} onOpenChange={() => setDeleteMachineId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete machine &quot;{deleteMachineId}&quot;? This action cannot be undone.
              The machine and all its associated workers will be permanently removed from the system.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Machine</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteMachine}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete Machine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog> */}

      {/* Job Details Modal */}
      <JobDetailsModal
        job={selectedJob}
        workers={workers}
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
      />

      {/* Add bottom padding to prevent content from being hidden behind status tray */}
      <div className="h-12" />
    </main>
  )
}

{/* Status Tray Footer - Outside main */}
function StatusTrayFooter() {
  const { connection, jobs, workers, machines } = useMonitorStore();
  
  return (
    <footer className="bg-background border-t border-border px-4 py-2 flex-shrink-0">
      <div className="max-w-7xl mx-auto flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className={`w-2 h-2 rounded-full ${
              connection.isConnected 
                ? 'bg-green-500' 
                : connection.error 
                  ? 'bg-red-500' 
                  : 'bg-yellow-500'
            }`} />
            <span className="text-muted-foreground">
              {connection.isConnected 
                ? 'Connected' 
                : connection.error 
                  ? 'Connection Failed' 
                  : 'Disconnected'}
            </span>
          </div>
          {!connection.isConnected && !connection.error && (
            <span className="text-muted-foreground">
              Auto-reconnect: Disabled - Click Connect to retry
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2 text-muted-foreground">
          <span>{workers.length} workers</span>
          <span>•</span>
          <span>{jobs.length} jobs</span>
          <span>•</span>
          <span>{machines.length} machines</span>
        </div>
      </div>
    </footer>
  )
}

export default function Page() {
  const [isJobPanelOpen, setIsJobPanelOpen] = useState(false);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <ConnectionHeader />

      {/* Main Container */}
      <div className="flex flex-1">
        {/* Left Panel */}
        <JobSubmissionPanel
          isOpen={isJobPanelOpen}
          onToggle={() => setIsJobPanelOpen(!isJobPanelOpen)}
        />

        {/* Main Content */}
        <Home isJobPanelOpen={isJobPanelOpen} />
      </div>

      {/* Footer */}
      <StatusTrayFooter />
    </div>
  )
}
