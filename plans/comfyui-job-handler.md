ComfyUI Job Completion Flow - Complete Implementation 
  Guide

  Here's a comprehensive breakdown of how the ComfyUI job
  completion works, from Redis message to client response:

  1. Redis Job Completion Message Structure

  The Redis job system sends a WebSocket message when a
  ComfyUI job completes:

  // Message received from Redis job system
  {
    type: "complete_job",
    timestamp: 1642637400000,
    job_id:
  "job-test-12345678-abcd-1234-5678-123456789abc",
    worker_id: "worker-comfyui-001",
    result: {
      status: "success", // or "failed"
      error?: string,    // only present if failed
      // Additional ComfyUI-specific data (not used in 
  current flow)
    },
    progress: 100
  }

  2. WebSocket Message Handler in RedisServerClient

  From src/clients/redis-server-client.ts, lines ~175-195:

  this.ws.on("message", async (message: string | Buffer) =>
   {
    if (!(message instanceof Buffer)) return;

    const parsedMessage = JSON.parse(message.toString()) as
   ParsedMessage;
    const jobId = parsedMessage.job_id;
    const jobContext = this.activeJobs.get(jobId);

    if (parsedMessage.type === "complete_job" &&
  jobContext) {
      const { result } = parsedMessage;

      if (result.status === "failed") {
        // Reject the promise with error
        jobContext.reject(result.error);
      } else {
        // Resolve the promise with result data
        jobContext.resolve(result);
      }

      // Clean up active job tracking
      this.activeJobs.delete(jobId);
    }
  });

  3. Job Promise Resolution Chain

  The runComfyPrompt() method creates a promise that gets
  resolved:

  // From src/clients/redis-server-client.ts:165-197
  async runComfyPrompt(comfyPrompt: any, ctx?: any):
  Promise<void> {
    return new Promise((resolve, reject) => {
      const jobId = `job-test-${randomUUID()}`;

      // Store promise handlers for this job
      this.activeJobs.set(jobId, { resolve, reject });

      const request = {
        type: "submit_job",
        job_type: "comfyui",
        priority: 5,
        job_id: jobId,
        payload: comfyPrompt,
        ctx
      };

      this.ws.send(JSON.stringify(request));
      // Promise resolves when WebSocket receives 
  "complete_job"
    });
  }

  4. Workflow Runner Response Formation

  From src/lib/workflows.ts:22-67:

  async runWorkflow(workflow: any, input: any, ctx?: any):
  Promise<any> {
    try {
      console.log("Starting prompt...");

      // This resolves when Redis sends "complete_job"
      await
  this.redisServerClient.runComfyPrompt(comfyPrompt, ctx);

      // Return standardized success response
      return this.successResponse("success");
    } catch (error) {
      console.error("Error running workflow:", error);
      return this.errorResponse(error);
    }
  }

  private successResponse(data: any) {
    return {
      data,
      error: null
    };
  }

  private errorResponse(error: any) {
    return {
      data: null,
      error: error.message || error
    };
  }

  5. Final Client Response Formation

  From
  src/modules/art-gen/nodes-v2/nodes/workflow.ts:11-25:

  async execute(payload: any, context: any) {
    const result = await
  this.workflowRunner.runWorkflow(workflow, payload,
  context);

    if (result.error != null) {
      throw new Error(result.error);
    }

    // Construct predictable file path (Azure storage + 
  CloudFront)
    const prefix =
  `${context.user.id}/${context.sessionId}`;
    const filename = `${randomUUID()}.png`;
    const path = `${prefix}/${filename}`;
    const src = `${process.env.CLOUDFRONT_URL}/${path}`;

    return {
      src,                    // Final serving URL
      mimeType: this.getMimeType()
    };
  }

  6. Complete Message Flow Summary

  // 1. Redis sends completion message
  {
    type: "complete_job",
    job_id: "job-test-abc123",
    result: { status: "success" }
  }

  // 2. RedisServerClient resolves promise
  jobContext.resolve(result) // result = { status: 
  "success" }

  // 3. WorkflowRunner returns standardized response  
  {
    data: "success",
    error: null
  }

  // 4. ComfyWorkflowNode returns client response
  {
    src:
  "https://cdn.example.com/user123/session456/uuid.png",
    mimeType: "image/png"
  }

  7. Key Implementation Points for Queue Monitor

  To replicate this in your queue monitor:

  1. Listen for complete_job messages with matching job_id
  2. Check result.status to determine success/failure
  3. For success: Construct predictable file URLs using the
   same pattern
  4. For failure: Extract result.error for error handling
  5. Clean up job tracking after processing completion

  The critical insight is that the actual ComfyUI result
  data isn't needed - the file location is deterministic
  based on user ID, session ID, and generated filename,
  while ComfyUI handles the Azure upload internally.

✻ Thinking…

  This is a comprehensive explanation that covers:

  1. The Redis message structure they'll need to listen for
  2. How the WebSocket handler processes "complete_job" 
  messages
  3. The promise resolution chain
  4. How the workflow runner forms its response
  5. The final client response formation
  6. A complete flow summary
  7. Key implementation points for their queue monitor

  The user should have everything they need to replicate 
  this behavior in their queue monitor system. The 
  explanation shows that the key is listening for 
  "complete_job" messages and then constructing the 
  predictable file URLs rather than relying on the actual 
  result data from ComfyUI.