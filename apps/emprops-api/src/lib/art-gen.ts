import { PrismaClientType } from "@app/types/database";
import posthog from "../clients/posthog";
import { ExtraSingleImageRequest } from "../clients/stable-diffusion-client";
import { StorageClient } from "../clients/storage-client";
import logger from "../logger";
import {
  NodeExecutionPlan,
  NodeOutput,
  executeNodePlan,
} from "../modules/art-gen/nodes";
import { flattenObjectByKey } from "../utils";

import { from, merge } from "rxjs";
import { CreditNodeCost, CreditsService } from "./credits";
import { CreditCostV1 } from "./credits/calculator";

export type Variable = {
  name: string;
  value_type: string;
  value: any;
};

export interface UpscalerInput extends Omit<ExtraSingleImageRequest, "image"> {
  enabled: boolean;
}

export type EnhancerInput = {
  enabled: boolean;
  model: string;
  upscaler_model: string;
  steps: number;
  sampler_name: string;
  cfg_scale: number;
  denoising_strength: number;
  scale_factor: number;
  tile_overlap: number;
};

export type P5Input = {
  enabled: boolean;
  code: string;
};

export type GenerationInput = {
  id: string;
  version?: "v1";
  hashes: string[];
  generations: number;
  stable_diffusion_input: any;
  variables: Variable[];
  upscaler_input: UpscalerInput;
  p5_input: P5Input;
  enhancer_input?: EnhancerInput;
};

type NodeExecutionPlanInput = Omit<GenerationInput, "hashes" | "user_id"> & {
  hash: string;
};

type Config = {
  stableDiffusion: { headers: Record<string, string> };
};

// Centralize this constant to avoid duplication.
export const generatorUserId = "ffffffff-ffff-ffff-ffff-ffffffffffff";

export class GeneratorV1 {
  private callbacks: Record<string, (...args: any[]) => void> = {};

  constructor(
    private creditsService: CreditsService,
    private storageClient: StorageClient,
    private prisma: PrismaClientType,
    private config?: Config,
  ) {}

  on(
    event: "generation" | "error" | "complete",
    callback: (...args: any[]) => void,
  ) {
    this.callbacks[event] = callback;
    return this;
  }

  async generate(
    id: string,
    input: GenerationInput,
    userId: string,
    current_project_history_id?: string,
  ) {
    const { hashes, generations, ...rest } = input;

    const creditCost = (await this.creditsService.computeCredits(
      input,
    )) as CreditCostV1;

    if (userId !== generatorUserId) {
      const hasEnoughCredits = await this.creditsService.hasEnoughCredits(
        userId,
        input,
        generations,
      );

      if (!hasEnoughCredits) {
        throw new Error("Insufficient credits");
      }
    }

    const observables = hashes.map((hash, generationPosition) => {
      return from(
        new Promise<ReturnType<typeof this.parseNodeOutput> | null>(
          (resolve) => {
            const nodeExecutionPlan = this.getNodeExecutionPlan(
              {
                hash,
                generations,
                ...rest,
              },
              this.config,
            );
            executeNodePlan(nodeExecutionPlan)
              .then((output) => {
                const parsedOutput = this.parseNodeOutput(
                  input,
                  output,
                  hash,
                  generationPosition,
                );
                if (!userId || !id || process.env.LOG_GENERATION !== "true")
                  return parsedOutput;
                return this.logGeneration(
                  id,
                  userId,
                  parsedOutput,
                  creditCost,
                  generations,
                );
              })
              .then((output) =>
                this.decrementCredits(
                  output,
                  creditCost.total_cost,
                  userId,
                  `Generation (${id}, ${hash}, ${generationPosition})`,
                ),
              )
              .then((output) =>
                this.uploadImage(output, id, generationPosition, userId),
              )
              .then((output) => resolve(output))
              .catch((error) => {
                this.callbacks["error"](error);
                resolve(null);
              });
          },
        ),
      );
    });

    const mergedObservables = merge(...observables);

    const nodeOutputData: Omit<
      ReturnType<typeof this.parseNodeOutput>["data"],
      "image" | "p5_image"
    >[] = [];
    const subscription = mergedObservables.subscribe({
      next: (nodeOutput) => {
        if (!nodeOutput) return;
        if (current_project_history_id) {
          const { image: _, p5_image: __, ...rest } = nodeOutput.data;
          nodeOutputData.push(rest);
        }
        this.callbacks["generation"](nodeOutput);
      },
      complete: async () => {
        subscription.unsubscribe();
        if (nodeOutputData.length > 0 && current_project_history_id) {
          const projectHistory = await this.prisma.project_history.findUnique({
            where: { id: current_project_history_id },
          });
          if (projectHistory != null) {
            const images = JSON.parse(projectHistory.images as string);
            const previous = images?.current || [];
            const newImages = {
              current: nodeOutputData,
              previous,
            };
            await this.prisma.project_history.update({
              where: { id: current_project_history_id },
              data: { images: JSON.stringify(newImages) },
            });
          }
        }
        this.callbacks["complete"]();
      },
    });
  }

  async uploadImage(
    nodeOutput: ReturnType<typeof this.parseNodeOutput>,
    id: string,
    generationPosition: number,
    user_id?: string,
  ) {
    let fullPath = `generations/${user_id}/${id}/${generationPosition}/output.png`;
    if (!user_id) {
      fullPath = `generations/${id}/output.png`;
    }
    await this.storageClient.storeFile(
      fullPath,
      "image/png",
      Buffer.from(nodeOutput.data.image, "base64"),
    );
    nodeOutput.data.image_url = `${process.env.CLOUDFRONT_URL}/${fullPath}`;
    if (nodeOutput.data.p5_image) {
      const p5FullPath = `generations/${user_id}/${id}/${generationPosition}/p5.png`;
      await this.storageClient.storeFile(
        p5FullPath,
        "image/png",
        Buffer.from(nodeOutput.data.p5_image, "base64"),
      );
      nodeOutput.data.p5_image_url = `${process.env.CLOUDFRONT_URL}/${p5FullPath}`;
    }
    return nodeOutput;
  }

  async logGeneration(
    id: string,
    user_id: string,
    nodeOutput: ReturnType<typeof this.parseNodeOutput>,
    creditNodeCost: CreditNodeCost,
    generations: number,
  ) {
    const diffusionMetadata = nodeOutput.metadata.find(
      (it) => it.name === "txt2img" || it.name === "img2img",
    );
    if (!diffusionMetadata) return nodeOutput;
    const promptSize = diffusionMetadata.parameters.prompt.split(" ").length;
    const negPromptSize =
      diffusionMetadata.parameters.negative_prompt.split(" ").length;
    const totalExecutionTime = nodeOutput.metadata.reduce(
      (acc, it) => acc + Number(it.metadata.time || 0),
      0,
    );
    const nodeMetadata = nodeOutput.metadata.reduce((prev, curr) => {
      let prefix = curr.name;
      if (curr.name === "img2img" || curr.name === "txt2img") {
        prefix = "stable_diffusion";
      }
      const rawParams = flattenObjectByKey(curr.parameters, prefix);
      const {
        [prefix + "_prompt"]: _,
        [prefix + "_negative_prompt"]: __,
        ...params
      } = rawParams;
      return {
        ...prev,
        [prefix + "_time"]: Number(curr.metadata.time),
        [prefix + "_server_ip"]: curr.metadata.server,
        ...params,
      };
    }, {});
    const stableDiffusionApi = nodeOutput.metadata.find(
      (it) => it.name === "txt2img" || it.name === "img2img",
    );
    const image = Buffer.from(nodeOutput.data.image, "base64");
    let imageMetadata;
    try {
      const sharp = (await import("sharp")).default;
      imageMetadata = await sharp(image).metadata();
    } catch (error) {
      logger.warn('Sharp module not available, using fallback metadata:', error);
      imageMetadata = { width: 512, height: 512, channels: 3 }; // fallback
    }
    const generation = {
      id,
      user_id,
      stable_diffusion_prompt_size: promptSize,
      stable_diffusion_negative_prompt_size: negPromptSize,
      total_time: totalExecutionTime,
      image_width: imageMetadata.width,
      image_height: imageMetadata.height,
      image_size: imageMetadata.size,
      ...nodeMetadata,
      ...creditNodeCost,
      stable_diffusion_api: stableDiffusionApi?.name,
      total_requested_generations: generations,
    };
    logger.debug("Log generation: ", generation);
    posthog.capture({
      distinctId: user_id,
      event: "Image Generated",
      properties: generation,
    });
    return nodeOutput;
  }

  async decrementCredits(
    nodeOutput: ReturnType<typeof this.parseNodeOutput>,
    credits: number,
    userId: string,
    comment?: string,
  ) {
    // If the userId is the generator, then do not try and decrement credits.
    if (userId === generatorUserId) return nodeOutput;
    await this.creditsService.decrementCredits(userId, credits, comment);
    return nodeOutput;
  }

  getResponseFromNode(nodeOutput: NodeOutput[], id: string) {
    const result = nodeOutput.find((it) => it.id === id);
    if (!result) throw new Error(`Response from node ${id} not found.`);
    return result;
  }

  parseNodeOutput(
    insset: GenerationInput,
    nodeOutput: NodeOutput[],
    hash: string,
    generationPosition: number,
  ) {
    const pseudoRandomResponse = this.getResponseFromNode(
      nodeOutput,
      "pseudorandom",
    );

    const diffusionResponse = this.getResponseFromNode(nodeOutput, "diffusion");

    // Get the image from the corresponding node.
    let image;
    if (insset.upscaler_input.enabled) {
      const upscalerResponse = this.getResponseFromNode(nodeOutput, "upscaler");
      image = upscalerResponse.contents.data.image;
    } else if (insset.enhancer_input?.enabled) {
      const enhancerResponse = this.getResponseFromNode(nodeOutput, "enhancer");
      image = enhancerResponse.contents.data.images[0];
    } else {
      image = diffusionResponse.contents.data.images[0];
    }

    if (!image) throw new Error("Image not found in any node response");

    const p5Response = nodeOutput.find((it) => it.id === "p5");
    let p5Image;
    if (p5Response) {
      p5Image = p5Response.contents.data.image;
    }

    const nodeResultInfo = nodeOutput
      .filter((it) =>
        ["txt2img", "img2img", "upscaler", "p5", "enhancer"].includes(it.name),
      )
      .map((it) => {
        delete it.contents.parameters.images;
        delete it.contents.parameters.image;
        return {
          name: it.name,
          metadata: it.contents._meta,
          parameters: it.contents.parameters,
        };
      });

    return {
      metadata: nodeResultInfo,
      data: {
        position: generationPosition,
        hash,
        prompt: diffusionResponse.contents.data.parameters.prompt,
        values: {
          ...pseudoRandomResponse.contents.data,
          seed: diffusionResponse.contents.data.parameters.seed,
        },
        image,
        p5_image: p5Image,
        p5_image_url: null as string | null,
        image_url: null as string | null,
        image_mime_type: "image/png",
        p5_image_mime_type: "image/png",
      },
    };
  }

  getNodeExecutionPlan(
    {
      hash,
      stable_diffusion_input,
      variables,
      upscaler_input,
      p5_input,
      enhancer_input,
    }: NodeExecutionPlanInput,
    config?: Config,
  ): NodeExecutionPlan {
    const stableDiffusionConfig = {
      url: process.env.STABLE_DIFFUSION_URL,
      username: process.env.STABLE_DIFFUSION_USERNAME,
      password: process.env.STABLE_DIFFUSION_PASSWORD,
      headers: config?.stableDiffusion.headers,
    };
    const vars = this.variablesToObject(variables);
    const pseudorandomNode = {
      id: "pseudorandom",
      name: "pseudorandom",
      config: {
        hash,
      },
      input: {
        ...vars,
        seed: {
          type: "integer",
          value: {
            min: 1,
            max: 4294967295,
          },
        },
      },
      dependencies: [],
    };
    const variablesNames = variables.map((variable) => variable.name);
    const templateNode = {
      id: "template",
      name: "template",
      config: {},
      input: {
        template: stable_diffusion_input.prompt,
      },
      dependencies: [
        {
          source_id: "pseudorandom",
          source_output: variablesNames,
          target_input: "variables",
        },
      ],
    };
    const negativePromptTemplateNode = {
      id: "negative-prompt-template",
      name: "template",
      config: {},
      input: {
        template: stable_diffusion_input.negative_prompt,
      },
      dependencies: [
        {
          source_id: "pseudorandom",
          source_output: variablesNames,
          target_input: "variables",
        },
      ],
    };
    const txt2imgNode = {
      id: "diffusion",
      name: "txt2img",
      config: stableDiffusionConfig,
      input: stable_diffusion_input,
      dependencies: [
        {
          source_id: "template",
          source_output: "result",
          target_input: "prompt",
        },
        {
          source_id: "negative-prompt-template",
          source_output: "result",
          target_input: "negative_prompt",
        },
      ],
    };
    const img2imgNode = {
      id: "diffusion",
      name: "img2img",
      config: stableDiffusionConfig,
      input: stable_diffusion_input,
      dependencies: [
        {
          source_id: "template",
          source_output: "result",
          target_input: "prompt",
        },
        {
          source_id: "negative-prompt-template",
          source_output: "result",
          target_input: "negative_prompt",
        },
      ],
    };
    const enhancerNode = {
      id: "enhancer",
      name: "enhancer",
      config: stableDiffusionConfig,
      input: {
        width: stable_diffusion_input.width,
        height: stable_diffusion_input.height,
        override_settings: {
          sd_model_checkpoint: enhancer_input?.model,
          enable_pnginfo:
            stable_diffusion_input.override_settings.enable_pnginfo,
        },
        prompt: stable_diffusion_input.prompt,
        negative_prompt: stable_diffusion_input.negative_prompt,
        script_name: "sd upscale",
        script_args: [
          "",
          enhancer_input?.tile_overlap,
          enhancer_input?.upscaler_model,
          enhancer_input?.scale_factor,
        ],
        steps: enhancer_input?.steps,
        sampler_name: enhancer_input?.sampler_name,
        cfg_scale: enhancer_input?.cfg_scale,
        denoising_strength: enhancer_input?.denoising_strength,
        seed: stable_diffusion_input.seed,
      },
      dependencies: [
        {
          source_id: "diffusion",
          source_output: "images.0",
          target_input: "image",
        },
      ],
    };
    if (!stable_diffusion_input.seed_enabled) {
      txt2imgNode.dependencies.push({
        source_id: "pseudorandom",
        source_output: "seed",
        target_input: "seed",
      });
      img2imgNode.dependencies.push({
        source_id: "pseudorandom",
        source_output: "seed",
        target_input: "seed",
      });
      enhancerNode.dependencies.push({
        source_id: "pseudorandom",
        source_output: "seed",
        target_input: "seed",
      });
    } else if (stable_diffusion_input.seed_source === "variable") {
      txt2imgNode.dependencies.push({
        source_id: "pseudorandom",
        source_output: stable_diffusion_input.seed_variable,
        target_input: "seed",
      });
      img2imgNode.dependencies.push({
        source_id: "pseudorandom",
        source_output: stable_diffusion_input.seed_variable,
        target_input: "seed",
      });
      enhancerNode.dependencies.push({
        source_id: "pseudorandom",
        source_output: stable_diffusion_input.seed_variable,
        target_input: "seed",
      });
    }
    const upscaleNode = {
      id: "upscaler",
      name: "upscaler",
      config: stableDiffusionConfig,
      input: {
        ...upscaler_input,
      },
      dependencies: [],
    };
    const p5Node = {
      id: "p5",
      name: "p5",
      config: {
        url: process.env.PUPPETEER_API_URL,
      },
      input: {
        ...p5_input,
        hash,
      },
      dependencies: [
        {
          source_id: "pseudorandom",
          source_output: variablesNames,
          target_input: "variables",
        },
      ],
    };

    // Setup nodes.
    const nodes = [];
    nodes.push(pseudorandomNode);
    nodes.push(templateNode);
    nodes.push(negativePromptTemplateNode);
    if (p5_input.enabled) {
      nodes.push(p5Node);
      img2imgNode.dependencies.push({
        source_id: "p5",
        source_output: "image",
        target_input: "image",
      });
      nodes.push(img2imgNode);
    } else if (stable_diffusion_input.img2img_enabled) {
      if (stable_diffusion_input.img2img_source === "fixed") {
        nodes.push(img2imgNode);
      } else if (stable_diffusion_input.img2img_source === "variable") {
        img2imgNode.dependencies.push({
          source_id: "pseudorandom",
          source_output: stable_diffusion_input.image_variable,
          target_input: "image",
        });
        nodes.push(img2imgNode);
      }
    } else {
      nodes.push(txt2imgNode);
    }
    if (enhancer_input?.enabled) {
      nodes.push(enhancerNode);
      upscaleNode.dependencies.push({
        source_id: "enhancer",
        source_output: "images.0",
        target_input: "image",
      } as never);
    } else {
      upscaleNode.dependencies.push({
        source_id: "diffusion",
        source_output: "images.0",
        target_input: "image",
      } as never);
    }
    if (upscaler_input.enabled) nodes.push(upscaleNode);
    return nodes;
  }

  variablesToObject(variables: any[]) {
    return variables.reduce((acc: Record<string, any>, variable) => {
      acc[variable.name] = {
        type: variable.type,
        value: variable.value,
      };
      return acc;
    }, {});
  }
}
