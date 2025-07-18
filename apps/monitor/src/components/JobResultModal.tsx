"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Download, ExternalLink, Copy, Check, TestTube, AlertTriangle } from "lucide-react";
import type { Job } from "@/types/job";
import { useState } from "react";

interface JobResultModalProps {
  job: Job | null;
  isOpen: boolean;
  onClose: () => void;
}

export function JobResultModal({ job, isOpen, onClose }: JobResultModalProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [empropsMode, setEmpropsMode] = useState(false);

  if (!job) return null;

  // EmProps Open API URL prediction logic
  const predictEmpropsUrls = (job: Job): string[] => {
    // Extract context information from job (if available)
    // This mimics the EmProps pattern: ${context.user.id}/${context.sessionId}/${randomUUID()}.png
    
    // For testing, we'll use job metadata or create plausible values
    const userId = job.customer_id || 'user123'; // Use customer_id as user identifier
    const sessionId = job.id.split('-').slice(0, 2).join('-'); // Use parts of job ID as session
    
    // Generate predicted filename(s) - EmProps uses randomUUID().png
    // Since we don't know the actual UUID used, we'll generate plausible ones
    const baseUrl = process.env.NEXT_PUBLIC_CLOUDFRONT_URL || 'https://cdn.emprops.example.com';
    const fileExtension = job.job_type === 'comfyui' ? 'png' : 'jpg';
    
    // Generate a few possible URLs since we can't predict the exact UUID
    const possibleUrls = [];
    for (let i = 0; i < 3; i++) {
      const fakeUuid = `${Math.random().toString(36).substring(2, 15)}-${Math.random().toString(36).substring(2, 8)}`;
      possibleUrls.push(`${baseUrl}/${userId}/${sessionId}/${fakeUuid}.${fileExtension}`);
    }
    
    return possibleUrls;
  };

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
  const predictedUrls = predictEmpropsUrls(job);

  const renderEmpropsTest = () => {
    return (
      <div className="space-y-6">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <TestTube className="h-5 w-5 text-blue-600" />
            <h3 className="font-semibold text-blue-800">EmProps Open API Test</h3>
          </div>
          <p className="text-sm text-blue-700">
            This tests the EmProps approach of constructing predictable URLs instead of using actual result data.
            The EmProps system ignores ComfyUI result data and constructs URLs based on user context.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Result */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <span>Current Monitor Result</span>
              <Badge variant="outline">Actual Data</Badge>
            </h4>
            <div className="border rounded-lg p-3 bg-gray-50">
              {resultType === 'unknown' || !job.result ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
                  <p>No result data available</p>
                  <p className="text-xs mt-1">Perfect test case for EmProps approach!</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Type: {resultType}</p>
                  {renderFullContent()}
                </div>
              )}
            </div>
          </div>

          {/* EmProps Prediction */}
          <div className="space-y-3">
            <h4 className="font-medium flex items-center gap-2">
              <span>EmProps Predicted URLs</span>
              <Badge variant="outline">Constructed</Badge>
            </h4>
            <div className="border rounded-lg p-3 bg-green-50">
              <div className="space-y-3">
                <div className="text-xs text-muted-foreground">
                  <p>Pattern: {`{baseUrl}/{userId}/{sessionId}/{randomUUID}.{ext}`}</p>
                  <p>Base URL: {process.env.NEXT_PUBLIC_CLOUDFRONT_URL || 'https://cdn.emprops.example.com'}</p>
                </div>
                {predictedUrls.map((url, index) => (
                  <div key={index} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Predicted URL {index + 1}</span>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(url, `predicted-${index}`)}
                        >
                          {copiedField === `predicted-${index}` ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(url, '_blank')}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="bg-white border rounded p-2">
                      <img 
                        src={url} 
                        alt={`EmProps prediction ${index + 1}`}
                        className="w-full h-32 object-contain bg-gray-100 rounded"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent && !parent.querySelector('.error-message')) {
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'error-message text-center py-4 text-red-500 text-xs';
                            errorDiv.innerHTML = '❌ URL not accessible<br/>(This is expected for test URLs)';
                            parent.appendChild(errorDiv);
                          }
                        }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 break-all font-mono">{url}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h4 className="font-medium text-yellow-800 mb-2">Test Results Interpretation</h4>
          <div className="text-sm text-yellow-700 space-y-1">
            <p>• <strong>If images load:</strong> EmProps approach works - URLs are predictable</p>
            <p>• <strong>If images fail:</strong> Either URLs are wrong OR files aren&apos;t uploaded to expected locations</p>
            <p>• <strong>No current result:</strong> Perfect test case - EmProps doesn&apos;t need actual result data</p>
            <p>• <strong>Compare patterns:</strong> Do actual results match the predicted URL structure?</p>
          </div>
        </div>
      </div>
    );
  };

  const renderEmpropsComparison = () => {
    return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <TestTube className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-800">EmProps Mode Active</span>
          </div>
          <p className="text-xs text-blue-700 mt-1">
            Showing side-by-side comparison of actual result vs EmProps predicted URLs
          </p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium mb-2">Actual Result</h4>
            {renderFullContent()}
          </div>
          <div>
            <h4 className="font-medium mb-2">EmProps Prediction</h4>
            <div className="space-y-2">
              {predictedUrls.slice(0, 1).map((url, index) => (
                <div key={index} className="border rounded p-2">
                  <img 
                    src={url} 
                    alt="EmProps prediction"
                    className="w-full h-48 object-contain bg-gray-100 rounded"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                      const parent = target.parentElement;
                      if (parent && !parent.querySelector('.error-message')) {
                        const errorDiv = document.createElement('div');
                        errorDiv.className = 'error-message text-center py-4 text-red-500 text-xs';
                        errorDiv.textContent = '❌ Predicted URL not accessible';
                        parent.appendChild(errorDiv);
                      }
                    }}
                  />
                  <p className="text-xs text-gray-500 mt-1 break-all">{url}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

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
      <DialogContent className="max-w-7xl w-[95vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span>Job Result: {job.id}</span>
              <Badge variant="default">{job.status}</Badge>
            </div>
            <div className="flex items-center space-x-2">
              <TestTube className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="emprops-mode" className="text-sm font-normal">EmProps Mode</Label>
              <Switch 
                id="emprops-mode"
                checked={empropsMode} 
                onCheckedChange={setEmpropsMode}
              />
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="flex-1 overflow-hidden">
          <Tabs defaultValue="result" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="result">Result</TabsTrigger>
              <TabsTrigger value="emprops">
                <div className="flex items-center gap-1">
                  <TestTube className="h-3 w-3" />
                  EmProps Test
                </div>
              </TabsTrigger>
              <TabsTrigger value="details">Job Details</TabsTrigger>
              <TabsTrigger value="raw">Raw Data</TabsTrigger>
            </TabsList>
            
            <TabsContent value="result" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4">
                  {empropsMode ? renderEmpropsComparison() : renderFullContent()}
                </div>
              </ScrollArea>
            </TabsContent>
            
            <TabsContent value="emprops" className="flex-1 overflow-hidden">
              <ScrollArea className="h-full">
                <div className="p-4">
                  {renderEmpropsTest()}
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
                  <div className="bg-gray-50 rounded border max-h-[60vh] overflow-auto">
                    <pre className="p-4 text-sm font-mono whitespace-pre-wrap">
                      {JSON.stringify(job, null, 2)}
                    </pre>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}