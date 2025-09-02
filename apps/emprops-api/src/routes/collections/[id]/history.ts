import { PrismaClientType } from "@app/types/database";
import { parseWhereQueryString } from "../../../utils/queries";

import { Request, Response } from "express";
import { z } from "zod";

export class CollectionHistoryService {
  constructor(private prisma: PrismaClientType) {}

  private async getProject(projectId: string, userId: string) {
    return this.prisma.project.findFirst({
      where: { id: projectId, user_id: userId },
    });
  }
  private async validateProjectOwnership(req: Request) {
    const projectId = req.params.projectId as string;
    const user_id = req.headers["user_id"] as string;
    const project = await this.getProject(projectId, user_id);
    if (!project || project.user_id !== user_id) {
      throw new Error("Forbidden");
    }
  }

  public async getAll(req: Request, res: Response) {
    try {
      await this.validateProjectOwnership(req);
      const query = parseWhereQueryString(req.query as Record<string, string>);
      const result = await this.prisma.collection_history.findMany({
        where: {
          ...query,
          collection_id: req.params.id as string,
        },
      });

      res.status(200).json({ data: result, error: null });
    } catch (error) {
      res.status(500).json({ data: null, error: "Internal server error" });
    }
  }

  public async insert(req: Request, res: Response) {
    try {
      const scheme = z.object({
        event: z.enum([
          "visibility_updated",
          "price_updated",
          "status_updated",
          "editions_updated",
        ]),
        current_value: z.string(),
        new_value: z.string(),
      });
      const parsedBody = scheme.safeParse(req.body);
      if (!parsedBody.success) {
        return res.status(400).json({
          data: null,
          error: "Invalid request",
        });
      }
      await this.validateProjectOwnership(req);
      const result = await this.prisma.collection_history.create({
        data: {
          ...req.body,
          collection_id: req.params.id as string,
        },
      });
      res.status(200).json({ data: result, error: null });
    } catch (error) {
      res.status(500).json({ data: null, error: "Internal server error" });
    }
  }
}
