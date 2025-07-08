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
import { Plus, X } from 'lucide-react';

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

interface RequirementPair {
  id: string;
  key: string;
  value: string;
  type: 'must_have' | 'must_not_have';
}

export function JobSubmissionForm() {
  const [lastSubmission, setLastSubmission] = useState<string | null>(null);
  const [selectedJobType, setSelectedJobType] = useState('simulation');
  const [useSimulation, setUseSimulation] = useState(false);
  const [showRequirements, setShowRequirements] = useState(false);
  const [requirementPairs, setRequirementPairs] = useState<RequirementPair[]>([
    { id: '1', key: '', value: '', type: 'must_have' }
  ]);
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

      // Build requirements from key-value pairs
      const parsedRequirements = buildRequirementsObject();

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
              <Label htmlFor="step_number" className="text-xs">Step Number</Label>
              <Input
                id="step_number"
                type="number"
                min="0"
                className="h-8"
                {...register('step_number')}
                placeholder="optional"
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