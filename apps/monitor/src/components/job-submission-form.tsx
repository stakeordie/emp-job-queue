"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useMonitorStore } from '@/store';

// Default payloads for different job types from original monitor
const DEFAULT_PAYLOADS = {
  simulation: {
    steps: 20,
    seed: Math.floor(Math.random() * 1000000000),
    simulation_time: 5
  },
  a1111: {
    endpoint: "txt2img",
    method: "POST",
    payload: {
      prompt: "a photo of a cat",
      negative_prompt: "blurry, bad quality",
      width: 1024,
      height: 1024,
      steps: 20,
      cfg_scale: 7,
      sampler_name: "Euler a",
      sampler_index: "Euler a",
      seed: -1,
      batch_size: 1,
      n_iter: 1,
      override_settings: {
        sd_model_checkpoint: "sd_xl_base_1.0_0.9vae.safetensors"
      },
      override_settings_restore_afterwards: true,
      send_images: true,
      save_images: false
    }
  },
  comfyui: {
    workflow: {
      "55": {
        "inputs": {
          "id": ""
        },
        "class_type": "AssetDownloader",
        "_meta": {
          "title": "AssetDownloader"
        }
      },
      "85": {
        "inputs": {
          "seed": Date.now(), // Dynamic seed to prevent caching
          "steps": 8,
          "cfg": 7,
          "sampler_name": "euler",
          "scheduler": "normal",
          "denoise": 1,
          "model": [
            "86",
            0
          ],
          "positive": [
            "87",
            0
          ],
          "negative": [
            "88",
            0
          ],
          "latent_image": [
            "89",
            0
          ]
        },
        "class_type": "KSampler",
        "_meta": {
          "title": "KSampler"
        }
      },
      "86": {
        "inputs": {
          "ckpt_name": "sd_xl_base_1.0_0.9vae.safetensors"
        },
        "class_type": "CheckpointLoaderSimple",
        "_meta": {
          "title": "Load Checkpoint"
        }
      },
      "87": {
        "inputs": {
          "text": "a beautiful landscape",
          "clip": [
            "86",
            1
          ]
        },
        "class_type": "CLIPTextEncode",
        "_meta": {
          "title": "CLIP Text Encode (Prompt)"
        }
      },
      "88": {
        "inputs": {
          "text": "",
          "clip": [
            "86",
            1
          ]
        },
        "class_type": "CLIPTextEncode",
        "_meta": {
          "title": "CLIP Text Encode (Negative Prompt)"
        }
      },
      "89": {
        "inputs": {
          "width": 512,
          "height": 512,
          "batch_size": 1
        },
        "class_type": "EmptyLatentImage",
        "_meta": {
          "title": "Empty Latent Image"
        }
      },
      "90": {
        "inputs": {
          "samples": [
            "85",
            0
          ],
          "vae": [
            "86",
            2
          ]
        },
        "class_type": "VAEDecode",
        "_meta": {
          "title": "VAE Decode"
        }
      },
      "91": {
        "inputs": {
          "filename_prefix": "EmProps_ComfyUI",
          "images": [
            "90",
            0
          ]
        },
        "class_type": "EmProps_Cloud_Storage_Saver",
        "_meta": {
          "title": "EmProps_Cloud_Storage_Saver"
        }
      }
    }
  },
  rest: {
    endpoint: "/api/generate",
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      prompt: "Example prompt",
      parameters: {
        temperature: 0.7
      }
    }
  }
};

const SERVICE_TYPES = [
  { value: 'simulation', label: 'Simulation' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'a1111', label: 'Automatic1111' },
  { value: 'comfyui-sim', label: 'ComfyUI (Simulated)' },
  { value: 'a1111-sim', label: 'A1111 (Simulated)' },
  { value: 'rest', label: 'REST API' }
];

const jobSubmissionSchema = z.object({
  job_type: z.string().min(1, 'Job type is required'),
  priority: z.number().min(0).max(100).default(50),
  payload: z.string().min(1, 'Payload is required'),
  customer_id: z.string().optional().or(z.literal('')),
  workflow_id: z.string().optional().or(z.literal('')),
  workflow_priority: z.coerce.number().min(0).max(100).optional().or(z.literal('')),
  workflow_datetime: z.coerce.number().optional().or(z.literal('')),
  step_number: z.coerce.number().min(0).optional().or(z.literal('')),
  requirements: z.string().optional().or(z.literal('')),
  batch_number: z.coerce.number().min(1).max(100),
});

type JobSubmissionData = z.infer<typeof jobSubmissionSchema>;

export function JobSubmissionForm() {
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);
  const [selectedJobType, setSelectedJobType] = useState('simulation');
  const [useSimulation, setUseSimulation] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const { submitJob, connection } = useMonitorStore();

  const form = useForm({
    resolver: zodResolver(jobSubmissionSchema),
    defaultValues: {
      job_type: 'simulation',
      priority: 50,
      payload: JSON.stringify(DEFAULT_PAYLOADS.simulation, null, 2),
      batch_number: 1,
      requirements: '',
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = form;

  // Handle job type change
  const handleJobTypeChange = (jobType: string) => {
    setSelectedJobType(jobType);
    setValue('job_type', jobType);
    
    // Update payload based on job type
    const payload = DEFAULT_PAYLOADS[jobType as keyof typeof DEFAULT_PAYLOADS];
    if (payload) {
      setValue('payload', JSON.stringify(payload, null, 2));
    }
  };

  // Watch for job_type changes to keep dropdown in sync
  const watchedJobType = watch('job_type');
  useEffect(() => {
    if (watchedJobType !== selectedJobType) {
      setSelectedJobType(watchedJobType);
    }
  }, [watchedJobType, selectedJobType]);

  const onSubmit = async (data: JobSubmissionData) => {
    try {
      // Parse JSON payload
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(data.payload);
      } catch {
        throw new Error('Invalid JSON in payload');
      }

      // Parse requirements if provided
      let parsedRequirements;
      if (data.requirements) {
        try {
          parsedRequirements = JSON.parse(data.requirements);
        } catch {
          throw new Error('Invalid JSON in requirements');
        }
      }

      const job_number = data.batch_number;

      // Determine service type based on simulation checkbox
      const serviceType = useSimulation && data.job_type !== 'simulation' 
        ? `${data.job_type}-sim` 
        : data.job_type;

      const jobData = {
        job_type: serviceType,
        service_required: serviceType,
        priority: data.priority,
        payload: parsedPayload,
        customer_id: data.customer_id && data.customer_id.trim() ? data.customer_id : undefined,
        requirements: parsedRequirements || { service_type: serviceType },
        workflow_id: data.workflow_id && data.workflow_id.trim() ? data.workflow_id : undefined,
        workflow_priority: data.workflow_priority !== '' ? data.workflow_priority : undefined,
        workflow_datetime: data.workflow_datetime !== '' ? data.workflow_datetime : undefined,
        step_number: data.step_number !== '' ? data.step_number : undefined,
      };

      for(let v = 1; v <= job_number; v++){
        submitJob(jobData);
        setLastSubmission(new Date().toLocaleTimeString());
      }
      
    } catch (error) {
      console.error('Job submission error:', error);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="space-y-2">
          <CardTitle className="text-base">Submit Job</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant={connection.isConnected ? "default" : "destructive"} className="text-xs">
              {connection.isConnected ? "Connected" : "Disconnected"}
            </Badge>
            {lastSubmission && (
              <Badge variant="secondary" className="text-xs">
                Last: {lastSubmission}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-3">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="job_type" className="text-xs">Service Type</Label>
              <Select value={selectedJobType} onValueChange={handleJobTypeChange}>
                <SelectTrigger id="job_type" size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_TYPES.filter(type => 
                    // Don't show -sim variants in dropdown, use checkbox instead
                    !type.value.endsWith('-sim')
                  ).map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="priority" className="text-xs">Priority</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="100"
                className="h-8"
                {...register('priority', { valueAsNumber: true })}
                placeholder="50"
              />
            </div>
          </div>

          {/* Simulation mode checkbox */}
          {selectedJobType !== 'simulation' && selectedJobType !== 'rest' && (
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="simulation" 
                checked={useSimulation}
                onCheckedChange={(checked) => setUseSimulation(checked as boolean)}
              />
              <Label htmlFor="simulation" className="text-xs cursor-pointer">
                Use simulation mode (testing only)
              </Label>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="payload" className="text-xs">Payload</Label>
            <textarea
              id="payload"
              {...register('payload')}
              className="w-full px-2 py-1 border rounded-md resize-y font-mono text-xs"
              rows={4}
              placeholder='{"message": "Hello from Next.js monitor"}'
            />
          </div>

          {/* Requirements section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Requirements (Optional)</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setShowRequirements(!showRequirements)}
              >
                {showRequirements ? 'Hide' : 'Show'}
              </Button>
            </div>
            
            {showRequirements && (
              <div className="space-y-2 p-2 border rounded-md bg-muted/50">
                <div className="text-xs text-muted-foreground mb-2">
                  Specify job requirements for capability matching
                </div>
                <textarea
                  {...register('requirements')}
                  className="w-full px-2 py-1 border rounded-md resize-y font-mono text-xs"
                  rows={3}
                  placeholder={JSON.stringify({
                    service_type: "comfyui",
                    hardware: {
                      gpu_memory_gb: 16,
                      gpu_model: "RTX 4090"
                    },
                    models: ["sdxl", "sd15"],
                    customer_isolation: "none"
                  }, null, 2)}
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="workflow_id" className="text-xs">Workflow ID</Label>
              <Input
                id="workflow_id"
                className="h-8"
                {...register('workflow_id')}
                placeholder="optional"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="workflow_priority" className="text-xs">W. Priority</Label>
              <Input
                id="workflow_priority"
                type="number"
                min="0"
                max="100"
                className="h-8"
                {...register('workflow_priority')}
                placeholder="0-100"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="batch_number" className="text-xs">Batch Number</Label>
              <Input
                id="batch_number"
                type="number"
                min="1"
                max="100"
                className="h-8"
                {...register('batch_number')}
                placeholder="0-100"
              />
          </div>

          <div className="flex gap-2">
            <Button 
              type="submit" 
              disabled={!connection.isConnected}
              className={`flex-1 h-8 text-sm transition-all duration-200 transform ${
                !connection.isConnected
                  ? "opacity-50 cursor-not-allowed"
                  : "hover:bg-green-600 hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
              }`}
            >
              Submit Job
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => reset()}
              className="h-8 text-sm transition-all duration-200 transform hover:bg-gray-100 hover:scale-105 active:scale-95 shadow-sm hover:shadow-md"
            >
              Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}