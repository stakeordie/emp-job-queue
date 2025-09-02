import { GenerationInput } from "../../lib/art-gen";
import lint from "../../lib/linter";
import logger from "../../logger";
import { Request as ExpressRequest, Response } from "express";

interface Request extends ExpressRequest {
  body: GenerationInput;
}

export default function (req: Request, res: Response) {
  try {
    const lints = lint(req.body);
    const status = lints.filter((l) => l.level == "error").length
      ? "failed"
      : "passed";
    res.json({
      data: {
        status,
        rules: lints,
        error: null,
      },
    });
  } catch (e) {
    if (e instanceof Error) {
      logger.error(`LinterEndPointFatal: ${e.message}`);

      res.status(500).json({ error: e.message });
    }
  }
}
