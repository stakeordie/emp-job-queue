"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, ExternalLink, Copy, Check } from "lucide-react";
import type { Job } from "@/types/job";
import { useState } from "react";

interface JobResultModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JobResultModal({ job, isOpen, onClose }: JobResultModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!job) return null;

  // Determine result display type
  const getResultType = (result: unknown): 'image' | 'video' | 'text' | 'json' | 'url' | 'unknown' => {
    if (typeof result === 'string') {
      try {
        const url = new URL(result);
        if (url.pathname.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) return 'image';
        if (url.pathname.match(/\.(mp4|webm|ogg|mov|avi)$/i)) return 'video';
        return 'url';
      } catch {
        return 'text';
      }
    }
    
    if (typeof result === 'object' && result !== null) {
      const resultObj = result as Record<string, unknown>;
      if (resultObj.image_url || resultObj.images || resultObj.output_image) return 'image';
      if (resultObj.video_url || resultObj.videos || resultObj.output_video) return 'video';
      return 'json';
    }
    
    return 'unknown';
  };

  // Extract displayable content from result
  const getDisplayableContent = (result: unknown, type: string): string[] => {
    if (type === 'image') {
      if (typeof result === 'string') return [result];
      
      const resultObj = result as Record<string, unknown>;
      if (resultObj.image_url) return [resultObj.image_url as string];
      if (resultObj.images && Array.isArray(resultObj.images)) return resultObj.images as string[];
      if (resultObj.output_image) return [resultObj.output_image as string];
      if (resultObj.outputs && Array.isArray(resultObj.outputs)) {
        return resultObj.outputs.filter(url => typeof url === 'string');
      }
    }
    
    if (type === 'video') {
      if (typeof result === 'string') return [result];
      
      const resultObj = result as Record<string, unknown>;
      if (resultObj.video_url) return [resultObj.video_url as string];
      if (resultObj.videos && Array.isArray(resultObj.videos)) return resultObj.videos as string[];
      if (resultObj.output_video) return [resultObj.output_video as string];
    }
    
    return [];
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const downloadContent = (url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resultType = getResultType(job.result);
  const content = getDisplayableContent(job.result, resultType);

  const renderFullContent = () => {
    switch (resultType) {
      case 'image':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {content.map((url, index) => (
                <div key={index} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Image {index + 1}</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(url, `image-${index}`)}
                      >
                        {copiedField === `image-${index}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadContent(url, `result-${job.id}-${index + 1}.jpg`)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(url, '_blank')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <img 
                      src={url} 
                      alt={`Result ${index + 1}`}
                      className="w-full h-auto max-h-96 object-contain"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 break-all">{url}</p>
                </div>
              ))}
            </div>
          </div>
        );
      
      case 'video':
        return (
          <div className="space-y-4">
            {content.map((url, index) => (
              <div key={index} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Video {index + 1}</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(url, `video-${index}`)}
                    >
                      {copiedField === `video-${index}` ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadContent(url, `result-${job.id}-${index + 1}.mp4`)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden">
                  <video 
                    src={url}
                    controls
                    className="w-full h-auto max-h-96"
                    onError={(e) => {
                      const target = e.target as HTMLVideoElement;
                      target.style.display = 'none';
                    }}
                  />
                </div>
                <p className="text-xs text-gray-500 break-all">{url}</p>
              </div>
            ))}
          </div>
        );
      
      case 'text':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Text Result</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(String(job.result), 'text')}
              >
                {copiedField === 'text' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <ScrollArea className="h-96">
              <pre className="bg-gray-50 p-4 rounded text-sm font-mono whitespace-pre-wrap">
                {String(job.result)}
              </pre>
            </ScrollArea>
          </div>
        );
      
      case 'json':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">JSON Result</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(JSON.stringify(job.result, null, 2), 'json')}
              >
                {copiedField === 'json' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <ScrollArea className="h-96">
              <pre className="bg-gray-50 p-4 rounded text-sm font-mono whitespace-pre-wrap">
                {JSON.stringify(job.result, null, 2)}
              </pre>
            </ScrollArea>
          </div>
        );
      
      case 'url':
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">URL Result</span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(String(job.result), 'url')}
                >
                  {copiedField === 'url' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(String(job.result), '_blank')}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="bg-gray-50 p-4 rounded">
              <a 
                href={String(job.result)} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline break-all"
              >
                {String(job.result)}
              </a>
            </div>
          </div>
        );
      
      default:
        return (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Result ({typeof job.result})</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyToClipboard(String(job.result), 'unknown')}
              >
                {copiedField === 'unknown' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <ScrollArea className="h-96">
              <pre className="bg-gray-50 p-4 rounded text-sm font-mono whitespace-pre-wrap">
                {String(job.result)}
              </pre>
            </ScrollArea>
          </div>
        );
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl w-[90vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>Job Result: {job.id}</span>
            <Badge variant="default">{job.status}</Badge>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="result" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="result">Result</TabsTrigger>
              <TabsTrigger value="details">Job Details</TabsTrigger>
              <TabsTrigger value="raw">Raw Data</TabsTrigger>
            </TabsList>
            
            <TabsContent value="result" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4">
                  {renderFullContent()}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="details" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-sm mb-2">Job Information</h4>
                      <div className="space-y-1 text-sm">
                        <p><span className="font-medium">ID:</span> {job.id}</p>
                        <p><span className="font-medium">Type:</span> {job.job_type}</p>
                        <p><span className="font-medium">Status:</span> {job.status}</p>
                        <p><span className="font-medium">Priority:</span> {job.priority}</p>
                        <p><span className="font-medium">Worker:</span> {job.worker_id || 'N/A'}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-medium text-sm mb-2">Timestamps</h4>
                      <div className="space-y-1 text-sm">
                        <p><span className="font-medium">Created:</span> {new Date(job.created_at).toLocaleString()}</p>
                        {job.started_at && <p><span className="font-medium">Started:</span> {new Date(job.started_at).toLocaleString()}</p>}
                        {job.completed_at && <p><span className="font-medium">Completed:</span> {new Date(job.completed_at).toLocaleString()}</p>}
                        {job.failed_at && <p><span className="font-medium">Failed:</span> {new Date(job.failed_at).toLocaleString()}</p>}
                      </div>
                    </div>
                  </div>
                  
                  {job.progress !== undefined && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">Progress</h4>
                      <div className="space-y-1 text-sm">
                        <p><span className="font-medium">Progress:</span> {job.progress}%</p>
                        {job.progress_message && <p><span className="font-medium">Message:</span> {job.progress_message}</p>}
                        {job.current_step && <p><span className="font-medium">Current Step:</span> {job.current_step}</p>}
                        {job.total_steps && <p><span className="font-medium">Total Steps:</span> {job.total_steps}</p>}
                      </div>
                    </div>
                  )}
                  
                  {job.error && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">Error</h4>
                      <pre className="bg-red-50 p-2 rounded text-sm text-red-700 whitespace-pre-wrap">
                        {job.error}
                      </pre>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="raw" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Complete Job Object</span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(JSON.stringify(job, null, 2), 'job')}
                    >
                      {copiedField === 'job' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <pre className="bg-gray-50 p-4 rounded text-sm font-mono whitespace-pre-wrap">
                    {JSON.stringify(job, null, 2)}
                  </pre>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}