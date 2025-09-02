import { PrismaClientType } from "@app/types/database";
import logger from "../../../../logger";

import { Request, Response } from "express";
import { DynamicWebhookBody, UserUpdatedBody, WalletLinkedBody } from "./types";
import { onUserUpdated } from "./userUpdated";
import { onWalletLinked } from "./walletLinked";

export default function (prisma: PrismaClientType) {
  return async function (req: Request, res: Response) {
    const body = req.body as DynamicWebhookBody<any>;

    if (body.eventName === "ping") {
      return res.status(200).json({
        data: "pong",
        error: null,
      });
    }
    logger.info(
      "Synchronizing user information from event of type:",
      body.eventName,
      body,
    );
    const userId = body.data?.id;

    try {
      if (body.eventName === "user.updated") {
        await onUserUpdated(prisma, body as UserUpdatedBody);
      }
      if (body.eventName === "wallet.linked") {
        await onWalletLinked(prisma, body as WalletLinkedBody);
      }
    } catch (error) {
      const e = error instanceof Error ? error : new Error("Unknown error");
      logger.error(`Error while processing sync user request`, e);
      return res.status(500).json({
        data: null,
        error: `Internal Server Error: ${e.message}`,
      });
    }
    logger.info("User information synchronized successfully.");
    res.status(200).json({
      data: {
        user_id: userId,
      },
      error: null,
    });
  };
}
