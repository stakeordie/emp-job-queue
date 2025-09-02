import { PrismaClientType } from "@app/types/database";
import logger from "../../../../logger";
import { batchCreateCollectionPreviews } from "../../../collections/[id]/preview";
import { Prisma, PrismaClient, collection } from '@emp/database';
import { Request, Response } from "express";

export default function (prisma: PrismaClientType) {
  return async function (req: Request, res: Response) {
    const user_id = req.headers["user_id"] as string;

    const { id: rawId } = req.params;
    const id = parseInt(rawId);
    if (isNaN(id)) {
      return res.status(400).json({ data: null, error: "ID is required" });
    }
    // Get the template
    const template = await prisma.project_template.findUnique({
      where: { id },
      include: { project_template_save: true },
    });

    if (template == null) {
      return res.status(404).json({ data: null, error: "Template not found" });
    }

    const templateData = template.data;
    if (!templateData) {
      return res.status(400).json({
        data: null,
        error: "Template data is null",
      });
    }

    const createdCollections: collection[] = [];

    // Create the project.
    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: "Untitled",
          data: templateData,
          user_id,
        },
      });
      let firstHistoryId: string | undefined = undefined;
      for (const it of template.project_template_save) {
        if (!it.data) continue;
        const collection = await tx.collection.create({
          data: {
            title: it.name,
            data: it.data,
            project_id: project.id,
            images: it.images as Prisma.InputJsonValue,
            is_current:
              it.project_history_id === template.current_project_history_id,
          },
        });

        if (collection) {
          createdCollections.push(collection);
        }

        if (it.project_history_id === template.current_project_history_id) {
          firstHistoryId = collection.id;
        }
      }

      await tx.project.update({
        where: { id: project.id },
        data: {
          current_project_history_id: firstHistoryId,
        },
      });

      return project;
    });

    try {
      const doBatchCreateCollectionPreviews =
        batchCreateCollectionPreviews(prisma);
      await doBatchCreateCollectionPreviews(createdCollections);
    } catch (e) {
      logger.error(e);
    }

    res.status(201).json({ data: result, error: null });
  };
}
