import { PrismaClientType } from "@app/types/database";
import { social_org_enum, PrismaClient } from '@emp/database';
import { Request, Response } from "express";
import { z } from "zod";

export function isValidSocialOrg(value: string): value is social_org_enum {
  return Object.values(social_org_enum).includes(value as social_org_enum);
}

// Schema for edit requests - mirrors the collection public response structure
const editCollectionSchema = z.object({
  // Collection metadata fields
  title: z.string().optional(),
  description: z.string().optional(),
  blockchain: z.string().optional(),
  cover_image_url: z.string().optional(),
  editions: z.number().optional(),
  price: z.number().optional(),

  // Core workflow data - components and variables are in here
  data: z.any().optional(),

  // Social context for custodial collections
  social_org: z.string().optional(),
  social_identifier: z.string().optional(),

  // Publish/hide functionality
  status: z.enum(["draft", "published"]).optional(),

  // Collection preview settings
  collection_preview: z
    .object({
      enabled: z.boolean().optional(),
      max_generations: z.number().optional(),
      access_level: z.enum(["PRIVATE", "PUBLIC"]).optional(),
      is_remixable: z.boolean().optional(),
      farcaster_collection: z.boolean().optional(),
    })
    .optional(),
});

export default function createEditHandler(prisma: PrismaClientType) {
  return async function editCollection(req: Request, res: Response) {
    try {
      const collectionId = req.params.id;
      const userId = req.headers["user_id"] as string;

      // Validate request body
      const validationResult = editCollectionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: validationResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", "),
        });
      }

      const body = validationResult.data;

      // Find the collection
      const collection = await prisma.collection.findFirst({
        where: {
          id: collectionId,
          archived: false,
        },
        include: {
          collection_preview: true,
          social_link: true,
        },
      });

      if (!collection) {
        return res.status(404).json({
          data: null,
          error: "Collection not found",
        });
      }

      // Check edit permissions
      if (collection.is_custodial) {
        // Custodial collections: validate social authentication
        if (!body.social_org || !body.social_identifier) {
          return res.status(400).json({
            data: null,
            error:
              "Custodial collections require social_org and social_identifier for editing",
          });
        }

        // Validate social organization
        if (!isValidSocialOrg(body.social_org)) {
          return res.status(400).json({
            data: null,
            error: `Invalid social_org. Must be one of: ${Object.values(
              social_org_enum,
            ).join(", ")}`,
          });
        }

        // Verify social link matches
        if (
          !collection.social_link ||
          collection.social_link.social_org !== body.social_org ||
          collection.social_link.identifier !== body.social_identifier
        ) {
          return res.status(403).json({
            data: null,
            error: "Social credentials do not match this custodial collection",
          });
        }
      } else {
        // Standard collections: validate user ownership via project
        const project = await prisma.project.findFirst({
          where: {
            id: collection.project_id,
            user_id: userId,
          },
        });

        if (!project) {
          return res.status(403).json({
            data: null,
            error: "You do not have permission to edit this collection",
          });
        }
      }

      // Perform updates in transaction
      const result = await prisma.$transaction(async (tx) => {
        // Prepare collection updates (only defined fields)
        const collectionUpdates: any = {};

        if (body.title !== undefined) collectionUpdates.title = body.title;
        if (body.description !== undefined)
          collectionUpdates.description = body.description;
        if (body.blockchain !== undefined)
          collectionUpdates.blockchain = body.blockchain;
        if (body.cover_image_url !== undefined)
          collectionUpdates.cover_image_url = body.cover_image_url;
        if (body.editions !== undefined)
          collectionUpdates.editions = body.editions;
        if (body.price !== undefined) collectionUpdates.price = body.price;
        if (body.data !== undefined) collectionUpdates.data = body.data;
        if (body.status !== undefined) collectionUpdates.status = body.status;

        // Update collection if there are changes
        let updatedCollection = collection;
        if (Object.keys(collectionUpdates).length > 0) {
          updatedCollection = await tx.collection.update({
            where: { id: collectionId },
            data: collectionUpdates,
            include: {
              collection_preview: true,
              social_link: true,
            },
          });
        }

        // Update collection_preview if provided
        let updatedPreview = collection.collection_preview;
        if (body.collection_preview && collection.collection_preview) {
          const previewUpdates: any = {};

          if (body.collection_preview.enabled !== undefined) {
            previewUpdates.enabled = body.collection_preview.enabled;
          }
          if (body.collection_preview.max_generations !== undefined) {
            previewUpdates.max_generations =
              body.collection_preview.max_generations;
          }
          if (body.collection_preview.access_level !== undefined) {
            previewUpdates.access_level = body.collection_preview.access_level;
          }
          if (body.collection_preview.is_remixable !== undefined) {
            previewUpdates.is_remixable = body.collection_preview.is_remixable;
          }
          if (body.collection_preview.farcaster_collection !== undefined) {
            previewUpdates.farcaster_collection =
              body.collection_preview.farcaster_collection;
          }

          if (Object.keys(previewUpdates).length > 0) {
            updatedPreview = await tx.collection_preview.update({
              where: { collection_id: collectionId },
              data: previewUpdates,
            });
          }
        }

        return {
          collection: updatedCollection,
          collection_preview: updatedPreview,
        };
      });

      return res.status(200).json({
        data: {
          ...result.collection,
          collection_preview: result.collection_preview,
        },
        error: null,
      });
    } catch (error) {
      console.error("Edit collection error:", error);
      return res.status(500).json({
        data: null,
        error: "Internal server error",
      });
    }
  };
}
