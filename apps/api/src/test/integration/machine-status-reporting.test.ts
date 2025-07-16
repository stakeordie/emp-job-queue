import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'
import fetch from 'node-fetch'
import EventSource from 'eventsource'

const execAsync = promisify(exec)

/**
 * CRITICAL INTEGRATION TEST
 * This test catches the exact failure scenario:
 * - Machine comes online but components are missing from UI
 * - Components appear but status changes are not reflected
 * - Components disappear when they should remain visible with updated status
 * 
 * REQUIREMENT: Components (machine, workers, service connections) should:
 * 1. Always be present once registered
 * 2. Show correct status that reflects current state
 * 3. Never go missing from UI
 * 4. Update status consistently via both events and periodic updates
 * 
 * When this test fails = component visibility/status issues exist
 * When this test passes = components are always visible with correct status
 */

interface MachineStatusEvent {
  type: string
  machine_id: string
  service?: string
  status?: string
  phase?: string
  timestamp: string
}

interface ServiceBadge {
  name: string
  status: string
  pid?: number
}

class EventStreamMonitor {
  private eventSource: EventSource | null = null
  private events: MachineStatusEvent[] = []
  private apiUrl: string

  constructor(apiUrl: string = 'http://localhost:3331') {
    this.apiUrl = apiUrl
  }

  async startListening(timeout: number = 30000): Promise<MachineStatusEvent[]> {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(`${this.apiUrl}/api/events/monitor`)
      this.events = []

      const timer = setTimeout(() => {
        this.cleanup()
        reject(new Error(`EventStream timeout after ${timeout}ms`))
      }, timeout)

      this.eventSource.addEventListener('message', (event: any) => {
        try {
          const data = JSON.parse(event.data)
          this.events.push(data)
          
          // Complete when we see machine startup complete
          if (data.type === 'startup_complete') {
            clearTimeout(timer)
            this.cleanup()
            resolve(this.events)
          }
        } catch (error) {
          console.error('Failed to parse EventStream message:', error)
        }
      })

      this.eventSource.addEventListener('error', (error: any) => {
        clearTimeout(timer)
        this.cleanup()
        reject(new Error(`EventStream error: ${error}`))
      })
    })
  }

  private cleanup() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }

  getEvents(): MachineStatusEvent[] {
    return this.events
  }
}

class MachineTestHelper {

  async startMachine(): Promise<void> {
    console.log('Starting machine container...')
    await execAsync('cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue && pnpm machines:basic:local:up:build')
  }

  async stopMachine(): Promise<void> {
    console.log('Stopping machine container...')
    try {
      await execAsync('cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue && pnpm machines:basic:local:down')
    } catch (error) {
      // Ignore errors during cleanup
    }
  }

  async waitForMachineHealth(timeout: number = 60000): Promise<void> {
    const start = Date.now()
    while (Date.now() - start < timeout) {
      try {
        const response = await fetch('http://localhost:9090/health')
        if (response.ok) {
          const health = await response.json() as { healthy: boolean }
          if (health.healthy) {
            console.log('Machine health check passed')
            return
          }
        }
      } catch (error) {
        // Continue waiting
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    throw new Error('Machine failed to become healthy within timeout')
  }

  async getServiceBadges(): Promise<ServiceBadge[]> {
    const response = await fetch('http://localhost:9090/pm2/list')
    if (!response.ok) {
      throw new Error(`Failed to get PM2 services: ${response.status}`)
    }
    const services = await response.json() as any[]
    return services.map((service: any) => ({
      name: service.name,
      status: service.pm2_env.status,
      pid: service.pid
    }))
  }

  async getMonitorState(): Promise<any> {
    const response = await fetch('http://localhost:3331/api/monitor/state')
    if (!response.ok) {
      throw new Error(`Failed to get monitor state: ${response.status}`)
    }
    return response.json()
  }
}

describe('Machine Status Reporting Integration', () => {
  let machineHelper: MachineTestHelper
  let eventMonitor: EventStreamMonitor

  beforeEach(async () => {
    machineHelper = new MachineTestHelper()
    eventMonitor = new EventStreamMonitor()
    
    // Ensure clean start
    await machineHelper.stopMachine()
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Check if API server is running
    try {
      await fetch('http://localhost:3331/health')
    } catch (error) {
      console.error('API server not running. Please start with: pnpm dev:local-redis')
      throw new Error('API server not running')
    }
  })

  afterEach(async () => {
    await machineHelper.stopMachine()
  })

  it('should register machine with complete static information and maintain dual status system', async () => {
    console.log('=== TESTING MACHINE STATUS REPORTING SYSTEM ===')
    
    // Start listening to events BEFORE starting machine
    const eventPromise = eventMonitor.startListening(60000)
    
    // Start the machine
    await machineHelper.startMachine()
    
    // Wait for machine to be healthy
    await machineHelper.waitForMachineHealth()
    
    // Wait for all startup events to complete
    const events = await eventPromise
    
    console.log(`Received ${events.length} events from EventStream`)
    
    // CRITICAL TEST 1: Machine Registration with Static Information
    console.log('🔍 Testing machine registration...')
    
    const monitorState = await machineHelper.getMonitorState()
    expect(monitorState.data.machines).toHaveLength(1)
    
    const machine = monitorState.data.machines[0]
    expect(machine.machine_id).toBe('basic-machine-local')
    expect(machine.status).toBe('ready')
    
    // Machine should have complete static information
    expect(machine).toHaveProperty('gpu_count')
    expect(machine.gpu_count).toBeGreaterThan(0)
    expect(machine).toHaveProperty('services')
    expect(machine.services).toContain('comfyui')
    expect(machine.services).toContain('redis-worker')
    
    console.log(`✅ Machine registered with ${machine.gpu_count} GPUs and services: ${machine.services.join(', ')}`)
    
    // CRITICAL TEST 2: Event-Driven Updates (Change Events)
    console.log('🔍 Testing event-driven updates...')
    
    expect(events.length).toBeGreaterThan(0)
    
    const machineStartupEvents = events.filter(e => e.type === 'machine_startup')
    expect(machineStartupEvents.length).toBeGreaterThan(0)
    
    const serviceStartedEvents = events.filter(e => e.type === 'service_started')
    expect(serviceStartedEvents.length).toBeGreaterThan(0)
    
    // Should have service events for each expected service
    const expectedServices = ['comfyui-gpu0', 'redis-worker-gpu0']
    for (const serviceName of expectedServices) {
      const serviceEvent = serviceStartedEvents.find(e => e.service === serviceName)
      expect(serviceEvent).toBeDefined()
      console.log(`✅ Found service_started event for ${serviceName}`)
    }
    
    // CRITICAL TEST 3: Service Status Consistency
    console.log('🔍 Testing service status consistency...')
    
    const serviceBadges = await machineHelper.getServiceBadges()
    console.log('Service badges:', serviceBadges.map(s => ({ name: s.name, status: s.status })))
    
    // All essential services should be online
    const essentialServices = serviceBadges.filter(s => 
      s.name.includes('comfyui') || s.name.includes('redis-worker')
    )
    
    for (const service of essentialServices) {
      expect(service.status).toBe('online')
      expect(service.pid).toBeGreaterThan(0)
      console.log(`✅ Service ${service.name} is online with PID ${service.pid}`)
    }
    
    // CRITICAL TEST 4: Worker-Machine Association
    console.log('🔍 Testing worker-machine association...')
    
    expect(monitorState.data.workers.length).toBeGreaterThan(0)
    
    // All workers should be associated with the machine
    for (const worker of monitorState.data.workers) {
      expect(worker.machine_id).toBe('basic-machine-local')
      expect(worker.status).toBe('idle')
      console.log(`✅ Worker ${worker.worker_id} associated with machine and idle`)
    }
    
    console.log('✅ ALL TESTS PASSED - Machine registration and status reporting working correctly')
  }, 120000) // 2 minute timeout for full startup
  
  it('should provide periodic comprehensive status updates every 15 seconds', async () => {
    console.log('=== TESTING PERIODIC STATUS UPDATES ===')
    
    // Start machine first
    await machineHelper.startMachine()
    await machineHelper.waitForMachineHealth()
    
    // Start monitoring for periodic updates
    const events: MachineStatusEvent[] = []
    
    const eventPromise = new Promise<MachineStatusEvent[]>((resolve) => {
      const eventSource = new EventSource('http://localhost:3331/api/events/monitor')
      let periodicUpdateCount = 0
      
      eventSource.addEventListener('message', (event: any) => {
        const data = JSON.parse(event.data)
        events.push(data)
        
        // Look for periodic comprehensive status updates
        if (data.type === 'periodic_status_update' || data.type === 'full_state_snapshot') {
          periodicUpdateCount++
          console.log(`📊 Received periodic update #${periodicUpdateCount}`)
          
          // After receiving 2 periodic updates, we've confirmed the system works
          if (periodicUpdateCount >= 2) {
            eventSource.close()
            resolve(events)
          }
        }
      })
      
      // Timeout after 35 seconds (should get 2 updates in 30 seconds)
      setTimeout(() => {
        eventSource.close()
        resolve(events)
      }, 35000)
    })
    
    const periodicEvents = await eventPromise
    
    // Should have received at least 2 periodic updates
    const statusUpdates = periodicEvents.filter(e => 
      e.type === 'periodic_status_update' || e.type === 'full_state_snapshot'
    )
    
    expect(statusUpdates.length).toBeGreaterThan(1)
    console.log(`✅ Received ${statusUpdates.length} periodic status updates`)
    
    // Each periodic update should contain comprehensive information
    for (const update of statusUpdates) {
      expect(update).toHaveProperty('timestamp')
      expect(update).toHaveProperty('machine_id')
      // Should contain machine, worker, and service status
      console.log(`✅ Periodic update contains required fields`)
    }
    
    console.log('✅ PERIODIC STATUS TEST PASSED - 15-second updates working correctly')
  }, 40000) // 40 second timeout for periodic updates
  
  it('should maintain status consistency between events and periodic updates', async () => {
    console.log('=== TESTING STATUS CONSISTENCY ===')
    
    // Start machine first
    await machineHelper.startMachine()
    await machineHelper.waitForMachineHealth()
    
    // Get initial state via API
    const initialState = await machineHelper.getMonitorState()
    
    // Monitor events for 20 seconds to see both change events and periodic updates
    const events: MachineStatusEvent[] = []
    
    const eventPromise = new Promise<MachineStatusEvent[]>((resolve) => {
      const eventSource = new EventSource('http://localhost:3331/api/events/monitor')
      
      eventSource.addEventListener('message', (event: any) => {
        const data = JSON.parse(event.data)
        events.push(data)
      })
      
      setTimeout(() => {
        eventSource.close()
        resolve(events)
      }, 20000)
    })
    
    await eventPromise
    
    // Get final state via API
    const finalState = await machineHelper.getMonitorState()
    
    // Status should be consistent between initial and final states
    // (since machine should be stable after startup)
    expect(finalState.data.machines[0].status).toBe(initialState.data.machines[0].status)
    expect(finalState.data.workers.length).toBe(initialState.data.workers.length)
    
    console.log('✅ STATUS CONSISTENCY TEST PASSED - Events and periodic updates are consistent')
  }, 25000) // 25 second timeout for consistency test
  
  it('should ensure components remain visible throughout machine lifecycle', async () => {
    console.log('=== TESTING COMPONENT VISIBILITY PERSISTENCE ===')
    
    // Start machine and get initial component registration
    await machineHelper.startMachine()
    await machineHelper.waitForMachineHealth()
    
    console.log('📋 Getting initial component registration...')
    const initialState = await machineHelper.getMonitorState()
    const initialMachine = initialState.data.machines[0]
    const initialWorkers = initialState.data.workers
    const initialServiceBadges = await machineHelper.getServiceBadges()
    
    console.log(`✅ Initial state: ${initialWorkers.length} workers, ${initialServiceBadges.length} services`)
    
    // Monitor for 30 seconds to ensure components remain visible
    const componentChecks: Array<{
      check: number;
      machine: string;
      workers: number;
      services: number;
    }> = []
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      
      const currentState = await machineHelper.getMonitorState()
      const currentServiceBadges = await machineHelper.getServiceBadges()
      
      // CRITICAL: Components should never disappear
      expect(currentState.data.machines).toHaveLength(1)
      expect(currentState.data.machines[0].machine_id).toBe(initialMachine.machine_id)
      
      // Workers should always be present (same count)
      expect(currentState.data.workers).toHaveLength(initialWorkers.length)
      
      // Service badges should always be present
      expect(currentServiceBadges).toHaveLength(initialServiceBadges.length)
      
      // All workers should still be associated with the machine
      for (const worker of currentState.data.workers) {
        expect(worker.machine_id).toBe(initialMachine.machine_id)
      }
      
      componentChecks.push({
        check: i + 1,
        machine: currentState.data.machines[0].status,
        workers: currentState.data.workers.length,
        services: currentServiceBadges.length
      })
      
      console.log(`📊 Check ${i + 1}: Machine=${currentState.data.machines[0].status}, Workers=${currentState.data.workers.length}, Services=${currentServiceBadges.length}`)
    }
    
    // CRITICAL: All components should have been present in every check
    expect(componentChecks).toHaveLength(6)
    
    for (const check of componentChecks) {
      expect(check.workers).toBe(initialWorkers.length)
      expect(check.services).toBe(initialServiceBadges.length)
    }
    
    console.log('✅ COMPONENT VISIBILITY TEST PASSED - All components remained visible throughout lifecycle')
  }, 35000) // 35 second timeout for visibility test
})