import { PrismaClientType } from "@app/types/database";
import logger from "../logger";
import { isServiceKeyAuth } from "../utils";
import {
  buildBulkAuthIdentifiedResourceQuery,
  buildDefaultAuthIdentifiedQuery,
  buildDefaultAuthPagedQuery,
} from "../utils/queries";

import { Request, Response } from "express";
import { z } from "zod";

export class CRUDAuthenticatedResource {
  private prisma: PrismaClientType;
  private resourceName: string;
  private resourceCreationSchema?: z.ZodSchema;
  private resourceUpdateSchema?: z.ZodSchema;
  private resourceIdentifierFieldName: string;

  constructor(
    prisma: PrismaClientType,
    resourceName: string,
    resourceCreationSchema?: z.ZodSchema,
    resourceUpdateSchema?: z.ZodSchema,
    resourceIdentifierFieldName = "user_id",
  ) {
    this.prisma = prisma;
    this.resourceName = resourceName;
    this.resourceCreationSchema = resourceCreationSchema;
    this.resourceUpdateSchema = resourceUpdateSchema;
    this.resourceIdentifierFieldName = resourceIdentifierFieldName;
  }

  fetchAll(req: Request, res: Response) {
    const query = buildDefaultAuthPagedQuery(
      req,
      this.resourceIdentifierFieldName,
    );
    // @ts-ignore
    this.prisma[this.resourceName]
      .findMany(query)
      .then((result: any) =>
        res.status(200).json({ data: result, error: null }),
      )
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ data: null, error: "Internal server error" });
      });
  }

  count(req: Request, res: Response) {
    const query = buildDefaultAuthPagedQuery(
      req,
      this.resourceIdentifierFieldName,
    );
    // @ts-ignore - dynamic property access
    this.prisma[this.resourceName]
      .count(query)
      .then((result: any) =>
        res.status(200).json({ data: { count: result }, error: null }),
      )
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ data: null, error: "Internal server error" });
      });
  }

  fetchById(req: Request, res: Response) {
    const query = buildDefaultAuthIdentifiedQuery(
      req,
      this.resourceIdentifierFieldName,
    );
    // @ts-ignore - dynamic property access
    this.prisma[this.resourceName]
      .findUnique(query)
      .then((result: any) => {
        if (!result) {
          return res.status(404).json({
            data: null,
            error: "Not found",
          });
        }
        return res.status(200).json({ data: result, error: null });
      })
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ data: null, error: "Internal server error" });
      });
  }

  delete(req: Request, res: Response) {
    const query = buildDefaultAuthIdentifiedQuery(
      req,
      this.resourceIdentifierFieldName,
    );
    // @ts-ignore - dynamic property access
    this.prisma[this.resourceName]
      .delete(query)
      .then(() => res.status(200).send({ data: "done", error: null }))
      .catch((error: any) => {
        if (error.code === "P2025") {
          return res.status(404).json({
            error: "Not found",
          });
        }
        logger.error(error);
        return res
          .status(500)
          .json({ data: null, error: "Internal server error" });
      });
  }

  bulkDelete(req: Request, res: Response) {
    const isAuth = isServiceKeyAuth(req);
    if (!isAuth)
      return res.status(401).json({ data: null, error: "Unauthorized" });
    if (!req.query.bulk)
      return res.status(400).json({ data: null, error: "Bad Request" });
    const query = buildBulkAuthIdentifiedResourceQuery(req);
    // @ts-ignore - dynamic property access
    this.prisma[this.resourceName]
      .deleteMany(query)
      .then(() => res.status(200).send({ data: "done", error: null }))
      .catch((error: any) => {
        if (error.code === "P2025") {
          return res.status(404).json({
            error: "Not found",
          });
        }
        logger.error(error);
        return res
          .status(500)
          .json({ data: null, error: "Internal server error" });
      });
  }

  bulkInsert(req: Request, res: Response) {
    const serviceKeyAuth = isServiceKeyAuth(req);

    if (!req.query.bulk)
      return res.status(400).json({ data: null, error: "Bad Request" });
    let body = req.body;
    if (typeof this.resourceCreationSchema !== "undefined") {
      const schema = this.resourceCreationSchema as z.ZodObject<any>;
      const parsedBody = serviceKeyAuth
        ? schema
            .extend({
              user_id: z.string(),
            })
            .array()
            .safeParse(req.body)
        : schema.array().safeParse(req.body);

      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }

      if (serviceKeyAuth) {
        body = parsedBody.data;
      } else {
        body = parsedBody.data.map((data) => {
          return {
            ...data,
            user_id: req.headers["user_id"],
          };
        });
      }
    }

    // @ts-ignore - dynamic property access
    this.prisma[this.resourceName]
      .createMany({
        data: body,
      })
      .then((result: any) =>
        res.status(201).json({ data: result, error: null }),
      )
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ data: null, error: "Internal server error" });
      });
  }

  insert(req: Request, res: Response) {
    let body = req.body;
    if (typeof this.resourceCreationSchema !== "undefined") {
      let schema = this.resourceCreationSchema;
      if (Array.isArray(body)) {
        schema = this.resourceCreationSchema.array();
      }
      const parsedBody = schema.safeParse(req.body);
      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }
      body = parsedBody.data;
    }
    const data = isServiceKeyAuth(req)
      ? body
      : {
          user_id: req.headers["user_id"],
          ...body,
        };
    // @ts-ignore - dynamic property access
    this.prisma[this.resourceName]
      .create({
        data,
      })
      .then((result: any) =>
        res.status(201).json({ data: result, error: null }),
      )
      .catch((error: any) => {
        logger.error(error);
        res.status(500).json({ data: null, error: "Internal server error" });
      });
  }

  update(req: Request, res: Response) {
    const query = buildDefaultAuthIdentifiedQuery(
      req,
      this.resourceIdentifierFieldName,
    );
    let body = req.body;
    if (this.resourceUpdateSchema != null) {
      const parsedBody = this.resourceUpdateSchema.safeParse(req.body);
      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }
      body = parsedBody.data;
    }
    // @ts-ignore - dynamic property access
    this.prisma[this.resourceName]
      .update({
        ...query,
        data: body,
      })
      .then((data: any) => res.status(200).send({ data, error: null }))
      .catch((error: any) => {
        if (error.code === "P2025") {
          return res.status(404).json({
            data: null,
            error: "Not found",
          });
        }
        logger.error(error);
        return res
          .status(500)
          .json({ data: null, error: "Internal server error" });
      });
  }

  bulkUpdate(req: Request, res: Response) {
    if (!req.query.bulk)
      return res.status(400).json({ data: null, error: "Bad Request" });

    const query = buildBulkAuthIdentifiedResourceQuery(req);
    let body = req.body;
    if (this.resourceUpdateSchema != null) {
      const parsedBody = this.resourceUpdateSchema.safeParse(req.body);
      if (!parsedBody.success) {
        const { path, message } = parsedBody.error.errors[0];
        return res
          .status(400)
          .json({ data: null, error: `${path.join(".")} ${message}` });
      }
      body = parsedBody.data;
    }
    // @ts-ignore - dynamic property access
    this.prisma[this.resourceName]
      .updateMany({
        ...query,
        data: body,
      })
      .then((data: any) => res.status(200).send({ data, error: null }))
      .catch((error: any) => {
        if (error.code === "P2025") {
          return res.status(404).json({
            data: null,
            error: "Not found",
          });
        }
        logger.error(error);
        return res
          .status(500)
          .json({ data: null, error: "Internal server error" });
      });
  }
}
