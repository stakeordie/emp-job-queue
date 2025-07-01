"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select"
import { Activity, Server, Zap, Play, Square } from "lucide-react"
import { JobSubmissionForm } from "@/components/job-submission-form"
import { useMonitorStore } from "@/store"
import { useState } from "react"

// Environment presets
const CONNECTION_PRESETS = {
  local: {
    websocket: 'ws://localhost:3002',
    auth: '3u8sdj5389fj3kljsf90u',
    name: 'Local Dev'
  },
  'local-test': {
    websocket: 'ws://localhost:3012', 
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
  const { connection, jobs, workers, connect, disconnect } = useMonitorStore();
  const [websocketUrl, setWebsocketUrl] = useState(CONNECTION_PRESETS.local.websocket);
  const [authToken, setAuthToken] = useState(CONNECTION_PRESETS.local.auth);
  const [selectedPreset, setSelectedPreset] = useState('local');

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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Jobs</p>
              <p className="text-2xl font-bold">{activeJobs}</p>
            </div>
            <Activity className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Workers</p>
              <p className="text-2xl font-bold">{workers.length}</p>
            </div>
            <Server className="h-5 w-5 text-muted-foreground" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold text-green-600">{completedJobs}</p>
            </div>
            <Zap className="h-5 w-5 text-green-600" />
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Failed</p>
              <p className="text-2xl font-bold text-red-600">{failedJobs}</p>
            </div>
            <Zap className="h-5 w-5 text-red-600" />
          </div>
        </Card>
      </div>

      {/* Main Content - Side by Side Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side - Job Submission */}
        <div>
          <JobSubmissionForm />
        </div>

        {/* Right Side - Job Queue and Workers */}
        <div className="space-y-6">
          <Tabs defaultValue="jobs" className="space-y-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="jobs">Jobs ({jobs.length})</TabsTrigger>
              <TabsTrigger value="workers">Workers ({workers.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="jobs" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Job Queue</CardTitle>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                  {jobs.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No jobs yet. Submit a job to get started.</p>
                  ) : (
                    <div className="space-y-2">
                      {jobs.slice(0, 20).map((job) => (
                        <div key={job.id} className="flex items-center justify-between p-3 border rounded">
                          <div className="flex items-center gap-3">
                            <Badge variant={
                              job.status === 'completed' ? 'default' :
                              job.status === 'failed' ? 'destructive' :
                              job.status === 'processing' || job.status === 'active' ? 'secondary' :
                              'outline'
                            }>
                              {job.status}
                            </Badge>
                            <div>
                              <p className="font-medium text-sm">{job.id}</p>
                              <p className="text-xs text-muted-foreground">
                                {job.job_type} | Priority: {job.priority}
                                {job.workflow_id && ` | Workflow: ${job.workflow_id}`}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {job.worker_id && <p>Worker: {job.worker_id}</p>}
                            {job.progress !== undefined && <p>Progress: {job.progress}%</p>}
                          </div>
                        </div>
                      ))}
                      {jobs.length > 20 && (
                        <p className="text-center text-muted-foreground text-sm">
                          Showing 20 of {jobs.length} jobs
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workers" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Connected Workers</CardTitle>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                  {workers.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No workers connected.</p>
                  ) : (
                    <div className="space-y-2">
                      {workers.map((worker) => (
                        <div key={worker.id} className="flex items-center justify-between p-3 border rounded">
                          <div className="flex items-center gap-3">
                            <Badge variant={
                              worker.status === 'idle' ? 'default' :
                              worker.status === 'busy' ? 'secondary' :
                              'destructive'
                            }>
                              {worker.status}
                            </Badge>
                            <div>
                              <p className="font-medium text-sm">{worker.id}</p>
                              <p className="text-xs text-muted-foreground">
                                Services: {worker.capabilities.services.join(', ')}
                              </p>
                            </div>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            {worker.current_job_id && <p>Job: {worker.current_job_id}</p>}
                            <p>GPU: {worker.capabilities.gpu_model}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  )
}
