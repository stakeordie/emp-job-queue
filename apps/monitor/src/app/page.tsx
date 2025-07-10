"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import { Play, Square, RefreshCw, X } from "lucide-react"
import { JobSubmissionForm } from "@/components/job-submission-form"
import { MachineCard } from "@/components/MachineCard"
import { JobDetailsModal } from "@/components/JobDetailsModal"
import { useMonitorStore } from "@/store"
import { useState, useMemo, useEffect } from "react"
import type { Job } from "@/types/job"

// Environment presets
const CONNECTION_PRESETS = {
  local: {
    websocket: 'http://localhost:3001',
    auth: '3u8sdj5389fj3kljsf90u',
    name: 'Local Dev'
  },
  railway: {
    websocket: 'wss://redisserver-production.up.railway.app',
    auth: '3u8sdj5389fj3kljsf90u',
    name: 'Railway (Old)'
  },
  railwaynew: {
    websocket: 'wss://emp-job-queue-production.up.railway.app',
    auth: '3u8sdj5389fj3kljsf90u',
    name: 'Railway (New)'
  }
};

export default function Home() {
  const { connection, jobs, workers, machines, connect, disconnect, syncJobState, cancelJob, deleteMachine } = useMonitorStore();
  const [websocketUrl, setWebsocketUrl] = useState(CONNECTION_PRESETS.local.websocket);
  const [authToken, setAuthToken] = useState(CONNECTION_PRESETS.local.auth);
  const [selectedPreset, setSelectedPreset] = useState('local');
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [deleteMachineId, setDeleteMachineId] = useState<string | null>(null);

  const handlePresetChange = (preset: string) => {
    setSelectedPreset(preset);
    if (CONNECTION_PRESETS[preset as keyof typeof CONNECTION_PRESETS]) {
      const config = CONNECTION_PRESETS[preset as keyof typeof CONNECTION_PRESETS];
      setWebsocketUrl(config.websocket);
      setAuthToken(config.auth);
    }
  };

  const handleConnect = () => {
    const urlWithAuth = authToken ? `${websocketUrl}?token=${encodeURIComponent(authToken)}` : websocketUrl;
    connect(urlWithAuth);
    // Remember that user wants to be connected
    localStorage.setItem('monitor-auto-connect', 'true');
  };

  const handleDisconnect = () => {
    disconnect();
    // Remember that user manually disconnected
    localStorage.setItem('monitor-auto-connect', 'false');
  };

  // Auto-connect on page load only if user hasn't manually disconnected
  useEffect(() => {
    const shouldAutoConnect = localStorage.getItem('monitor-auto-connect');
    // Default to auto-connect if no preference is stored (first time user)
    // But respect the user's choice if they've manually disconnected
    if (shouldAutoConnect !== 'false' && !connection.isConnected && websocketUrl && authToken) {
      const urlWithAuth = authToken ? `${websocketUrl}?token=${encodeURIComponent(authToken)}` : websocketUrl;
      connect(urlWithAuth);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run only on mount, ignore dependency warnings since we want this to run once

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

  const handleDeleteMachine = (machineId: string) => {
    setDeleteMachineId(machineId);
  };

  const confirmDeleteMachine = () => {
    if (deleteMachineId) {
      deleteMachine(deleteMachineId);
      setDeleteMachineId(null);
    }
  };

  // Memoize job counts to avoid recalculating on every render
  const jobCounts = useMemo(() => ({
    active: jobs.filter(job => job.status === 'active' || job.status === 'processing').length,
    pending: jobs.filter(job => job.status === 'pending').length,
    completed: jobs.filter(job => job.status === 'completed').length,
    failed: jobs.filter(job => job.status === 'failed').length,
  }), [jobs]);

  // Memoize filtered and sorted job lists
  const activeJobsList = useMemo(() => 
    jobs.filter(job => job.status === 'active' || job.status === 'processing'),
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

  const finishedJobsList = useMemo(() => 
    jobs
      .filter(job => job.status === 'completed' || job.status === 'failed')
      .sort((a, b) => {
        // Sort finished jobs by completion time (most recent first)
        const timeA = a.completed_at || a.failed_at || a.created_at;
        const timeB = b.completed_at || b.failed_at || b.created_at;
        return timeB - timeA;
      }),
    [jobs]
  );

  return (
    <main className="container mx-auto p-6 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold">Job Queue Monitor</h1>
        <p className="text-sm text-muted-foreground">
          Real-time monitoring and job submission
        </p>
      </div>

      {/* Connection Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label htmlFor="preset">Environment</Label>
              <Select value={selectedPreset} onValueChange={handlePresetChange}>
                <SelectTrigger id="preset">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CONNECTION_PRESETS).map(([key, config]) => (
                    <SelectItem key={key} value={key}>
                      {config.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="websocket-url">WebSocket URL</Label>
              <Input
                id="websocket-url"
                value={websocketUrl}
                onChange={(e) => setWebsocketUrl(e.target.value)}
                placeholder="ws://localhost:3002"
              />
            </div>
            <div>
              <Label htmlFor="auth-token">Auth Token</Label>
              <Input
                id="auth-token"
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Enter auth token"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connection.isConnected ? "default" : "destructive"}>
              {connection.isConnected ? "Connected" : "Disconnected"}
            </Badge>
            <Button
              onClick={connection.isConnected ? handleDisconnect : handleConnect}
              variant={connection.isConnected ? "destructive" : "default"}
              size="sm"
              className={`transition-all duration-200 transform ${
                connection.isConnected 
                  ? "hover:bg-red-600 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg" 
                  : "hover:bg-blue-600 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
              }`}
            >
              {connection.isConnected ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Disconnect
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Connect
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

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
              const machineWorkers = workers.filter(w => 
                machine.workers.includes(w.worker_id)
              );
              return (
                <MachineCard 
                  key={machine.machine_id} 
                  machine={machine} 
                  workers={machineWorkers} 
                  onDelete={handleDeleteMachine}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Main Content - Job Focused Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Side - Compact Job Submission (1/4 width) */}
        <div className="lg:col-span-1">
          <JobSubmissionForm />
        </div>

        {/* Right Side - Job Monitoring (3/4 width) */}
        <div className="lg:col-span-3 space-y-6">
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
                    {activeJobsList.map((job, index) => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3 flex-1">
                        <span className="text-lg font-bold text-muted-foreground w-8">{index + 1}</span>
                        <Badge variant={
                          job.status === 'processing' || job.status === 'active' ? 'secondary' : 'outline'
                        }>
                          {job.status}
                        </Badge>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{job.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.job_type} | Priority: {job.priority}
                            {job.workflow_id && ` | Workflow: ${job.workflow_id}`}
                            {job.workflow_priority !== undefined && ` | W.Priority: ${job.workflow_priority}`}
                            {job.workflow_datetime && ` | ${new Date(job.workflow_datetime).toLocaleTimeString()}`}
                            {job.step_number !== undefined && ` | Step: ${job.step_number}`}
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
                              <Progress value={job.progress} className="w-full h-1.5" />
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
                            onClick={() => handleCancelJob(job.id)}
                            className="h-7 w-7 p-0 hover:bg-red-50 hover:border-red-200"
                            title="Cancel job"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
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
                              {job.step_number !== undefined && ` | Step: ${job.step_number}`}
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
                              setCancelJobId(job.id);
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
              <CardTitle>Finished Jobs ({jobCounts.completed + jobCounts.failed})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 overflow-y-auto">
              {finishedJobsList.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No finished jobs yet.</p>
              ) : (
                <div className="space-y-2">
                  {finishedJobsList.map((job, index) => (
                    <div key={job.id} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div className="flex items-center gap-3">
                        <span className="text-base font-bold text-muted-foreground w-6">{index + 1}</span>
                        <Badge variant={
                          job.status === 'completed' ? 'default' : 'destructive'
                        }>
                          {job.status}
                        </Badge>
                        <div>
                          <p className="font-medium">{job.id}</p>
                          <p className="text-xs text-muted-foreground">
                            {job.job_type} | Priority: {job.priority}
                            {job.workflow_id && ` | Workflow: ${job.workflow_id}`}
                            {job.workflow_priority !== undefined && ` | W.Priority: ${job.workflow_priority}`}
                            {job.workflow_datetime && ` | ${new Date(job.workflow_datetime).toLocaleTimeString()}`}
                            {job.step_number !== undefined && ` | Step: ${job.step_number}`}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        {job.worker_id && <p>Worker: {job.worker_id}</p>}
                        {job.error && <p className="text-red-500">Error: {job.error}</p>}
                      </div>
                    </div>
                  ))}
                  {jobs.filter(job => job.status === 'completed' || job.status === 'failed').length > 15 && (
                    <p className="text-center text-muted-foreground text-sm">
                      Showing 15 of {jobs.filter(job => job.status === 'completed' || job.status === 'failed').length} finished jobs
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cancel Job Confirmation Dialog */}
      <AlertDialog open={!!cancelJobId} onOpenChange={() => setCancelJobId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Job</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel job &quot;{cancelJobId}&quot;? This action cannot be undone.
              The job will be marked as failed and removed from the queue.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Job</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelJob}
              className="bg-red-600 hover:bg-red-700"
            >
              Cancel Job
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Machine Confirmation Dialog */}
      <AlertDialog open={!!deleteMachineId} onOpenChange={() => setDeleteMachineId(null)}>
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
      </AlertDialog>

      {/* Job Details Modal */}
      <JobDetailsModal
        job={selectedJob}
        workers={workers}
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </main>
  )
}
