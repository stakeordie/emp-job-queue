import { PrismaClientType } from "@app/types/database";
import logger from "../../logger";
import {
  buildDefaultAuthIdentifiedQuery,
  buildDefaultAuthPagedQuery,
  parsePageQueryString,
} from "../../utils/queries";
import { Prisma, PrismaClient } from '@emp/database';
import { Request, Response } from "express";
import { z } from "zod";

const creationSchema = z.object({
  name: z.string(),
  url: z.string().nullable(),
  rel_type: z.string(),
  mime_type: z.string(),
  tags: z.array(z.string()).optional(),
  hidden: z.boolean().optional(),
});
const updateSchema = creationSchema.partial();

export const getFlatFiles =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const query = buildDefaultAuthPagedQuery(req);
      const result = await prisma.flat_file.findMany(query);
      return res.status(200).json({ data: result, error: null });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const getComponentFlatFiles =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const collectionId = req.params.collectionId as string;
      const componentId = req.params.componentId as unknown as
        | number
        | undefined;
      const { skip, take } = parsePageQueryString(req.query);
      const userId = req.headers["user_id"] as string;
      const queryResult = await prisma.component_flat_file.findMany({
        where: {
          component_id: componentId,
          component: {
            collection_id: collectionId,
          },
          flat_file: {
            user_id: userId,
            hidden: false,
          },
        },
        include: {
          flat_file: true,
        },
        orderBy: {
          flat_file: {
            created_at: "desc",
          },
        },
        skip,
        take,
      });
      const result = queryResult.map((item) => item.flat_file);
      return res.status(200).json({ data: result, error: null });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const countFlatFiles =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const query = buildDefaultAuthPagedQuery(req);
      const count = await prisma.flat_file.count(query);
      return res.status(200).json({ data: { count }, error: null });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const getFlatFileById =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const query = buildDefaultAuthIdentifiedQuery<bigint>(req);
      const result = await prisma.flat_file.findUnique(query);
      if (!result) {
        return res.status(404).json({ data: null, error: "Not found" });
      }
      return res.status(200).json({ data: result, error: null });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const createFlatFile =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    if (req.query.bulk) {
      return createBulkFlatFiles(prisma)(req, res);
    }

    try {
      const parsedBody = creationSchema.safeParse(req.body);
      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }

      const result = await prisma.flat_file.create({
        data: {
          name: parsedBody.data.name,
          url: parsedBody.data.url,
          rel_type: parsedBody.data.rel_type,
          mime_type: parsedBody.data.mime_type,
          tags: parsedBody.data.tags ?? [],
          hidden: parsedBody.data.hidden ?? false,
          user_id: req.headers["user_id"] as string,
        },
      });
      return res.status(200).json({ data: result, error: null });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const createBulkFlatFiles =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const parsedBody = creationSchema.array().safeParse(req.body);
      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }

      const data = parsedBody.data.map((item) => ({
        name: item.name,
        url: item.url,
        rel_type: item.rel_type,
        mime_type: item.mime_type,
        tags: item.tags ?? [],
        hidden: item.hidden ?? false,
        user_id: req.headers["user_id"] as string,
      }));

      const result = await prisma.flat_file.createMany({ data });
      return res.status(200).json({ data: result, error: null });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const updateFlatFile =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const parsedBody = updateSchema.safeParse(req.body);
      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }
      const query = buildDefaultAuthIdentifiedQuery<bigint>(req);
      const result = await prisma.flat_file.update({
        ...query,
        data: parsedBody.data,
      });
      return res.status(200).json({ data: result, error: null });
    } catch (error) {
      logger.error(error);
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2025") {
          return res.status(404).json({ error: "Not found" });
        }
      }
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };

export const updateBulkFlatFiles =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const ids = (req.query.ids as string).split(",").map((id) => +id);
      const body = updateSchema.safeParse(req.body);
      if (!body.success) {
        const { path, message } = body.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }
      await prisma.flat_file.updateMany({
        where: {
          id: {
            in: ids,
          },
        },
        data: body.data,
      });
      return res.status(200).json({ data: "done", error: null });
    } catch (error) {
      logger.error(error);
      return res
        .status(500)
        .json({ data: null, error: "Internal server error" });
    }
  };
