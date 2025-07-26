/**
 * GPU Machine Docker Compose Interface  
 * Container for GPU workloads (ComfyUI, AI model inference)
 */

export const GpuMachineComposeInterface = {
  name: "gpu_machine",
  location: "apps/machine", 
  file_name: "docker-compose.gpu.yml",
  dockerfile: "Dockerfile.gpu",
  
  ports: {
    always: [
      "9090:9090"   // Health check endpoint - always available
    ],
    conditional: [
      {
        condition: "MACHINE_EXPOSE_PORTS",
        when_true: [
          "8299:8299"   // API services
        ],
        when_false: []  // No additional ports when not exposing
      }
    ]
  },
  
  conditionals: {
    ports: {
      condition: "MACHINE_EXPOSE_PORTS",
      include_when: "true"  // Only include ports section when MACHINE_EXPOSE_PORTS=true
    }
  },
  

  gpu: "MACHINE_HAS_GPU",  // GPU access required
  
  environment: {
    "MACHINE_TYPE": "MACHINE_TYPE"
  }
};