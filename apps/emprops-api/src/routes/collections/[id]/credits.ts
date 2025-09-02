import { PrismaClientType } from "@app/types/database";
import DynamicClient from "../../../clients/dynamic-client";
import { CreditsService } from "../../../lib/credits";

import { Request, Response } from "express";
import { z } from "zod";

const validationSchema = z.object({
  amount: z.number(),
  owner: z.string(),
  type: z.enum(["permanent", "rental"]).optional(),
  flow: z.enum(["in", "out"]),
  comment: z.string().nullable().optional(),
});

export default function (
  prisma: PrismaClientType,
  creditsService: CreditsService,
  dynamicClient: DynamicClient,
) {
  return async function (req: Request, res: Response) {
    const isApiQuerier =
      req.headers.authorization?.split(" ")[1] == process.env.SERVICE_KEY;
    if (!isApiQuerier) {
      res.status(401).json({
        data: null,
        error: "Unauthorized",
      });
      return;
    }
    const result = validationSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        data: null,
        error: "Invalid request",
      });
    }
    const { amount, type, flow, comment, owner } = result.data;
    try {
      let user_id = null;
      if (owner.startsWith("0x")) {
        const response = await dynamicClient.getAllUsersForEnvironment({
          filterColumn: "walletPublicKey",
          filterValue: owner,
        });
        if (response.users.length > 0) {
          user_id = response.users[0].id;
        }
      } else {
        const user = await prisma.wallet.findUniqueOrThrow({
          where: {
            address: owner,
          },
        });

        user_id = user.user_id;
      }
      if (!user_id) {
        res.status(400).json({
          data: null,
          error: "Wallet has no user_id",
        });
        return;
      }
      if (flow === "in") {
        await creditsService.incrementCredits(user_id, amount, type, comment);
      } else if (flow === "out") {
        await creditsService.decrementCredits(user_id, amount, comment);
      }
      res.json({
        data: {
          amount,
          type,
        },
        error: null,
      });
    } catch (e) {
      res.status(500).json({
        data: null,
        error: (e as Error).message,
      });
    }
  };
}
