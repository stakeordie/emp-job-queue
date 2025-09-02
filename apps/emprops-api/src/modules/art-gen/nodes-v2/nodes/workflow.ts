import logger from "../../../../logger";
import { Context, ImageNodeOutput } from ".";
import { ComfyNode as BaseComfyWorkflowNode } from "./comfy";

export class ComfyWorkflowNode extends BaseComfyWorkflowNode {
  async execute(context: Context, rawPayload: any): Promise<ImageNodeOutput> {
    const workflow = await this.workflowRunner.getWorkflow(this.name);
    if (!workflow) throw new Error(`Workflow ${this.name} not found`);
    const prefix = this.getPrefix(context);
    const filename = this.getFilename();
    const payload = {
      ...rawPayload,
      prefix,
      filename,
      bucket: process.env.AZURE_STORAGE_CONTAINER || "emprops-production",
    };
    logger.debug("RUNNING WORKFLOW");
    // TODO: workflow context should be passed from higher level (GeneratorV2)
    // This contains workflow_id, workflow_datetime, step_number, workflow_priority
    const workflowContext = context.workflowContext;

    const result = await this.workflowRunner.runWorkflow(
      workflow,
      payload,
      context,
      workflowContext,
    );
// @ts-ignore
    if (result.error != null) {
// @ts-ignore
      if ((result as any)?.details) {
        throw new Error(result.error, { cause: (result as any)?.details });
      }
      throw new Error(result.error);
    }
    const path = `${prefix}/${filename}`;
    const src = `${process.env.CLOUDFRONT_URL}/${path}`;
    return {
      src,
      mimeType: this.getMimeType(),
    };
  }
}
