import { PrismaClientType } from "@app/types/database";
import { Model } from "../../../clients/stable-diffusion-client";
import { GenerationInput as GenerationInputV1 } from "../../art-gen";
import { GenerationInput as GenerationInputV2 } from "../../../modules/art-gen/nodes-v2";

import { VM } from "vm2";

export type CreditCostV1 = {
  stable_diffusion_cost: number;
  p5_cost: number;
  upscaler_cost: number;
  enhancer_cost: number;
  total_cost: number;
};

export type CreditCostV2 = {
  total_cost: number;
  breakdown: {
    nodeName: string;
    cost: number;
  }[];
};

interface CreditCostCalculator {
  calculateCost(
    insset: any,
    metadata?: any,
  ): Promise<CreditCostV1 | CreditCostV2>;
}

class CreditCostCalculatorV2 implements CreditCostCalculator {
  private vm: VM;
  private prisma: PrismaClientType;

  constructor(prisma: PrismaClientType) {
    this.vm = new VM({
      timeout: 1000,
      sandbox: {},
    });
    this.prisma = prisma;
  }

  async calculateCost(
    input: GenerationInputV2,
    metadata?: any,
  ): Promise<CreditCostV2> {
    const usedComponents = input.steps.filter(
      (step) =>
        !step.isTest && (!(metadata?.source === "test_workflow") || !step.skip),
    );
    const allComponents = usedComponents.map((step) => step.nodeName);
    const workflows = await this.prisma.workflow.findMany({
      where: {
        name: {
          in: allComponents,
        },
      },
    });
    const formulas = workflows.reduce(
      (acc, curr) => {
        const data = curr.data as any;
        if (!data) {
          return acc;
        }
        acc[curr.name] = data.credits_script;
        return acc;
      },
      {} as Record<string, string>,
    );
    const breakdown = usedComponents.map((step) => {
      const script = formulas[step.nodeName];
      if (!script) {
        return {
          nodeName: step.nodeName,
          cost: 1,
        };
      }
      try {
        this.vm.run(script);
        const computeCost = this.vm.run("computeCost");
        if (!computeCost) {
          return {
            nodeName: step.nodeName,
            cost: 1,
          };
        }
        const data = computeCost(step.nodePayload);
        return {
          nodeName: step.nodeName,
          cost: data.cost,
        };
      } catch (e) {
        return {
          nodeName: step.nodeName,
          cost: 1,
        };
      }
    });
    const totalCost = breakdown.reduce((acc, curr) => acc + curr.cost, 0);
    return {
      total_cost: totalCost,
      breakdown,
    };
  }
}

class CreditCostCalculatorV1 implements CreditCostCalculator {
  async calculateCost(insset: GenerationInputV1): Promise<CreditCostV1> {
    const stableDiffusionCost = this.computeStableDiffusionCost(insset);
    const p5Cost = this.computeP5Cost(insset);
    const upscalerCost = this.computeUpscalerCost(insset);
    const enhancerCost = this.getEnhancerCost(insset);
    return {
      stable_diffusion_cost: stableDiffusionCost,
      p5_cost: p5Cost,
      upscaler_cost: upscalerCost,
      enhancer_cost: enhancerCost,
      total_cost: stableDiffusionCost + p5Cost + upscalerCost + enhancerCost,
    };
  }

  private computeStableDiffusionCost(insset: GenerationInputV1) {
    const width = insset.stable_diffusion_input.width;
    const height = insset.stable_diffusion_input.height;
    const steps = insset.stable_diffusion_input.steps;
    const model =
      insset.stable_diffusion_input.override_settings.sd_model_checkpoint;
    if (insset.stable_diffusion_input.refiner_enabled) {
      const refinerSwitchAt = insset.stable_diffusion_input.refiner_switch_at;
      const modelSteps = steps * refinerSwitchAt;
      const modelCost =
        (width * height * modelSteps) /
        1_000_000 /
        this.getModelConstant(model);
      const refinerSteps = steps * (1 - refinerSwitchAt);
      const refinerCost =
        (width * height * refinerSteps) /
        1_000_000 /
        this.getModelConstant(Model.SD_XL_BASE_1_0);
      const totalCost = modelCost + refinerCost;
      return Number(totalCost.toFixed(2));
    } else {
      const totalCost =
        (width * height * steps) / 1_000_000 / this.getModelConstant(model);
      return Number(totalCost.toFixed(2));
    }
  }

  private computeP5Cost(insset: GenerationInputV1) {
    return insset.p5_input.enabled ? 0.5 : 0;
  }

  private computeUpscalerCost(insset: GenerationInputV1) {
    return insset.upscaler_input.enabled
      ? insset.upscaler_input.upscaling_resize || 0
      : 0;
  }

  private getModelConstant(model: Model) {
    switch (model) {
      case Model.V1_5_DEPRECATED:
      case Model.V2_1_DEPRECATED:
      case Model.V1_5:
      case Model.V2_1:
      case Model.EPIC_PHOTOGASM:
        return 41;
      case Model.SD_XL_BASE_1_0_DEPRECATED:
      case Model.JUGGERNAUT_XL_V8_DEPRECATED:
      case Model.SD_XL_BASE_1_0:
      case Model.JUGGERNAUT_XL_V8:
      case Model.JUGGERNAUT_XL_V9:
        return 31.5;
      default:
        return 0;
    }
  }

  private getEnhancerCost(insset: GenerationInputV1) {
    return insset.enhancer_input?.enabled ? 1 : 0;
  }
}

export class CreditsCalculator {
  private v1Calculator: CreditCostCalculatorV1;
  private v2Calculator: CreditCostCalculatorV2;

  constructor(private prisma: PrismaClientType) {
    this.v1Calculator = new CreditCostCalculatorV1();
    this.v2Calculator = new CreditCostCalculatorV2(this.prisma);
  }

  calculateCost<T extends Promise<CreditCostV1 | CreditCostV2>>(
    insset: any,
    metadata?: any,
  ): T {
    if (insset.version === "v1" || typeof insset.version === "undefined") {
      return this.v1Calculator.calculateCost(insset) as T;
    } else if (insset.version === "v2") {
      return this.v2Calculator.calculateCost(insset, metadata) as T;
    }
    throw new Error("Unsupported version");
  }
}
