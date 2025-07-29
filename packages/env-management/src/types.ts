import { z } from 'zod';

export const ComponentSchema = z.object({
  redis: z.union([z.string(), z.array(z.string())]),
  api: z.union([z.string(), z.array(z.string())]),
  machine: z.union([z.string(), z.array(z.string())]),
  monitor: z.union([z.string(), z.array(z.string())]),
  comfy: z.union([z.string(), z.array(z.string())]),
  simulation: z.union([z.string(), z.array(z.string())]).optional(),
  worker: z.union([z.string(), z.array(z.string())]).optional(),
});

export const ServiceSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  filter: z.string().optional(),
  depends_on: z.array(z.string()).optional(),
  delay: z.number().optional(),
  background: z.boolean().optional(),
  env_output: z.string().optional(), // Where to write the .env file
});

// Docker Compose configuration schemas
export const DockerServiceSchema = z.object({
  image: z.string().optional(),
  build: z
    .union([
      z.string(),
      z.object({
        context: z.string(),
        dockerfile: z.string().optional(),
        args: z.record(z.string()).optional(),
      }),
    ])
    .optional(),
  environment: z.array(z.string()).optional(), // References to .env files
  env_file: z.array(z.string()).optional(), // Generated from environment references
  ports: z.array(z.string()).optional(),
  volumes: z.array(z.string()).optional(),
  depends_on: z.array(z.string()).optional(),
  platform: z.string().optional(), // For cross-architecture compatibility
  deploy: z
    .object({
      resources: z
        .object({
          reservations: z
            .object({
              devices: z
                .array(
                  z.object({
                    driver: z.string(),
                    capabilities: z.array(z.string()),
                  })
                )
                .optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  profiles: z.array(z.string()).optional(),
  condition: z.string().optional(), // For conditional inclusion
});

export const DockerComposeSchema = z.object({
  services: z.record(DockerServiceSchema),
  networks: z.record(z.any()).optional(),
  volumes: z.record(z.any()).optional(),
  profiles: z.array(z.string()).optional(),
});

export const ProfileSchema = z.object({
  name: z.string(),
  description: z.string(),
  components: ComponentSchema,
  services: z.record(ServiceSchema).optional(),
  secrets: z.array(z.string()).optional(), // Legacy - no longer used, all secrets auto-loaded
  docker: DockerComposeSchema.optional(), // New Docker configuration
  worker_connectors: z.string().optional(), // Worker-driven: "comfyui:2,openai:4"
});

export type Components = z.infer<typeof ComponentSchema>;
export type ComponentValue = string | string[];
export type Service = z.infer<typeof ServiceSchema>;
export type DockerServiceConfig = z.infer<typeof DockerServiceSchema>;
export type DockerComposeConfig = z.infer<typeof DockerComposeSchema>;
export type Profile = z.infer<typeof ProfileSchema>;

export interface EnvironmentConfig {
  [section: string]: {
    [key: string]: string;
  };
}

export interface BuildResult {
  success: boolean;
  envPath: string;
  profile?: Profile;
  errors?: string[];
  warnings?: string[];
}
