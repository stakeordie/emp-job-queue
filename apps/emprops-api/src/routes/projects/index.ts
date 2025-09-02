import { PrismaClientType } from "@app/types/database";
import logger from "../../logger";
import { buildDefaultAuthPagedQuery, getUserId } from "../../utils/queries";
import { PrismaClient, project as Project, project_history as ProjectHistory } from '@emp/database';
import { Request, Response } from "express";

export default function (prisma: PrismaClientType) {
  return async function (req: Request, res: Response) {
    const query = buildDefaultAuthPagedQuery(req, "user_id");
    const additionalQuery = {
      include: {
        collection: true,
      },
    };
    const finalQuery = Object.assign(query, additionalQuery);
    try {
      const project = await prisma.project.findMany(finalQuery);
      const historyIds = project
        .filter(
          (p) => p.version === "v1" && p.current_project_history_id != null,
        )
        .map((p) => p.current_project_history_id) as string[];
      const histories = await prisma.project_history.findMany({
        where: {
          id: {
            in: historyIds,
          },
        },
      });
      type ProjectWithHistory = Project & {
        current_project_history?: ProjectHistory | null;
      };
      const result: ProjectWithHistory[] = project.map((p) => {
        const history = histories.find(
          (h) => h.id === p.current_project_history_id,
        );
        return {
          ...p,
          current_project_history: history,
        };
      });
      return res.json({
        data: result,
        error: null,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : "An error occurred";
      logger.error(message);
      return res.status(500).json({
        data: null,
        error: message,
      });
    }
  };
}

export const getDefaultProject =
  (prisma: PrismaClientType) => async (req: Request, res: Response) => {
    try {
      const userId = getUserId(req);
      const defaultProject = await prisma.project.findFirst({
        where: {
          user_id: userId,
          is_default: true,
        },
      });
      if (!defaultProject) {
        return res.status(404).json({ data: null, error: "Not found" });
      }
      return res.status(200).json({ data: defaultProject, error: null });
    } catch (e) {
      const message = e instanceof Error ? e.message : "An error occurred";
      res.status(500).json({ data: null, error: message });
    }
  };
