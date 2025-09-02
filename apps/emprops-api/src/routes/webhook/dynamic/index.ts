import { PrismaClientType } from "@app/types/database";
import logger from "../../../logger";

import { Request, Response } from "express";

export default function (prisma: PrismaClientType) {
  return async function (req: Request, res: Response) {
    const body = req.body;

    if (body.eventName === "ping") {
      return res.status(200).json({
        data: "pong",
        error: null,
      });
    }

    logger.debug("Sign-up request", req.body);
    const userId = req.body.data.id;

    try {
      let customer = await prisma.customer.findFirst({
        where: {
          id: userId,
        },
      });
      if (customer == null) {
        logger.warn(`Customer not found for user ${userId}`);
        customer = await prisma.customer.create({
          data: {
            id: userId,
          },
        });
        logger.info(`Creating customer for user ${userId}`);
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error("Unknown error");
      logger.error(`Error while processing signup request`, e);
      return res.status(500).json({
        data: null,
        error: `Internal Server Error: ${e.message}`,
      });
    }

    res.status(200).json({
      data: {
        user_id: userId,
      },
      error: null,
    });
  };
}
