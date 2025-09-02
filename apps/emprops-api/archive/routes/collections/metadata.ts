import { IpfsClient } from "../../clients/ipfs-client";
import { GenerationInput } from "../../lib/art-gen";
import { CreditsService } from "../../lib/credits";
import { encryptString } from "../../lib/encrypter";
import lint from "../../lib/linter";
import {
  AIGenerativeCollectionList,
  isServiceKeyAuth,
  uploadUngeneratedImage,
} from "../../utils";
import { Request, Response } from "express";
import { z } from "zod";

import { StorageClient } from "../../clients/storage-client";
import logger from "../../logger";

type MatadataVersion = "v1" | "v2";

// v1: Old versions in tezos
// v2: New versions for ETH and Tezos

interface BaseValidationSchema {
  id: string;
  code: any;
  cover_image: string;
  password?: string;
  ungenerated_image?: string;
  total_editions: number;
  collection_type: string;
}

interface V2ValidationSchema extends BaseValidationSchema {
  name: string;
  type: string;
  description: string;
  width: number;
  height: number;
  publish_date: string;
  origin?: string | null;
}

interface V1ValidationSchema extends BaseValidationSchema {
  creator_address: string;
  royalties: number;
}

const MetadataVersionsArray: MatadataVersion[] = ["v1", "v2"];

const v2ValidationSchema = z.object({
  id: z.string().nonempty(),
  name: z.string().nonempty(),
  type: z.string().nonempty(),
  description: z.string().nonempty(),
  width: z.number().positive(),
  height: z.number().positive(),
  code: z.unknown(),
  cover_image: z.string().nonempty(),
  password: z.string().optional(),
  ungenerated_image: z.string().optional(),
  publish_date: z.string().nonempty(),
  total_editions: z.number().positive(),
  collection_type: z.string().nonempty(),
  origin: z.string().optional().nullable(),
});

const v1ValidationSchema = z.object({
  id: z.string().nonempty(),
  creator_address: z.string().nonempty(),
  code: z.unknown(),
  cover_image: z.string().nonempty(),
  ungenerated_image: z.string().optional(),
  royalties: z.number().int(),
  password: z.string().optional(),
  total_editions: z.number().positive(),
  collection_type: z.string().nonempty(),
});

export default function (
  ipfsClient: IpfsClient,
  storageClient: StorageClient,
  creditsService: CreditsService,
) {
  return async function (req: Request, res: Response) {
    let version: MatadataVersion = req.body?.version || "v2";

    if (!MetadataVersionsArray.includes(version)) {
      version = "v2";
    }

    const validationResult =
      version == "v1"
        ? v1ValidationSchema.safeParse(req.body)
        : v2ValidationSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).send({ error: validationResult.error });
      return;
    }

    const form = validationResult.data;
    const id = form.id;
    if (
      AIGenerativeCollectionList.includes(form.collection_type) &&
      !isServiceKeyAuth(req)
    ) {
      if (version == "v1") {
        const messages = lint(form.code as GenerationInput, "error")
          .map((l) => l.messages)
          .flat();

        if (messages.length) {
          return res.status(400).json({ error: `LINTER_ERROR: ${messages}` });
        }
      }

      const user_id = req.headers["user_id"] as string;
      const hasEnoughCredits = await creditsService.hasEnoughCredits(
        user_id,
        form.code as GenerationInput,
        form.total_editions,
      );
      if (!hasEnoughCredits) {
        return res.status(400).json({
          error: `Not enough credits.`,
        });
      }
    }

    const codeContent = JSON.stringify(form.code);
    try {
      await storageClient.storeFile(
        `instruction-sets/${id}.json`,
        "application/json",
        Buffer.from(codeContent),
      );
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message });
    }

    let codeCid;
    if (form.password) {
      const encryptedCodeContent = encryptString(codeContent, form.password);
      try {
        codeCid = await ipfsClient.uploadFile(
          `${id}_code.enc.json`,
          Buffer.from(encryptedCodeContent),
          "application/octet-stream",
        );
      } catch (e) {
        logger.error(e);
        return res.status(500).json({ error: (e as Error).message });
      }
    } else {
      try {
        codeCid = await ipfsClient.uploadFile(
          `${id}_code.json`,
          Buffer.from(codeContent),
          "application/json",
        );
      } catch (e) {
        logger.error(e);
        return res.status(500).json({ error: (e as Error).message });
      }
    }

    // Create and save mint metadata.
    let ungeneratedImageCid;
    if (form.ungenerated_image) {
      try {
        ungeneratedImageCid = await uploadUngeneratedImage(
          ipfsClient,
          id,
          form.ungenerated_image,
        );
      } catch (e) {
        logger.error(e);
        return res.status(500).json({ error: (e as Error).message });
      }
    }

    if (version == "v2") {
      try {
        const metadataResult = await createV2MintMetadata(
          ipfsClient,
          id,
          form as V2ValidationSchema,
          codeCid,
          ungeneratedImageCid,
        );
        return res.json({
          data: metadataResult,
        });
      } catch (e) {
        res.status(500).json({ error: (e as Error).message });
        return;
      }
    } else {
      const mintMetadataContent = createV1MintMetadata(
        form as V1ValidationSchema,
        id,
        ungeneratedImageCid,
      );
      let mintMetadataCid;
      try {
        mintMetadataCid = await ipfsClient.uploadFile(
          `${id}_mint_metadata.json`,
          Buffer.from(JSON.stringify(mintMetadataContent)),
          "application/json",
        );
      } catch (e) {
        logger.error(e);
        res.status(500).json({ error: (e as Error).message });
        return;
      }

      return res.json({
        data: {
          id,
          code_url: `ipfs://${codeCid}`,
          mint_metadata_url: `ipfs://${mintMetadataCid}`,
          cover_image_url: form.cover_image,
        },
      });
    }
  };
}

async function createV2MintMetadata(
  ipfsClient: IpfsClient,
  id: string,
  form: V2ValidationSchema,
  codeCid: string,
  ungeneratedImageCid?: string,
) {
  const metadata = {
    id: id,
    name: form.name,
    type: form.type,
    description: form.description,
    width: form.width,
    height: form.height,
    displayUri: form.cover_image,
    artifactUri: `ipfs://${codeCid}`,
    verificationSignature: encryptString(id, process.env.ENCRYPTION_SECRET_KEY),
    ungeneratedImage: ungeneratedImageCid
      ? `ipfs://${ungeneratedImageCid}`
      : "ipfs:///QmcLnVoCo6Mxv68Ad8LHVz8H8Gt1MLugeRuBQaqzQkXsbC",
    origen: form.origin || "open",
    publishDate: form.publish_date,
  };

  const mintMetadataCid = await ipfsClient.uploadFile(
    `${id}_mint_metadata.json`,
    Buffer.from(JSON.stringify(metadata)),
    "application/json",
  );

  return {
    id,
    metadata_url: `ipfs://${mintMetadataCid}`,
  };
}

function createV1MintMetadata(
  form: V1ValidationSchema,
  id: string,
  ungeneratedImageCid?: string,
) {
  const imageUri = ungeneratedImageCid
    ? `ipfs://${ungeneratedImageCid}`
    : "ipfs://QmcLnVoCo6Mxv68Ad8LHVz8H8Gt1MLugeRuBQaqzQkXsbC";
  return {
    description: "This token is waiting to be generated by EmProps",
    type: form.collection_type,
    verificationSignature: encryptString(id, process.env.ENCRYPTION_SECRET_KEY),
    artifactUri: imageUri,
    displayUri: imageUri,
    thumbnailUri: imageUri,
    symbol: "EmProps",
    decimals: "0",
    isBooleanAmount: true,
    royalties: {
      shares: {
        [form.creator_address]: form.royalties,
      },
      decimals: "4",
    },
  };
}
