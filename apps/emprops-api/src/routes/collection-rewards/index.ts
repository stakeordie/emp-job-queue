import { CollectionRewardService } from "../../lib/collection-rewards";
import { Request, Response } from "express";

export default function (rewardsService: CollectionRewardService) {
  return async function (req: Request, res: Response) {
    try {
      const chainId = req.query.chain_id as string;
      const result = await rewardsService.getCollectionRewards(chainId);

      res.status(200).json({
        data: result,
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
