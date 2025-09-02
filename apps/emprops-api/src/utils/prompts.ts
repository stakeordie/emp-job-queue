import { Context } from "../modules/art-gen/nodes-v2/nodes";
import { fetchText } from "./fetch";

function serializeElement(node: any) {
  if (node.text !== undefined) {
    return node.text;
  }

  if (node.type && node.type === "variable" && node.variable) {
    return `$${node.variable.name}`;
  }

  if (node.type && node.type == "component" && node.component) {
    return `#${node.component.id}`;
  }

  if (node.children && Array.isArray(node.children)) {
    return node.children.map((it: any) => serializeElement(it)).join("");
  }

  return "";
}

export function serializeDocument(document: any) {
  return document.map((it: any) => serializeElement(it)).join("\n");
}

export async function preprocessPrompts(
  workflowData: any,
  runnableWorkflow: any,
  body: any,
  ctx: Context,
) {
  const form = workflowData.form;
  const inputs = workflowData.inputs;
  const prompts = form.fields.filter((it: any) => it.type === "prompt_editor");
  for (const prompt of prompts) {
    const value = body[prompt.id];
    if (!value) continue;
    const processedValue = await preprocessPrompt(value, ctx);
    const fieldIdAndName = findIdAndFieldName(inputs, prompt.id);
    if (!fieldIdAndName) continue;
    runnableWorkflow[fieldIdAndName.id]["inputs"][fieldIdAndName.value] =
      processedValue;
  }
}

function findIdAndFieldName(data: any, field: string) {
  for (const [id, entries] of Object.entries(data)) {
    for (const [key, entry] of Object.entries(entries as any)) {
      if ((entry as any).value === field) {
        return { id, value: key };
      }
    }
  }
  return null;
}

export async function preprocessPrompt(prompt: string, ctx: Context) {
  const variablesComponentOutput = ctx.outputs.find(
    (it) => it.nodeName === "variables",
  );
  if (!variablesComponentOutput) return prompt;
  const variablesValues = variablesComponentOutput.nodeResponse.data as Record<
    string,
    string
  >;
  let result = serializeDocument(JSON.parse(prompt));
  for (const variable in variablesValues) {
    let value = variablesValues[variable];
    // Fetch the value if it's a URL and ends with .txt
    if (
      typeof value === "string" &&
      value.startsWith("http") &&
      value.endsWith(".txt")
    ) {
      value = await fetchText(value);
    }
    result = result.replaceAll(new RegExp(`\\$${variable}\\b`, "g"), value);
  }
  const matches = result.match(/#[0-9]+/g);
  if (matches) {
    for (const match of matches) {
      const componentId = parseInt(match.substring(1));
      const componentOutput = ctx.outputs.find((it) => it.id === componentId);
      if (
        componentOutput &&
        componentOutput.nodeResponse.src.endsWith(".txt")
      ) {
        const value = await fetchText(componentOutput.nodeResponse.src);
        result = result.replace(match, value);
      }
    }
  }
  return result;
}
