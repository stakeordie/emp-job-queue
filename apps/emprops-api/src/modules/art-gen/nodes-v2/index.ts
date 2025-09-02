import { PrismaClientType, Prisma } from "@app/types/database";
import posthog from "../../../clients/posthog";
import { PuppeteerClient } from "../../../clients/puppeteer-api";
import RedisServerClient from "../../../clients/redis-server-client";
import { StorageClient } from "../../../clients/storage-client";
import { CreditsService } from "../../../lib/credits";
import { CreditCostV2 } from "../../../lib/credits/calculator";
import { Pseudorandom } from "../../../lib/pseudorandom";
import logger from "../../../logger";
import { PrismaClient, workflow as Workflow } from '@emp/database';
import EventEmitter from "events";
import * as mime from "mime-types";
import * as jq from "node-jq";
import { OpenAIApi } from "openai";
import { from, merge } from "rxjs";
import { v4 as uuid } from "uuid";
import { GeneratorNode, JsNode, P5JsNode, VariablesNode } from "./nodes";
import { ThirdPartyApiComponent } from "./nodes/api";
import { DirectJobNode } from "./nodes/direct-job";
import { P5ToVid } from "./nodes/p52vid";
import { PromptNode } from "./nodes/prompt";
import { ComfyWorkflowNode } from "./nodes/workflow";
import { findRefKeys, findRefs } from "./utils";

// AKA Instruction set.
export type GenerationInput = {
  version: "v2";
  steps: NodeStepInput[];
  generations: GenerationArgs;
  variables: Variable[];
};

export type Variable = {
  name: string;
  type: "pick" | "weighted_pick";
  value_type:
    | "strings"
    | "images"
    | "text"
    | "video"
    | "live_artifact"
    | "integers";
  value: {
    display_names: string[];
    values: string[];
    weights: number[];
  };
  lock_value: boolean;
  test_value: string | null;
};

type GenerationArgMetadata = {
  id: number; // gid
  hash: string;
};

type GenerationArgs = {
  hashes: string[];
  generations: number;
  use_custom_hashes: boolean;
};

type GenerationOutput = {
  id: string;
  steps: NodeStepOutput[];
  generation: GenerationArgMetadata;
};

type NodeStepInput = {
  id: number;
  nodeName: string;
  fromId?: number;
  nodePayload: any;
  testValue?: {
    src: string;
    data: string;
    mimeType: string;
    outputId: string;
  };
  isTest?: boolean;
  skip?: boolean;
  alias?: string;
};

export type NodeStepOutput = {
  id: number;
  nodeName: string;
  nodeAlias?: string;
  nodeResponse: any;
};

type DependencyRef = {
  $ref: number;
  path: string;
};

type GenerationMetadata = {
  userId: string;
  collectionId?: string;
  source?: AssetGenerationSource;
  sourceId?: string | number;
  testPayload?: GenerationInput;
  workflowPriority?: number;
  workflowContext?: {
    workflow_id: string;
    workflow_datetime: number;
    step_number: number;
    current_step: number;
    total_steps: number;
    workflow_priority: number;
  };
};

export type AssetGenerationSource =
  | "preview"
  | "component_test"
  | "workflow_test";

export const variableComponentId = 953;
export const generatorUserId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

class GenerationError extends Error {
  constructor(e: Error, nodeName: string) {
    super(`Error in component '${nodeName}': ${e.message}`);
  }
}

export class GeneratorV2 {
  private nodes = [] as GeneratorNode[];
  private nodeStepOutputs = {} as Record<number, NodeStepOutput[]>;
  private eventEmitter = new EventEmitter();
  private prisma: PrismaClientType;
  private creditsService: CreditsService;
  private storageClient: StorageClient;
  private workflows = [] as Workflow[];
  private currentMetadata: GenerationMetadata | null = null;

  constructor(
    storageClient: StorageClient,
    prisma: PrismaClientType,
    creditsService: CreditsService,
    openai: OpenAIApi,
  ) {
    const puppeteerClient = new PuppeteerClient(process.env.PUPPETEER_API_URL);
    this.nodes.push(new VariablesNode(storageClient));
    this.nodes.push(new P5JsNode(storageClient, puppeteerClient));
    this.nodes.push(new P5ToVid(storageClient, puppeteerClient));
    this.nodes.push(new JsNode(storageClient, puppeteerClient));
    this.nodes.push(new PromptNode(openai, storageClient));

    this.prisma = prisma;
    this.storageClient = storageClient;
    this.creditsService = creditsService;
  }

  async start(
    id: string,
    input: GenerationInput,
    metadata: GenerationMetadata,
  ) {
    try {
      await this.registerComfyWorkflows();
      await this.generateImage(id, input, metadata);
    } catch (e) {
      this.cleanup();
      this.eventEmitter.emit("error", e);
    }
  }

  private async registerComfyWorkflows() {
    this.workflows = await this.prisma.workflow.findMany({
      where: {
        type: {
          in: ["comfy_workflow", "fetch_api", "direct_job"],
        },
      },
    });
    this.workflows.forEach((workflow) => {
      if (!workflow.output_mime_type)
        throw new Error(
          `Output mime type missing for workflow ${workflow.name}`,
        );
      switch (workflow.type) {
        case "comfy_workflow":
          this.nodes.push(
            new ComfyWorkflowNode(
              workflow.name,
              workflow.output_mime_type,
              this.prisma,
              this.storageClient,
              this.eventEmitter,
            ),
          );
          break;
        case "fetch_api":
          this.nodes.push(
            new ThirdPartyApiComponent(
              workflow.name,
              workflow,
              this.storageClient,
              this.prisma,
            ),
          );
          break;
        case "direct_job":
          this.nodes.push(
            new DirectJobNode(
              workflow.name,
              workflow.output_mime_type,
              this.prisma,
              this.storageClient,
              this.eventEmitter,
            ),
          );
          break;
      }
    });
  }

  private isMaxGenerationsValid(
    usedWorkflowsNames: string[],
    generations: number,
  ) {
    if (!this.workflows) throw new Error("Workflows haven't been registered");
    const currentUsedWorkflows = this.workflows.filter(
      (workflow) =>
        usedWorkflowsNames.includes(workflow.name) &&
        workflow.type != null &&
        ["comfy_workflow", "fetch_api", "direct_job"].includes(workflow.type),
    );
    if (currentUsedWorkflows.length === 0) return true;
    const maxGenerations = Math.max(
      ...currentUsedWorkflows.map(
        (workflow) =>
          (workflow.data as any).form.config.maxNumberOfGenerations || 10,
      ),
    );
    return generations <= maxGenerations;
  }

  private async generateImage(
    id: string,
    _input: GenerationInput,
    metadata: GenerationMetadata,
  ) {
    const {
      userId,
      collectionId,
      source,
      sourceId,
      testPayload,
      workflowPriority,
    } = metadata;
    const rawInput = _input;
    let input: GenerationInput = _input;
    if (source === "component_test") {
      if (!testPayload) throw new Error("Test payload is missing");
      input = testPayload;
    }
    const { steps: rawSteps, generations, variables } = input;
    logger.info(`🔍 WORKFLOW ANALYSIS:`, {
      rawStepsCount: rawSteps.length,
      generationsCount: generations.generations,
      hashesCount: generations.hashes.length,
      variablesCount: variables.length,
    });
    logger.info(
      `📝 RAW STEPS:`,
      rawSteps.map((s) => `${s.nodeName}(id:${s.id}, skip:${s.skip})`),
    );
    logger.info(`🎯 GENERATIONS OBJECT:`, JSON.stringify(generations, null, 2));
    const generationOutputs = [] as GenerationOutput[];

    const usedWorkflows = input.steps.map((step) => step.nodeName);
    if (!this.isMaxGenerationsValid(usedWorkflows, generations.generations)) {
      this.cleanup();
      this.eventEmitter.emit("error", new Error("Exceeded max generations"));
      this.eventEmitter.emit("complete", null);
      return;
    }

    const creditCost = await this.creditsService.computeCredits<CreditCostV2>(
      input,
      { source },
    );

    if (userId !== generatorUserId) {
      const result = await this.creditsService.hasEnoughCredits(
        userId,
        input,
        generations.generations,
      );
      if (!result) {
        this.cleanup();
        this.eventEmitter.emit("error", new Error("Insufficient credits"));
        this.eventEmitter.emit("complete", null);
      }
    }

    const promises = [];

    // Custom nodes.
    const variablesNode: NodeStepInput = {
      id: variableComponentId,
      nodeName: "variables",
      nodePayload: variables,
    };
    const steps = [variablesNode, ...rawSteps];

    let gid = 0;
    const workflowDateTime = Date.now();

    // Generate hashes if none provided and not using custom hashes
    let hashesToUse = generations.hashes;
    if (
      hashesToUse.length === 0 &&
      !generations.use_custom_hashes &&
      generations.generations > 0
    ) {
      logger.info(`🎲 GENERATING ${generations.generations} HASHES`);
      hashesToUse = [];
      for (let i = 0; i < generations.generations; i++) {
        hashesToUse.push(uuid());
      }
    }

    logger.info(
      `🔄 STARTING GENERATION LOOP with ${hashesToUse.length} hashes`,
    );
    for (const hash of hashesToUse) {
      logger.info(`🎲 PROCESSING HASH ${gid}: ${hash}`);
      const prng = new Pseudorandom(hash);
      const seed = prng.pseudorandomInteger(1, 4294967295);

      // Only create workflow context for workflows (not component tests or previews)
      let workflowContext = undefined;
      const isWorkflowRequest =
        source === "workflow_test" ||
        (source === undefined &&
          collectionId &&
          workflowPriority !== undefined);

      if (isWorkflowRequest) {
        workflowContext = {
          workflow_id: id,
          workflow_datetime: workflowDateTime,
          step_number: 0,
          current_step: 1, // Will be updated for each step, 1-indexed
          total_steps: rawSteps.length, // Only count user steps, not variables node
          workflow_priority: workflowPriority || 50,
        };
      }

      // Store metadata with conditional workflow context
      this.currentMetadata = {
        ...metadata,
        workflowContext,
      };

      const doGenerate = async (gen: GenerationArgMetadata) => {
        for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
          const step = steps[stepIndex];

          // current_step will be updated in executeNode for queue-based steps

          const dependentNodesIds = findRefs(step.nodePayload);
          for (const id of dependentNodesIds) {
            const dependentStep = steps.find((s) => s.id === id);
            if (dependentStep) {
              if (dependentStep.skip && source === "workflow_test") continue;
              try {
                await this.executeNode({
                  id,
                  userId,
                  seed,
                  gen,
                  step: dependentStep,
                  collectionId,
                  source,
                  input,
                  rawInput,
                  creditCost,
                  rawSteps,
                });
              } catch (e) {
                const error =
                  e instanceof Error
                    ? new GenerationError(
                        e,
                        dependentStep.alias || dependentStep.nodeName,
                      )
                    : e;
                throw error;
              }
            }
          }
          if (step.skip && source === "workflow_test") continue;
          try {
            await this.executeNode({
              id,
              userId,
              seed,
              gen,
              step,
              collectionId,
              source,
              input,
              rawInput,
              creditCost,
              rawSteps,
            });
          } catch (e) {
            // Print stack
            logger.error((e as Error).stack);
            const error =
              e instanceof Error
                ? new GenerationError(e, step.alias || step.nodeName)
                : e;
            throw error;
          }
        }
        if (userId !== generatorUserId) {
          await this.creditsService.decrementCredits(
            userId,
            creditCost.total_cost,
            `Generation ${id}/${gid}`,
          );
        }
        return gen;
      };

      const doGenerateWithCatch = async (gen: GenerationArgMetadata) => {
        try {
          return await doGenerate(gen);
        } catch (e) {
          this.cleanup();
          this.eventEmitter.emit("error", e);
          return;
        }
      };

      promises.push(doGenerateWithCatch({ id: gid, hash }));
      gid++;
    }

    logger.info(
      `🎭 CREATING RXJS OBSERVABLES from ${promises.length} promises`,
    );

    // Handle empty promises array case
    if (promises.length === 0) {
      logger.info(`📭 No generations to process for task ${id}`);
      this.cleanup();
      this.eventEmitter.emit("complete", generationOutputs);
      return generationOutputs;
    }

    const observables = merge(...promises.map((p) => from(p)));

    logger.info(`📺 SUBSCRIBING TO OBSERVABLES...`);
    const subscription = observables.subscribe({
      next: (gen) => {
// @ts-ignore
// @ts-ignore
// @ts-ignore
        // @ts-ignore
        logger.info(
          `🔄 RXJS NEXT: received gen=${(gen as any)?.id || "null"} for task ${id}`,
        );
// @ts-ignore
// @ts-ignore
// @ts-ignore
        if (!gen) return;
        // @ts-ignore
        logger.info(`📸 Output ${(gen as any).id} generated for task ${id}`);
        const generationOutput = {
// @ts-ignore
// @ts-ignore
// @ts-ignore
          id,
          steps: this.nodeStepOutputs[(gen as any).id],
          generation: gen,
        } as GenerationOutput;
        generationOutputs.push(generationOutput);
        if (source === "workflow_test" && collectionId) {
          this.saveAsset({
            collectionId,
            input,
            outputs: [generationOutput],
            source,
            sourceId,
          });
        }
        this.eventEmitter.emit("image_generated", generationOutput);
      },
      complete: () => {
        logger.info(
          `🏆 RXJS COMPLETE: about to unsubscribe and cleanup for task ${id}`,
        );
        if (subscription) {
          subscription.unsubscribe();
        }
        this.cleanup();
        this.eventEmitter.emit("complete", generationOutputs);
        logger.info(`✨ Generation complete ${id}`);
      },
      error: (error) => {
        logger.error(`💥 RXJS ERROR for task ${id}:`, error);
        this.cleanup();
        this.eventEmitter.emit("error", error);
      },
    });

    logger.info(`📋 SUBSCRIPTION CREATED for task ${id}`);

    return generationOutputs;
  }

  async saveAsset({
    collectionId,
    input,
    outputs,
    source,
    sourceId,
  }: {
    collectionId: string;
    input: GenerationInput;
    outputs: GenerationOutput[];
    source?: AssetGenerationSource;
    sourceId?: string | number;
  }): Promise<Prisma.flat_fileGetPayload<{}>[]> {
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      include: { project: true },
    });

    if (collection === null)
      throw new Error(`Collection ${collectionId} not found`);

    const data = outputs.map((output) => {
      const lastStep = output.steps[output.steps.length - 1];
      const url = lastStep.nodeResponse.src;
      const mimeType = lastStep.nodeResponse.mimeType;
      const userId = collection.project.user_id;
      const collectionName = collection.title
        ? collection.title
        : collection.project.name;
      const prefix = collectionName.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
      const ext = mime.extension(mimeType);
      const name = `${prefix}-${output.generation.id}.${ext}`;
      return {
        name,
        url,
        user_id: userId,
        gen_in_data: input, // The input for this generation.
        gen_out_data: output, // The output for this generation.
        rel_type: source,
        rel_id: sourceId?.toString(),
        mime_type: mimeType,
      };
    });

    return await this.prisma.flat_file.createManyAndReturn({
      data,
    });
  }

  private async executeNode(args: {
    id: string;
    userId: string;
    seed: number;
    gen: GenerationArgMetadata;
    step: NodeStepInput;
    collectionId?: string;
    source?: AssetGenerationSource;
    input: GenerationInput;
    rawInput: GenerationInput;
    creditCost: CreditCostV2;
    rawSteps: NodeStepInput[];
  }): Promise<void> {
    logger.info(
      `🚀🚀🚀 EXECUTE NODE START: ${args.step.nodeName} (id: ${args.step.id}, alias: ${args.step.alias})`,
    );
    this.eventEmitter.emit("node_started", {
      args,
    });
    const {
      id,
      userId,
      seed,
      gen,
      step,
      collectionId,
      source,
      input,
      rawInput,
      creditCost,
      rawSteps,
    } = args;
    if (!this.nodeStepOutputs[gen.id]) {
      this.nodeStepOutputs[gen.id] = [];
    } else {
      const hasOutputAlready = this.nodeStepOutputs[gen.id].find(
        (output) => output.id === step.id,
      );
      if (hasOutputAlready) return;
    }
    if (step.isTest) {
      if (step.testValue) {
        this.nodeStepOutputs[gen.id].push({
          id: step.id,
          nodeName: step.nodeName,
          nodeAlias: step.alias,
          nodeResponse: {
            src: step.testValue?.src,
            data: step.testValue?.data,
            mimeType: step.testValue?.mimeType,
          },
        });
      }
    }
    const hasOutputAlready = this.nodeStepOutputs[gen.id].find(
      (output) => output.id === step.id,
    );
    if (hasOutputAlready) return;

    // Find the node to execute.
    logger.info(`🔍 LOOKING FOR NODE: ${step.nodeName}`);
    logger.info(
      `📋 AVAILABLE NODES: ${this.nodes.map((n) => n.name).join(", ")}`,
    );
    const node = this.nodes.find((node) => node.name === step.nodeName);
    if (!node) {
      logger.error(
        `❌ COMPONENT NOT FOUND: '${
          step.alias || step.nodeName
        }' (looking for: ${step.nodeName})`,
      );
      throw new Error(`Component '${step.alias || step.nodeName}' not found`);
    }
    logger.info(`✅ FOUND NODE: ${node.name}`);

    // Update current_step for all user steps (excluding variables)
    if (
      this.currentMetadata?.workflowContext &&
      step.id !== variableComponentId
    ) {
      // Find the step number in the original rawSteps (1-indexed)
      const rawStepIndex = rawSteps.findIndex((s) => s.id === step.id);
      if (rawStepIndex >= 0) {
        this.currentMetadata.workflowContext.current_step = rawStepIndex + 1;
      }
    }

    // Determine if this is a delegated job (local execution) vs queue-based job
    const isQueueBasedNode = this.workflows.some(
      (w) =>
        w.name === step.nodeName &&
        w.type &&
        ["comfy_workflow", "direct_job"].includes(w.type),
    );
    const isDelegatedJob = !isQueueBasedNode && step.id !== variableComponentId;

    // Debug logging to see what's happening
    logger.info(
      `🔧 PROCESSING STEP: ${step.nodeName}, id: ${step.id}, variableComponentId: ${variableComponentId}`,
    );
    logger.info(
      `🎯 QUEUE DETECTION: isQueueBasedNode=${isQueueBasedNode}, isDelegatedJob=${isDelegatedJob}`,
    );
    logger.info(
      `📚 AVAILABLE WORKFLOWS: ${this.workflows
        .map((w) => `${w.name}:${w.type}`)
        .join(", ")}`,
    );
    logger.info(
      `🌐 WORKFLOW CONTEXT: ${
        this.currentMetadata?.workflowContext ? "EXISTS" : "NONE"
      }`,
    );

    let redisClient: RedisServerClient | null = null;
    let jobId: string | null = null;

    // For delegated jobs, send submit_job message before execution (for all executions, not just workflows)
    logger.info(`🚨 DELEGATED JOB CHECK: isDelegatedJob=${isDelegatedJob}`);
    if (isDelegatedJob) {
      logger.info(
        `🔄 STARTING DELEGATED JOB WEBSOCKET FLOW for ${step.nodeName}`,
      );
      try {
        redisClient = RedisServerClient.getInstance(
          process.env.REDIS_SERVER_URL,
          process.env.REDIS_SERVER_TOKEN,
          this.eventEmitter,
        );

        jobId = `job-delegated-${uuid()}`;

        // Use workflow context if available, otherwise use fallback values
        const workflowContext = this.currentMetadata?.workflowContext;
        const submitJobMessage = {
          type: "submit_job",
          message_id: jobId, // Use message_id to match ComfyUI/DirectJob format
          job_type: step.nodeName, // Use the actual service name (p5js, fetch_api, etc.)
          service_required: step.nodeName,
          payload: {}, // Empty payload for delegated jobs
          priority: workflowContext?.workflow_priority || 50,
          requirements: {
            service_type: step.nodeName,
          },
          step_number: workflowContext?.current_step || 1,
          total_steps: workflowContext?.total_steps || 1,
          timestamp: new Date().getTime(),
          workflow_datetime: workflowContext?.workflow_datetime || Date.now(),
          workflow_id: workflowContext?.workflow_id || id,
          workflow_priority: workflowContext?.workflow_priority || 50,
        };

        // Log the job submission for debugging
        logger.info(
          `📤 SENDING DELEGATED JOB:`,
          JSON.stringify(submitJobMessage, null, 2),
        );

        // Send submit_job message via WebSocket
        logger.info(`🔌 GETTING WEBSOCKET CONNECTION...`);
        const ws = await (redisClient as any).getWebSocket();
        logger.info(`📡 SENDING WEBSOCKET MESSAGE...`);
        ws.send(JSON.stringify(submitJobMessage));
        logger.info(
          `✅ MESSAGE_SENT - Delegated submit_job for ${step.nodeName}: ${jobId}`,
        );
      } catch (error) {
        logger.error(
          `Failed to send delegated submit_job for ${step.nodeName}:`,
          error,
        );
      }
    }

    const ctx = {
      uid: id,
      gid: gen.id,
      sid: step.id,
      userId,
      hash: gen.hash,
      seed,
      outputs: this.nodeStepOutputs[gen.id],
      currentNodeName: step.nodeName,
      workflowContext: this.currentMetadata?.workflowContext,
    };
    const nodeInput = await this.resolveInput(gen.id, step);

    logger.info(
      `⚡ EXECUTING NODE: ${step.nodeName} with context:`,
      JSON.stringify(
        {
          uid: ctx.uid,
          gid: ctx.gid,
          sid: ctx.sid,
          currentNodeName: ctx.currentNodeName,
          hasWorkflowContext: !!ctx.workflowContext,
        },
        null,
        2,
      ),
    );

    let output: any;
    let executionSuccess = true;

    try {
      logger.info(`🎬 CALLING node.execute() for ${step.nodeName}`);
      output = await node.execute(ctx, nodeInput);
      logger.info(`✅ NODE EXECUTION SUCCESS: ${step.nodeName}`);
    } catch (error) {
      logger.error(`❌ NODE EXECUTION FAILED: ${step.nodeName}`, error);
      executionSuccess = false;
      throw error; // Re-throw to maintain existing error handling
    } finally {
      // For delegated jobs, send completion message after execution (success or failure)
      if (isDelegatedJob && redisClient && jobId) {
        try {
          const delegatedResultMessage = {
            type: "delegated_job_result",
            job_id: jobId, // Use job_id for delegated_job_result messages
            result: {
              success: executionSuccess,
              data: executionSuccess ? "completed" : "fail", // Just status string: "completed", "retry", or "fail"
            },
            timestamp: new Date().getTime(),
          };

          // Log the delegated result for debugging
          logger.info(
            `📤 SENDING DELEGATED RESULT:`,
            JSON.stringify(delegatedResultMessage, null, 2),
          );

          // Send delegated_job_result message via WebSocket
          logger.info(`🔌 GETTING WEBSOCKET CONNECTION FOR RESULT...`);
          const ws = await (redisClient as any).getWebSocket();
          logger.info(`📡 SENDING RESULT WEBSOCKET MESSAGE...`);
          ws.send(JSON.stringify(delegatedResultMessage));
          logger.info(
            `✅ RESULT MESSAGE_SENT - delegated_job_result for ${step.nodeName}: ${jobId} (success: ${executionSuccess})`,
          );
        } catch (wsError) {
          logger.error(
            `Failed to send delegated_job_result for ${step.nodeName}:`,
            wsError,
          );
        }
      }
    }

    const nodeStepOutput: NodeStepOutput = {
      id: step.id,
      nodeName: step.nodeName,
      nodeAlias: step.alias,
      nodeResponse: output,
    };
    if (
      collectionId &&
      source !== "preview" &&
      step.id !== variableComponentId
    ) {
      const genInData = {
        ...rawInput,
        generations: { ...input.generations, hashes: [gen.hash] },
      };
      const generationOutput: GenerationOutput[] = [
        {
          id: id,
          steps: [...this.nodeStepOutputs[gen.id], nodeStepOutput],
          generation: { id: gen.id, hash: gen.hash },
        },
      ];
      const assets = await this.saveAsset({
        collectionId,
        input: genInData,
        outputs: generationOutput,
        source: "component_test",
        sourceId: `${collectionId}_${step.id}`,
      });
      for (const asset of assets) {
        await this.prisma.component_flat_file.create({
          data: {
            component_id: step.id,
            flat_file_id: asset.id,
          },
        });
      }
    }
    this.nodeStepOutputs[gen.id].push(nodeStepOutput);
    logger.info(
      `🏁 NODE COMPLETED: ${step.nodeName} - emitting node_completed event`,
    );
    this.eventEmitter.emit("node_completed", {
      args,
      nodeStepOutput,
    });

    if (node.name !== "variables") {
      const costBreakdown = creditCost.breakdown.find(
        (c) => c.nodeName === node.name,
      );
      if (!costBreakdown) {
        logger.warn(`Cost not found for component ${node.name}`);
        return;
      }
      this.captureGenerationEvent(
        userId,
        node.name,
        costBreakdown.cost,
        nodeInput,
      );
    }
  }

  private captureGenerationEvent(
    userId: string,
    component: string,
    cost: number,
    payload: any,
  ) {
    if (process.env.LOG_GENERATION !== "true") return;
    const ignoreProps = [
      "prompt",
      "negativePrompt",
      "negative_prompt",
      "promptText",
      "image",
      "seed",
    ];
    const keys = Object.keys(payload).filter(
      (key) => !ignoreProps.includes(key),
    );
    const properties = keys.reduce((acc, key) => {
      acc[key] = payload[key];
      return acc;
    }, {} as any);
    const eventProperties = {
      ...properties,
      $componentName: component,
      $creditCost: cost,
    };
    posthog.capture({
      distinctId: userId,
      event: "asset_generated",
      properties: eventProperties,
    });
  }

  private async resolveInput(gid: number, step: NodeStepInput) {
    // Create a deep copy of the payload to avoid modifying the original.
    let payload;
    if (typeof step.nodePayload === "object") {
      payload = JSON.parse(JSON.stringify(step.nodePayload));
    } else if (Array.isArray(step.nodePayload)) {
      payload = JSON.parse(JSON.stringify(step.nodePayload));
    }

    if (step.nodePayload.seed) delete step.nodePayload.seed;

    const refKeys = findRefKeys(payload);
    for (const key of refKeys) {
      const ref = payload[key] as DependencyRef;
      const output = this.nodeStepOutputs[gid].find(
        (output) => output.id === ref.$ref,
      );
      if (!output)
        throw new Error(`Could not find output of dependent component`);
      const result = await jq.run(ref.path, output?.nodeResponse, {
        input: "json",
        raw: true,
      });
      payload[key] = result;
    }

    return payload;
  }

  cleanup() {
    // Clean up ComfyWorkflowNode instances
    this.nodes.forEach((node) => {
      if ("destroy" in node && typeof (node as any).destroy === "function") {
        (node as any).destroy();
      }
    });
  }

  on(
    event:
      | "complete"
      | "error"
      | "image_generated"
      | "node_started"
      | "node_completed"
      | "node_progress",
    listener: (data: any) => void,
  ) {
    this.eventEmitter.on(event, listener);
    return this;
  }
}
