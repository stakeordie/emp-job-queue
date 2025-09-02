import { PrismaClientType } from "@app/types/database";
import DynamicClient from "../../../clients/dynamic-client";
import { SelfApi } from "../../../clients/self-api";

import { Request, Response } from "express";
import { convertV1toV2 } from "../conversions";

export default function handleRequest(
  prisma: PrismaClientType,
  selfApi: SelfApi,
  dynamicClient: DynamicClient,
) {
  return async (req: Request, res: Response) => {
    try {
      const userId = (req.headers["user_id"] as string) || req.params.id;
      const userResponse = await dynamicClient.getUser(userId);

      const customer = await prisma.customer.findUnique({
        where: { id: userId },
      });
      if (!customer) {
        return res.status(404).json({ data: null, error: "User not found" });
      }
      if (customer.has_migrated) {
        return res.status(400).json({
          data: null,
          error: "User has already been migrated",
        });
      }
      const { data: projects, error } = await selfApi.getProjectsByEmail(
        userResponse.user.email,
      );
      if (error) throw new Error(error);

      // Check if the instruction set is valid.
      const isInstructionSetvalid = (it: any) => {
        const allValid = it.project_history.every((it: any) => {
          const data =
            typeof it.data === "string" ? JSON.parse(it.data) : it.data;
          return data && typeof data["stable_diffusion_input"] !== "undefined";
        });
        return allValid && it.current_project_history_id != null;
      };

      // Map the IDs of the projects.
      const projectIds = projects
        .filter(isInstructionSetvalid)
        .map((project: any) => project.id);

      const result = await prisma.$transaction(async (tx) => {
        // Delete all the collections related to those projects.
        await tx.collection.deleteMany({
          where: { project_id: { in: projectIds } },
        });
        // Delete the projects.
        await tx.project.deleteMany({
          where: { id: { in: projectIds }, user_id: userId },
        });

        // For each project, create the project and the corresponding
        // collections.
        const projectsInfo = projects
          .filter(isInstructionSetvalid)
          .map((project: any) => ({
            id: project.id,
            name: project.name,
            user_id: userId,
            version: "v2",
          }));
        const createdProjects = await tx.project.createMany({
          data: projectsInfo,
        });
        const allCollections = projects
          .filter(isInstructionSetvalid)
          .flatMap((project: any) => project.project_history);
        const collectionsInfo = allCollections.map((collection: any) => ({
          id: collection.id,
          title: collection.name,
          project_id: collection.project_id,
        }));
        const collections = await tx.collection.createManyAndReturn({
          data: collectionsInfo,
        });
        for (const collection of collections) {
          const data = allCollections.find((it: any) => it.id === collection.id)
            ?.data;
          const collectionProject = projects.find(
            (p: any) => p.id === collection.project_id,
          );
          if (!data || !collectionProject) continue;
          const instructionSet =
            typeof data === "string" ? JSON.parse(data) : data;
          const convertedData = await convertV1toV2(
            tx,
            collection,
            instructionSet,
          );
          await tx.collection.update({
            where: { id: collection.id },
            data: {
              data: convertedData,
              is_current:
                collectionProject.current_project_history_id === collection.id,
            },
          });
        }
        await tx.customer.update({
          where: { id: userId },
          data: { has_migrated: true },
        });
        return createdProjects.count;
      });
      res.json({
        data: {
          count: result,
        },
        error: null,
      });
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error ? e.message : "Failed to fetch user data";
      res.json({ data: null, error: message });
    }
  };
}
