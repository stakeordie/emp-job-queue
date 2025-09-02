import { StorageClient } from "../clients/storage-client";
import logger from "../logger";
import { Request as ExpressRequest, Response } from "express";
import { UploadedFile } from "express-fileupload";
import { v4 as uuid } from "uuid";
import { z } from "zod";

interface Request extends ExpressRequest {
  body: {
    path: string;
  };
}
// @ts-ignore
BigInt.prototype.toJSON = function () {
  // @ts-ignore
  if (this <= Number.MAX_SAFE_INTEGER) {
    return Number(this);
  }
  return this.toString();
};

const validationSchema = z.object({
  path: z.string().min(1),
});

export default function (storageClient: StorageClient) {
  return async function (req: Request, res: Response) {
    const validationResult = validationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: validationResult.error,
      });
    }
    const body = validationResult.data;
    if (!req.files || !req.files.file) {
      return res.status(400).json({
        error: "No file uploaded",
      });
    }
    const file = req.files.file as UploadedFile;
    const ext = file.name.split(".").pop();
    const fileName = `${body.path}/${uuid()}.${ext}`;
    try {
      await storageClient.storeFile(fileName, file.mimetype, file.data);
      res.json({ data: { url: `${process.env.CLOUDFRONT_URL}/${fileName}` } });
    } catch (error) {
      logger.error(error);
      const e = error as Error;
      return res.status(500).send({
        error: e.message,
      });
    }
  };
}
