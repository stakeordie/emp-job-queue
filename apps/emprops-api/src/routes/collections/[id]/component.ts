import { PrismaClientType } from "@app/types/database";
import logger from "../../../logger";

import { Request, Response } from "express";

export const createComponent =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
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

      const result = await prisma.component.create({
        data: {
          collection_id: collectionId,
        },
      });

      return res.status(201).json({ data: result, error: null });
    } catch (error) {
      logger.error(error);
      const message =
        error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ data: null, error: message });
    }
  };

export const deleteComponent =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const user_id = req.headers["user_id"] as string;
      const { collectionId, componentId } = req.params;
      const componentIdNum = parseInt(componentId);

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

      const component = await prisma.component.findFirst({
        where: {
          id: componentIdNum,
        },
      });

      if (!component) {
        return res.status(404).json({
          data: null,
          error: "Component not found",
        });
      }

      await prisma.component.delete({
        where: {
          id: componentIdNum,
        },
      });

      return res.status(200).json({
        data: "Component deleted successfully",
        error: null,
      });
    } catch (error) {
      logger.error(error);
      const message =
        error instanceof Error ? error.message : "Internal server error";
      return res.status(500).json({ data: null, error: message });
    }
  };
