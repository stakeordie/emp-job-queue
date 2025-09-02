import { PrismaClientType } from "@app/types/database";
import { PlatformApiClient } from "../../../clients/platform-client";
import { CreditsService } from "../../../lib/credits";
import logger from "../../../logger";

import { Request, Response } from "express";

export default function (
  prisma: PrismaClientType,
  platformApiClient: PlatformApiClient,
) {
  return async function (req: Request, res: Response) {
    const body = req.body;
    const userId = req.headers["user_id"] as string;
    const walletsLinked = body?.linkedWallets;

    try {
      if (!walletsLinked) {
        return res.status(200).json({
          data: {
            user_id: userId,
            message: `No wallets linked`,
          },
        });
      }

      // Validate if user exist
      const customer = await prisma.customer.findUnique({
        where: {
          id: userId,
        },
      });

      if (!customer) {
        return res.status(404).json({
          data: null,
          error: `User id ${userId} not found`,
        });
      }

      const profile = await prisma.profile.findUnique({
        where: {
          id: userId,
        },
      });

      // Validate if has completed onboarding process
      if (profile) {
        return res.status(400).json({
          data: null,
          error: `User id ${userId} has completed onboarding process`,
        });
      }

      // Prevent abuse of the endpoint
      const creditHistory = await prisma.credits_history.findFirst({
        where: {
          AND: [
            { user_id: userId },
            { flow: "in" },
            { comment: "Received by linking wallet for the first time" },
          ],
        },
      });

      if (creditHistory) {
        return res.status(400).json({
          data: null,
          error: `User id ${userId} has already received credits by onboarding`,
        });
      }

      // Validate if has a emprops token
      const tokensByWallet = await platformApiClient.getTokens({
        owner: walletsLinked,
      });

      if (!tokensByWallet?._embedded?.tokenModelList) {
        return res.status(400).json({
          data: null,
          error: `User id ${userId} has no tokens`,
        });
      }

      const creditService = new CreditsService(prisma);

      await creditService.incrementCredits(
        userId,
        100,
        "permanent",
        "Received by linking wallet for the first time",
      );

      res.status(200).json({
        data: {
          user_id: userId,
          message: "User has received credits successfully",
        },
        error: null,
      });
    } catch (error) {
      const e = error instanceof Error ? error : new Error("Unknown error");
      logger.error(`Error while processing onboarding process link wallet`, e);
      return res.status(500).json({
        data: null,
        error: `Internal Server Error: ${e.message}`,
      });
    }
  };
}
