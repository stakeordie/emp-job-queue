import { PrismaClientType } from "@app/types/database";
import logger from "../../../logger";

import { Request, Response } from "express";

export default function (prisma: PrismaClientType) {
  return function (req: Request, res: Response) {
    const { id } = req.params;
    prisma.$queryRaw`select update_flat_file_hidden(${id}::integer, true)::text;`
      .then(() => res.status(200).json({ data: "done", error: null }))
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ data: null, error: "Internal server error" });
      });
  };
}
