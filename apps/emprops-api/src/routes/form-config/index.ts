import { PrismaClientType } from "@app/types/database";

import { Request, Response } from "express";
import { validate } from "uuid";
import { z } from "zod";

export function getFormConfigs(prisma: PrismaClientType) {
  return async (_: Request, res: Response) => {
    const result = await prisma.form_config.findMany();
    res.json({ data: result, error: null });
  };
}

export function getFormConfig(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!validate(id)) {
      return res.status(400).json({ data: null, error: "Invalid ID" });
    }
    const result = await prisma.form_config.findFirst({
      where: {
        id,
      },
    });
    if (!result) {
      return res
        .status(404)
        .json({ data: null, error: "Form config not found" });
    }
    res.json({ data: result, error: null });
  };
}

export function getFormConfigByName(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const name = req.params.name;
    const result = await prisma.form_config.findFirst({
      where: {
        name,
      },
    });
    if (!result) {
      return res
        .status(404)
        .json({ data: null, error: "Form config not found" });
    }
    res.json({ data: result, error: null });
  };
}

const formConfigCreationSchema = z.object({
  name: z.string(),
  data: z.any(),
});

export function createFormConfig(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const validationResult = formConfigCreationSchema.safeParse(req.body);
    if (validationResult.error) {
      return res
        .status(400)
        .json({ data: null, error: validationResult.error });
    }
    const body = validationResult.data;
    const alreadyExists = await prisma.form_config.findFirst({
      where: {
        name: body.name,
      },
    });
    if (alreadyExists) {
      return res.status(400).json({
        data: null,
        error: "Form config with this name already exists",
      });
    }
    const result = await prisma.form_config.create({
      data: {
        name: body.name,
        data: body.data,
      },
    });
    res.json({ data: result, error: null });
  };
}

export function deleteFormConfig(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const id = req.params.id;
    if (!validate(id)) {
      return res.status(400).json({ data: null, error: "Invalid ID" });
    }
    const result = await prisma.form_config.delete({
      where: {
        id,
      },
    });
    res.json({ data: result, error: null });
  };
}
