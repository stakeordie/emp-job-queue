import { PrismaClientType } from "@app/types/database";
import logger from "../../../logger";
import { formatZodError } from "../../../utils";
import { PrismaClient, collection } from '@emp/database';
import { Request, Response } from "express";
import { z } from "zod";

const bodyValidator = z.object({
  enabled: z.boolean(),
  max_generations: z.number(),
  access_level: z.string(),
  is_remixable: z.boolean(),
  farcaster_collection: z.boolean(),
});

type CollectionPreviewUpdateModel = z.infer<typeof bodyValidator>;

export const getPreviewByCollection =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    const { id: collectionId } = req.params;

    try {
      const preview = await prisma.collection_preview.findUnique({
        where: { collection_id: collectionId },
        include: {
          collection_preview_version: {
            where: { is_latest: true },
          },
          collection: {
            include: {
              project: true,
            },
          },
        },
      });

      const chat = await prisma.chat.findFirst({
        where: {
          entity_id: preview?.id.toString(),
        },
      });

      if (!preview) {
        return res.status(404).json({ data: null, error: "Preview not found" });
      }

      const flatFiles = await prisma.flat_file.findMany({
        where: {
          AND: [{ rel_id: preview.id.toString() }, { rel_type: "preview" }],
        },
        orderBy: { created_at: "asc" },
      });

      const response = {
        preview,
        assets: flatFiles,
        chat,
      };

      return res.status(200).json({ data: response, error: null });
    } catch (error) {
      logger.error(error);
      const message =
        error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ data: null, error: message });
    }
  };

export const handleCollectionPreviewUpdate =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const validationResult = bodyValidator.safeParse(req.body);
      if (!validationResult.success) {
        return res
          .status(400)
          .json({ data: null, error: formatZodError(validationResult.error) });
      }

      const body = validationResult.data;
      const user_id = req.headers["user_id"] as string;
      const { id: collectionId } = req.params;

      const collection = await prisma.collection.findUnique({
        where: { id: collectionId },
        include: { project: true },
      });

      if (!collection) {
        return res
          .status(404)
          .json({ data: null, error: "Collection not found" });
      }

      if (collection.project.user_id !== user_id) {
        return res
          .status(401)
          .json({ data: null, error: "User is not the creator" });
      }

      const previewByCollectionId = await prisma.collection_preview.findFirst({
        where: { collection_id: collectionId },
      });

      if (previewByCollectionId) {
        if (body.max_generations < previewByCollectionId.total_generations) {
          return res.status(400).json({
            data: null,
            error: "Max generations should not be less than total generations",
          });
        }

        const result = await prisma.collection_preview.update({
          data: {
            enabled: body.enabled,
            max_generations: body.max_generations,
            access_level: body.access_level,
            is_remixable: body.is_remixable,
            farcaster_collection: body.farcaster_collection,
          },
          where: { collection_id: collectionId },
        });

        await prisma.$executeRaw`update collection_preview_version set is_latest = false where collection_preview_id = ${previewByCollectionId.id}`;

        const previousVersion =
          await prisma.collection_preview_version.findFirst({
            where: { collection_preview_id: previewByCollectionId.id },
            orderBy: { version: "desc" },
          });

        await prisma.collection_preview_version.create({
          data: {
            collection_preview_id: previewByCollectionId.id,
            is_latest: true,
            data: collection.data as any,
            version: previousVersion ? previousVersion.version + 1 : 1,
          },
        });

        return res.status(200).json({ data: result, error: null });
      } else {
        const newPreview = await createCollectionPreview(
          collection,
          prisma,
          body,
        );
        await prisma.collection_preview_version.create({
          data: {
            collection_preview_id: newPreview.id,
            is_latest: true,
            data: collection.data as any,
          },
        });
        return res.status(201).json({ data: newPreview, error: null });
      }
    } catch (error) {
      logger.error(error);
      const message =
        error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ data: null, error: message });
    }
  };

export const createCollectionPreview = async (
  collection: collection,
  prisma: PrismaClientType,
  body?: CollectionPreviewUpdateModel,
) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const preview = await tx.collection_preview.create({
        data: {
          enabled: body ? body.enabled : false,
          max_generations: body ? body.max_generations : 0,
          collection_id: collection.id,
          access_level: "PUBLIC",
          is_remixable: body ? body.is_remixable : false,
          farcaster_collection: body ? body.farcaster_collection : false,
        },
      });

      await tx.chat.create({
        data: {
          entity_type: "PREVIEW",
          entity_id: preview.id.toString(),
        },
      });

      return preview;
    });

    return result;
  } catch (error) {
    logger.error(error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    throw new Error(message);
  }
};

export const batchCreateCollectionPreviews =
  (prisma: PrismaClientType) =>
  async (collections: collection[], body?: CollectionPreviewUpdateModel) => {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const previewsData = collections.map((collection) => ({
          enabled: body ? body.enabled : false,
          max_generations: body ? body.max_generations : 0,
          collection_id: collection.id,
        }));

        await tx.collection_preview.createMany({
          data: previewsData,
          skipDuplicates: true,
        });

        const createdPreviews = await tx.collection_preview.findMany({
          where: {
            collection_id: { in: collections.map((c) => c.id) },
          },
        });

        const chatsData = createdPreviews.map((preview) => ({
          entity_type: "PREVIEW",
          entity_id: preview.id.toString(),
        }));

        await tx.chat.createMany({
          data: chatsData,
          skipDuplicates: true,
        });

        return createdPreviews;
      });

      return result;
    } catch (error) {
      logger.error(error);
      const message =
        error instanceof Error ? error.message : "Internal server error";
      throw new Error(message);
    }
  };
