export interface Machine {
  machine_id: string;
  status: 'starting' | 'ready' | 'stopping' | 'offline';
  workers: string[]; // Array of worker IDs
  logs: MachineLog[];
  started_at?: string;
  last_activity?: string;
  host_info?: {
    hostname?: string;
    ip_address?: string;
    os?: string;
    cpu_cores?: number;
    total_ram_gb?: number;
    gpu_count?: number;
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