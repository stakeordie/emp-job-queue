import { PrismaClientType } from "@app/types/database";

import { Request, Response } from "express";
import { z } from "zod";
import logger from "../../logger";
import { formatZodError } from "../../utils/index";

const bodyValidator = z.object({
  profile_image: z.string().optional(),
  profile_preference: z.enum(["CREATOR", "COLLECTOR"]).optional(),
  profile_username: z.string().optional(),
});

export async function createProfile(
  req: Request,
  res: Response,
  prisma: PrismaClientType,
) {
  const validationResult = bodyValidator.safeParse(req.body);
  if (!validationResult.success) {
    return res
      .status(400)
      .json({ data: null, error: formatZodError(validationResult.error) });
  }

  const body = validationResult.data;
  try {
    const user_id = req.headers["user_id"] as string;
    const result = await prisma.profile.create({
      data: {
        id: user_id,
        profile_image: body.profile_image,
        profile_preference: body.profile_preference,
        profile_username: body.profile_username,
      },
    });

    return res.status(201).json({ data: result, error: null });
  } catch (e) {
    logger.error(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return res.status(500).json({ data: null, error: message });
  }
}

export async function getProfileByAddress(
  req: Request,
  res: Response,
  prisma: PrismaClientType,
) {
  try {
    const blockchainAddr = req.query.address?.toString();

    // Search for profile in wallets table.
    const walletExists = await prisma.wallet.findFirst({
      where: {
        address: {
          equals: blockchainAddr,
          mode: "insensitive",
        },
      },
    });

    if (!walletExists || !walletExists.user_id) {
      return res.json({
        data: null,
        error: `No profile found for address ${blockchainAddr}`,
      });
    }

    const profile = await prisma.profile.findUnique({
      where: {
        id: walletExists.user_id,
      },
    });

    if (!profile) {
      return res.json({
        data: null,
        error: `No profile found for address ${blockchainAddr}`,
      });
    } else {
      return res.json({
        data: profile,
        error: null,
      });
    }
  } catch (error) {
    const e = error instanceof Error ? error : new Error("Unknown error");
    return res.status(500).json({
      data: null,
      error: `Internal Server Error: ${e.message}`,
    });
  }
}
