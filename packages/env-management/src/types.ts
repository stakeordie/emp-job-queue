import { z } from 'zod';

export const ComponentSchema = z.object({
  redis: z.string(),
  api: z.string(),
  machine: z.string(),
  monitor: z.string(),
  comfy: z.string(),
});

export const ValidationSchema = z.object({
  required_services: z.array(z.string()).optional(),
  port_conflicts: z.array(z.number()).optional(),
  network_access: z.array(z.string()).optional(),
  warnings: z.array(z.string()).optional(),
});

export const ProfileSchema = z.object({
  name: z.string(),
  description: z.string(),
  components: ComponentSchema,
  secrets: z.array(z.string()).optional(),
  validation: ValidationSchema.optional(),
});

export type Components = z.infer<typeof ComponentSchema>;
export type Validation = z.infer<typeof ValidationSchema>;
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
