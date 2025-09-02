import { PrismaClientType } from "@app/types/database";
import { StorageClient } from "../../../clients/storage-client";
import { detectMimeType } from "../../../utils/mime-types";

import { Request, Response } from "express";
import mime from "mime";
import { v4 as uuid } from "uuid";
import { z } from "zod";
import logger from "../../../logger";
import { formatZodError } from "../../../utils/index";

export async function getById(
  req: Request,
  res: Response,
  prisma: PrismaClientType,
) {
  const { profileId } = req.params;

  try {
    const profile = await prisma.profile.findUnique({
      where: { id: profileId },
    });

    if (!profile) {
      return res.status(404).json({ data: null, error: "Profile not found" });
    }

    return res.status(200).json({ data: profile, error: null });
  } catch (e) {
    logger.error(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return res.status(500).json({ data: null, error: message });
  }
}

const updateProfileForm = z.object({
  profile_image: z.string().optional(),
  profile_preference: z.enum(["CREATOR", "COLLECTOR"]).optional(),
  profile_username: z.string().optional(),
});

export async function update(
  req: Request,
  res: Response,
  prisma: PrismaClientType,
  storageClient: StorageClient,
) {
  const validationResult = updateProfileForm.safeParse(req.body);
  if (!validationResult.success) {
    return res
      .status(400)
      .json({ data: null, error: formatZodError(validationResult.error) });
  }

  const body = validationResult.data;
  try {
    const { profileId } = req.params;

    // Validate if profile exist
    const profile = await prisma.profile.findUnique({
      where: {
        id: profileId,
      },
    });

    let profileImage = body.profile_image;

    if (profileImage && !profileImage.startsWith("http")) {
      const base64WithoutPrefix = profileImage.split(",")[1];
      const mimeType = detectMimeType(base64WithoutPrefix);
      if (!mimeType) {
        return res
          .status(400)
          .json({ data: null, error: "Invalid image format" });
      }
      const ext = mime.getExtension(mimeType);
      const uri = `profile/${profileId}/${uuid()}.${ext}`;
      await storageClient.storeFile(
        uri,
        mimeType,
        Buffer.from(base64WithoutPrefix, "base64"),
      );
      profileImage = `${process.env.CLOUDFRONT_URL}/${uri}`;
    }

    if (!profile) {
      await prisma.profile.create({
        data: {
          id: profileId,
          profile_image: profileImage,
          profile_preference: body.profile_preference,
          profile_username: body.profile_username,
        },
      });
      return res.status(201).json({ data: null, error: null });
    }

    const now = new Date();

    const result = await prisma.profile.update({
      data: {
        profile_image: profileImage,
        profile_preference: body.profile_preference,
        updated_at: now,
        profile_username: body.profile_username,
      },
      where: {
        id: profileId,
      },
    });

    return res.status(200).json({ data: result, error: null });
  } catch (e) {
    logger.error(e);
    const message = e instanceof Error ? e.message : "Internal server error";
    return res.status(500).json({ data: null, error: message });
  }
}
