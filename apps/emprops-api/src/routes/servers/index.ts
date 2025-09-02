import { PrismaClientType } from "@app/types/database";

import { Request, Response } from "express";
import { z } from "zod";

export function get(prisma: PrismaClientType) {
  return async (_: Request, res: Response) => {
    const result = await prisma.server.findMany();
    res.json({ data: result, error: null });
  };
}

const serverRequestSchema = z.object({
  name: z.string(),
  url: z.string(),
});

export function post(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const validationResult = serverRequestSchema.safeParse(req.body);
    if (validationResult.error) {
      res.status(400).json({ data: null, error: validationResult.error });
      return;
    }
    const body = validationResult.data;
    try {
      const server = await prisma.server.findFirst({
        where: { name: body.name },
      });
      if (server) {
        return res
          .status(400)
          .json({
            data: null,
            error: "Server already exists with provided name",
          });
      }
      const response = await prisma.server.create({
        data: {
          name: body.name,
          url: body.url,
        },
      });
      res.json({ data: response, error: null });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An error occurred";
      res.status(500).json({ data: null, error: message });
    }
  };
}
