import { Request as ExpressRequest, Response } from "express";
import { z } from "zod";

interface Form {
  project_id: string;
  enabled: boolean;
}

interface Request extends ExpressRequest {
  body: Form;
}

const requestSchema = z.object({
  project_id: z.string().nonempty(),
  enabled: z.boolean(),
});

export default async function (req: Request, res: Response) {
  const validationResult = requestSchema.safeParse(req.body);
  if (!validationResult.success) {
    return res.status(400).json({ error: validationResult.error });
  }
  const body = validationResult.data;
  const response = await fetch(
    `${process.env.PLATFORM_API_URL}/private/projects/${body.project_id}/enabled`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        enabled: body.enabled,
      }),
    },
  );
  if (response.ok) {
    const project = await response.json();
    return res.status(200).json({ data: { newStatus: project.enabled } });
  } else {
    return res.status(500).json({ error: "Internal server error" });
  }
}
