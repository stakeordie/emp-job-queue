import { PrismaClientType } from "@app/types/database";

import { Request, Response } from "express";

export default function (prisma: PrismaClientType) {
  return async function (
    req: Request<
      any,
      any,
      any,
      { size: string; page: string; afterDate: string }
    >,
    res: Response,
  ) {
    const {
      page: pageQueryParam,
      size: sizeQueryParam,
      afterDate: afterRawDate,
    } = req.query;
    const page = pageQueryParam ? Number(pageQueryParam) : 1;
    const size = sizeQueryParam ? Number(sizeQueryParam) : 10;
    const afterDate = afterRawDate ? new Date(afterRawDate) : undefined;

    const totalCollections = await prisma.collection.count({
      where: {
        OR: [
          { status: "published" },
          { status: "draft", collection_preview: { enabled: true } },
        ],
      },
    });

    const totalPages = Math.ceil(totalCollections / size);
// @ts-ignore
// @ts-ignore
    const take = size === 0 ? undefined : size;
    // @ts-ignore
    const skip = (Number(page) - 1) * size ?? 0;

    const previewVersions = await prisma.collection_preview_version.findMany({
      take,
      skip,
      include: {
        collection_preview: {
          include: {
            collection: {
              include: {
                collection_sample_images: true,
                project: true,
              },
            },
          },
        },
      },
      where: {
        created_at: afterDate ? { gt: afterDate } : undefined,
        is_latest: true,
      },
      orderBy: {
        created_at: "desc",
      },
    });
    const collections = previewVersions.map((previewVersion) => {
      return {
        ...previewVersion.collection_preview.collection,
        collection_preview: previewVersion.collection_preview,
      };
    });
    res.send({
      data: {
        size,
        page,
        totalPages,
        collections,
      },
    });
  };
}
