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
import { WorkerCard } from "@/components/WorkerCard"
import { useMonitorStore } from "@/store"
import { useState } from "react"

// Environment presets
const CONNECTION_PRESETS = {
  local: {
    websocket: 'ws://localhost:3001',
    auth: '3u8sdj5389fj3kljsf90u',
    name: 'Local Dev'
  },
  'local-test': {
    websocket: 'ws://localhost:3011', 
    auth: '3u8sdj5389fj3kljsf90u',
    name: 'Local Test'
  },
  railway: {
    websocket: 'wss://redisserver-production.up.railway.app',
    auth: '3u8sdj5389fj3kljsf90u',
    name: 'Railway (Old)'
  },
  railwaynew: {
    websocket: 'wss://redisservernew-production.up.railway.app',
    auth: '3u8sdj5389fj3kljsf90u',
    name: 'Railway (New)'
  }
};

export default function Home() {
  const { connection, jobs, workers, connect, disconnect, syncJobState, cancelJob } = useMonitorStore();
  const [websocketUrl, setWebsocketUrl] = useState(CONNECTION_PRESETS.local.websocket);
  const [authToken, setAuthToken] = useState(CONNECTION_PRESETS.local.auth);
  const [selectedPreset, setSelectedPreset] = useState('local');
  const [cancelJobId, setCancelJobId] = useState<string | null>(null);

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
  };

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

  const activeJobs = jobs.filter(job => job.status === 'active' || job.status === 'processing').length;
  const completedJobs = jobs.filter(job => job.status === 'completed').length;
  const failedJobs = jobs.filter(job => job.status === 'failed').length;

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
                <SelectTrigger>
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
              onClick={connection.isConnected ? disconnect : handleConnect}
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

      {/* Workers */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Workers ({workers.length})
          </h2>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>Active Jobs: {activeJobs}</span>
            <span>Completed: {completedJobs}</span>
            <span>Failed: {failedJobs}</span>
          </div>
        </div>
        
        {workers.length === 0 ? (
          <Card className="p-8">
            <p className="text-muted-foreground text-center">No workers connected. Start some workers to see them here.</p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {workers.map((worker) => (
              <WorkerCard key={worker.id} worker={worker} />
            ))}
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
          {/* Active Job Queue */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Job Queue ({jobs.filter(job => job.status === 'pending' || job.status === 'active' || job.status === 'processing').length})</span>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Active: {activeJobs}</span>
                  <span>Completed: {completedJobs}</span>
                  <span>Failed: {failedJobs}</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="max-h-80 overflow-y-auto">
              {jobs.filter(job => job.status === 'pending' || job.status === 'active' || job.status === 'processing').length === 0 ? (
                <p className="text-muted-foreground text-center py-8">No active jobs. Submit a job to get started.</p>
              ) : (
                <div className="space-y-2">
                  {jobs
                    .filter(job => job.status === 'pending' || job.status === 'active' || job.status === 'processing')
                    .slice(0, 20)
                    .map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 border rounded">
                      <div className="flex items-center gap-3 flex-1">
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

          {/* Finished Jobs */}
          <Card>
            <CardHeader>
              <CardTitle>Finished Jobs ({jobs.filter(job => job.status === 'completed' || job.status === 'failed').length})</CardTitle>
            </CardHeader>
            <CardContent className="max-h-64 overflow-y-auto">
              {jobs.filter(job => job.status === 'completed' || job.status === 'failed').length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No finished jobs yet.</p>
              ) : (
                <div className="space-y-2">
                  {jobs
                    .filter(job => job.status === 'completed' || job.status === 'failed')
                    .slice(0, 15)
                    .map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-2 border rounded text-sm">
                      <div className="flex items-center gap-3">
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
    </main>
  )
}
