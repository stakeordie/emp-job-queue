import { IpfsClient } from "../../../../clients/ipfs-client";
import { StorageClient } from "../../../../clients/storage-client";
import logger from "../../../../logger";
import { Request as ExpressRequest, Response } from "express";
import sharp from "sharp";
import { z } from "zod";

interface Request extends ExpressRequest {
  body: {
    name: string;
    description: string;
    image_url: string;
    creator_address: string;
    royalties: {
      address: string;
      value: number;
    }[];
    attributes: {
      name: string;
      value: string;
    }[];
    project_id: string;
    token_id: string;
  };
}

const validationSchema = z.object({
  name: z.string().nonempty(),
  description: z.string().nonempty(),
  image_url: z.string().nonempty(),
  creator_address: z.string(),
  royalties: z.array(
    z.object({
      address: z.string().nonempty(),
      value: z.number().nonnegative(),
    }),
  ),
  attributes: z.array(
    z.object({
      name: z.string().nonempty(),
      value: z.string().nonempty(),
    }),
  ),
  project_id: z.string().nonempty(),
  token_id: z.string().nonempty(),
});

export default function (ipfsClient: IpfsClient, storageClient: StorageClient) {
  return async function (req: Request, res: Response) {
    const validationResult = validationSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "A required field is missing or invalid",
      });
    }

    const body = validationResult.data;

    // Get image from url and upload to ipfs.
    const response = await fetch(body.image_url);
    const buffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type");
    if (!contentType) {
      return res.status(500).json({
        error: "Failed to get content type",
      });
    }
    if (!contentType.startsWith("image/")) {
      return res.status(400).json({
        error: "`image_url` is not an image",
      });
    }
    const extension = body.image_url.substring(
      body.image_url.lastIndexOf(".") + 1,
    );

    const imageMetadata = await sharp(buffer).metadata();
    if (!imageMetadata) {
      return res.status(500).json({
        error: "Failed to get image metadata",
      });
    }
    const width = imageMetadata.width || 512;
    const height = imageMetadata.height || 512;

    // Resizing images.
    const fullBuffer = Buffer.from(buffer);
    const hdBuffer = await sharp(buffer)
      .resize(Math.floor(width / 2), Math.floor(height / 2))
      .toBuffer();
    const sdBuffer = await sharp(buffer)
      .resize(Math.floor(width / 4), Math.floor(height / 4))
      .toBuffer();

    const images = [
      {
        name: `tokens/${body.token_id}/full.${extension}`,
        content: fullBuffer,
      },
      {
        name: `tokens/${body.token_id}/hd.${extension}`,
        content: hdBuffer,
      },
      {
        name: `tokens/${body.token_id}/sd.${extension}`,
        content: sdBuffer,
      },
    ];

    // Upload to s3.
    const s3Promises = images.map((it) =>
      storageClient.storeFile(it.name, contentType, it.content),
    );
    try {
      await Promise.all(s3Promises);
    } catch (e) {
      logger.error(e);
      return res.status(500).json({
        error: "Failed to upload image to S3",
      });
    }

    // Upload image to ipfs.
    const ipfsPromises = images.map((it) =>
      ipfsClient.uploadFile(it.name, it.content, contentType),
    );
    let cids: string[];
    try {
      cids = await Promise.all(ipfsPromises);
    } catch (e) {
      logger.error(e);
      return res.status(500).json({
        error: "Failed to upload image to IPFS",
      });
    }

    // Build metadata and upload to ipfs.
    // @ts-ignore
    const metadata = buildMetadata(body, cids, contentType);

    let metadataCid;
    try {
      metadataCid = await ipfsClient.uploadFile(
        `${body.token_id}.json`,
        Buffer.from(JSON.stringify(metadata)),
        "application/json",
      );
    } catch (e) {
      logger.error(e);
      return res.status(500).json({
        error: "Failed to upload metadata to IPFS",
      });
    }

    return res.json({
      data: {
        uri: `ipfs://${metadataCid}`,
      },
    });
  };
}

function buildMetadata(
  body: Request["body"],
  cids: string[],
  mimeType: string,
) {
  const royalties = body.royalties.reduce(
    (acc, curr) => {
      acc[curr.address] = curr.value;
      return acc;
    },
    {} as Record<string, number>,
  );
  return {
    name: body.name,
    symbol: "EmProps",
    decimals: 0,
    artifactUri: `ipfs://${cids[0]}`,
    displayUri: `ipfs://${cids[1]}`,
    thumbnailUri: `ipfs://${cids[2]}`,
    description: body.description,
    minter: body.creator_address,
    creators: [body.creator_address],
    isBooleanAmount: true,
    royalties: {
      decimals: 4,
      shares: royalties,
    },
    attributes: body.attributes,
    formats: [
      {
        uri: `ipfs://${cids[0]}`,
        mimeType: mimeType,
      },
      {
        uri: `ipfs://${cids[1]}`,
        mimeType: mimeType,
      },
      {
        uri: `ipfs://${cids[2]}`,
        mimeType: mimeType,
      },
    ],
  };
}
