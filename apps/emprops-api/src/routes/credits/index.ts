import { CreditsService } from "../../lib/credits";
import { Request, Response } from "express";

export default function (creditsService: CreditsService) {
  return async function (req: Request, res: Response) {
    let userId = req.headers["user_id"] as string;
    if (!userId) {
      if (
        req.headers.authorization?.split(" ")[1] === process.env.SERVICE_KEY
      ) {
        userId = req.query.user_id as string;
      }
    }
    const credits = await creditsService.getTotalCredits(userId);
    res.json({
      data: credits,
      error: null,
    });
  };
}
