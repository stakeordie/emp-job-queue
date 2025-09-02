import { CollectionRewardService } from "../../../lib/collection-rewards";
import { CreditsService } from "../../../lib/credits";
import { Request, Response } from "express";
import { z } from "zod";

const validationSchema = z.object({
  walletAddress: z.string(),
});

export default function (
  collectionRewards: CollectionRewardService,
  creditsService: CreditsService,
) {
  return async function (req: Request, res: Response) {
    try {
      let userId = req.headers["user_id"] as string;
      if (!userId) {
        if (
          req.headers.authorization?.split(" ")[1] === process.env.SERVICE_KEY
        ) {
          userId = req.query.user_id as string;
        }
      }
      const id = Number(req.params.id);
      const result = validationSchema.safeParse(req.body);
      if (!result.success || !id) {
        return res.status(400).json({
          data: null,
          error: "Invalid request",
        });
      }
      const { walletAddress } = result.data;
      const data = await collectionRewards.redeemRewards(
        userId,
        id,
        walletAddress,
      );

      const credits = data.pending_rewards.length * data.reward.credits;

      await creditsService.incrementCredits(
        userId,
        credits,
        "permanent",
        `Rewards of ${data.reward.tag}`,
      );
      res.json({
        data: data,
        error: null,
      });
    } catch (e) {
      res.status(500).json({
        data: null,
        error: e instanceof Error ? e.message : e,
      });
    }
  };
}
