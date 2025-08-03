"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMonitorStore } from "@/store";
import { useMemo, useState } from "react";
import { Eye, Image as ImageIcon, Video, FileText, Code } from "lucide-react";
import type { Job } from "@/types/job";
import { JobResultModal } from "./JobResultModal";

interface JobResultsCardProps {
  className?: string;
}

export function JobResultsCard({ className }: JobResultsCardProps) {
  const { jobs } = useMonitorStore();
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Get 10 most recent completed jobs
  const recentCompletedJobs = useMemo(() => {
    const completed = jobs
      .filter(job => job.status === 'completed')
      .sort((a, b) => {
        // Sort by completion time DESC (newest first)
        const aTime = new Date(a.completed_at || a.created_at).getTime();
        const bTime = new Date(b.completed_at || b.created_at).getTime();
        return bTime - aTime;
      })
      .slice(0, 10); // Only show 10 most recent
    
    return completed;
  }, [jobs]);


  // Determine result display type
  const getResultType = (result: unknown): 'image' | 'video' | 'text' | 'json' | 'url' | 'unknown' => {
    if (typeof result === 'string') {
      // Check if it's a URL
      try {
        const url = new URL(result);
        if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return 'image';
        if (url.pathname.match(/\.(mp4|webm|ogg|mov|avi)$/i)) return 'video';
        return 'url';
      } catch {
        // Not a valid URL, treat as text
        return 'text';
      }
    }
    
    if (typeof result === 'object' && result !== null) {
      // Check if it's an object with image/video URLs
      const resultObj = result as Record<string, unknown>;
      if (resultObj.image_url || resultObj.images || resultObj.output_image) return 'image';
      if (resultObj.video_url || resultObj.videos || resultObj.output_video) return 'video';
      return 'json';
    }
    
    return 'unknown';
  };


  const getResultIcon = (type: string) => {
    switch (type) {
      case 'image': return <ImageIcon className="h-4 w-4" />;
      case 'video': return <Video className="h-4 w-4" />;
      case 'text': return <FileText className="h-4 w-4" />;
      case 'json': return <Code className="h-4 w-4" />;
      case 'url': return <Eye className="h-4 w-4" />;
      default: return <FileText className="h-4 w-4" />;
    }
  };


  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
Recent Job Results ({recentCompletedJobs.length}/10)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {recentCompletedJobs.length === 0 ? (
          <p className="text-muted-foreground text-center py-4 text-xs">No recent completed jobs yet</p>
        ) : (
          <div className="space-y-3">
            {recentCompletedJobs.map((job, index) => {
              const resultType = getResultType(job.result);
              
              return (
                <div key={job.id} className="border rounded p-2 space-y-2">
                  {/* Job Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-medium text-muted-foreground w-4">{index + 1}</span>
                      <Badge variant="default" className="text-xs px-1 py-0">
                        {job.status}
                      </Badge>
                      <div className="flex items-center gap-1">
                        {getResultIcon(resultType)}
                        <span className="text-xs text-gray-500">
                          {resultType === 'unknown' ? 'no result' : resultType}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedJob(job)}
                        className="h-6 w-6 p-0"
                        title="View result details"
                      >
                        <Eye className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Job Info */}
                  <div className="text-xs text-muted-foreground">
                    <p className="font-medium truncate">{job.id}</p>
                    <p>
                      {job.job_type} • 
                      {job.workflow_priority !== undefined ? (
                        <span className="text-blue-600 font-medium">
                          Priority: {job.workflow_priority} (workflow)
                        </span>
                      ) : (
                        <span>Priority: {job.priority}</span>
                      )}
                      {job.workflow_id && (
                        <span className="text-purple-600 font-medium">
                          {` • 🔗 ${job.workflow_id}`}
                          {job.step_number !== undefined && job.total_steps ? ` (Step ${job.step_number} of ${job.total_steps})` : ''}
                          {job.step_number !== undefined && !job.total_steps && ` (step ${job.step_number})`}
                        </span>
                      )}
                    </p>
                    <p>{job.completed_at ? new Date(job.completed_at).toLocaleString() : 'N/A'}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
      
      {/* Job Result Modal */}
      <JobResultModal
        job={selectedJob}
        isOpen={!!selectedJob}
        onClose={() => setSelectedJob(null)}
      />
    </Card>
  );
}