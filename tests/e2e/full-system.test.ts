// End-to-end tests for complete system integration
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import axios from 'axios';
import WebSocket from 'ws';
import { createJob } from '../fixtures/jobs.js';

describe('Full System E2E Tests', () => {
  let hubUrl: string;
  let hubWsUrl: string;

  beforeAll(() => {
    hubUrl = global.testEndpoints?.hub || 'http://localhost:3001';
    hubWsUrl = global.testEndpoints?.hubWs || 'ws://localhost:3002';
  });

  describe('System Health', () => {
    it('should have hub service running', async () => {
      const response = await axios.get(`${hubUrl}/health`);
      expect(response.status).toBe(200);
      expect(response.data.status).toBe('healthy');
    });

    it('should have WebSocket service running', async () => {
      const ws = new WebSocket(hubWsUrl);
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });

      ws.close();
    });
  });

  describe('Job Submission and Processing', () => {
    it('should accept job submission via REST API', async () => {
      const job = createJob();
      
      const response = await axios.post(`${hubUrl}/api/jobs`, job);
      
      expect(response.status).toBe(201);
      expect(response.data.job_id).toBeDefined();
      expect(response.data.status).toBe('queued');
    });

    it('should provide job status via REST API', async () => {
      const job = createJob();
      
      // Submit job
      const submitResponse = await axios.post(`${hubUrl}/api/jobs`, job);
      const jobId = submitResponse.data.job_id;
      
      // Check status
      const statusResponse = await axios.get(`${hubUrl}/api/jobs/${jobId}`);
      
      expect(statusResponse.status).toBe(200);
      expect(statusResponse.data.id).toBe(jobId);
      expect(statusResponse.data.status).toBeDefined();
    });

    it('should process job and return results', async () => {
      const job = createJob({
        type: 'simulation', // Use simulation connector for E2E tests
        requirements: {
          service_type: 'simulation',
          timeout_minutes: 1
        }
      });
      
      // Submit job
      const submitResponse = await axios.post(`${hubUrl}/api/jobs`, job);
      const jobId = submitResponse.data.job_id;
      
      // Wait for processing (with timeout)
      const maxWait = 30000; // 30 seconds
      const pollInterval = 1000; // 1 second
      let elapsed = 0;
      let jobCompleted = false;
      
      while (elapsed < maxWait && !jobCompleted) {
        const statusResponse = await axios.get(`${hubUrl}/api/jobs/${jobId}`);
        const status = statusResponse.data.status;
        
        if (status === 'completed') {
          jobCompleted = true;
          expect(statusResponse.data.result).toBeDefined();
          expect(statusResponse.data.result.success).toBe(true);
        } else if (status === 'failed') {
          throw new Error(`Job failed: ${statusResponse.data.error}`);
        }
        
        if (!jobCompleted) {
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          elapsed += pollInterval;
        }
      }
      
      expect(jobCompleted).toBe(true);
    }, 35000);
  });

  describe('Real-time Updates via WebSocket', () => {
    it('should receive job status updates via WebSocket', async () => {
      const job = createJob({
        type: 'simulation',
        requirements: { service_type: 'simulation' }
      });
      
      const ws = new WebSocket(hubWsUrl);
      const messages: any[] = [];
      
      // Setup WebSocket
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messages.push(message);
      });
      
      // Submit job
      const response = await axios.post(`${hubUrl}/api/jobs`, job);
      const jobId = response.data.job_id;
      
      // Subscribe to job updates
      ws.send(JSON.stringify({
        type: 'subscribe_job',
        job_id: jobId,
        timestamp: Date.now()
      }));
      
      // Wait for messages
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Should receive status updates
      expect(messages.length).toBeGreaterThan(0);
      
      const jobMessages = messages.filter(m => m.job_id === jobId);
      expect(jobMessages.length).toBeGreaterThan(0);
      
      ws.close();
    });

    it('should receive system stats broadcasts', async () => {
      const ws = new WebSocket(hubWsUrl);
      const messages: any[] = [];
      
      await new Promise((resolve, reject) => {
        ws.on('open', resolve);
        ws.on('error', reject);
        setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
      });
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        messages.push(message);
      });
      
      // Subscribe to stats
      ws.send(JSON.stringify({
        type: 'subscribe_stats',
        enabled: true,
        interval_seconds: 2,
        timestamp: Date.now()
      }));
      
      // Wait for stats broadcasts
      await new Promise(resolve => setTimeout(resolve, 7000));
      
      const statsMessages = messages.filter(m => m.type === 'stats_broadcast');
      expect(statsMessages.length).toBeGreaterThan(0);
      
      const latestStats = statsMessages[statsMessages.length - 1];
      expect(latestStats.system).toBeDefined();
      expect(latestStats.workers).toBeDefined();
      
      ws.close();
    });
  });

  describe('Worker Integration', () => {
    it('should show workers in system stats', async () => {
      const response = await axios.get(`${hubUrl}/api/stats`);
      
      expect(response.status).toBe(200);
      expect(response.data.workers).toBeDefined();
      expect(response.data.workers.total).toBeGreaterThan(0);
    });

    it('should handle multiple concurrent jobs', async () => {
      const jobCount = 5;
      const jobs = Array.from({ length: jobCount }, () => createJob({
        type: 'simulation',
        requirements: { service_type: 'simulation' }
      }));
      
      // Submit all jobs concurrently
      const submitPromises = jobs.map(job => 
        axios.post(`${hubUrl}/api/jobs`, job)
      );
      
      const responses = await Promise.all(submitPromises);
      
      // All jobs should be accepted
      responses.forEach(response => {
        expect(response.status).toBe(201);
        expect(response.data.job_id).toBeDefined();
      });
      
      // Wait for all jobs to complete
      const jobIds = responses.map(r => r.data.job_id);
      const completionPromises = jobIds.map(async (jobId) => {
        const maxWait = 30000;
        const pollInterval = 1000;
        let elapsed = 0;
        
        while (elapsed < maxWait) {
          const statusResponse = await axios.get(`${hubUrl}/api/jobs/${jobId}`);
          const status = statusResponse.data.status;
          
          if (status === 'completed' || status === 'failed') {
            return statusResponse.data;
          }
          
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          elapsed += pollInterval;
        }
        
        throw new Error(`Job ${jobId} did not complete within timeout`);
      });
      
      const completedJobs = await Promise.all(completionPromises);
      
      // All jobs should complete successfully
      completedJobs.forEach(job => {
        expect(['completed', 'failed']).toContain(job.status);
      });
      
      const successfulJobs = completedJobs.filter(job => job.status === 'completed');
      expect(successfulJobs.length).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle invalid job submissions', async () => {
      const invalidJob = {
        type: 'invalid_type',
        // Missing required fields
      };
      
      try {
        await axios.post(`${hubUrl}/api/jobs`, invalidJob);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data.error).toBeDefined();
      }
    });

    it('should handle non-existent job queries', async () => {
      try {
        await axios.get(`${hubUrl}/api/jobs/non-existent-job-id`);
        fail('Should have thrown an error');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
      }
    });

    it('should handle WebSocket connection errors gracefully', async () => {
      const ws = new WebSocket('ws://localhost:9999'); // Invalid port
      
      await new Promise((resolve) => {
        ws.on('error', () => {
          resolve(true); // Expected error
        });
        
        setTimeout(() => {
          resolve(true); // Timeout is acceptable
        }, 2000);
      });
    });
  });

  describe('Performance', () => {
    it('should handle rapid job submissions', async () => {
      const jobCount = 20;
      const jobs = Array.from({ length: jobCount }, () => createJob({
        type: 'simulation',
        requirements: { service_type: 'simulation' }
      }));
      
      const startTime = Date.now();
      
      const submitPromises = jobs.map(job => 
        axios.post(`${hubUrl}/api/jobs`, job)
      );
      
      const responses = await Promise.all(submitPromises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      // Should handle 20 job submissions in under 5 seconds
      expect(totalTime).toBeLessThan(5000);
      expect(responses.length).toBe(jobCount);
      
      responses.forEach(response => {
        expect(response.status).toBe(201);
      });
    });

    it('should maintain low latency for status queries', async () => {
      // Submit a job first
      const job = createJob();
      const submitResponse = await axios.post(`${hubUrl}/api/jobs`, job);
      const jobId = submitResponse.data.job_id;
      
      // Measure status query latency
      const queryCount = 10;
      const startTime = Date.now();
      
      for (let i = 0; i < queryCount; i++) {
        await axios.get(`${hubUrl}/api/jobs/${jobId}`);
      }
      
      const endTime = Date.now();
      const avgLatency = (endTime - startTime) / queryCount;
      
      // Average latency should be under 100ms
      expect(avgLatency).toBeLessThan(100);
    });
  });
});