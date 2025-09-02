import { RetoolClient } from "../../clients/retool-client";
import { CRUDAuthenticatedResource } from "../../lib/crud";
import logger from "../../logger";
import { Request, Response } from "express";

export default function (
  assignmentResource: CRUDAuthenticatedResource,
  retoolClient: RetoolClient,
) {
  return async function (req: Request, res: Response) {
    try {
      const response = await retoolClient.executeAssignMemberTokenWorkflow(
        req.body.address,
      );
      const json = await response.json();

      if (json.workflowError) {
        throw Error(json.workflowError);
      }

      if (response.ok) {
        assignmentResource.insert(req, res);
      }
    } catch (error) {
      logger.error(error);
      res.status(500).json({ data: null, error: "Internal server error" });
    }
  };
}
