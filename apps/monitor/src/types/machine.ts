export interface Machine {
  machine_id: string;
  status: 'starting' | 'ready' | 'stopping' | 'offline' | 'disconnected';
  workers: string[]; // Array of worker IDs
  logs: MachineLog[];
  started_at?: string;
  last_activity?: string;
  health_url?: string; // Health check endpoint URL
  host_info?: {
    hostname?: string;
    ip_address?: string;
    os?: string;
    cpu_cores?: number;
    total_ram_gb?: number;
    gpu_count?: number;
  };
  services?: {
    [serviceName: string]: {
      status: string;
      health: string;
      pm2_status: string;
    };
  };
  structure?: {
    gpu_count: number;
    capabilities: string[];
    workers: Record<
      string,
      {
        worker_id: string;
        gpu_id: number;
        services: string[];
        [key: string]: unknown;
      }
    >;
  };
}

export interface MachineLog {
  id: string;
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  source?: string;
  worker_id?: string;
}
