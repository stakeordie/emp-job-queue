import { PrismaClientType } from "@app/types/database";
import { StorageClient } from "../../clients/storage-client";
import {
  generateNewIds,
  updateComponentReferencesIds,
} from "../../lib/collections";
import { findOrCreateSocialLink, isValidSocialOrg } from "../../lib/social-links";
import { GenerationInput } from "../../modules/art-gen/nodes-v2";
import { social_org_enum, PrismaClient } from '@emp/database';
import { Request as ExpressRequest, Response } from "express";
import { v4 as uuid } from "uuid";
import z from "zod";

interface Request extends ExpressRequest {
  params: {
    projectId: string;
    collectionId: string;
  };
}

const remixCreationSchema = z.object({
  project_id: z.string().optional(),
  is_custodial: z.boolean().optional(),
  social_org: z.string().optional(),
  social_identifier: z.string().optional(),
});

const custodialCollectionFromTemplateSchema = z.object({
  // Required fields
  template_collection_id: z.string().uuid(),
  social_org: z.string(),
  social_identifier: z.string(),

  // Optional miniapp user ID
  miniapp_user_id: z.string().uuid().optional(),

  // Optional miniapp cover image
  miniapp_cover_image: z.string().url().optional(),

  // Flat overrides object - any dot-notation path can be overridden
  overrides: z.record(z.string(), z.any()),

  // Optional collection preview settings
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

export function getFork(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const remix = await prisma.collection_remix.findFirst({
      where: {
        target_collection_id: req.params.collectionId,
      },
      include: {
        collection_preview_version: true,
        source_collection: {
          select: {
            title: true,
            project: true,
          },
        },
      },
    });
    if (!remix) {
      return res.status(404).json({ data: null, error: "Fork not found" });
    }
    return res.status(200).json({ data: remix, error: null });
  };
}

export function createFork(prisma: PrismaClientType) {
  return async (req: Request, res: Response) => {
    const userId = req.headers["user_id"] as string;
    const bodyValidationResponse = remixCreationSchema.safeParse(req.body);
    if (!bodyValidationResponse.success) {
      return res.status(400).json({
        data: null,
        error: "Invalid request body",
      });
    }
    const body = bodyValidationResponse.data;

    // Validate custodial vs standard collection requirements
    if (body.is_custodial === true) {
      // Custodial collections require social parameters
      if (!body.social_org || !body.social_identifier) {
        return res.status(400).json({
          data: null,
          error:
            "Custodial collections require both social_org and social_identifier",
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
    } else {
      // Standard collections require user authentication
      if (!userId) {
        return res.status(400).json({
          data: null,
          error: "User authentication required for standard collections",
        });
      }
    }

    // Get the current collection.
    const forkableCollection = await prisma.collection.findUnique({
      where: {
        id: req.params.collectionId,
      },
      include: {
        collection_preview: {
          include: {
            collection_preview_version: {
              where: {
                is_latest: true,
              },
            },
          },
        },
      },
    });
    if (!forkableCollection) {
      return res
        .status(404)
        .json({ data: null, error: "Collection not found" });
    }
    if (!forkableCollection.collection_preview?.enabled) {
      return res
        .status(400)
        .json({ data: null, error: "Collection preview is not enabled" });
    }
    const rawCollectionVersion =
      forkableCollection.collection_preview?.collection_preview_version;
    if (!rawCollectionVersion) {
      return res
        .status(404)
        .json({ data: null, error: "Collection preview version not found" });
    }
    const [collectionVersion] = rawCollectionVersion;
    const forkedFrom = await prisma.collection_remix.findFirst({
      where: {
        target_collection_id: forkableCollection.id,
      },
    });
    if (forkedFrom == null) {
      if (!forkableCollection.collection_preview?.is_remixable) {
        return res
          .status(400)
          .json({ data: null, error: "Collection is not remixable" });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let project;
      let socialLink = null;

      if (body.is_custodial === true) {
        // For custodial collections, find or create social link
        socialLink = await findOrCreateSocialLink(
          body.social_org as social_org_enum,
          body.social_identifier!,
          tx,
        );

        // Use API key owner's project for custodial collections
        if (body.project_id) {
          project = await tx.project.findUnique({
            where: {
              id: body.project_id,
              user_id: userId,
            },
          });
        } else {
          const defaultProject = await tx.project.findFirst({
            where: {
              user_id: userId,
              is_default: true,
            },
          });
          if (!defaultProject) {
            project = await tx.project.create({
              data: {
                name: "Default",
                user_id: userId,
                is_default: true,
                version: "v2",
              },
            });
          } else {
            project = defaultProject;
          }
        }
      } else {
        // For standard collections, use user's project
        if (body.project_id) {
          project = await tx.project.findUnique({
            where: {
              id: body.project_id,
              user_id: userId,
            },
          });
        } else {
          const defaultProject = await tx.project.findFirst({
            where: {
              user_id: userId,
              is_default: true,
            },
          });
          if (!defaultProject) {
            project = await tx.project.create({
              data: {
                name: "Default",
                user_id: userId,
                is_default: true,
                version: "v2",
              },
            });
          } else {
            project = defaultProject;
          }
        }
      }

      if (!project) {
        throw new Error("Project not found");
      }

      const collection = await tx.collection.create({
        data: {
          title: `Fork of ${forkableCollection.title}`,
          project_id: project.id,
          is_custodial: body.is_custodial === true,
          custodied_for: socialLink?.id || null,
        },
      });

      let data = collectionVersion.data as GenerationInput;

      // Ensure generation data has hashes for forks too
      if (
        data.generations &&
        (!data.generations.hashes || data.generations.hashes.length === 0)
      ) {
        const numGenerations = data.generations.generations || 1;
        data.generations.hashes = [];
        for (let i = 0; i < numGenerations; i++) {
          data.generations.hashes.push(uuid());
        }
        console.log(`Generated ${numGenerations} hashes for forked collection`);
      }

      data = await generateNewIds(tx as PrismaClient, collection.id, data);
      await updateComponentReferencesIds(tx as PrismaClient, data);

      await tx.collection.update({
        where: {
          id: collection.id,
        },
        data: {
          data,
        },
      });

      const preview = await tx.collection_preview.create({
        data: {
          enabled: false,
          max_generations: 0,
          collection_id: collection.id,
          is_remixable: true,
          farcaster_collection: body.is_custodial === true, // Set based on custodial status
        },
      });

      await tx.chat.create({
        data: {
          entity_type: "PREVIEW",
          entity_id: preview.id.toString(),
        },
      });

      await tx.collection_remix.create({
        data: {
          source_collection_id: forkableCollection.id,
          target_collection_id: collection.id,
          collection_preview_version_id: collectionVersion.id,
        },
      });

      return collection;
    });

    res.status(200).json({ data: result, error: null });
  };
}

// Helper function to upload external image to Azure and create flat file
async function uploadExternalImageToCDN(
  imageUrl: string,
  userId: string,
  storageClient: StorageClient,
  prisma: PrismaClientType,
): Promise<string> {
  try {
    // Fetch the image from external URL
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    // Get image data and content type
    const imageBuffer = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const fileExtension = contentType.split("/")[1] || "jpg";

    // Generate unique filename
    const fileName = `cover_${uuid()}.${fileExtension}`;
    const filePath = `collections/covers/${fileName}`;

    // Upload to Azure via StorageClient
    const uploadedUrl = await storageClient.storeFile(
      filePath,
      contentType,
      imageBuffer,
    );

    // Create flat file record
    await prisma.flat_file.create({
      data: {
        name: fileName,
        url: uploadedUrl,
        user_id: userId,
        mime_type: contentType,
        rel_type: "upload",
        hidden: false,
      },
    });

    return uploadedUrl;
  } catch (error) {
    console.error("Error uploading external image to CDN:", error);
    throw new Error(
      `Failed to upload image to CDN: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

// Helper function to convert plain text to rich text editor format
function convertToRichTextFormat(text: string): string {
  return JSON.stringify([
    {
      type: "paragraph",
      children: [{ text }],
    },
  ]);
}

// Helper function to apply flat overrides to nested object using dot notation
function applyOverrides(obj: any, overrides: Record<string, any>): any {
  const result = JSON.parse(JSON.stringify(obj)); // Deep clone

  for (const [path, value] of Object.entries(overrides)) {
    // Auto-convert plain text prompts to rich text format
    let processedValue = value;
    if (
      path.includes(".prompt") &&
      typeof value === "string" &&
      !value.startsWith("[")
    ) {
      processedValue = convertToRichTextFormat(value);
    }

    setNestedValue(result, path, processedValue);
  }

  return result;
}

// Helper function to set nested values using dot notation with array support
function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split(".");
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    const arrayMatch = key.match(/^(.+)\[(\d+)\]$/);

    if (arrayMatch) {
      // Handle array notation like "steps[0]"
      const arrayKey = arrayMatch[1];
      const index = parseInt(arrayMatch[2], 10);

      if (!current[arrayKey]) current[arrayKey] = [];
      if (!current[arrayKey][index]) current[arrayKey][index] = {};
      current = current[arrayKey][index];
    } else {
      // Handle regular object keys
      if (!current[key]) current[key] = {};
      current = current[key];
    }
  }

  // Set the final value
  const finalKey = keys[keys.length - 1];
  const finalArrayMatch = finalKey.match(/^(.+)\[(\d+)\]$/);

  if (finalArrayMatch) {
    const arrayKey = finalArrayMatch[1];
    const index = parseInt(finalArrayMatch[2], 10);
    if (!current[arrayKey]) current[arrayKey] = [];
    current[arrayKey][index] = value;
  } else {
    current[finalKey] = value;
  }
}

export function createCustodialCollectionFromTemplate(
  prisma: PrismaClientType,
  storageClient: StorageClient,
) {
  return async (req: Request, res: Response) => {
    try {
      // Validate request body
      const validationResult = custodialCollectionFromTemplateSchema.safeParse(
        req.body,
      );
      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: validationResult.error.errors
            .map((e) => `${e.path.join(".")}: ${e.message}`)
            .join(", "),
        });
      }

      const {
        template_collection_id,
        social_org,
        social_identifier,
        miniapp_user_id,
        miniapp_cover_image,
        overrides,
        collection_preview,
      } = validationResult.data;

      // Validate social organization
      if (!isValidSocialOrg(social_org)) {
        return res.status(400).json({
          data: null,
          error: `Invalid social_org. Must be one of: ${Object.values(
            social_org_enum,
          ).join(", ")}`,
        });
      }

      // Get the template collection
      const templateCollection = await prisma.collection.findUnique({
        where: { id: template_collection_id },
        include: {
          collection_preview: true,
        },
      });

      if (!templateCollection) {
        return res.status(404).json({
          data: null,
          error: "Template collection not found",
        });
      }

      // Create everything in a transaction
      const result = await prisma.$transaction(async (tx) => {
        // Find or create social link
        let socialLink = await findOrCreateSocialLink(
          social_org as social_org_enum,
          social_identifier,
          tx,
        );

        // Update social link with miniapp_user_id if provided
        if (miniapp_user_id && socialLink.miniapp_user_id !== miniapp_user_id) {
          socialLink = await tx.social_link.update({
            where: { id: socialLink.id },
            data: { miniapp_user_id },
          });
        }

        // Start with template collection data
        let collectionData = {
          title: templateCollection.title,
          description: templateCollection.description,
          blockchain: templateCollection.blockchain,
          cover_image_url: templateCollection.cover_image_url,
          editions: templateCollection.editions,
          price: templateCollection.price,
          data: templateCollection.data,
          status: templateCollection.status,
          project_id: templateCollection.project_id, // Inheritable but overrideable
        };

        // Apply overrides to the collection data
        try {
          console.log(
            "Applying overrides:",
            JSON.stringify(overrides, null, 2),
          );
          collectionData = applyOverrides(collectionData, overrides);
          console.log("Overrides applied successfully");
        } catch (error) {
          console.error("Error applying overrides:", error);
          throw new Error(
            `Failed to apply overrides: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }

        // Handle cover image upload if it's an external URL
        if (collectionData.cover_image_url) {
          const isExternalUrl =
            collectionData.cover_image_url.startsWith("http://") ||
            collectionData.cover_image_url.startsWith("https://");
          const isCdnUrl =
            collectionData.cover_image_url.includes("cdn.emprops.ai") ||
            collectionData.cover_image_url.includes("imagedelivery.net");

          // Only upload if it's an external URL and not already from our CDN
          if (isExternalUrl && !isCdnUrl) {
            try {
              console.log(
                "Uploading external cover image to CDN:",
                collectionData.cover_image_url,
              );
              const cdnUrl = await uploadExternalImageToCDN(
                collectionData.cover_image_url,
                (req.headers["user_id"] as string) || "system",
                storageClient,
                tx as any, // Use transaction context
              );
              collectionData.cover_image_url = cdnUrl;
              console.log("Cover image uploaded to CDN:", cdnUrl);
            } catch (error) {
              console.error(
                "Failed to upload cover image to CDN, using original URL:",
                error,
              );
              // Continue with original URL if upload fails
            }
          }
        }

        // Ensure generation data has hashes
        if (collectionData.data && typeof collectionData.data === "object") {
          const genData = collectionData.data as GenerationInput;
          if (genData.generations) {
            // If no hashes or empty hashes array, generate them
            if (
              !genData.generations.hashes ||
              genData.generations.hashes.length === 0
            ) {
              const numGenerations = genData.generations.generations || 1;
              genData.generations.hashes = [];
              for (let i = 0; i < numGenerations; i++) {
                genData.generations.hashes.push(uuid());
              }
              console.log(`Generated ${numGenerations} hashes for collection`);
            }
          }
        }

        // Create the collection with custodial flag
        const collection = await tx.collection.create({
          data: {
            title: collectionData.title,
            description: collectionData.description,
            blockchain: collectionData.blockchain || "tezos",
            cover_image_url: collectionData.cover_image_url,
            miniapp_cover_image: miniapp_cover_image || null,
            editions: collectionData.editions,
            price: collectionData.price,
            data: collectionData.data as any,
            status: collectionData.status || "draft",
            is_custodial: true,
            custodied_for: socialLink.id,
            project_id: collectionData.project_id, // Use project from template or override
          },
        });

        // Generate unique IDs for the collection data after creation
        let updatedData;
        try {
          updatedData = await generateNewIds(
            tx as PrismaClient,
            collection.id,
            collectionData.data as GenerationInput,
          );
        } catch (error) {
          console.error("Error in generateNewIds:", error);
          console.error(
            "Collection data:",
            JSON.stringify(collectionData.data, null, 2),
          );
          throw new Error(
            `Failed to generate new IDs: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          );
        }

        // Update the collection with the new data containing unique IDs
        const updatedCollection = await tx.collection.update({
          where: { id: collection.id },
          data: { data: updatedData },
          include: {
            social_link: true,
          },
        });

        // Create collection preview - use template settings or provided overrides
        let collectionPreview = null;
        const templatePreview = templateCollection.collection_preview;

        if (collection_preview || templatePreview) {
          collectionPreview = await tx.collection_preview.create({
            data: {
              collection_id: collection.id,
              enabled:
                collection_preview?.enabled ?? templatePreview?.enabled ?? true,
              max_generations:
                collection_preview?.max_generations ??
                templatePreview?.max_generations ??
                10,
              access_level:
                collection_preview?.access_level ??
                templatePreview?.access_level ??
                "PUBLIC",
              is_remixable:
                collection_preview?.is_remixable ??
                templatePreview?.is_remixable ??
                true,
              farcaster_collection:
                collection_preview?.farcaster_collection ??
                templatePreview?.farcaster_collection ??
                true,
            },
          });
        }

        return {
          collection: updatedCollection,
          collection_preview: collectionPreview,
          social_link: socialLink,
          template_used: {
            id: templateCollection.id,
            title: templateCollection.title,
          },
        };
      });

      return res.status(201).json({
        data: {
          ...result.collection,
          collection_preview: result.collection_preview,
          social_link: result.social_link,
          template_used: result.template_used,
        },
        error: null,
      });
    } catch (error) {
      console.error("Create custodial collection from template error:", error);
      return res.status(500).json({
        data: null,
        error: "Internal server error",
      });
    }
  };
}
