"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { JobSubmissionForm } from "@/components/job-submission-form"
import { useMonitorStore } from "@/store"
import { useMemo } from "react"
import Link from "next/link"

export default function ClientTestPage() {
  const { connection, jobs } = useMonitorStore();

  // Memoize job counts to avoid recalculating on every render
  const jobCounts = useMemo(() => ({
    active: jobs.filter(job => job.status === 'active' || job.status === 'processing').length,
    pending: jobs.filter(job => job.status === 'pending').length,
    completed: jobs.filter(job => job.status === 'completed').length,
    failed: jobs.filter(job => job.status === 'failed').length,
  }), [jobs]);

  // Memoize recent jobs (last 10)
  const recentJobs = useMemo(() => 
    jobs
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 10),
    [jobs]
  );

  return (
    <main className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Monitor
          </Button>
        </Link>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Client Test Page</h1>
          <p className="text-sm text-muted-foreground">
            Submit jobs and test the worker system
          </p>
        </div>
      </div>

      {/* Connection Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connection Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Badge variant={connection.isConnected ? "default" : "destructive"}>
              {connection.isConnected ? "Connected" : "Disconnected"}
            </Badge>
            {connection.error && (
              <div className="text-red-600 text-sm">
                {connection.error}
              </div>
            )}
          </div>
          {!connection.isConnected && (
            <div className="text-sm text-muted-foreground">
              Go back to the main monitor page to connect to the system before submitting jobs.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{jobCounts.active}</div>
            <div className="text-sm text-muted-foreground">Active Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{jobCounts.pending}</div>
            <div className="text-sm text-muted-foreground">Pending Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{jobCounts.completed}</div>
            <div className="text-sm text-muted-foreground">Completed Jobs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-red-600">{jobCounts.failed}</div>
            <div className="text-sm text-muted-foreground">Failed Jobs</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content - Job Submission and Recent Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Side - Job Submission */}
        <div>
          <JobSubmissionForm />
        </div>

        {/* Right Side - Recent Jobs */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Jobs ({recentJobs.length})</CardTitle>
          </CardHeader>
          <CardContent className="max-h-96 overflow-y-auto">
            {recentJobs.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No jobs submitted yet</p>
            ) : (
              <div className="space-y-2">
                {recentJobs.map((job, index) => (
                  <div key={job.id} className="flex items-center justify-between p-3 border rounded">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-sm font-medium text-muted-foreground w-6">{index + 1}</span>
                      <Badge variant={
                        job.status === 'completed' ? 'default' :
                        job.status === 'failed' ? 'destructive' :
                        job.status === 'processing' || job.status === 'active' ? 'secondary' :
                        'outline'
                      }>
                        {job.status}
                      </Badge>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{job.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {job.job_type} | Priority: {job.priority}
                          {job.workflow_id && ` | Workflow: ${job.workflow_id}`}
                        </p>
                      </div>
                    </div>
                    
                    <div className="text-right text-xs text-muted-foreground">
                      {job.worker_id && <p>Worker: {job.worker_id}</p>}
                      {job.progress !== undefined && (
                        <p>Progress: {job.progress}%</p>
                      )}
                      <p>{new Date(job.created_at).toLocaleTimeString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer Note */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">
            <strong>Note:</strong> This page is for testing job submissions and monitoring recent results. 
            For comprehensive system monitoring, machine status, and real-time updates, use the 
            <Link href="/" className="text-blue-600 hover:underline ml-1">main monitor page</Link>.
          </div>
        </CardContent>
      </Card>

      {/* Add bottom padding to prevent content from being hidden */}
      <div className="h-12" />
    </main>
  )
}