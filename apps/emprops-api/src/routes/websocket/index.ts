import { PrismaClientType } from "@app/types/database";
import { StorageClient } from "../../clients/storage-client";

import { Emitter } from "@socket.io/postgres-emitter";
import { OpenAIApi } from "openai";
import { Socket } from "socket.io";
import { GeneratorV1 } from "../../lib/art-gen";
import { CreditsService } from "../../lib/credits";
import lint from "../../lib/linter";
import logger from "../../logger";
import {
  AssetGenerationSource,
  GeneratorV2,
} from "../../modules/art-gen/nodes-v2";
import { verifyJwt } from "../../utils/jwt";

export interface GenerationMessage {
  id: string;
  jwt: string;
  current_project_history_id?: string;
  collection_id?: string;
  flat_file_id?: number;
  payload: any | null;
  source?: AssetGenerationSource;
  sourceId?: string | number;
  testPayload?: any;
}

const previewGenerationErrorMessages = {
  disabled: "Preview is disabled",
  noMaxGenerations: "No max generations set",
  maxReached: "Max generations reached",
  incompleteIntructionSet: "Instruction set is incomplete",
};

export interface RequestChatMessage {
  jwt: string;
  chat_id: string;
  page?: number;
  size?: number;
}

export interface AddChatMessage {
  jwt: string;
  chat_id: string;
  content: string;
  flat_file_id?: bigint;
}

export class WebSocketEventManager {
  constructor(
    private emitter: Emitter,
    private socket: Socket,
    private creditsService: CreditsService,
    private storageClient: StorageClient,
    private prisma: PrismaClientType,
    private openAiApi: OpenAIApi,
  ) {}

  pong() {
    this.send("pong", null);
  }

  private send(event: string, payload: any, id?: string) {
    this.socket.emit(event, payload, id);
  }

  async generate(message: GenerationMessage) {
    const {
      id,
      jwt,
      payload: instructionSet,
      collection_id: collectionId,
      current_project_history_id,
      source,
      sourceId,
      testPayload,
    } = message;

    let jwtResponse;
    let userId;
    try {
      jwtResponse = await verifyJwt(jwt);
      userId = jwtResponse.sub;
    } catch (e) {
      return this.send("error", "Unauthorized");
    }

    // Run V1 generator.
    if (!instructionSet.version || instructionSet.version === "v1") {
      logger.info("Starting V1 generation");
      const lints = lint(instructionSet, "error");
      if (lints.length) {
        this.send("lint_error", {
          rules: lints,
        });
        return;
      }

      const options = {
        stableDiffusion: {
          headers: {
            "x-user-id": userId,
          },
        },
      };

      const generator = new GeneratorV1(
        this.creditsService,
        this.storageClient,
        this.prisma,
        options,
      )
        .on("generation", (data) => this.send("image_generated", data))
        .on("error", (error) => {
          logger.error(error);
          this.send("error", (error as Error).message);
        })
        .on("complete", () => this.send("generation_complete", null));
      await generator.generate(
        id,
        instructionSet,
        userId,
        current_project_history_id,
      );
    } else if (instructionSet.version === "v2") {
      logger.info("Starting V2 generation");
      const generator = new GeneratorV2(
        this.storageClient,
        this.prisma,
        this.creditsService,
        this.openAiApi,
      )
        .on("image_generated", (data) => this.send("image_generated", data))
        .on("complete", () => this.send("generation_completed", id))
        .on("error", (error) => {
          logger.error(error);
          this.send("error", {
            id,
            message: (error as Error).message,
          });
        })
        .on("node_started", (data) => this.send("node_started", data))
        .on("node_progress", (data) => this.send("node_progress", data))
        .on("node_completed", (data) => this.send("node_completed", data));
      await generator.start(id, instructionSet, {
        userId,
        collectionId,
        source,
        sourceId: sourceId as string,
        testPayload,
      });
    }
  }

  async generatePreview(message: GenerationMessage) {
    const { id, jwt, payload: instructionSet, source, sourceId } = message;

    let jwtResponse;
    let userId;
    try {
      jwtResponse = await verifyJwt(jwt);
      userId = jwtResponse.sub;
    } catch (e) {
      return this.send("error", "Unauthorized");
    }

    let preview;

    try {
      preview = await this.prisma.collection_preview.findUnique({
        where: {
          id: sourceId as number,
        },
        include: {
          collection: {
            include: {
              project: true,
            },
          },
        },
      });

      if (!preview) {
        return this.send("error", "Preview not found");
      }
    } catch (error) {
      return this.send("error", error);
    }

    let errorMessage: string | null = null;

    if (!preview.enabled && preview.collection.project.user_id != userId) {
      errorMessage = previewGenerationErrorMessages.disabled;
    } else if (preview.max_generations === 0) {
      errorMessage = previewGenerationErrorMessages.noMaxGenerations;
    } else if (preview.total_generations >= preview.max_generations) {
      errorMessage = previewGenerationErrorMessages.maxReached;
    } else if (!instructionSet?.steps?.length) {
      errorMessage = previewGenerationErrorMessages.incompleteIntructionSet;
    }

    if (errorMessage) {
      return this.send("error", errorMessage);
    }

    if (instructionSet.version === "v2") {
      logger.info("Starting image generation v2");
      const generator = new GeneratorV2(
        this.storageClient,
        this.prisma,
        this.creditsService,
        this.openAiApi,
      )
        .on("image_generated", async (data) => {
          this.send("preview_image_generated", data);
          const assets = await generator.saveAsset({
            collectionId: preview.collection_id,
            input: instructionSet,
            outputs: [data],
            source,
            sourceId,
          });
          const [asset] = assets;
          try {
            await this.prisma.collection_preview.update({
              where: { id: sourceId as number },
              data: { total_generations: { increment: 1 } },
            });
            const chat = await this.prisma.chat.findFirst({
              where: {
                entity_id: preview.id.toString(),
                entity_type: "PREVIEW",
              },
            });
            if (chat != null && asset) {
              this.addMessage({
                jwt,
                chat_id: chat.id,
                content: "",
                flat_file_id: asset.id,
              });
            }
          } catch (error) {
            this.send("error", (error as Error).message);
          }
        })
        .on("complete", () => this.send("preview_generation_completed", null))
        .on("node_started", (data) => this.send("node_started", data))
        .on("node_progress", (data) => this.send("node_progress", data))
        .on("node_completed", (data) => this.send("node_completed", data))
        .on("error", (error) => {
          logger.error(error);
          this.send("error", (error as Error).message);
        });
      await generator.start(id, instructionSet, {
        userId,
        collectionId: preview.collection_id,
        source,
        sourceId: (sourceId as number).toString(),
      });
    } else {
      return this.send(
        "error",
        "Preview generations are not allowed for this collection",
      );
    }
  }

  async getMessages(message: RequestChatMessage) {
    try {
      const { jwt, chat_id, page = 1, size = 10 } = message;
      try {
        await verifyJwt(jwt);
      } catch (e) {
        return this.send("error", "Unauthorized");
      }

      const totalMessages = await this.prisma.chat_message.count({
        where: {
          chat_id: chat_id,
        },
      });
      const totalPages = Math.ceil(totalMessages / size);
      const take = size === 0 ? undefined : size;
      const skip = (page - 1) * size || 0;
      const chatMessages = await this.prisma.chat_message.findMany({
        take,
        skip,
        orderBy: {
          created_at: "desc",
        },
        where: {
          chat_id: chat_id,
        },
        include: {
          flat_file: true,
        },
      });
      this.socket.join(chat_id);
      this.send("chat_messages", {
        messages: chatMessages,
        size,
        page,
        totalPages: totalPages === Infinity ? 1 : totalPages,
      });
    } catch (error) {
      console.error(error);
      this.send("error", (error as Error).message);
    }
  }

  async addMessage(message: AddChatMessage) {
    if (message.flat_file_id) {
      logger.info("Adding text message");
    } else {
      logger.info("Adding image message");
    }
    try {
      const { jwt, chat_id, content } = message;
      let jwtResponse;
      let userId;
      try {
        jwtResponse = await verifyJwt(jwt);
        userId = jwtResponse.sub;
      } catch (e) {
        return this.send("error", "Unauthorized");
      }

      // Escape \' and \" characters
      const escapedContent = content.replace(/\\'/g, "'").replace(/\\"/g, '"');

      const result = await this.prisma.chat_message.create({
        data: {
          content: escapedContent,
          chat_id,
          user_id: userId,
          flat_file_id: message.flat_file_id,
        },
        include: {
          flat_file: true,
        },
      });
      this.emitter.to(chat_id).emit("new_message", result);
    } catch (error) {
      logger.error(error);
      this.send("error", (error as Error).message);
    }
  }
}
