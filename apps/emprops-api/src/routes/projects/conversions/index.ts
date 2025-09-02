import { PrismaClientType } from "@app/types/database";
import { variableComponentId } from "../../../modules/art-gen/nodes-v2";
import { Prisma, PrismaClient } from '@emp/database';
import { Request, Response } from "express";

enum V1Checkpoints {
  v15_ckpt = "v1-5-pruned.ckpt [e1441589a6]",
  v15_safetensors = "v1-5-pruned.safetensors [1a189f0be6]",
  v21_ckpt = "v2-1_768-ema-pruned.ckpt [ad2a33c361]",
  v21_safetensors = "v2-1_768-ema-pruned.safetensors [dcd690123c]",
  sdxl_safetensors = "sd_xl_base_1.0.safetensors [31e35c80fc]",
  sdxl_vae_safetensors = "sd_xl_base_1.0_0.9vae.safetensors [e6bb9ea85b]",
  sdxl_refiner_safetensors = "sd_xl_refiner_1.0.safetensors [7440042bbd]",
  sdxl_refiner_safetensors_9vae = "sd_xl_refiner_1.0_0.9vae.safetensors [8d0ce6c016]",
  juggernaut_v8_safetensors = "juggernautXL_v8Rundiffusion.safetensors [aeb7e9e689]",
  epicphotogasm_safetensors = "epiCPhotoGasm.safetensors [62bb78983a]",
}

enum V2Checkpoints {
  v15_ckpt = "v1-5-pruned.ckpt",
  v15_safetensors = "v1-5-pruned.safetensors",
  v21_ckpt = "v2-1_768-ema-pruned.ckpt",
  v21_safetensors = "v2-1_768-ema-pruned.safetensors",
  sdxl_safetensors = "sd_xl_base_1.0.safetensors",
  sdxl_vae_safetensors = "sd_xl_base_1.0_0.9vae.safetensors",
  sdxl_turbo_safetensors = "sd_xl_turbo_1.0_fp16.safetensors",
  epicphotogasm_safetensors = "epicphotogasm_v1.safetensors",
  juggernaut_v8_safetensors = "juggernautXL_v8Rundiffusion.safetensors",
  juggernaut_v9_safetensors = "JuggernautXL_v9_RunDiffusionPhoto_v2.safetensors",
  realistic_vision_safetensors = "realisticVisionV51_v51VAE.safetensors",
}

function getCheckpoint(v1: any) {
  switch (v1.stable_diffusion_input.override_settings.sd_model_checkpoint) {
    case V1Checkpoints.v15_ckpt:
    case V1Checkpoints.v15_safetensors:
      return V2Checkpoints.v15_safetensors;
    case V1Checkpoints.v21_ckpt:
    case V1Checkpoints.v21_safetensors:
      return V2Checkpoints.v21_safetensors;
    case V1Checkpoints.sdxl_safetensors:
    case V1Checkpoints.sdxl_vae_safetensors:
      return V2Checkpoints.sdxl_vae_safetensors;
    case V1Checkpoints.juggernaut_v8_safetensors:
      return V2Checkpoints.juggernaut_v8_safetensors;
    case V1Checkpoints.epicphotogasm_safetensors:
      return V2Checkpoints.epicphotogasm_safetensors;
    default:
      return V2Checkpoints.sdxl_vae_safetensors;
  }
}

enum V1UpscalerModels {
  NONE = "None",
  LANCZOS = "Lanczos",
  NEAREST = "Nearest",
  ESRGAN_4X = "ESRGAN_4x",
  R_ESRGAN_4X = "R-ESRGAN 4x+",
  R_ESRGAN_4X_PLUS_ANIME_6B = "R-ESRGAN 4x+ Anime6B",
  SCUNET = "ScuNET",
  SCUNET_PSNR = "ScuNET PSNR",
  _4X_ULTRASHARP = "4x-UltraSharp",
}

enum V2UpscalerModels {
  _4X_ULTRASHARP = "4x-UltraSharp.pth",
  _4X_ESRGAN = "4x-ESRGAN.pth",
  R_ESRGAN_X2_PLUS = "RealESRGAN_x2plus.pth",
  R_ESRGAN_X4_PLUS = "RealESRGAN_x4plus.pth",
  R_ESRGAN_X4_PLUS_ANIME_6B = "RealESRGAN_x4plus_anime_6B.pth",
}

function getUpscalerModel(v1: any) {
  switch (v1.upscaler_input.upscaler_1) {
    case V1UpscalerModels.ESRGAN_4X:
      return V2UpscalerModels._4X_ESRGAN;
    case V1UpscalerModels.R_ESRGAN_4X:
      return V2UpscalerModels.R_ESRGAN_X4_PLUS;
    case V1UpscalerModels.R_ESRGAN_4X_PLUS_ANIME_6B:
      return V2UpscalerModels.R_ESRGAN_X4_PLUS_ANIME_6B;
    case V1UpscalerModels.NONE:
    case V1UpscalerModels.LANCZOS:
    case V1UpscalerModels.NEAREST:
    case V1UpscalerModels.SCUNET:
    case V1UpscalerModels.SCUNET_PSNR:
    case V1UpscalerModels._4X_ULTRASHARP:
      return V2UpscalerModels._4X_ULTRASHARP;
    default:
      throw new Error("Upscaler model not found");
  }
}

const V1Samplers = {
  EULER_A: "Euler a",
  EULER: "Euler",
  LMS: "LMS",
  HEUN: "Heun",
  DPM2: "DPM2",
  DPM2_A: "DPM2 a",
  DPM2_KARRAS: "DPM2 Karras",
  DPM2_A_KARRAS: "DPM2 a Karras",
  DPMPP_2S_A: "DPM++ 2S a",
  DPMPP_2S_A_KARRAS: "DPM++ 2S a Karras",
  DPMPP_SDE: "DPM++ SDE",
  DPMPP_SDE_KARRAS: "DPM++ SDE Karras",
  DPMPP_2M: "DPM++ 2M",
  DPMPP_2M_KARRAS: "DPM++ 2M Karras",
  DPMPP_2M_SDE: "DPM++ 2M SDE",
  DPMPP_2M_SDE_KARRAS: "DPM++ 2M SDE Karras",
  DPMPP_2M_SDE_EXPONENTIAL: "DPM++ 2M SDE Exponential",
  DPMPP_2M_SDE_HEUN: "DPM++ 2M SDE Heun",
  DPMPP_2M_SDE_HEUN_KARRAS: "DPM++ 2M SDE Heun Karras",
  DPMPP_2M_SDE_HEUN_EXPONENTIAL: "DPM++ 2M SDE Heun Exponential",
  DPMPP_3M_SDE: "DPM++ 3M SDE",
  DPMPP_3M_SDE_KARRAS: "DPM++ 3M SDE Karras",
  DPMPP_3M_SDE_EXPONENTIAL: "DPM++ 3M SDE Exponential",
  DPM_FAST: "DPM fast",
  DPM_ADAPTIVE: "DPM adaptive",
  LMS_KARRAS: "LMS Karras",
  RESTART: "Restart",
  DDIM: "DDIM",
  PLMS: "PLMS",
  UNIPC: "UniPC",
};

const V2Samplers = {
  EULER: "euler",
  EULER_CFG_PP: "euler_cfg_pp",
  EULER_ANCESTRAL: "euler_ancestral",
  EULER_ANCESTRAL_CFG_PP: "euler_ancestral_cfg_pp",
  HEUN: "heun",
  HEUNPP2: "heunpp2",
  DPM_2: "dpm_2",
  DPM_2_ANCESTRAL: "dpm_2_ancestral",
  LMS: "lms",
  DPM_FAST: "dpm_fast",
  DPM_ADAPTIVE: "dpm_adaptive",
  DPMPP_2S_ANCESTRAL: "dpmpp_2s_ancestral",
  DPMPP_SDE: "dpmpp_sde",
  DPMPP_SDE_GPU: "dpmpp_sde_gpu",
  DPMPP_2M: "dpmpp_2m",
  DPMPP_2M_SDE: "dpmpp_2m_sde",
  DPMPP_2M_SDE_GPU: "dpmpp_2m_sde_gpu",
  DPMPP_3M_SDE: "dpmpp_3m_sde",
  DPMPP_3M_SDE_GPU: "dpmpp_3m_sde_gpu",
  DDPM: "ddpm",
  LCM: "lcm",
  IPNDM: "ipndm",
  IPNDM_V: "ipndm_v",
  DEIS: "deis",
  DDIM: "ddim",
  UNI_PC: "uni_pc",
  UNI_PC_BH2: "uni_pc_bh2",
};

function mapV1ToV2Sampler(v1Sampler: string) {
  const mapping = {
    [V1Samplers.EULER]: V2Samplers.EULER,
    [V1Samplers.EULER_A]: V2Samplers.EULER_ANCESTRAL,
    [V1Samplers.LMS]: V2Samplers.LMS,
    [V1Samplers.HEUN]: V2Samplers.HEUN,
    [V1Samplers.DPM2]: V2Samplers.DPM_2,
    [V1Samplers.DPM2_A]: V2Samplers.DPM_2_ANCESTRAL,
    [V1Samplers.DPM2_KARRAS]: V2Samplers.DPM_2,
    [V1Samplers.DPM2_A_KARRAS]: V2Samplers.DPM_2_ANCESTRAL,
    [V1Samplers.DPMPP_2S_A]: V2Samplers.DPMPP_2S_ANCESTRAL,
    [V1Samplers.DPMPP_2S_A_KARRAS]: V2Samplers.DPMPP_2S_ANCESTRAL,
    [V1Samplers.DPMPP_SDE]: V2Samplers.DPMPP_SDE,
    [V1Samplers.DPMPP_SDE_KARRAS]: V2Samplers.DPMPP_SDE,
    [V1Samplers.DPMPP_2M]: V2Samplers.DPMPP_2M,
    [V1Samplers.DPMPP_2M_KARRAS]: V2Samplers.DPMPP_2M,
    [V1Samplers.DPMPP_2M_SDE]: V2Samplers.DPMPP_2M_SDE,
    [V1Samplers.DPMPP_2M_SDE_KARRAS]: V2Samplers.DPMPP_2M_SDE,
    [V1Samplers.DPMPP_2M_SDE_EXPONENTIAL]: V2Samplers.DPMPP_2M_SDE_GPU,
    [V1Samplers.DPMPP_2M_SDE_HEUN]: V2Samplers.DPMPP_2M_SDE_GPU,
    [V1Samplers.DPMPP_2M_SDE_HEUN_KARRAS]: V2Samplers.DPMPP_2M_SDE_GPU,
    [V1Samplers.DPMPP_2M_SDE_HEUN_EXPONENTIAL]: V2Samplers.DPMPP_2M_SDE_GPU,
    [V1Samplers.DPMPP_3M_SDE]: V2Samplers.DPMPP_3M_SDE,
    [V1Samplers.DPMPP_3M_SDE_KARRAS]: V2Samplers.DPMPP_3M_SDE,
    [V1Samplers.DPMPP_3M_SDE_EXPONENTIAL]: V2Samplers.DPMPP_3M_SDE_GPU,
    [V1Samplers.DPM_FAST]: V2Samplers.DPM_FAST,
    [V1Samplers.DPM_ADAPTIVE]: V2Samplers.DPM_ADAPTIVE,
    [V1Samplers.LMS_KARRAS]: V2Samplers.LMS,
    [V1Samplers.RESTART]: V2Samplers.DDPM,
    [V1Samplers.DDIM]: V2Samplers.DDIM,
    [V1Samplers.PLMS]: V2Samplers.DDPM,
    [V1Samplers.UNIPC]: V2Samplers.UNI_PC,
  };

  return mapping[v1Sampler] || null; // Return null if no mapping is found
}

function splitByPlaceholders(input: string): string[] {
  const regex = /({{.*?}})/g; // Regular expression to match text inside {{...}}
  const parts: string[] = [];
  let lastIndex = 0;

  input.replace(regex, (match, _, offset) => {
    // Add the text before the placeholder to the result
    if (lastIndex < offset) {
      parts.push(input.slice(lastIndex, offset));
    }
    // Add the matched placeholder to the result
    parts.push(match);
    // Update the last index to the end of the matched placeholder
    lastIndex = offset + match.length;
    return match; // Return the match to avoid changing anything
  });

  // Add the remaining part of the string after the last placeholder
  if (lastIndex < input.length) {
    parts.push(input.slice(lastIndex));
  }

  return parts;
}

function convertPrompt(v1: any, prompt: string) {
  if (prompt === "") {
    return JSON.stringify([
      {
        type: "paragraph",
        children: [
          {
            text: "",
          },
        ],
      },
    ]);
  }
  const parts = splitByPlaceholders(prompt);
  const children = [] as any[];
  for (const part of parts) {
    if (part.startsWith("{{")) {
      const variableName = part.slice(2, -2);
      const variable = v1.variables.find((v: any) => v.name === variableName);
      if (variable) {
        children.push({
          type: "variable",
          variable,
          children: [
            {
              text: "",
            },
          ],
        });
      }
    } else {
      children.push({
        text: part,
      });
    }
  }
  return JSON.stringify([
    {
      type: "paragraph",
      children,
    },
  ]);
}

export async function convertV1toV2(tx: any, collection: any, v1: any) {
  const v2 = {
    steps: [] as any[],
    version: "v2",
    variables: [],
    generations: {
      hashes: ["uWCkKMYQnAeSETlQgXXjgv5rpsqQ4wOksnStXFck1PtrBy9TEVg"],
      generations: 1,
      use_custom_hashes: false,
    },
  };

  // Convert generations
  v2.generations = {
    hashes: v1.hashes || [],
    generations: v1.generations || 1,
    use_custom_hashes: v1.use_custom_hashes || false,
  };

  // Convert variables
  v2.variables = v1.variables.map((variable: any) => {
    return {
      ...variable,
      value_type: variable.value_type || variable.valueType,
    };
  });

  // Convert steps
  const stableDiffusionComponent = await tx.component.create({
    data: {
      collection_id: collection.id,
    },
  });
  if (!v1.stable_diffusion_input) {
    const step = {
      id: parseInt(stableDiffusionComponent.id),
      nodeName: "txt2img-comfy",
      alias: "txt2img",
      nodePayload: {
        prompt: convertPrompt(v1, ""),
        negative_prompt: convertPrompt(v1, ""),
        width: 512,
        height: 512,
        seed: 0,
        steps: 20,
        cfg: 0.7,
        sampler: "euler",
        scheduler: "normal",
        model: V2Checkpoints.v15_safetensors,
      },
    };
    v2.steps.push(step);
  } else if (!v1.stable_diffusion_input.img2img_enabled) {
    // If img2img is not enabled, we need to add a txt2img component.
    const step = {
      id: parseInt(stableDiffusionComponent.id),
      nodeName: "txt2img-comfy",
      alias: "txt2img",
      nodePayload: {
        prompt: convertPrompt(v1, v1.stable_diffusion_input.prompt),
        negative_prompt: convertPrompt(
          v1,
          v1.stable_diffusion_input.negative_prompt,
        ),
        width: v1.stable_diffusion_input.width,
        height: v1.stable_diffusion_input.height,
        seed: v1.stable_diffusion_input.seed,
        steps: v1.stable_diffusion_input.steps,
        cfg: v1.stable_diffusion_input.cfg_scale,
        sampler: mapV1ToV2Sampler(v1.stable_diffusion_input.sampler_name),
        scheduler: "normal",
        model: getCheckpoint(v1),
      },
    };
    v2.steps.push(step);
  } else {
    // If img2img is enabled, we need to add an img2img component.
    let step = {
      id: parseInt(stableDiffusionComponent.id),
      nodeName: "img2img-comfy",
      alias: "img2img",
      nodePayload: {
        prompt: convertPrompt(v1, v1.stable_diffusion_input.prompt),
        negative_prompt: convertPrompt(
          v1,
          v1.stable_diffusion_input.negative_prompt,
        ),
        width: v1.stable_diffusion_input.width,
        height: v1.stable_diffusion_input.height,
        seed: v1.stable_diffusion_input.seed,
        steps: v1.stable_diffusion_input.steps,
        cfg: v1.stable_diffusion_input.cfg_scale,
        sampler: mapV1ToV2Sampler(v1.stable_diffusion_input.sampler_name),
        scheduler: "normal",
        model: getCheckpoint(v1),
        image: v1.stable_diffusion_input.image,
        denoising: v1.stable_diffusion_input.denoising_strength,
      },
    };
    if (v1.stable_diffusion_input.img2img_source === "fixed") {
      step = {
        ...step,
        nodePayload: {
          ...step.nodePayload,
          image: v1.stable_diffusion_input.image,
        },
      };
    } else if (v1.stable_diffusion_input.img2img_source === "variable") {
      step = {
        ...step,
        nodePayload: {
          ...step.nodePayload,
          image: {
            tag: "vars",
            $ref: variableComponentId,
            path: `.data.${v1.stable_diffusion_input.image_variable}`,
          },
        },
      };
    } else if (
      v1.stable_diffusion_input.img2img_source === "p5" &&
      v1.p5_input?.enabled
    ) {
      const component = await tx.component.create({
        data: {
          collection_id: collection.id,
        },
      });
      const p5Step = {
        id: parseInt(component.id),
        nodeName: "p5",
        alias: "p5",
        nodePayload: {
          code: v1.p5_input.code,
        },
      };
      v2.steps = [p5Step, ...v2.steps];
      step = {
        ...step,
        nodePayload: {
          ...step.nodePayload,
          image: {
            $ref: parseInt(component.id),
            path: ".src",
          },
        },
      };
    }
    v2.steps.push(step);
  }
  if (v1.upscaler_input?.enabled) {
    const component = await tx.component.create({
      data: {
        collection_id: collection.id,
      },
    });
    const step = {
      id: parseInt(component.id),
      nodeName: "upscaler-comfy",
      alias: "upscaler",
      nodePayload: {
        image: {
          $ref: parseInt(stableDiffusionComponent.id),
          path: ".src",
        },
        model: getUpscalerModel(v1),
        scaleBy: v1.upscaler_input.upscaling_resize,
      },
    };
    v2.steps.push(step);
  }
  return v2;
}

export default function (prisma: PrismaClientType) {
  return async function (req: Request, res: Response) {
    const userId = req.headers["user_id"] as string;
    const projectId = req.params.id;
    try {
      const result = await prisma.$transaction(async (tx) => {
        const project = await tx.project.findUniqueOrThrow({
          where: { id: projectId, user_id: userId },
        });
        if (project.version === "v2") {
          return res
            .status(400)
            .json({ data: null, error: "Project is not a v1 project" });
        }
        const newProject = await tx.project.create({
          data: {
            name: project.name,
            user_id: project.user_id,
            version: "v2",
          },
        });
        const projectHistory = await tx.project_history.findMany({
          where: { project_id: projectId },
        });
        let i = 0;
        for (const history of projectHistory) {
          const collection = await tx.collection.create({
            data: {
              title: history.name,
              project_id: newProject.id,
              is_current: i++ === 0,
            },
          });
          const data = await convertV1toV2(
            tx,
            collection,
            JSON.parse(history.data as string),
          );
          await tx.collection.update({
            where: { id: collection.id },
            data: { data },
          });
        }
        return newProject;
      });
      return res.status(200).json({ data: result, error: null });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        switch (e.code) {
          case "P2025":
            return res
              .status(404)
              .json({ data: null, error: "Project not found" });
          default:
            return res
              .status(500)
              .json({ data: null, error: "An error occurred" });
        }
      }
    }
  };
}
