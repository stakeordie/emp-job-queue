import { describe, it, expect, beforeEach } from 'vitest';
import { useMonitorStore } from '../index';
import type { WorkerStatus } from '@/types';

describe('Machine Disconnected Event Handler', () => {
  beforeEach(() => {
    // Reset the store before each test
    useMonitorStore.setState({
      machines: [],
      workers: [],
      logs: []
    });
  });

  it('should handle machine_disconnected event and update machine status to offline', () => {
    // Add a machine with workers
    useMonitorStore.getState().addMachine({
      machine_id: 'test-machine-1',
      status: 'ready',
      workers: ['worker-1', 'worker-2'],
      logs: [],
      started_at: new Date().toISOString(),
      last_activity: new Date().toISOString()
    });

    // Add workers
    useMonitorStore.getState().addWorker({
      worker_id: 'worker-1',
      status: 'idle' as WorkerStatus,
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
    });

    useMonitorStore.getState().addWorker({
      worker_id: 'worker-2',
      status: 'idle' as WorkerStatus,
      capabilities: {
        worker_id: 'worker-2',
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
    });

    // Verify initial state
    let store = useMonitorStore.getState();
    expect(store.machines).toHaveLength(1);
    expect(store.workers).toHaveLength(2);
    expect(store.machines[0].status).toBe('ready');

    // Simulate machine_disconnected event
    const disconnectedEvent = {
      type: 'machine_disconnected' as const,
      machine_id: 'test-machine-1',
      reason: 'Status timeout (30s)',
      timestamp: Date.now()
    };

    useMonitorStore.getState().handleEvent(disconnectedEvent);

    // Get updated store state
    store = useMonitorStore.getState();

    // Verify machine status is updated to offline
    const updatedMachine = store.machines.find(m => m.machine_id === 'test-machine-1');
    expect(updatedMachine?.status).toBe('offline');
    expect(updatedMachine?.workers).toHaveLength(0);

    // Verify workers are removed
    expect(store.workers).toHaveLength(0);

    // Verify log entry was added
    expect(updatedMachine?.logs).toHaveLength(1);
    expect(updatedMachine?.logs[0].message).toBe('Machine disconnected: Status timeout (30s)');
    expect(updatedMachine?.logs[0].level).toBe('warn');
    expect(updatedMachine?.logs[0].source).toBe('system');
  });

  it('should handle machine_disconnected event for non-existent machine gracefully', () => {
    const store = useMonitorStore.getState();
    
    // Simulate machine_disconnected event for non-existent machine
    const disconnectedEvent = {
      type: 'machine_disconnected' as const,
      machine_id: 'non-existent-machine',
      reason: 'Status timeout (30s)',
      timestamp: Date.now()
    };

    // This should not throw an error
    expect(() => store.handleEvent(disconnectedEvent)).not.toThrow();
    
    // Verify no machines were added
    expect(store.machines).toHaveLength(0);
    expect(store.workers).toHaveLength(0);
  });

  it('should handle machine_disconnected event without reason', () => {
    // Add a machine
    useMonitorStore.getState().addMachine({
      machine_id: 'test-machine-1',
      status: 'ready',
      workers: [],
      logs: [],
      started_at: new Date().toISOString(),
      last_activity: new Date().toISOString()
    });

    // Simulate machine_disconnected event without reason
    const disconnectedEvent = {
      type: 'machine_disconnected' as const,
      machine_id: 'test-machine-1',
      timestamp: Date.now()
    };

    useMonitorStore.getState().handleEvent(disconnectedEvent);

    // Get updated store state
    const store = useMonitorStore.getState();

    // Verify machine status is updated to offline
    const updatedMachine = store.machines.find(m => m.machine_id === 'test-machine-1');
    expect(updatedMachine?.status).toBe('offline');

    // Verify log entry was added without reason
    expect(updatedMachine?.logs).toHaveLength(1);
    expect(updatedMachine?.logs[0].message).toBe('Machine disconnected');
  });
});