import P5 from "./node-p5";
import Pseudonrandom from "./node-pseudorandom";
import Template from "./node-template";
import Txt2ImgNode from "./node-txt2img";
import Upscaler from "./node-upscaler";
import Img2ImgNode from "./nodes-img2img";

export interface NodeCall {
  id: string;
  name: string;
  config: Record<string, unknown>;
  input: object;
  dependencies:
    | {
        source_id: string;
        source_output: string | string[];
        target_input: string;
      }[]
    | undefined;
}

export type NodeFunction<C, I, O> = (config: C, input: I) => Promise<O>;

export type NodeOutputData<T> = {
  _meta: Record<string, any>;
  parameters: Record<string, any>;
  data: T;
};

export type NodeOutput = {
  id: string;
  name: string;
  contents: NodeOutputData<any>;
};

export type NodeExecutionPlan = NodeCall[];

const nodes: Record<string, NodeFunction<any, any, any>> = {
  txt2img: Txt2ImgNode,
  pseudorandom: Pseudonrandom,
  template: Template,
  upscaler: Upscaler,
  img2img: Img2ImgNode,
  p5: P5,
  enhancer: Img2ImgNode,
};

export async function executeNodePlan(plan: NodeExecutionPlan) {
  const outputs = [] as NodeOutput[];

  for (const node of plan) {
    if (node.dependencies) {
      for (const dep of node.dependencies) {
        const node = plan.find((node) => node.id === dep.source_id);
        if (!node) throw new Error(`No node found for id ${dep.source_id}`);
        await executeNode(node, outputs);
      }
    }
    await executeNode(node, outputs);
  }

  return outputs;
}

export async function executeNode(nodeCall: NodeCall, outputs: NodeOutput[]) {
  if (outputs.find((output) => output.id === nodeCall.id)) return;
  const nodeFunction = nodes[nodeCall.name];
  if (!nodeFunction)
    throw new Error(`No node function with name ${nodeCall.name}`);
  const input = resolveInput(nodeCall, outputs);
  const contents = await nodeFunction(nodeCall.config, input);
  outputs.push({ id: nodeCall.id, name: nodeCall.name, contents });
}

// What a beauty bro: https://stackoverflow.com/questions/8051975/access-object-child-properties-using-a-dot-notation-string
export function getDescendantProp(obj: any, desc: string) {
  const arr = desc.split(".");
  while (arr.length && (obj = obj[arr.shift() as string]));
  return obj;
}

export function resolveInput(nodeCall: NodeCall, outputs: NodeOutput[]) {
  const result = {} as Record<string, any>;

  if (nodeCall.dependencies) {
    for (const deps of nodeCall.dependencies) {
      const output = outputs.find((output) => output.id === deps.source_id);
      if (!output) throw new Error(`No output for node ${deps.source_id}`);
      if (Array.isArray(deps.source_output)) {
        const obj = {} as Record<string, any>;
        for (const prop of deps.source_output) {
          const value = getDescendantProp(output.contents.data, prop);
          obj[prop] = value;
        }
        result[deps.target_input] = obj;
      } else {
        const value = getDescendantProp(
          output.contents.data,
          deps.source_output,
        );
        result[deps.target_input] = value;
      }
    }
  }

  return { ...nodeCall.input, ...result };
}
