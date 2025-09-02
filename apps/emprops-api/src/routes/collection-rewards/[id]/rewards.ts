import { CollectionRewardService } from "../../../lib/collection-rewards";
import { Request, Response } from "express";

export default function (rewardsService: CollectionRewardService) {
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
      const walletAddress = req.params.walletAddress;
      const availableRewards = await rewardsService.getWalletRewardsInfo(
        userId,
        id,
        walletAddress,
      );

      res.status(200).json({
        data: availableRewards,
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
