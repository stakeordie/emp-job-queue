#!/usr/bin/env node

// Test script for job health checking with service job ID mapping
// Usage: node test-job-health-check.js [job_id]

import Redis from 'ioredis';

const STUCK_JOB_ID = process.argv[2] || 'eb9e00bb-5aeb-413c-a6a0-152c3537aa7c';
const COMFY_URL = 'http://108.53.57.130:53647';
const COMFY_USER = 'sd';
const COMFY_PASS = 'UbjpkE6kwM';

async function testJobHealthCheck() {
  const redis = new Redis('redis://localhost:6379');
  
  try {
    console.log(`🔍 Health checking job: ${STUCK_JOB_ID}`);
    
    // 1. Get job data from Redis
    const jobData = await redis.hgetall(`job:${STUCK_JOB_ID}`);
    console.log('📋 Job data:', {
      id: jobData.id,
      status: jobData.status,
      service_job_id: jobData.service_job_id,
      service_submitted_at: jobData.service_submitted_at,
      worker_id: jobData.worker_id
    });
    
    if (!jobData.service_job_id) {
      console.log('❌ No service_job_id found - job never submitted to ComfyUI');
      return;
    }
    
    // 2. Query ComfyUI directly
    console.log(`🔎 Querying ComfyUI for prompt: ${jobData.service_job_id}`);
    
    const historyUrl = `${COMFY_URL}/history/${jobData.service_job_id}`;
    const authHeader = 'Basic ' + Buffer.from(`${COMFY_USER}:${COMFY_PASS}`).toString('base64');
    
    const response = await fetch(historyUrl, {
      headers: { 'Authorization': authHeader }
    });
    
    if (!response.ok) {
      console.log(`❌ ComfyUI history query failed: ${response.status} ${response.statusText}`);
      return;
    }
    
    const historyData = await response.json();
    console.log('📊 ComfyUI history response:', JSON.stringify(historyData, null, 2));
    
    if (!historyData || Object.keys(historyData).length === 0) {
      console.log('❌ Job not found in ComfyUI history');
      
      // Check queue
      const queueResponse = await fetch(`${COMFY_URL}/queue`, {
        headers: { 'Authorization': authHeader }
      });
      
      if (queueResponse.ok) {
        const queueData = await queueResponse.json();
        console.log('📋 ComfyUI queue data:', {
          running: queueData.queue_running?.length || 0,
          pending: queueData.queue_pending?.length || 0
        });
        
        const inQueue = queueData.queue_running?.some(item => 
          item[1] === jobData.service_job_id || item[0] === jobData.service_job_id
        ) || queueData.queue_pending?.some(item => 
          item[1] === jobData.service_job_id || item[0] === jobData.service_job_id
        );
        
        if (inQueue) {
          console.log('✅ Job still in ComfyUI queue - worker should continue monitoring');
        } else {
          console.log('❌ Job not in queue either - worker lost track of job');
        }
      }
      return;
    }
    
    const promptData = historyData[jobData.service_job_id];
    if (promptData?.status?.completed) {
      console.log('✅ Job COMPLETED in ComfyUI but worker missed it!');
      console.log('📊 Results available:', Object.keys(promptData.outputs || {}));
      
      // Recommend action
      console.log('🔧 RECOMMENDED ACTION: Complete job with results from ComfyUI');
      
    } else if (promptData?.status?.status_str === 'error') {
      console.log('❌ Job FAILED in ComfyUI');
      console.log('💥 Error:', promptData.status.messages?.join(', ') || 'Unknown error');
      
      // Recommend action  
      console.log('🔧 RECOMMENDED ACTION: Fail job with ComfyUI error');
      
    } else {
      console.log('⏳ Job status unclear, may still be processing');
      console.log('🔧 RECOMMENDED ACTION: Continue monitoring or return to queue');
    }
    
  } catch (error) {
    console.error('💥 Health check failed:', error);
  } finally {
    redis.disconnect();
  }
}

// Run the test
testJobHealthCheck().catch(console.error);