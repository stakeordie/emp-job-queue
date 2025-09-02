import { PrismaClientType } from "@app/types/database";
import logger from "../logger";
import { GenerationInput } from "../modules/art-gen/nodes-v2";
import { createCollectionPreview } from "../routes/collections/[id]/preview";
import { v2InstructionSet } from "../routes/projects/untitled";
import { deepDelete } from "../utils";
import { buildRelationAuthPagedQuery, getUserId } from "../utils/queries";
import { Prisma, PrismaClient } from '@emp/database';
import { Request, Response } from "express";
import { z } from "zod";

function handleErrorResponse(e: any, res: Response) {
  logger.error(e);
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2025") {
      return res.status(404).json({ data: null, error: "Not found" });
    } else {
      return res.status(400).json({
        data: null,
        error: `A Prisma error with code ${e.code} has occurred`,
      });
    }
  } else if (e instanceof Error) {
    const message = e instanceof Error ? e.message : "An error occurred";
    return res.status(500).json({ data: null, error: message });
  }
}
export const generateNewIds = async (
  prisma: PrismaClientType,
  collectionId: string,
  data: GenerationInput,
) => {
  const currentComponents = data.steps.map(() => ({
    collection_id: collectionId,
  }));
  const newComponents = await prisma.component.createManyAndReturn({
    data: currentComponents,
  });
  const newSteps = data.steps.map((step, index) => ({
    ...step,
    fromId: step.id,
    id: Number(newComponents[index].id),
  }));

  for (const step of newSteps) {
    const fromComponentFlatFiles = await prisma.component_flat_file.findMany({
      where: {
        component_id: step.fromId,
      },
    });
    const newComponentFlatFiles = fromComponentFlatFiles.map(
      ({ id: _, ...rest }) => ({
        ...rest,
        component_id: step.id,
      }),
    );
    await prisma.component_flat_file.createMany({
      data: newComponentFlatFiles,
    });
  }
  return {
    ...data,
    steps: newSteps,
  };
};

export async function updateComponentReferencesIds(
  prisma: PrismaClientType,
  data: GenerationInput,
) {
  function walkPrompt(obj: any) {
    if (Array.isArray(obj)) {
      obj.forEach(walkPrompt);
    } else if (typeof obj === "object" && obj !== null) {
      if (obj.type === "component") {
        const relatedStep = data.steps.find(
          (s) => s.fromId === obj.component.id,
        );
        if (relatedStep) {
          obj.component.fromId = obj.component.id;
          obj.component.id = relatedStep.id;
        }
      } else if (obj.children) {
        walkPrompt(obj.children);
      } else {
        for (const key in obj) {
          walkPrompt(obj[key]);
        }
      }
    }
  }

  async function updateReferences(step: GenerationInput["steps"][0]) {
    for (const key in step.nodePayload) {
      const value = step.nodePayload[key];
      if (value && typeof value === "object" && value.$ref !== undefined) {
        const relatedStep = data.steps.find((s) => s.fromId === value.$ref);
        if (relatedStep) {
          value.$ref = relatedStep.id;
        }
      }
    }
    const workflow = await prisma.workflow.findUnique({
      where: {
        name: step.nodeName,
      },
    });
    if (!workflow) return step;
    const workflowData = workflow.data as any;
    if (step.nodeName === "prompt") {
      const prompt = JSON.parse(step.nodePayload.prompt);
      walkPrompt(prompt);
      deepDelete(prompt, "testValue");
      step.nodePayload.prompt = JSON.stringify(prompt);
    } else if (workflowData !== null) {
      const fields = workflowData.form.fields;
      const promptPropNames = fields
        .filter((it: any) => it.type === "prompt_editor")
        .map((it: any) => it.id);
      for (const propertyName of promptPropNames) {
        const value = step.nodePayload[propertyName];
        if (value) {
          const prompt = JSON.parse(value);
          walkPrompt(prompt);
          deepDelete(prompt, "testValue");
          step.nodePayload[propertyName] = JSON.stringify(prompt);
        }
      }
    }
    deepDelete(step, "testValue");
    return step;
  }

  for (let i = 0; i < data.steps.length; i++) {
    const step = data.steps[i];
    data.steps[i] = await updateReferences(step);
  }

  return data;
}

const collectionSchema = z.object({
  data: z.any(),
  title: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  editions: z.number().int().optional().nullable(),
  publish_date: z.string().optional().nullable(),
  price: z.number().optional().nullable(),
  cover_image_url: z.string().optional().nullable(),
  batch_mint_enabled: z.boolean().optional(),
  batch_max_tokens: z.number().int().optional().nullable(),
  encryption_enabled: z.boolean().optional(),
  archived: z.boolean().optional(),
  blockchain: z.enum(["ETHEREUM", "BASE", "TEZOS"]).optional().nullable(),
});

export class CollectionsService {
  constructor(private prisma: PrismaClientType) {}

  async moveProject(req: Request, res: Response) {
    try {
      const id = req.params.id;
      const projectId = req.body.project_id as string;
      if (!projectId) {
        return res
          .status(400)
          .json({ data: null, error: "project_id field is empty" });
      }
      const project = this.prisma.project.findFirst({
        where: {
          id: projectId,
        },
      });
      if (!project) {
        return res.status(400).json({ data: null, error: "Project not found" });
      }
      const result = await this.prisma.collection.update({
        where: {
          id,
        },
        data: {
          project_id: projectId,
        },
      });
      res.status(200).send({
        data: result,
        error: null,
      });
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async findAll(req: Request, res: Response) {
    try {
      const query = buildRelationAuthPagedQuery(req, "project");
      const result = await this.prisma.collection.findMany({
        ...query,
        where: {
          ...query.where,
          project_id: req.params.projectId,
        },
      });
      return res.status(200).json({ data: result, error: null });
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async findAllPublic(req: Request, res: Response) {
    const userIdQuery = req.query.user_id
      ? { project: { user_id: req.query.user_id as string } }
      : {};
    const keys = Object.keys(req.query);
    const query = keys.reduce((acc, key) => {
      if (key === "user_id") {
        return acc;
      }
      return {
        ...acc,
        [key]: req.query[key],
      };
    }, {});
    try {
      const result = await this.prisma.collection.findMany({
        select: {
          id: true,
          created_at: true,
          updated_at: true,
          project_id: true,
          status: true,
          title: true,
          description: true,
          editions: true,
          publish_date: true,
          price: true,
          cover_image_url: true,
          batch_mint_enabled: true,
          batch_max_tokens: true,
          encryption_enabled: true,
          blockchain: true,
          archived: true,
        },
        where: {
          ...query,
          ...userIdQuery,
          archived: false,
          collection_preview: {
            enabled: true,
          },
        },
      });
      return res.status(200).json({ data: result, error: null });
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async findCurrent(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const result = await this.prisma.collection.findFirst({
        where: {
          project: {
            id: req.params.projectId,
            user_id: userId,
          },
          is_current: true,
        },
      });
      return res.status(200).json({ data: result, error: null });
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async findOne(req: Request, res: Response) {
    try {
      const userId = getUserId(req);
      const result = await this.prisma.collection.findFirst({
        where: {
          id: req.params.collectionId,
          project: {
            id: req.params.projectId,
            user_id: userId,
          },
        },
      });
      return res.status(200).json({ data: result, error: null });
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async findOnePublic(req: Request, res: Response) {
    try {
      console.log(req.params.id);
      const result = await this.prisma.collection.findFirst({
        where: {
          id: req.params.id,
          archived: false,
        },
        include: {
          collection_sample_images: true,
        },
      });
      if (!result) {
        return res.status(404).json({ data: null, error: "Not found" });
      }
      return res.status(200).json({ data: result, error: null });
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async findOneMiniapp(req: Request, res: Response) {
    try {
      console.log(req.params.id);
      const result = await this.prisma.collection.findFirst({
        where: {
          id: req.params.id,
          archived: false,
        },
        include: {
          collection_sample_images: true,
        },
      });
      if (!result) {
        return res.status(404).json({ data: null, error: "Not found" });
      }

      // Transform the result: replace cover_image_url with miniapp_cover_image value
      const transformedResult = {
        ...result,
        cover_image_url: result.miniapp_cover_image || result.cover_image_url,
        // Remove miniapp_cover_image from the response
        miniapp_cover_image: undefined,
      };

      return res.status(200).json({ data: transformedResult, error: null });
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async create(req: Request, res: Response) {
    try {
      const assetId = parseInt(req.query.asset_id as string) || undefined;

      const validationResult = collectionSchema.safeParse(req.body);
      if (!validationResult.success) {
        return res.status(400).json({
          data: null,
          error: validationResult.error.errors
            .map((e) => `${e.path}: ${e.message}`)
            .join(", "),
        });
      }
      const body = validationResult.data;

      const userId = getUserId(req);
      const projectId = req.query.project_id as string | undefined;

      if (!userId) throw new Error("User not found");

      const collection = await this.prisma.$transaction(async (tx) => {
        let project;
        if (!projectId) {
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
        } else {
          project = await tx.project.findFirst({
            where: {
              id: projectId,
              user_id: userId,
            },
          });

          if (!project) {
            throw new Error("Project not found");
          }
        }

        const collection = await tx.collection.create({
          data: {
            ...body,
            project_id: project.id,
          },
        });

        let data = v2InstructionSet;

        if (assetId) {
          const asset = await tx.flat_file.findUnique({
            where: {
              id: assetId,
            },
          });
          if (!asset) {
            throw new Error("Asset not found");
          }
          data = await generateNewIds(
            tx as PrismaClient,
            collection.id,
            asset.gen_in_data as GenerationInput,
          );
          data = await updateComponentReferencesIds(tx as PrismaClient, data);
        } else if (body.data) {
          data = await generateNewIds(
            tx as PrismaClient,
            collection.id,
            body.data,
          );
          data = await updateComponentReferencesIds(tx as PrismaClient, data);
        }

        await tx.collection.update({
          where: {
            id: collection.id,
          },
          data: {
            data,
          },
        });

        return collection;
      });

      if (collection) {
        await createCollectionPreview(collection, this.prisma);
      }

      res.status(201).json({ data: collection, error: null });
    } catch (e) {
      handleErrorResponse(e, res);
    }
  }

  async update(req: Request, res: Response) {
    const { projectId, collectionId } = req.params;
    const data = req.body;
    const validationResult = collectionSchema.safeParse(data);
    if (!validationResult.success) {
      return res.status(400).json({
        data: null,
        error: validationResult.error.errors
          .map((e) => `${e.path}: ${e.message}`)
          .join(", "),
      });
    }
    try {
      await this.prisma.collection.update({
        where: {
          id: collectionId,
          project: {
            id: projectId,
            user_id: getUserId(req),
          },
        },
        data: validationResult.data,
      });
      return res.sendStatus(204);
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async publish(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const collectionExists = await this.prisma.collection.findUnique({
        where: {
          id,
        },
      });
      if (!collectionExists)
        return res.status(200).json({
          error: "Collect does not exist",
          data: null,
        });

      const result = await this.prisma.collection.update({
        where: { id },
        data: {
          status: "published",
        },
      });
      return res.status(200).json({
        error: null,
        data: result,
      });
    } catch (e) {
      return handleErrorResponse(e, res);
    }
  }

  async findAllUsers(_: Request, res: Response) {
    const profiles = await this.prisma.profile.findMany();
    return res.status(200).json({ data: profiles, error: null });
  }
}
