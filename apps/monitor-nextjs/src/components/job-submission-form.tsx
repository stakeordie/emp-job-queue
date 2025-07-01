"use client";

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
      "3": {
        inputs: {
          seed: 156680208700286,
          steps: 8,
          cfg: 7.5,
          sampler_name: "euler",
          scheduler: "normal",
          denoise: 1,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["5", 0]
        },
        class_type: "KSampler",
        _meta: {
          title: "KSampler"
        }
      },
      "4": {
        inputs: {
          ckpt_name: "sd_xl_base_1.0_0.9vae.safetensors"
        },
        class_type: "CheckpointLoaderSimple",
        _meta: {
          title: "Load Checkpoint"
        }
      },
      "5": {
        inputs: {
          width: 512,
          height: 512,
          batch_size: 1
        },
        class_type: "EmptyLatentImage",
        _meta: {
          title: "Empty Latent Image"
        }
      },
      "6": {
        inputs: {
          text: "a beautiful landscape",
          clip: ["4", 1]
        },
        class_type: "CLIPTextEncode",
        _meta: {
          title: "CLIP Text Encode (Prompt)"
        }
      },
      "7": {
        inputs: {
          text: "",
          clip: ["4", 1]
        },
        class_type: "CLIPTextEncode",
        _meta: {
          title: "CLIP Text Encode (Negative Prompt)"
        }
      },
      "8": {
        inputs: {
          samples: ["3", 0],
          vae: ["4", 2]
        },
        class_type: "VAEDecode",
        _meta: {
          title: "VAE Decode"
        }
      },
      "9": {
        inputs: {
          filename_prefix: "ComfyUI",
          images: ["8", 0]
        },
        class_type: "SaveImage",
        _meta: {
          title: "Save Image"
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

const JOB_TYPES = [
  { value: 'simulation', label: 'Simulation (Default)' },
  { value: 'a1111', label: 'Automatic1111' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'rest', label: 'REST API' }
];

const jobSubmissionSchema = z.object({
  job_type: z.string().min(1, 'Job type is required'),
  priority: z.number().min(0).max(100).default(50),
  payload: z.string().min(1, 'Payload is required'),
  customer_id: z.string().optional(),
  workflow_id: z.string().optional(),
  workflow_priority: z.number().min(0).max(100).optional(),
  workflow_datetime: z.number().optional(),
  step_number: z.number().min(0).optional(),
  requirements: z.string().optional(),
});

type JobSubmissionData = z.infer<typeof jobSubmissionSchema>;

export function JobSubmissionForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);
  const [selectedJobType, setSelectedJobType] = useState('simulation');
  const { submitJob, connection } = useMonitorStore();

  const form = useForm({
    resolver: zodResolver(jobSubmissionSchema),
    defaultValues: {
      job_type: 'simulation',
      priority: 50,
      payload: JSON.stringify(DEFAULT_PAYLOADS.simulation, null, 2),
    },
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = form;

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
    setIsSubmitting(true);
    
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

      const jobData = {
        job_type: data.job_type,
        priority: data.priority,
        payload: parsedPayload,
        customer_id: data.customer_id || undefined,
        requirements: parsedRequirements,
        workflow_id: data.workflow_id || undefined,
        workflow_priority: data.workflow_priority || undefined,
        workflow_datetime: data.workflow_datetime || undefined,
        step_number: data.step_number || undefined,
      };

      submitJob(jobData);
      setLastSubmission(new Date().toLocaleTimeString());
      
    } catch (error) {
      console.error('Job submission error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Submit Job</CardTitle>
            <CardDescription>
              Send a job to the queue for processing
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={connection.isConnected ? "default" : "destructive"}>
              {connection.isConnected ? "Connected" : "Disconnected"}
            </Badge>
            {lastSubmission && (
              <Badge variant="secondary">
                Last: {lastSubmission}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="job_type">Job Type</Label>
              <Select value={selectedJobType} onValueChange={handleJobTypeChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOB_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.job_type && (
                <p className="text-sm text-red-500">{errors.job_type.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="priority">Priority (0-100)</Label>
              <Input
                id="priority"
                type="number"
                min="0"
                max="100"
                {...register('priority', { valueAsNumber: true })}
                placeholder="50"
              />
              {errors.priority && (
                <p className="text-sm text-red-500">{errors.priority.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="payload">Payload (JSON)</Label>
            <textarea
              id="payload"
              {...register('payload')}
              className="w-full px-3 py-2 border rounded-md resize-y font-mono text-sm"
              rows={8}
              placeholder='{"message": "Hello from Next.js monitor"}'
            />
            {errors.payload && (
              <p className="text-sm text-red-500">{errors.payload.message}</p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="customer_id">Customer ID</Label>
              <Input
                id="customer_id"
                {...register('customer_id')}
                placeholder="optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workflow_id">Workflow ID</Label>
              <Input
                id="workflow_id"
                {...register('workflow_id')}
                placeholder="optional"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="workflow_priority">Workflow Priority</Label>
              <Input
                id="workflow_priority"
                type="number"
                min="0"
                max="100"
                {...register('workflow_priority', { valueAsNumber: true })}
                placeholder="optional"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="workflow_datetime">Workflow DateTime</Label>
              <Input
                id="workflow_datetime"
                type="number"
                {...register('workflow_datetime', { valueAsNumber: true })}
                placeholder="timestamp"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="step_number">Step Number</Label>
              <Input
                id="step_number"
                type="number"
                min="0"
                {...register('step_number', { valueAsNumber: true })}
                placeholder="0"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="requirements">Requirements (JSON)</Label>
            <textarea
              id="requirements"
              {...register('requirements')}
              className="w-full px-3 py-2 border rounded-md resize-none font-mono text-sm"
              rows={2}
              placeholder='{"gpu_memory_gb": 8, "service_types": ["comfyui"]}'
            />
            {errors.requirements && (
              <p className="text-sm text-red-500">{errors.requirements.message}</p>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button 
              type="submit" 
              disabled={isSubmitting || !connection.isConnected}
              className="flex-1"
            >
              {isSubmitting ? 'Submitting...' : 'Submit Job'}
            </Button>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => reset()}
            >
              Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}