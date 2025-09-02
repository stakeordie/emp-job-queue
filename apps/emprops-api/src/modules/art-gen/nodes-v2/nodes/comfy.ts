import { PrismaClientType } from "@app/types/database";
import { StorageClient } from "../../../../clients/storage-client";
import { ComfyWorkflowRunner } from "../../../../lib/workflows";

import EventEmitter from "events";
import { ImageNode } from ".";

export abstract class ComfyNode extends ImageNode {
  protected workflowRunner: ComfyWorkflowRunner;
  protected mimeType: string;

  constructor(
    name: string,
    mimeType: string,
    prisma: PrismaClientType,
    storageClient: StorageClient,
    eventEmitter: EventEmitter,
  ) {
    super(storageClient);
    this.name = name;
    this.mimeType = mimeType;
    this.workflowRunner = new ComfyWorkflowRunner(prisma, eventEmitter);
  }

  getMimeType() {
    return this.mimeType;
  }

  destroy() {
    this.workflowRunner.destroy();
  }
}
