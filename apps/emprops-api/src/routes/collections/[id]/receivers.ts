import { PrismaClientType } from "@app/types/database";
import { parseWhereQueryString } from "../../../utils/queries";

import { Request, Response } from "express";
import { z } from "zod";

const insertScheme = z.object({
  address: z.string(),
  value: z.number(),
  type: z.enum(["primary", "secondary"]),
});

const patchScheme = z.array(insertScheme);

export class CollectionReceiverService {
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
      const result = await this.prisma.collection_sales_receivers.findMany({
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

  public async get(req: Request, res: Response) {
    try {
      await this.validateProjectOwnership(req);
      const result = await this.prisma.collection_sales_receivers.findFirst({
        where: {
          id: Number(req.params.id),
        },
      });
      res.status(200).json({ data: result, error: null });
    } catch (error) {
      res.status(500).json({ data: null, error: "Internal server error" });
    }
  }

  public async update(req: Request, res: Response) {
    try {
      const updateScheme = z.object({
        address: z.string(),
        value: z.number().int(),
      });
      const parsedBody = updateScheme.safeParse(req.body);

      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }
      await this.validateProjectOwnership(req);
      const result = await this.prisma.collection_sales_receivers.update({
        where: {
          id: Number(req.params.id),
        },
        data: req.body,
      });
      res.status(200).json({ data: result, error: null });
    } catch (error) {
      res.status(500).json({ data: null, error: "Internal server error" });
    }
  }

  public async delete(req: Request, res: Response) {
    try {
      await this.validateProjectOwnership(req);
      const result = await this.prisma.collection_sales_receivers.delete({
        where: {
          id: Number(req.params.id),
        },
      });
      res.status(200).json({ data: result, error: null });
    } catch (error) {
      res.status(500).json({ data: null, error: "Internal server error" });
    }
  }

  public async insert(req: Request, res: Response) {
    try {
      const parsedBody = insertScheme.safeParse(req.body);
      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }
      await this.validateProjectOwnership(req);
      const result = await this.prisma.collection_sales_receivers.create({
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

  async bulkPatch(req: Request, res: Response) {
    try {
      await this.validateProjectOwnership(req);
      const parsedBody = patchScheme.safeParse(req.body);
      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }
      await this.prisma.collection_sales_receivers.deleteMany({
        where: {
          collection_id: req.params.id as string,
        },
      });
      const result = await this.prisma.collection_sales_receivers.createMany({
        data: parsedBody.data.map((r) => ({
          address: r.address,
          value: r.value,
          type: r.type,
          collection_id: req.params.id as string,
        })),
      });
      res.status(200).json({ data: result, error: null });
    } catch (error) {
      res.status(500).json({ data: null, error: "Internal server error" });
    }
  }
}
