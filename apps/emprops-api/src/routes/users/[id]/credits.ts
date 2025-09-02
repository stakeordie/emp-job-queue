import { CreditsService } from "../../../lib/credits";
import { Prisma } from '@emp/database';
import { Request, Response } from "express";
import { z } from "zod";

export default function (creditsService: CreditsService) {
  return async function (req: Request, res: Response) {
    switch (req.method) {
      case "GET":
        await handleGet(req, res, creditsService);
        break;
      case "POST":
        await handlePost(req, res, creditsService);
        break;
      default:
        res.status(405).json({
          data: null,
          error: "Method not allowed",
        });
        return;
    }
  };
}

async function handleGet(
  req: Request,
  res: Response,
  creditsService: CreditsService,
) {
  const { id: user_id } = req.params;
  try {
    const balances = await creditsService.getBalances(user_id);
    const totalCredits = balances
      .map((credit) => credit.balance)
      .reduce((a, b) => a.plus(b), new Prisma.Decimal(0));
    res.json({
      data: {
        balances: balances,
        total: totalCredits,
      },
      error: null,
    });
  } catch (e) {
    res.status(500).json({
      data: null,
      error: (e as Error).message,
    });
  }
}

const validationSchema = z.object({
  amount: z.number(),
  type: z.enum(["permanent", "rental"]).nullable().optional(),
  flow: z.enum(["in", "out"]),
  comment: z.string().nullable().optional(),
});

async function handlePost(
  req: Request,
  res: Response,
  creditsService: CreditsService,
) {
  const isApiQuerier =
    req.headers.authorization?.split(" ")[1] == process.env.SERVICE_KEY;
  if (!isApiQuerier && !req.headers["user_id"]) {
    return res.status(401).json({
      data: null,
      error: "Unauthorized",
    });
  }
  const { id: user_id } = req.params;

  const result = validationSchema.safeParse(req.body);
  if (!result.success || !user_id) {
    return res.status(400).json({
      data: null,
      error: "Invalid request",
    });
  }
  const { amount, type, flow, comment } = result.data;
  try {
    if (flow === "out") {
      await creditsService.decrementCredits(user_id, amount, comment);
    } else if (flow === "in") {
      if (type == null) {
        return res.status(400).json({
          data: null,
          error: "Invalid request",
        });
      }
      await creditsService.incrementCredits(user_id, amount, type, comment);
    }
    res.json({
      data: {
        amount,
        type,
        flow,
      },
      error: null,
    });
  } catch (e) {
    res.status(500).json({
      data: null,
      error: (e as Error).message,
    });
  }
}
