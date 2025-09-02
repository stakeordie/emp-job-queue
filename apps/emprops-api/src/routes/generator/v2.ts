import { PrismaClientType } from "@app/types/database";
import { StorageClient } from "../../clients/storage-client";
import { CreditsService } from "../../lib/credits";
import logger from "../../logger";
import { GenerationInput, GeneratorV2 } from "../../modules/art-gen/nodes-v2";
import { generateHash } from "../../utils";

import { Request, Response } from "express";
import { OpenAIApi } from "openai";
import { v4 as uuid } from "uuid";
import { z } from "zod";

const schema = z.object({
  variables: z.record(z.string(), z.any()),
  workflow_id: z.string().optional(),
  workflow_priority: z.number().optional(),
});

export const runCollectionGeneration = (
  storageClient: StorageClient,
  prisma: PrismaClientType,
  creditsService: CreditsService,
  openAiApi: OpenAIApi,
) => {
  return async (req: Request, res: Response) => {
    const bodyValidationResult = schema.safeParse(req.body);

    if (!bodyValidationResult.success) {
      return res.status(400).json({
        data: null,
        error: "Invalid request body",
      });
    }

    const userId = req.headers["user_id"] as string;
    const collectionId = req.params.id;

    const collection = await prisma.collection.findUnique({
      where: {
        id: collectionId,
      },
    });
    if (!collection) {
      return res.status(404).json({
        data: null,
        error: "Collection not found",
      });
    }

    const variables = bodyValidationResult.data.variables;
    const rawInput = collection.data as GenerationInput;
    const jobId = uuid();

    // Workflow context will be generated per-workflow in the generation loop
    const workflowPriority = bodyValidationResult.data.workflow_priority || 50;

    const input = prepareInput(rawInput, variables);

    // Create a job record
    await prisma.job.create({
      data: {
        id: jobId,
        name: `Collection Generation: ${collection.title || "Untitled"}`,
        description: `Generation job for collection ${collectionId}`,
        status: "pending",
        data: {
          collectionId,
          variables,
        },
        user_id: userId,
        job_type: "collection_generation",
        priority: workflowPriority,
      },
    });

    // Create initial job history record
    await prisma.job_history.create({
      data: {
        job_id: jobId,
        status: "pending",
        message: "Job created and pending execution",
        data: {
          collectionId,
          variables,
        },
      },
    });

    const generator = new GeneratorV2(
      storageClient,
      prisma,
      creditsService,
      openAiApi,
    )
      .on("node_started", async (data) => {
        // Update job with processing status if this is the first node
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "processing",
            started_at: new Date(),
            progress: 0,
          },
        });

        // Add job history entry
        await prisma.job_history.create({
          data: {
            job_id: jobId,
            status: "processing",
            message: "Node started",
            data: {
              node: data.args.step.nodeName,
              nodeId: data.args.step.id,
            },
          },
        });
      })
      .on("node_progress", async (data) => {
        // Update job progress
        await prisma.job.update({
          where: { id: jobId },
          data: {
            progress: data.value,
          },
        });
      })
      .on("node_completed", async (data) => {
        // Add job history entry
        await prisma.job_history.create({
          data: {
            job_id: jobId,
            status: "processing",
            message: `Node ${data.args.step.nodeName} completed`,
            data: {
              node: data.args.step.nodeName,
              nodeId: data.args.step.id,
              output: data.nodeStepOutput,
            },
          },
        });
      })
      .on("complete", async (data) => {
        // Update job as completed
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "completed",
            completed_at: new Date(),
            progress: 100,
            data: {
              collectionId,
              variables,
              outputs: data,
            },
          },
        });

        // Add job history entry
        await prisma.job_history.create({
          data: {
            job_id: jobId,
            status: "completed",
            message: "Generation completed successfully",
            data: { outputs: data },
          },
        });
      })
      .on("error", async (error) => {
        // Update job with error status
        await prisma.job.update({
          where: { id: jobId },
          data: {
            status: "failed",
            error_message: error.message,
            completed_at: new Date(),
          },
        });

        // Add job history entry
        await prisma.job_history.create({
          data: {
            job_id: jobId,
            status: "failed",
            message: `Generation failed: ${error.message}`,
            data: { error: error.message },
          },
        });
      });

    generator.start(jobId, input, {
      userId,
      collectionId,
      workflowPriority,
    });

    logger.info("Started generation for job", jobId);

    return res.status(200).json({
      data: {
        jobId,
      },
      error: null,
    });
  };
};

function prepareInput(input: GenerationInput, variables: Record<string, any>) {
  let result = overrideVariables(input, variables);
  result = setGenerationData(result);
  return result;
}

function setGenerationData(input: GenerationInput) {
  const newInput = { ...input };
  const hashes = generateHash(51);
  newInput.generations.hashes = [hashes];
  newInput.generations.generations = 1;
  return newInput;
}

function overrideVariables(
  input: GenerationInput,
  variables: Record<string, any>,
) {
  const newInput = { ...input };
  for (const variable of newInput.variables) {
    if (!variables[variable.name]) continue;
    variable.value = {
      values: [variables[variable.name]],
      weights: [1],
      display_names: [""],
    };
  }
  return newInput;
}

/**
 * Stream job events using Server-Sent Events (SSE)
 */
export const streamJobEvents = (prisma: PrismaClientType) => {
  // Map to store active connections for each job
  const jobConnections: Record<string, Set<Response>> = {};

  // Function to send event to all connected clients for a job
  const sendEventToJob = (jobId: string, event: string, data: any) => {
    if (jobConnections[jobId]) {
      const eventData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      jobConnections[jobId].forEach((res) => {
        try {
          res.write(eventData);
        } catch (error) {
          logger.error(
            `Error sending event to client for job ${jobId}:`,
            error,
          );
        }
      });
    }
  };

  // Create a Prisma middleware to capture job and job_history updates
  prisma.$use(async (params, next) => {
    // Process the request
    const result = await next(params);

    // Check if this is a job or job_history update
    if (
      params.model === "job" &&
      (params.action === "update" || params.action === "create")
    ) {
      const job = result;
      if (job.id && jobConnections[job.id]) {
        sendEventToJob(job.id, "job_update", {
          id: job.id,
          status: job.status,
          progress: job.progress,
          error_message: job.error_message,
          updated_at: job.updated_at,
        });
      }
    } else if (params.model === "job_history" && params.action === "create") {
      const history = result;
      if (history.job_id && jobConnections[history.job_id]) {
        sendEventToJob(history.job_id, "job_history", {
          id: history.id,
          status: history.status,
          message: history.message,
          created_at: history.created_at,
          data: history.data,
        });
      }
    }

    return result;
  });

  return async (req: Request, res: Response) => {
    const jobId = req.params.id;

    if (!jobId) {
      return res.status(400).json({
        data: null,
        error: "Job ID is required",
      });
    }

    try {
      // Check if job exists and user has permission
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return res.status(404).json({
          data: null,
          error: "Job not found",
        });
      }

      // Set headers for SSE
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no", // Disable Nginx buffering
      });

      // Send initial job state
      res.write(
        `event: job_update\ndata: ${JSON.stringify({
          id: job.id,
          status: job.status,
          progress: job.progress,
          error_message: job.error_message,
          updated_at: job.updated_at,
        })}\n\n`,
      );

      // Fetch and send all existing history entries to catch up on any missed events
      const jobHistory = await prisma.job_history.findMany({
        where: { job_id: jobId },
        orderBy: { created_at: "asc" },
      });

      // Send a special "history_init" event with all history entries
      res.write(
        `event: history_init\ndata: ${JSON.stringify(
          jobHistory.map((history) => ({
            id: history.id,
            status: history.status,
            message: history.message,
            created_at: history.created_at,
            data: history.data,
          })),
        )}\n\n`,
      );

      // Add this connection to the job's connections
      if (!jobConnections[jobId]) {
        jobConnections[jobId] = new Set();
      }
      jobConnections[jobId].add(res);

      // Handle client disconnect
      req.on("close", () => {
        if (jobConnections[jobId]) {
          jobConnections[jobId].delete(res);
          // Clean up if no more connections for this job
          if (jobConnections[jobId].size === 0) {
            delete jobConnections[jobId];
          }
        }
      });

      // Send a heartbeat every 30 seconds to keep the connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          res.write(":heartbeat\n\n");
        } catch (error) {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Clean up interval on disconnect
      req.on("close", () => {
        clearInterval(heartbeatInterval);
      });
    } catch (error) {
      return res.status(500).json({
        data: null,
        error: `Failed to stream job events: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  };
};

export default {
  runCollectionGeneration,
  streamJobEvents,
};
