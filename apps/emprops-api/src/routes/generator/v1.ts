import { PrismaClientType } from "@app/types/database";
import { StorageClient } from "../../clients/storage-client";
import { GenerationInput, GeneratorV1, generatorUserId } from "../../lib/art-gen";
import { CreditsService } from "../../lib/credits";
import logger from "../../logger";

import { Request as ExpressRequest, Response } from "express";
import { v4 as uuid } from "uuid";

interface Request extends ExpressRequest {
  body: GenerationInput;
}

export default function (
  creditsService: CreditsService,
  storageClient: StorageClient,
  prisma: PrismaClientType,
) {
  return async function (req: Request, res: Response) {
    logger.info("Starting generator request");
    const config = getConfig(req);
    new GeneratorV1(creditsService, storageClient, prisma, config)
      .on("generation", (data) => {
        logger.info("Generated data");
        res.json({ data, error: null });
      })
      .on("error", (error) => {
        logger.error(error);
        res.status(500).json({ data: null, error: (error as Error).message });
      })
      .on("complete", () => logger.info("Finished generation"))
      .generate(uuid(), req.body, generatorUserId);
  };
}

function getConfig(req: Request) {
  // Filter headers that start with `x-` and pass them to the stable diffusion service.
  const headerKeys = Object.keys(req.headers);
  const XHeaders = headerKeys.filter((key) => key.startsWith("x-"));
  const headers = XHeaders.reduce(
    (acc, key) => {
      acc[key] = req.headers[key] as string;
      return acc;
    },
    {} as Record<string, string>,
  );
  return {
    stableDiffusion: {
      headers,
    },
  };
}
