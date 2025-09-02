import { PrismaClientType } from "@app/types/database";
import logger from "../../../logger";

import { Request as ExpressRequest, Response } from "express";

export interface Request extends ExpressRequest {
  params: {
    address: string;
  };
}

export default function (prisma: PrismaClientType) {
  return function (req: Request, res: Response) {
    const { address } = req.params;
    prisma.assignment
      .findMany({
        where: {
          address: {
            equals: address,
            mode: "insensitive",
          },
        },
      })
      .then((result) =>
        res.status(200).json({ data: result.length > 0, error: null }),
      )
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ data: null, error: "Internal server error" });
      });
  };
}
