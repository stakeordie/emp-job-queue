"use client";

import { Button } from "@/components/ui/button"
import { PanelLeftOpen, PanelLeftClose } from "lucide-react"
import { JobSubmissionForm } from "@/components/job-submission-form"
import { JobResultsCard } from "@/components/JobResultsCard"

interface JobSubmissionPanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function JobSubmissionPanel({ isOpen, onToggle }: JobSubmissionPanelProps) {

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

            {/* Job Results */}
            <JobResultsCard />
          </div>
        </div>
      </div>
    </div>
  );
}