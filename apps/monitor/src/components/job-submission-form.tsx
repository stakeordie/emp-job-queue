"use client";

import { useState, useEffect, useCallback } from 'react';
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
import { websocketService } from '@/services/websocket';
import { Plus, X } from 'lucide-react';

// Random sentence generators for batch testing
const SUBJECTS = ['A curious robot', 'An ancient wizard', 'A space explorer', 'A brave knight', 'A clever scientist', 'A magical cat', 'A friendly dragon', 'A time traveler', 'A wise owl', 'A young artist'];
const ACTIONS = ['discovers', 'creates', 'explores', 'builds', 'paints', 'writes', 'composes', 'designs', 'invents', 'learns'];
const OBJECTS = ['a hidden treasure', 'a beautiful melody', 'a mysterious portal', 'an incredible machine', 'a stunning landscape', 'a fascinating story', 'a perfect recipe', 'a brilliant solution', 'a magical spell', 'a wonderful garden'];
const SETTINGS = ['in a enchanted forest', 'on a distant planet', 'in a bustling city', 'beneath the ocean', 'atop a mountain', 'in a cozy library', 'within a crystal cave', 'beside a flowing river', 'in a floating castle', 'under the starry sky'];

const IMAGE_SUBJECTS = ['A majestic', 'A serene', 'A vibrant', 'A mystical', 'A peaceful', 'A dramatic', 'A ethereal', 'A golden', 'A misty', 'A colorful'];
const IMAGE_OBJECTS = ['sunset over mountains', 'forest with ancient trees', 'lake reflecting clouds', 'city skyline at night', 'field of wildflowers', 'waterfall in a canyon', 'desert with sand dunes', 'beach with crashing waves', 'garden with butterflies', 'valley filled with mist'];
const IMAGE_STYLES = ['in impressionist style', 'with soft watercolors', 'in photorealistic detail', 'with dreamy lighting', 'in vintage tones', 'with rainbow colors', 'in minimalist design', 'with dramatic shadows', 'in pastel hues', 'with golden hour lighting'];

function generateRandomTextPrompt(): string {
  const subject = SUBJECTS[Math.floor(Math.random() * SUBJECTS.length)];
  const action = ACTIONS[Math.floor(Math.random() * ACTIONS.length)];
  const object = OBJECTS[Math.floor(Math.random() * OBJECTS.length)];
  const setting = SETTINGS[Math.floor(Math.random() * SETTINGS.length)];
  return `Write a creative story about how ${subject.toLowerCase()} ${action} ${object} ${setting}.`;
}

function generateRandomImagePrompt(): string {
  const subject = IMAGE_SUBJECTS[Math.floor(Math.random() * IMAGE_SUBJECTS.length)];
  const object = IMAGE_OBJECTS[Math.floor(Math.random() * IMAGE_OBJECTS.length)];
  const style = IMAGE_STYLES[Math.floor(Math.random() * IMAGE_STYLES.length)];
  return `${subject} ${object} ${style}`;
}

// Generate fresh random payload for batch jobs
function generateFreshPayload(jobType: string, useCpuMode: boolean = false): Record<string, unknown> {
  let payloadKey = jobType;
  
  // Use CPU-specific payload for ComfyUI when CPU mode is enabled
  if (jobType === 'comfyui' && useCpuMode) {
    payloadKey = 'comfyui-cpu';
  }
  
  // Generate fresh random content for OpenAI services
  if (jobType === 'openai_text') {
    return {
      prompt: generateRandomTextPrompt(),
      temperature: 0.7,
      max_tokens: 500
    };
  }
  
  if (jobType === 'openai_image') {
    return {
      prompt: generateRandomImagePrompt(),
      size: "1024x1024",
      quality: "standard",
      n: 1
    };
  }
  
  // For simulation, generate new random seed
  if (jobType === 'simulation') {
    return {
      steps: 20,
      seed: Math.floor(Math.random() * 1000000000),
      simulation_time: 5
    };
  }
  
  // For delegated jobs, return base payload
  if (jobType === 'delegated') {
    return DEFAULT_PAYLOADS.delegated;
  }
  
  // For ComfyUI, update the seed to prevent caching
  if (jobType === 'comfyui' || payloadKey === 'comfyui-cpu') {
    const basePayload = DEFAULT_PAYLOADS[payloadKey as keyof typeof DEFAULT_PAYLOADS];
    if (payloadKey === 'comfyui' && basePayload && typeof basePayload === 'object' && 'workflow' in basePayload) {
      const freshPayload = JSON.parse(JSON.stringify(basePayload));
      if (freshPayload.workflow && freshPayload.workflow["85"] && freshPayload.workflow["85"].inputs) {
        freshPayload.workflow["85"].inputs.seed = Date.now() + Math.floor(Math.random() * 1000);
      }
      return freshPayload;
    }
    return basePayload;
  }
  
  // Return default payload for other job types
  return DEFAULT_PAYLOADS[payloadKey as keyof typeof DEFAULT_PAYLOADS];
}

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
  'comfyui-cpu': {
    workflow: {
      "1": {
        "inputs": {
          "value": 1,
          "width": 512,
          "height": 512
        },
        "class_type": "SolidMask",
        "_meta": {
          "title": "SolidMask"
        }
      },
      "2": {
        "inputs": {
          "mask": [
            "1",
            0
          ]
        },
        "class_type": "MaskToImage",
        "_meta": {
          "title": "Convert Mask to Image"
        }
      },
      "3": {
        "inputs": {
          "filename_prefix": "ComfyUI",
          "images": [
            "2",
            0
          ]
        },
        "class_type": "SaveImage",
        "_meta": {
          "title": "Save Image"
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
  },
  openai_text: {
    prompt: generateRandomTextPrompt(),
    temperature: 0.7,
    max_tokens: 500
  },
  openai_image: {
    prompt: generateRandomImagePrompt(),
    size: "1024x1024",
    quality: "standard",
    n: 1
  },
  delegated: {
    service_name: "external_service",
    task_type: "processing",
    parameters: {
      wait_for_completion: true,
      timeout_seconds: 300
    },
    callback_url: "https://your-service.com/webhook",
    metadata: {}
  }
};

const SERVICE_TYPES = [
  { value: 'simulation', label: 'Simulation' },
  { value: 'comfyui', label: 'ComfyUI' },
  { value: 'a1111', label: 'Automatic1111' },
  { value: 'openai_text', label: 'OpenAI Text' },
  { value: 'openai_image', label: 'OpenAI Image' },
  { value: 'delegated', label: 'Delegated Job' },
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
  is_workflow: z.boolean().default(false),
});

type JobSubmissionData = z.infer<typeof jobSubmissionSchema>;

interface RequirementPair {
  id: string;
  key: string;
  value: string;
  type: 'must_have' | 'must_not_have';
}

export function JobSubmissionForm() {
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);
  const [selectedJobType, setSelectedJobType] = useState('simulation');
  const [useCpuMode, setUseCpuMode] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [requirementPairs, setRequirementPairs] = useState<RequirementPair[]>([
    { id: '1', key: '', value: '', type: 'must_have' }
  ]);
  const { submitJob, connection, trackSimulationWorkflow } = useMonitorStore();

  const form = useForm({
    resolver: zodResolver(jobSubmissionSchema),
    defaultValues: {
      job_type: 'simulation',
      priority: 50,
      payload: JSON.stringify(DEFAULT_PAYLOADS.simulation, null, 2),
      batch_number: 1,
      requirements: '',
      is_workflow: false,
    },
  });

  const { register, handleSubmit, reset, setValue, watch } = form;

  // Convert requirement pairs to object with positive and negative requirements
  const buildRequirementsObject = () => {
    const positiveRequirements: Record<string, unknown> = {};
    const negativeRequirements: Record<string, unknown> = {};
    
    requirementPairs.forEach(pair => {
      if (pair.key.trim() && pair.value.trim()) {
        // Try to parse value as JSON, fall back to string
        let parsedValue: unknown = pair.value;
        try {
          // Try parsing as JSON for numbers, booleans, arrays, objects
          parsedValue = JSON.parse(pair.value);
        } catch {
          // If parsing fails, keep as string
          parsedValue = pair.value;
        }
        
        // Choose the target object based on requirement type
        const targetRequirements = pair.type === 'must_have' ? positiveRequirements : negativeRequirements;
        
        // Handle nested keys like "hardware.gpu_memory_gb"
        const keys = pair.key.split('.');
        let current: Record<string, unknown> = targetRequirements;
        
        for (let i = 0; i < keys.length - 1; i++) {
          const key = keys[i];
          if (!(key in current)) {
            current[key] = {};
          }
          current = current[key] as Record<string, unknown>;
        }
        
        current[keys[keys.length - 1]] = parsedValue;
      }
    });
    
    const hasPositive = Object.keys(positiveRequirements).length > 0;
    const hasNegative = Object.keys(negativeRequirements).length > 0;
    
    if (!hasPositive && !hasNegative) {
      return undefined;
    }
    
    const result: Record<string, unknown> = {};
    if (hasPositive) {
      result.positive_requirements = positiveRequirements;
    }
    if (hasNegative) {
      result.negative_requirements = negativeRequirements;
    }
    
    return result;
  };

  // Helper functions for managing requirement pairs
  const addRequirementPair = () => {
    const newPair: RequirementPair = {
      id: Date.now().toString(),
      key: '',
      value: '',
      type: 'must_have'
    };
    setRequirementPairs([...requirementPairs, newPair]);
  };

  const removeRequirementPair = (id: string) => {
    if (requirementPairs.length > 1) {
      // Remove the pair if there are multiple pairs
      setRequirementPairs(requirementPairs.filter(pair => pair.id !== id));
    } else {
      // If it's the last pair, just clear the values instead of removing
      setRequirementPairs([{ id: '1', key: '', value: '', type: 'must_have' }]);
    }
  };

  const updateRequirementPair = (id: string, field: 'key' | 'value' | 'type', value: string) => {
    setRequirementPairs(requirementPairs.map(pair => 
      pair.id === id ? { ...pair, [field]: value } : pair
    ));
  };

  // Handle job type change
  const handleJobTypeChange = (jobType: string) => {
    setSelectedJobType(jobType);
    setValue('job_type', jobType);
    
    // Update payload based on job type and CPU mode
    updatePayloadForJobType(jobType);
  };

  // Update payload based on job type and CPU mode
  const updatePayloadForJobType = useCallback((jobType: string) => {
    let payloadKey = jobType;
    
    // Use CPU-specific payload for ComfyUI when CPU mode is enabled
    if (jobType === 'comfyui' && useCpuMode) {
      payloadKey = 'comfyui-cpu';
    }
    
    const payload = DEFAULT_PAYLOADS[payloadKey as keyof typeof DEFAULT_PAYLOADS];
    if (payload) {
      setValue('payload', JSON.stringify(payload, null, 2));
    }
  }, [useCpuMode, setValue]);

  // Watch for job_type changes to keep dropdown in sync
  const watchedJobType = watch('job_type');
  useEffect(() => {
    if (watchedJobType !== selectedJobType) {
      setSelectedJobType(watchedJobType);
    }
  }, [watchedJobType, selectedJobType]);

  // Update payload when CPU mode is toggled
  useEffect(() => {
    updatePayloadForJobType(selectedJobType);
  }, [useCpuMode, selectedJobType, updatePayloadForJobType]);

  const onSubmit = async (data: JobSubmissionData) => {
    try {
      // Parse JSON payload
      try {
        JSON.parse(data.payload);
      } catch {
        throw new Error('Invalid JSON in payload');
      }

      // Build requirements from key-value pairs
      const parsedRequirements = buildRequirementsObject();

      const batchSize = data.batch_number; // Number of workflows to create
      const stepsPerWorkflow = data.step_number !== '' ? data.step_number as number : 1; // Steps within each workflow

      // Service type is always the selected job type (CPU mode only changes payload, not service routing)
      const serviceType = data.job_type;

      // Create multiple workflows (batch)
      for(let workflowIndex = 1; workflowIndex <= batchSize; workflowIndex++){
        // For each workflow, only submit the FIRST step (step 1)
        // The UI will automatically submit subsequent steps when previous steps complete
        const freshPayload = generateFreshPayload(serviceType, useCpuMode);
        
        // Base job data that all jobs have
        const jobData: Record<string, unknown> = {
          job_type: serviceType,
          service_required: serviceType,
          priority: data.priority,
          payload: freshPayload,
          customer_id: data.customer_id && data.customer_id.trim() ? data.customer_id : undefined,
          requirements: parsedRequirements || { service_type: serviceType },
        };

        // Only include workflow fields if this is marked as a workflow
        if (data.is_workflow) {
          const baseWorkflowId = data.workflow_id && data.workflow_id.trim() ? data.workflow_id : `workflow-${Date.now()}`;
          const currentWorkflowId = baseWorkflowId;
          
          jobData.workflow_id = currentWorkflowId;
          jobData.workflow_priority = data.workflow_priority !== '' ? data.workflow_priority : undefined;
          jobData.workflow_datetime = data.workflow_datetime !== '' ? data.workflow_datetime : undefined;
          jobData.step_number = 1; // Always start with step 1
          jobData.total_steps = stepsPerWorkflow; // Tell the system how many total steps this workflow has
        }
        
        // For simulation jobs with multiple steps, register the workflow for auto-progression
        if (data.is_workflow && serviceType === 'simulation' && stepsPerWorkflow > 1) {
          trackSimulationWorkflow(jobData.workflow_id as string, {
            total_steps: stepsPerWorkflow,
            job_type: serviceType,
            priority: data.priority,
            customer_id: data.customer_id && data.customer_id.trim() ? data.customer_id : undefined,
            workflow_priority: data.workflow_priority !== '' ? data.workflow_priority : undefined,
            workflow_datetime: data.workflow_datetime !== '' ? data.workflow_datetime : undefined,
            requirements: parsedRequirements || { service_type: serviceType },
            basePayload: freshPayload,
            useCpuMode: useCpuMode
          });
          
          console.log(`Registered simulation workflow ${jobData.workflow_id} with ${stepsPerWorkflow} steps`);
        }
        
        // Submit only the first step - subsequent steps will be submitted automatically
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

          {/* CPU mode checkbox */}
          {selectedJobType === 'comfyui' && (
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="cpumode" 
                checked={useCpuMode}
                onCheckedChange={(checked) => setUseCpuMode(checked as boolean)}
              />
              <Label htmlFor="cpumode" className="text-xs cursor-pointer">
                Use CPU Mode (simple mask workflow)
              </Label>
            </div>
          )}

          {/* Is workflow checkbox */}
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="is_workflow" 
              {...register('is_workflow')}
            />
            <Label htmlFor="is_workflow" className="text-xs cursor-pointer">
              This is a workflow job
            </Label>
          </div>

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
              <div className="space-y-3 p-3 border rounded-md bg-muted/50">
                <div className="text-xs text-muted-foreground">
                  Specify job requirements for capability matching. Choose &quot;Must have&quot; for required capabilities or &quot;Must not have&quot; for capabilities that should be absent. Use dot notation for nested keys (e.g., &quot;hardware.gpu_memory_gb&quot;).
                </div>
                
                <div className="space-y-2">
                  {requirementPairs.map((pair) => (
                    <div key={pair.id} className="flex gap-2 items-center">
                      <div className="w-28">
                        <Select 
                          value={pair.type} 
                          onValueChange={(value: 'must_have' | 'must_not_have') => 
                            updateRequirementPair(pair.id, 'type', value)
                          }
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="must_have">
                              <span className="text-green-600">Must have</span>
                            </SelectItem>
                            <SelectItem value="must_not_have">
                              <span className="text-red-600">Must not have</span>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="Key (e.g., hardware.gpu_memory_gb)"
                          value={pair.key}
                          onChange={(e) => updateRequirementPair(pair.id, 'key', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex-1">
                        <Input
                          placeholder="Value (e.g., 16, true, ['model1', 'model2'])"
                          value={pair.value}
                          onChange={(e) => updateRequirementPair(pair.id, 'value', e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 hover:bg-red-100 hover:text-red-600"
                        onClick={() => removeRequirementPair(pair.id)}
                        title={requirementPairs.length === 1 ? "Clear values" : "Remove requirement"}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
                
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={addRequirementPair}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Requirement
                </Button>
                
                {/* Preview of built requirements */}
                {(() => {
                  const preview = buildRequirementsObject();
                  return preview ? (
                    <div className="mt-2 p-2 bg-background border rounded text-xs">
                      <div className="text-muted-foreground mb-1">Preview:</div>
                      <pre className="font-mono text-xs overflow-x-auto">
                        {JSON.stringify(preview, null, 2)}
                      </pre>
                    </div>
                  ) : null;
                })()}
                
                {/* Common examples */}
                <div className="text-xs text-muted-foreground">
                  <div className="font-medium mb-1">Common examples:</div>
                  <div className="space-y-1 text-xs">
                    <div className="text-green-600">✅ <strong>Must have:</strong></div>
                    <div className="ml-4"><code>hardware.gpu_memory_gb</code> → <code>16</code> (min 16GB VRAM)</div>
                    <div className="ml-4"><code>asset_type</code> → <code>&quot;video&quot;</code> (single item from worker&apos;s array)</div>
                    <div className="ml-4"><code>models</code> → <code>[&quot;sdxl&quot;, &quot;sd15&quot;]</code> (worker must have ALL these models)</div>
                    <div className="ml-4"><code>services</code> → <code>&quot;comfyui&quot;</code> (worker&apos;s services array contains this)</div>
                    
                    <div className="text-red-600 mt-2">❌ <strong>Must not have:</strong></div>
                    <div className="ml-4"><code>customer_isolation</code> → <code>&quot;strict&quot;</code> (not strict isolation)</div>
                    <div className="ml-4"><code>debugging_enabled</code> → <code>true</code> (not in debug mode)</div>
                    <div className="ml-4"><code>asset_type</code> → <code>&quot;audio&quot;</code> (worker&apos;s array must NOT contain this)</div>
                  </div>
                </div>
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
              <Label htmlFor="workflow_datetime" className="text-xs">Datetime Override</Label>
              <div className="flex gap-1">
                <Input
                  id="workflow_datetime"
                  type="number"
                  className="h-8 flex-1"
                  {...register('workflow_datetime')}
                  placeholder="unix timestamp (optional)"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2 text-xs"
                  onClick={() => setValue('workflow_datetime', Date.now())}
                  title="Set to current time"
                >
                  Now
                </Button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
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

            <div className="space-y-1">
              <Label htmlFor="step_number" className="text-xs">Steps per Workflow</Label>
              <Input
                id="step_number"
                type="number"
                min="1"
                className="h-8"
                {...register('step_number')}
                placeholder="creates 1→2→3... steps"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="batch_number" className="text-xs">Batch Size</Label>
            <Input
              id="batch_number"
              type="number"
              min="1"
              max="100"
              className="h-8"
              {...register('batch_number')}
              placeholder="creates sequential jobs"
            />
            <div className="text-xs text-muted-foreground">
              Creates multiple workflows. If &quot;Steps per Workflow&quot; is set, each workflow will have that many sequential steps.
            </div>
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

// Delegated Job Completion Component
export function DelegatedJobCompletion() {
  const { jobs, connection } = useMonitorStore();
  const [selectedJobId, setSelectedJobId] = useState('');
  const [resultData, setResultData] = useState('{"success": true, "data": "completed"}');
  const [isCompleting, setIsCompleting] = useState(false);

  // Filter delegated jobs that are still pending
  const delegatedJobs = jobs.filter(job => 
    job.job_type === 'delegated' && 
    job.status === 'pending'
  );


  const completeDelegatedJob = async () => {
    console.log('completeDelegatedJob called', { selectedJobId, isConnected: connection.isConnected });
    if (!selectedJobId) {
      console.error('No job selected for completion');
      return;
    }

    setIsCompleting(true);
    try {
      let parsedResult;
      try {
        parsedResult = JSON.parse(resultData);
      } catch {
        parsedResult = { success: true, data: resultData };
      }

      // Find the selected job to get its customer_id (like ComfyUI does)
      const selectedJob = delegatedJobs.find(job => job.id === selectedJobId);
      const jobIdentifier = selectedJob?.customer_id || selectedJobId; // Use customer_id if available, fallback to internal ID

      const message = {
        type: 'delegated_job_result' as const,
        job_id: jobIdentifier, // Use customer ID for consistency with ComfyUI pattern
        result: parsedResult,
      };

      console.log('Sending WebSocket message:', message);
      console.log('Job identifier used:', { internal_id: selectedJobId, customer_id: selectedJob?.customer_id, final_id: jobIdentifier });
      
      // Check connection status using imported websocketService
      const connectionStatus = websocketService.getConnectionStatus();
      const isConnected = websocketService.isConnected();
      
      console.log('WebSocket connection status:', {
        isConnected,
        connectionStatus
      });
      
      if (!isConnected) {
        console.error('WebSocket not connected - cannot send message');
        console.error('Connection details:', connectionStatus);
        return;
      }
      
      const success = websocketService.submitJob(message);
      console.log('WebSocket submitJob result:', success);
      
      if (success) {
        console.log('WebSocket message sent successfully');
        // Reset form on success
        setSelectedJobId('');
        setResultData('{"success": true, "data": "completed"}');
      } else {
        console.error('Failed to send WebSocket message');
        console.error('WebSocket connection details:', connectionStatus);
      }
    } catch (error) {
      console.error('Failed to complete delegated job:', error);
    } finally {
      setIsCompleting(false);
    }
  };

  if (delegatedJobs.length === 0) {
    return null; // Don't show the component if no delegated jobs
  }

  return (
    <Card className="mt-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          Complete Delegated Jobs
          <Badge variant="secondary" className="text-xs">
            {delegatedJobs.length} pending
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="delegated-job-select" className="text-xs">Select Delegated Job</Label>
            <Select value={selectedJobId} onValueChange={setSelectedJobId}>
              <SelectTrigger id="delegated-job-select" size="sm">
                <SelectValue placeholder="Choose a delegated job to complete" />
              </SelectTrigger>
              <SelectContent>
                {delegatedJobs.map((job) => (
                  <SelectItem key={job.id} value={job.id}>
                    {job.id} - {job.job_type || 'Unknown Service'} 
                    {job.workflow_id && ` (${job.workflow_id})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="result-data" className="text-xs">Result Data</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs text-green-600 border-green-200 hover:bg-green-50"
                  onClick={() => setResultData('{"success": true, "data": "completed"}')}
                >
                  ✓ Success
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs text-yellow-600 border-yellow-200 hover:bg-yellow-50"
                  onClick={() => setResultData('{"success": false, "data": "retry", "error": "Enter retry reason here"}')}
                >
                  ↻ Retry
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-xs text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setResultData('{"success": false, "data": "failed", "error": "Enter error message here"}')}
                >
                  ✗ Failed
                </Button>
              </div>
            </div>
            <textarea
              id="result-data"
              value={resultData}
              onChange={(e) => setResultData(e.target.value)}
              className="w-full px-2 py-1 border rounded-md resize-y font-mono text-xs"
              rows={3}
              placeholder='{"success": true, "data": "execution_result"}'
            />
            <div className="text-xs text-muted-foreground">
              <div className="font-medium mb-1">Quick templates:</div>
              <div className="space-y-1">
                <div className="text-green-600">✓ <strong>Success:</strong> <code>{`{"success": true, "data": "completed"}`}</code></div>
                <div className="text-yellow-600">↻ <strong>Retry:</strong> <code>{`{"success": false, "data": "retry", "error": "reason"}`}</code></div>
                <div className="text-red-600">✗ <strong>Failed:</strong> <code>{`{"success": false, "data": "failed", "error": "reason"}`}</code></div>
              </div>
            </div>
          </div>

          <Button
            onClick={completeDelegatedJob}
            disabled={!selectedJobId || !connection.isConnected || isCompleting}
            className="w-full h-8 text-sm"
          >
            {isCompleting ? 'Completing...' : 'Complete Job'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}