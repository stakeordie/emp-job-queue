/**
 * Base Machine Docker Compose Interface
 * Foundation image that other machine types extend from
 */

export const BaseMachineComposeInterface = {
  name: "base_machine",
  location: "apps/machine",
  file_name: "docker-compose.base.yml",
  dockerfile: "Dockerfile.base",
  
  services: [],
  
  environment: {
    "MACHINE_TYPE": "base"
  }
};