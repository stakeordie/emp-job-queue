import logger from "../../logger";
import { sanitizeBreaks } from "../../utils/str";
import { Request as ExpressRequest, Response } from "express";
import { OpenAIApi } from "openai";
import { z } from "zod";

interface Request extends ExpressRequest {
  body: {
    prompt: string;
  };
}

const requestSchema = z.object({
  prompt: z.string().min(1),
});

export default function (openai: OpenAIApi) {
  return async function (req: Request, res: Response) {
    const validationResult = requestSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error });
    }
    const body = validationResult.data;
    try {
      const completion = await openai.createChatCompletion({
        model: "gpt-4",
        messages: [
          {
            role: "user",
            content: `Enhance this prompt for an AI image generation tool, just send back the result: ${body.prompt}`,
          },
        ],
        temperature: 1,
      });
      const result = completion.data.choices[0].message?.content;
      if (!result) {
        return res.status(500).json({ error: "No result" });
      }
      return res.json({
        data: {
          prompt: sanitizeBreaks(result),
        },
      });
    } catch (e) {
      logger.error(e);
      const error = e instanceof Error ? e.message : "Unknown error";
      return res.status(500).json({ error });
    }
  };
}
