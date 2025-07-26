/**
 * API Machine Docker Compose Interface
 * Container for API-only workloads (OpenAI, Replicate, RunPod, etc.)
 */

export const ApiMachineComposeInterface = {
  name: "api_machine",
  location: "apps/machine",
  file_name: "docker-compose.api.yml",
  dockerfile: "Dockerfile.api",
  
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

  gpu: "MACHINE_HAS_GPU",  // No GPU needed for API machine
  
  environment: {
    "MACHINE_TYPE": "api"
  }
};