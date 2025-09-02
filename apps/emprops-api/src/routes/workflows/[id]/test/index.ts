import { PrismaClientType } from "@app/types/database";
import { ComfyWorkflowRunner } from "../../../../lib/workflows";

import { Request, Response } from "express";

export function testWorkflow(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const id = req.params.id;
    const body = req.body;
    try {
      const workflowRunner = new ComfyWorkflowRunner(prisma);
      const workflow = await workflowRunner.getWorkflow(id);
      const result = await workflowRunner.runWorkflow(workflow, body);
      if (result.error != null) {
        return res.status(400).json(result);
      }
      res.json({ data: result.data, error: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({ data: null, error: message });
    }
  };
}
