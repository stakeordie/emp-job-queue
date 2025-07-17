"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { PanelLeftOpen, PanelLeftClose } from "lucide-react"
import { JobSubmissionForm } from "@/components/job-submission-form"
import { useMonitorStore } from "@/store"
import { useMemo } from "react"

interface JobSubmissionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function JobSubmissionPanel({ isOpen, onToggle }: JobSubmissionPanelProps) {
  const { jobs } = useMonitorStore();

  // Memoize recent jobs (last 5 for the panel)
  const recentJobs = useMemo(() => 
    jobs
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 5),
    [jobs]
  );

  return (
    <div className={`relative flex-shrink-0 transition-all duration-300 ease-in-out ${
      isOpen ? 'w-96' : 'w-12'
    }`}>
      {/* Always visible tray (collapsed state) */}
      <div 
        className={`absolute inset-0 w-12 bg-background border-r transition-opacity duration-300 ease-in-out ${
          isOpen ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }`}
      >
        <div className="flex flex-col h-full items-center">
          <div className="p-4">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onToggle}
              className="h-10 w-10 p-0"
              title="Open job submission panel"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      
      {/* Sliding Panel - Full panel when open */}
      <div 
        className={`absolute inset-0 w-96 bg-background border-r transition-opacity duration-300 ease-in-out ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div>
              <h2 className="text-lg font-semibold">Job Submission</h2>
              <p className="text-sm text-muted-foreground">
                Submit and monitor jobs
              </p>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={onToggle}
              className="h-10 w-10 p-0"
              title="Close job submission panel"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Job Submission Form */}
            <JobSubmissionForm />

            {/* Recent Jobs */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Recent Jobs ({recentJobs.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-3">
                {recentJobs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4 text-xs">No jobs submitted yet</p>
                ) : (
                  <div className="space-y-2">
                    {recentJobs.map((job, index) => (
                      <div key={job.id} className="flex items-center justify-between p-2 border rounded text-xs">
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-xs font-medium text-muted-foreground w-4">{index + 1}</span>
                          <Badge variant={
                            job.status === 'completed' ? 'default' :
                            job.status === 'failed' ? 'destructive' :
                            job.status === 'processing' || job.status === 'active' ? 'secondary' :
                            'outline'
                          } className="text-xs px-1 py-0">
                            {job.status}
                          </Badge>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs truncate">{job.id}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {job.job_type} | P:{job.priority}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right text-xs text-muted-foreground">
                          {job.progress !== undefined && (
                            <p>{job.progress}%</p>
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
        </div>
      </div>
    </div>
  );
}