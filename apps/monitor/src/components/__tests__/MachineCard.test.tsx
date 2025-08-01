import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MachineCard } from '../MachineCard';
import type { Machine, Worker } from '@/types';
import { WorkerStatus } from '@/types';

// Mock fetch
global.fetch = vi.fn();

describe('MachineCard', () => {
  const mockMachine: Machine = {
    machine_id: 'test-machine-1',
    status: 'ready',
    workers: ['worker-1'],
    logs: [],
    started_at: new Date().toISOString(),
    last_activity: new Date().toISOString(),
    health_url: 'http://localhost:9090/health'
  };

  const mockWorkers: Worker[] = [{
    worker_id: 'worker-1',
    status: WorkerStatus.IDLE,
    capabilities: {
      worker_id: 'worker-1',
      services: ['comfyui'],
      hardware: { gpu_memory_gb: 8, gpu_model: 'RTX 4090', ram_gb: 32 },
      performance: { concurrent_jobs: 1, quality_levels: ['balanced'] },
      customer_access: { isolation: 'none' }
    },
    current_jobs: [],
    connected_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
    total_jobs_completed: 0,
    total_jobs_failed: 0,
    average_processing_time: 0,
    uptime: 0
  }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render machine card with refresh button', () => {
    render(<MachineCard machine={mockMachine} workers={mockWorkers} />);
    
    expect(screen.getByText('test-machine-1')).toBeInTheDocument();
    expect(screen.getByTitle('Refresh machine status')).toBeInTheDocument();
  });

  it('should call refresh-status endpoint when refresh button is clicked', async () => {
    const mockResponse = {
      message: 'Status update triggered',
      machine_id: 'test-machine-1',
      timestamp: Date.now()
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse
    } as Response);

    render(<MachineCard machine={mockMachine} workers={mockWorkers} />);
    
    const refreshButton = screen.getByTitle('Refresh machine status');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:9090/refresh-status',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        }
      );
    });
  });

  it('should handle refresh-status endpoint errors gracefully', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error'
    } as Response);

    render(<MachineCard machine={mockMachine} workers={mockWorkers} />);
    
    const refreshButton = screen.getByTitle('Refresh machine status');
    fireEvent.click(refreshButton);

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to request machine status:', 
        500, 
        'Internal Server Error'
      );
    });

    consoleErrorSpy.mockRestore();
  });

  it('should show refresh button for ready and starting states', () => {
    const { rerender } = render(<MachineCard machine={mockMachine} workers={mockWorkers} />);
    expect(screen.getByTitle('Refresh machine status')).toBeInTheDocument();

    // Test with starting state
    const startingMachine = { ...mockMachine, status: 'starting' as const };
    rerender(<MachineCard machine={startingMachine} workers={mockWorkers} />);
    expect(screen.getByTitle('Refresh machine status')).toBeInTheDocument();
  });

  it('should not show refresh button for offline or disconnected states', () => {
    const offlineMachine = { ...mockMachine, status: 'offline' as const };
    const { rerender } = render(<MachineCard machine={offlineMachine} workers={mockWorkers} />);
    expect(screen.queryByTitle('Refresh machine status')).not.toBeInTheDocument();

    const disconnectedMachine = { ...mockMachine, status: 'disconnected' as const };
    rerender(<MachineCard machine={disconnectedMachine} workers={mockWorkers} />);
    expect(screen.queryByTitle('Refresh machine status')).not.toBeInTheDocument();
  });
});