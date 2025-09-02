import { PrismaClientType } from "@app/types/database";
import logger from "../../logger";
import { formatZodError } from "../../utils";
import { Prisma, PrismaClient } from '@emp/database';
import { Request, Response } from "express";
import { z } from "zod";

export default function (prisma: PrismaClientType) {
  return async function (req: Request, res: Response) {
    switch (req.method) {
      case "GET":
        await handleGet(req, res, prisma);
        break;
      case "POST":
        await handlePost(req, res, prisma);
        break;
      default:
        res.status(405).json({ data: null, error: "Method not allowed" });
    }
  };
}

async function handleGet(_: Request, res: Response, prisma: PrismaClientType) {
  try {
    const results = await prisma.project_template.findMany();
    res.status(200).json({ data: results, error: null });
  } catch (e) {
    res.status(500).json({ data: null, error: "Internal server error" });
  }
}

const bodyValidator = z.object({
  name: z.string(),
  project_id: z.string(),
});

async function handlePost(req: Request, res: Response, prisma: PrismaClientType) {
  const validationResult = bodyValidator.safeParse(req.body);
  if (!validationResult.success) {
    return res
      .status(400)
      .json({ data: null, error: formatZodError(validationResult.error) });
  }
  const body = validationResult.data;
  try {
    const project = await prisma.project.findUnique({
      where: { id: body.project_id },
    });
    if (project == null) {
      return res.status(404).json({ data: null, error: "Project not found" });
    }
    const projectData = project.data;
    if (projectData == null) {
      return res.status(400).json({
        data: null,
        error: "Project data is null",
      });
    }
    const projectCollections = await prisma.collection.findMany({
      where: {
        project_id: body.project_id,
      },
    });
    const result = await prisma.$transaction(async (tx) => {
      const template = await tx.project_template.create({
        data: {
          name: body.name,
          data: projectData,
          current_project_history_id: project.current_project_history_id,
        },
      });

      for (const it of projectCollections) {
        if (!it.data) continue;
        await tx.project_template_save.create({
          data: {
            name: it.title || "Untitled",
            data: it.data,
            images: it.images as Prisma.InputJsonValue,
            project_template_id: template.id,
            project_history_id: it.id,
          },
        });
      }

      return template;
    });
    res.status(201).json({ data: result, error: null });
  } catch (e) {
    logger.error(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    res.status(500).json({ data: null, error: message });
  }
}
