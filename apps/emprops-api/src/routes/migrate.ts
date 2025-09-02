import { PrismaClientType } from "@app/types/database";
import logger from "../logger";

import { Request, Response } from "express";

export default function (prisma: PrismaClientType) {
  return async function (req: Request, res: Response) {
    const id = req.headers["user_id"] as string;
    const supabaseUserId = await getSupabaseUserId(id);
    if (!supabaseUserId)
      return res.status(404).json({ data: null, error: "User not found" });
    try {
      logger.info(
        `Migrating user from supabase ${supabaseUserId} to dynamic ${id}`,
      );
      await prisma.$transaction([
        prisma.$executeRawUnsafe(
          "update assignment set user_id = $1::uuid where user_id = $2::uuid",
          id,
          supabaseUserId,
        ),
        prisma.$executeRawUnsafe(
          "update collection set user_id = $1::uuid where user_id = $2::uuid",
          id,
          supabaseUserId,
        ),
        prisma.$executeRawUnsafe(
          "update flat_file set user_id = $1::uuid where user_id = $2::uuid",
          id,
          supabaseUserId,
        ),
        prisma.$executeRawUnsafe(
          "update project set user_id = $1::uuid where user_id = $2::uuid",
          id,
          supabaseUserId,
        ),
        prisma.$executeRawUnsafe(
          "update project_history set user_id = $1::uuid where user_id = $2::uuid",
          id,
          supabaseUserId,
        ),
        prisma.$executeRawUnsafe(
          "update role set user_id = $1::uuid where user_id = $2::uuid",
          id,
          supabaseUserId,
        ),
        prisma.$executeRawUnsafe(
          "update wallet set user_id = $1::uuid where user_id = $2::uuid",
          id,
          supabaseUserId,
        ),
      ]);
      logger.info(`Migration complete for user ${id}`);
      res.status(200).json({ data: "success", error: null });
    } catch (error) {
      logger.error(error);
      res.status(500).json({ data: null, error: "Internal server error" });
    }
  };
}

async function getSupabaseUserId(id: string) {
  const response = await fetch(
    `${process.env.DYNAMIC_API_URL}/api/v0/users/${id}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.DYNAMIC_API_KEY}`,
      },
    },
  );
  const json = await response.json();
  return json.user.metadata.supabaseUserId;
}
