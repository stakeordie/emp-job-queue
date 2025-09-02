import { PrismaClientType } from "@app/types/database";
import { GenerationInput } from "../../../modules/art-gen/nodes-v2";

import { Request, Response } from "express";

export const v2InstructionSet: GenerationInput = {
  version: "v2",
  steps: [],
  generations: {
    hashes: ["uWCkKMYQnAeSETlQgXXjgv5rpsqQ4wOksnStXFck1PtrBy9TEVg"],
    generations: 1,
    use_custom_hashes: false,
  },
  variables: [],
};

export default function (prisma: PrismaClientType) {
  return async function (req: Request, res: Response) {
    if (req.method !== "POST") {
      return res.status(405).json({ data: null, error: "Method not allowed" });
    }
    const { version } = req.body;
    const userId = req.headers["user_id"] as string;
    const result = await prisma.$transaction(async (tx) => {
      return await tx.project.create({
        data: {
          name: "New Project",
          user_id: userId,
          version,
        },
      });
    });
    res.status(200).json({ data: result, error: null });
  };
}
