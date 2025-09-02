import logger from "../../logger";
import {
  GenerationInput,
  generatorUserId,
  GeneratorV2,
} from "../../modules/art-gen/nodes-v2";
import { generateHash } from "../../utils";
import { Response } from "express";
import { v4 as uuid } from "uuid";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pfpInstructionSetJson = JSON.parse(
  readFileSync(path.join(__dirname, "../../data/profile-picture-instruction-set.json"), "utf8")
);

export async function generatePFP(res: Response, generator: GeneratorV2) {
  try {
    const pfpInstructionSet = JSON.parse(
      JSON.stringify(pfpInstructionSetJson),
    ) as GenerationInput;
    pfpInstructionSet.generations.hashes.push(generateHash(51));

    generator
      .on("complete", (data) => {
        res.json({
          data,
          error: null,
        });
      })
      .on("error", (error) => {
        res.status(500).json({ data: null, error: error.message });
      })
      .start(uuid(), pfpInstructionSet, {
        userId: generatorUserId,
      });
  } catch (error) {
    const e = error instanceof Error ? error : new Error("Unknown error");
    logger.error(`Error on generating PFP`, e);
    return res.status(500).json({
      data: null,
      error: `Internal Server Error: ${e.message}`,
    });
  }
}
