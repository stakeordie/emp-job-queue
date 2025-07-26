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

export const ProfileSchema = z.object({
  name: z.string(),
  description: z.string(),
  components: ComponentSchema,
  services: z.record(ServiceSchema).optional(),
  secrets: z.array(z.string()).optional(), // Legacy - no longer used, all secrets auto-loaded
});

export type Components = z.infer<typeof ComponentSchema>;
export type ComponentValue = string | string[];
export type Service = z.infer<typeof ServiceSchema>;
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
