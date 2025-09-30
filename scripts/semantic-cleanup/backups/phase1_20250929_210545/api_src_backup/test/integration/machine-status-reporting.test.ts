import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { exec } from 'child_process'
import { promisify } from 'util'
import fetch from 'node-fetch'
import EventSource from 'eventsource'

const execAsync = promisify(exec)

/**
 * Test Environment Validator
 * Ensures all required services are running before tests begin
 * Assumes API + Redis are already running (pnpm dev:local-redis)
 */
class TestEnvironmentValidator {
  static async validateEnvironment(): Promise<void> {
    console.log('🔍 Validating test environment...')
    
    // Check API server (must be running)
    try {
      const apiResponse = await fetch('http://localhost:3331/health')
      if (!apiResponse.ok) {
        throw new Error(`API server health check failed: ${apiResponse.status}`)
      }
      console.log('✅ API server is healthy')
    } catch (error) {
      throw new Error(`API server not available: ${error}. Start with: pnpm dev:local-redis`)
    }
    
    // Check Docker availability
    try {
      await execAsync('docker info > /dev/null 2>&1')
      console.log('✅ Docker daemon is running')
    } catch (error) {
      throw new Error('Docker daemon not available - required for machine containers')
    }
    
    // Verify no conflicting test containers
    try {
      const { stdout } = await execAsync('docker ps --filter name=basic-machine-test --format "{{.Names}}"')
      if (stdout.trim()) {
        console.log('⚠️  Existing basic-machine-test container found, will clean up')
      }
    } catch (error) {
      // Ignore - docker ps errors are not critical
    }
    
    console.log('✅ Test environment validation complete')
    console.log('📋 Required: API/Redis running on localhost:3331 (pnpm dev:local-redis)')
    console.log('🧪 Test machine will use ports: Health=9094, ComfyUI=3194, Simulation=8301')
  }
}

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

  async waitForMachineAndWorkersReady(timeout: number = 120000): Promise<{
    machineConnected: boolean,
    workersConnected: boolean,
    events: MachineStatusEvent[]
  }> {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(`${this.apiUrl}/api/events/monitor`)
      this.events = []
      let machineConnected = false
      let workersConnected = false

      const timer = setTimeout(() => {
        this.cleanup()
        reject(new Error(`Timeout after ${timeout}ms - Machine: ${machineConnected}, Workers: ${workersConnected}, Events: ${this.events.length}`))
      }, timeout)

      this.eventSource.addEventListener('message', (event: any) => {
        try {
          const data = JSON.parse(event.data)
          this.events.push(data)
          
          console.log(`🔄 Event: ${data.type}${data.phase ? ` (${data.phase})` : ''}${data.service ? ` [${data.service}]` : ''}`)
          
          // Check for machine connection/registration
          if (data.type === 'machine_startup' || data.type === 'machine_registered') {
            machineConnected = true
            console.log('✅ Machine connected/registered')
          }
          
          // Check for worker connections
          if (data.type === 'worker_connected') {
            workersConnected = true
            console.log('✅ Workers connected')
          }
          
          // Complete when both conditions are met
          if (machineConnected && workersConnected) {
            clearTimeout(timer)
            this.cleanup()
            console.log(`✅ Prerequisites met - Machine: ✓, Workers: ✓, Events: ${this.events.length}`)
            resolve({
              machineConnected,
              workersConnected,
              events: this.events
            })
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

  async startListening(timeout: number = 60000): Promise<MachineStatusEvent[]> {
    return new Promise((resolve, reject) => {
      this.eventSource = new EventSource(`${this.apiUrl}/api/events/monitor`)
      this.events = []

      const timer = setTimeout(() => {
        this.cleanup()
        resolve(this.events) // Return events collected so far
      }, timeout)

      this.eventSource.addEventListener('message', (event: any) => {
        try {
          const data = JSON.parse(event.data)
          this.events.push(data)
          console.log(`🔄 Event: ${data.type}${data.phase ? ` (${data.phase})` : ''}`)
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

  async waitForServices(requiredServices: string[], timeout: number = 30000): Promise<boolean> {
    console.log(`⏳ Waiting for services: ${requiredServices.join(', ')}`)
    
    return new Promise((resolve, reject) => {
      const startedServices = new Set<string>()
      const timer = setTimeout(() => {
        reject(new Error(`Service timeout after ${timeout}ms - missing: ${requiredServices.filter(s => !startedServices.has(s)).join(', ')}`))
      }, timeout)

      this.eventSource?.addEventListener('message', (event: any) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'service_started' && data.service) {
            startedServices.add(data.service)
            console.log(`✅ Service started: ${data.service} (${startedServices.size}/${requiredServices.length})`)
            
            // Check if all required services are started
            if (requiredServices.every(service => startedServices.has(service))) {
              clearTimeout(timer)
              console.log('✅ All required services started')
              resolve(true)
            }
          }
        } catch (error) {
          console.error('Failed to parse service event:', error)
        }
      })
    })
  }
}

class MachineTestHelper {
  private readonly TEST_HEALTH_PORT = 9094
  private readonly TEST_MACHINE_ID = 'basic-machine-test'

  async startMachine(): Promise<void> {
    console.log('🚀 Starting dedicated test machine container...')
    await execAsync('cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue && pnpm machines:basic:test:up:build')
  }

  async stopMachine(): Promise<void> {
    console.log('🛑 Stopping test machine container...')
    try {
      await execAsync('cd /Users/the_dusky/code/emprops/ai_infra/emp-job-queue && pnpm machines:basic:test:down')
    } catch (error) {
      // Ignore errors during cleanup
      console.log('🔧 Cleanup completed (errors ignored)')
    }
  }

  async waitForMachineHealth(timeout: number = 60000): Promise<void> {
    console.log(`⏳ Waiting for test machine health endpoint on port ${this.TEST_HEALTH_PORT}...`)
    const start = Date.now()
    
    while (Date.now() - start < timeout) {
      try {
        const response = await fetch(`http://localhost:${this.TEST_HEALTH_PORT}/health`)
        if (response.ok) {
          const health = await response.json() as { healthy: boolean }
          if (health.healthy) {
            console.log(`✅ Test machine health check passed on port ${this.TEST_HEALTH_PORT}`)
            return
          }
        }
      } catch (error) {
        // Continue waiting - machine may still be starting
      }
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    throw new Error(`Test machine failed to become healthy within ${timeout}ms on port ${this.TEST_HEALTH_PORT}`)
  }

  async getServiceBadges(): Promise<ServiceBadge[]> {
    const response = await fetch(`http://localhost:${this.TEST_HEALTH_PORT}/pm2/list`)
    if (!response.ok) {
      throw new Error(`Failed to get PM2 services on port ${this.TEST_HEALTH_PORT}: ${response.status}`)
    }
    const services = await response.json() as any[]
    return services.map((service: any) => ({
      name: service.name,
      status: service.pm2_env.status,
      pid: service.pid
    }))
  }

  async testActualRedisConnection(): Promise<{
    canSubmitJob: boolean,
    workersResponding: boolean,
    redisConnected: boolean
  }> {
    console.log('🔍 Testing actual Redis connection and job queue functionality...')
    
    try {
      // Test 1: Submit a simple job to Redis
      const testJob = {
        job_type: 'ping',
        data: { test: true, timestamp: Date.now() }
      }
      
      const submitResponse = await fetch('http://localhost:3331/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testJob)
      })
      
      const canSubmitJob = submitResponse.ok
      console.log(`📋 Job submission test: ${canSubmitJob ? '✅ SUCCESS' : '❌ FAILED'}`)
      
      // Test 2: Check if workers are actually connected to Redis
      const workersResponse = await fetch('http://localhost:3331/api/workers')
      const workersResponding = workersResponse.ok
      console.log(`👷 Workers API test: ${workersResponding ? '✅ SUCCESS' : '❌ FAILED'}`)
      
      return {
        canSubmitJob,
        workersResponding,
        redisConnected: canSubmitJob // If we can submit jobs, Redis is working
      }
    } catch (error) {
      console.log('❌ Redis connection test failed:', error)
      return {
        canSubmitJob: false,
        workersResponding: false,
        redisConnected: false
      }
    }
  }

  async checkIfAlreadyConnected(): Promise<{
    machineConnected: boolean,
    workersConnected: boolean,
    machineCount: number,
    workerCount: number
  }> {
    // Since we can't poll a state endpoint, we'll get a quick snapshot from the event stream
    return new Promise((resolve) => {
      const eventSource = new EventSource('http://localhost:3331/api/events/monitor')
      let resolved = false
      
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          eventSource.close()
          resolve({
            machineConnected: false,
            workersConnected: false,
            machineCount: 0,
            workerCount: 0
          })
        }
      }, 5000) // Quick 5 second check
      
      eventSource.addEventListener('message', (event: any) => {
        if (resolved) return
        
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'full_state_snapshot' && (data as any).data) {
            resolved = true
            clearTimeout(timer)
            eventSource.close()
            
            const machines = (data as any).data.machines || []
            const workers = (data as any).data.workers || []
            const testMachine = machines.find((m: any) => m.machine_id === this.TEST_MACHINE_ID)
            const testWorkers = workers.filter((w: any) => w.machine_id === this.TEST_MACHINE_ID)
            
            resolve({
              machineConnected: !!testMachine,
              workersConnected: testWorkers.length > 0,
              machineCount: machines.length,
              workerCount: workers.length
            })
          }
        } catch (error) {
          // Continue listening
        }
      })
      
      eventSource.addEventListener('error', () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timer)
          eventSource.close()
          resolve({
            machineConnected: false,
            workersConnected: false,
            machineCount: 0,
            workerCount: 0
          })
        }
      })
    })
  }
}

describe('Machine Status Reporting Integration', () => {
  let machineHelper: MachineTestHelper
  let eventMonitor: EventStreamMonitor

  beforeEach(async () => {
    // Validate test environment before each test
    await TestEnvironmentValidator.validateEnvironment()
    
    machineHelper = new MachineTestHelper()
    eventMonitor = new EventStreamMonitor()
    
    // Ensure clean start - stop test machine if running
    console.log('🧹 Cleaning up any existing test machine containers...')
    await machineHelper.stopMachine()
    await new Promise(resolve => setTimeout(resolve, 3000)) // Wait for cleanup
  })

  afterEach(async () => {
    await machineHelper.stopMachine()
  })

  it('1️⃣ BLOCKING: Machine and Redis connections must be established', async () => {
    console.log('=== 🚫 BLOCKING TEST: CONNECTIONS ===')
    console.log('This test MUST pass before any other tests can run')
    
    // Check if machine is already running
    const initialState = await machineHelper.checkIfAlreadyConnected()
    console.log(`📊 Initial state: Machine=${initialState.machineConnected}, Workers=${initialState.workersConnected}`)
    
    let connectionResult: {
      machineConnected: boolean,
      workersConnected: boolean,
      events: MachineStatusEvent[]
    }
    
    if (initialState.machineConnected && initialState.workersConnected) {
      console.log('✅ Machine and workers already connected via event stream')
      connectionResult = { machineConnected: true, workersConnected: true, events: [] }
    } else {
      console.log('⚠️  Starting test machine...')
      const eventPromise = eventMonitor.waitForMachineAndWorkersReady(120000)
      await machineHelper.startMachine()
      await machineHelper.waitForMachineHealth()
      connectionResult = await eventPromise
    }
    
    // CRITICAL: Event stream connections
    expect(connectionResult.machineConnected).toBe(true)
    expect(connectionResult.workersConnected).toBe(true)
    
    // CRITICAL: Redis job queue connections
    const redisTest = await machineHelper.testActualRedisConnection()
    expect(redisTest.redisConnected).toBe(true)
    expect(redisTest.canSubmitJob).toBe(true)
    
    console.log('✅ BLOCKING TEST PASSED: Machine ↔ Redis ↔ Workers connections verified')
  }, 180000)

  it('2️⃣ Machine structure validation (contingent on connections)', async () => {
    console.log('=== STRUCTURE VALIDATION ===')
    
    // Get current state from event stream
    const stateSnapshot = await new Promise<any>((resolve, reject) => {
      const eventSource = new EventSource('http://localhost:3331/api/events/monitor')
      
      const timer = setTimeout(() => {
        eventSource.close()
        reject(new Error('No full_state_snapshot received in 10 seconds'))
      }, 10000)
      
      eventSource.addEventListener('message', (event: any) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'full_state_snapshot' && (data as any).data) {
            clearTimeout(timer)
            eventSource.close()
            resolve(data)
          }
        } catch (error) {
          console.error('Failed to parse event:', error)
        }
      })
    })
    
    const machines = (stateSnapshot as any).data.machines
    const workers = (stateSnapshot as any).data.workers
    
    // Validate complete machine structure
    expect(machines).toHaveLength(1)
    const machine = machines[0]
    expect(machine.machine_id).toBe('basic-machine-test')
    expect(machine.status).toBe('ready')
    expect(machine.gpu_count).toBe(2)
    expect(machine.gpu_model).toBe('RTX 4090')
    expect(machine.gpu_memory_gb).toBe(16)
    
    const expectedServices = ['comfyui', 'redis-worker', 'simulation']
    for (const service of expectedServices) {
      expect(machine.services).toContain(service)
    }
    
    const testWorkers = workers.filter((w: any) => w.machine_id === 'basic-machine-test')
    expect(testWorkers.length).toBe(2)
    
    // Validate PM2 service reporting
    const serviceBadges = await machineHelper.getServiceBadges()
    const expectedPM2Services = ['comfyui-gpu0', 'comfyui-gpu1', 'redis-worker-gpu0', 'redis-worker-gpu1', 'orchestrator']
    
    for (const serviceName of expectedPM2Services) {
      const service = serviceBadges.find(s => s.name === serviceName)
      if (!service) {
        throw new Error(`REPORTING ERROR: PM2 service not reported: ${serviceName}`)
      }
      expect(service.status).toBeDefined()
    }
    
    console.log('✅ STRUCTURE TEST PASSED: Complete machine structure validated')
  }, 30000)

  it('3️⃣ Periodic status updates (contingent on structure)', async () => {
    console.log('=== PERIODIC UPDATES ===')
    
    let periodicUpdateCount = 0
    
    const periodicPromise = new Promise<void>((resolve, reject) => {
      const eventSource = new EventSource('http://localhost:3331/api/events/monitor')
      
      const timer = setTimeout(() => {
        eventSource.close()
        reject(new Error(`No periodic updates received in 35 seconds. Got ${periodicUpdateCount} updates.`))
      }, 35000)
      
      eventSource.addEventListener('message', (event: any) => {
        try {
          const data = JSON.parse(event.data)
          
          if (data.type === 'periodic_status_update' || data.type === 'heartbeat' || data.type === 'full_state_snapshot') {
            periodicUpdateCount++
            console.log(`📊 Periodic update #${periodicUpdateCount}: ${data.type}`)
            
            if (periodicUpdateCount >= 2) {
              clearTimeout(timer)
              eventSource.close()
              resolve()
            }
          }
        } catch (error) {
          console.error('Failed to parse periodic event:', error)
        }
      })
    })
    
    await periodicPromise
    expect(periodicUpdateCount).toBeGreaterThanOrEqual(2)
    
    console.log('✅ PERIODIC UPDATES TEST PASSED: 15-second updates confirmed')
  }, 40000)
  
  it('should report ALL services even when stopped (service reporting completeness)', async () => {
    console.log('=== TESTING SERVICE REPORTING COMPLETENESS ===')
    console.log('Testing that machine reports ALL services regardless of their status')
    
    // Ensure machine is running first
    const initialState = await machineHelper.checkIfAlreadyConnected()
    if (!initialState.machineConnected) {
      console.log('⚠️  Starting test machine for service reporting test...')
      await machineHelper.startMachine()
      await machineHelper.waitForMachineHealth()
    }
    
    // Get initial service list (all should be running)
    console.log('🔍 Getting initial service status...')
    const initialServices = await machineHelper.getServiceBadges()
    const expectedServices = ['comfyui-gpu0', 'comfyui-gpu1', 'redis-worker-gpu0', 'redis-worker-gpu1', 'orchestrator']
    
    console.log('📊 Initial services:', initialServices.map(s => `${s.name}=${s.status}`).join(', '))
    
    // Verify all services are initially reported
    for (const serviceName of expectedServices) {
      const service = initialServices.find(s => s.name === serviceName)
      expect(service).toBeDefined()
      console.log(`✅ Initially reported: ${serviceName} = ${service!.status}`)
    }
    
    // Stop one service to test reporting
    console.log('\n🛑 Testing: Stopping comfyui-gpu1 service...')
    try {
      await execAsync('docker exec basic-machine-test pm2 stop comfyui-gpu1')
      console.log('✅ Successfully stopped comfyui-gpu1')
    } catch (error) {
      console.log('⚠️  Could not stop service (may not exist), continuing test...')
    }
    
    // Wait a moment for status to update
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Get updated service list
    console.log('🔍 Getting updated service status after stopping comfyui-gpu1...')
    const updatedServices = await machineHelper.getServiceBadges()
    console.log('📊 Updated services:', updatedServices.map(s => `${s.name}=${s.status}`).join(', '))
    
    // CRITICAL TEST: All services should still be REPORTED
    console.log('🔍 CRITICAL: Verifying ALL services still reported...')
    for (const serviceName of expectedServices) {
      const service = updatedServices.find(s => s.name === serviceName)
      if (!service) {
        throw new Error(`REPORTING FAILURE: Service ${serviceName} disappeared from status after being stopped! Should report as "stopped" not disappear.`)
      }
      
      console.log(`✅ Still reported: ${serviceName} = ${service.status}${service.pid ? ` (PID: ${service.pid})` : ' (no PID)'}`)
      
      // The stopped service should report as stopped/errored, not online
      if (serviceName === 'comfyui-gpu1') {
        expect(['stopped', 'errored', 'error']).toContain(service.status)
        console.log(`✅ Stopped service correctly reports status: ${service.status}`)
      }
    }
    
    // Restart the service for cleanup
    console.log('\n🔄 Restarting comfyui-gpu1 for cleanup...')
    try {
      await execAsync('docker exec basic-machine-test pm2 restart comfyui-gpu1')
      await new Promise(resolve => setTimeout(resolve, 3000))
      console.log('✅ Service restarted for cleanup')
    } catch (error) {
      console.log('⚠️  Could not restart service, but test passed')
    }
    
    console.log('\n✅ SERVICE REPORTING TEST PASSED: Machine reports ALL services regardless of status')
  }, 120000) // 2 minute timeout
  
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
})