import { PrismaClientType } from "@app/types/database";
import logger from "../../../logger";
import { formatZodError } from "../../../utils";

import { Request, Response } from "express";
import { z } from "zod";

const bodyValidator = z.object({
  urls: z.array(z.string()).optional(),
});

export const getSampleImages =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    const { id: collectionId } = req.params;

    try {
      const sampleImages = await prisma.collection_sample_images.findMany({
        where: { collection_id: collectionId },
      });

      return res.status(200).json({ data: sampleImages, error: null });
    } catch (error) {
      logger.error(error);
      const message =
        error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ data: null, error: message });
    }
  };

export const createSamplesImages =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const validationResult = bodyValidator.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: formatZodError(validationResult.error),
        });
      }

      const body = validationResult.data;
      const user_id = req.headers["user_id"] as string;
      const { id: collectionId } = req.params;

      const collection = await prisma.collection.findUnique({
        where: { id: collectionId },
        include: { project: true },
      });

      if (!collection) {
        return res.status(404).json({
          data: null,
          error: "Collection not found",
        });
      }

      if (collection.project.user_id !== user_id) {
        return res.status(401).json({
          data: null,
          error: "User is not the creator",
        });
      }

      // Delete if no array is sent
      if (!body?.urls) {
        await prisma.collection_sample_images.deleteMany({
          where: { collection_id: collectionId },
        });

        return res.status(200).json({
          data: "Samples updated successfully",
          error: null,
        });
      }

      // Fetch current sample images for the collection
      const currentSamples = await prisma.collection_sample_images.findMany({
        where: { collection_id: collectionId },
      });

      const currentUrls = currentSamples.map((sample) => sample.url);
      const newUrls = body.urls;

      const urlsToDelete = currentUrls.filter((url) => !newUrls.includes(url));
      const urlsToAdd = newUrls.filter((url) => !currentUrls.includes(url));

      // Process deletions and additions in parallel
      await Promise.all([
        // Delete samples that are no longer needed
        urlsToDelete.length > 0 &&
          prisma.collection_sample_images.deleteMany({
            where: {
              collection_id: collectionId,
              url: { in: urlsToDelete },
            },
          }),

        // Add new samples
        urlsToAdd.length > 0 &&
          prisma.collection_sample_images.createMany({
            data: urlsToAdd.map((url) => ({
              url,
              collection_id: collectionId,
            })),
          }),
      ]);

      return res.status(200).json({
        data: "Samples updated successfully",
        error: null,
      });
    } catch (error) {
      logger.error(error);
      const message =
        error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ data: null, error: message });
    }
  };
