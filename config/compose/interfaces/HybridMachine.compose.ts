/**
 * Hybrid Machine Docker Compose Interface
 * Container supporting both API and GPU workloads
 */

export const HybridMachineComposeInterface = {
  name: "hybrid_machine",
  location: "apps/machine",
  file_name: "docker-compose.hybrid.yml", 
  dockerfile: "Dockerfile.hybrid",
  
  services: [
    {
      name: "comfyui",
      enabled_flag: "MACHINE_ENABLE_COMFYUI",
      ports: ["8188:8188", "8189:8189"],
    },
    {
      name: "redis-workers", 
      enabled_flag: "MACHINE_ENABLE_REDIS_WORKERS",
    },
    {
      name: "api-connectors",
      enabled_flag: "MACHINE_ENABLE_API", 
    },
    {
      name: "health-server",
      ports: ["9090:9090"],
    }
  ],
  
  ports: {
    always: [
      "9090:9090"   // Health check endpoint - always available
    ],
    conditional: [
      {
        condition: "MACHINE_EXPOSE_PORTS",
        when_true: [
          "8188:8188",  // ComfyUI GPU 0
          "8189:8189",  // ComfyUI GPU 1
          "8299:8299"   // API services
        ],
        when_false: []  // No additional ports when not exposing
      }
    ]
  },
  
  gpu: "HYBRID-MACHINE_HAS_GPU",  // GPU access for ComfyUI
  
  environment: {
    "MACHINE_TYPE": "MACHINE_TYPE"
  }
};