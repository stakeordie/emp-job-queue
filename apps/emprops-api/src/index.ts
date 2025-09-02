// Sentry imports moved to conditional loading to avoid Node.js compatibility issues
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: index.ts loaded - starting imports');
import { createAdapter } from "@socket.io/postgres-adapter";
import { Emitter } from "@socket.io/postgres-emitter";
import bodyParser from "body-parser";
import cors from "cors";
import express, { NextFunction, Request, Response } from "express";
// import { createTelemetryClient } from '@emp/telemetry';
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: telemetry import DISABLED');
import fileUpload from "express-fileupload";
import rateLimit from "express-rate-limit";
import fs from "fs";
import * as http from "http";
import { Configuration, OpenAIApi } from "openai";
import { Server } from "socket.io";
import Stripe from "stripe";
// import { parse } from "ts-command-line-args"; // Removed - causing hanging issues
import { v4 as uuid } from "uuid";
import { z } from "zod";
import { AzureStorageClient } from "./clients/azure-storage-client";
import DynamicClient from "./clients/dynamic-client";
import { GcpStorageClient } from "./clients/gcp-storage-client";
import { PlatformApiClient } from "./clients/platform-client";
import posthog from "./clients/posthog";
import { RetoolClient } from "./clients/retool-client";
import { SelfApi } from "./clients/self-api";
import { StorageClient } from "./clients/storage-client";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to import @emp/database');
import { createPgPool, monitorPool, disconnectPrisma, getPrismaClient } from '@emp/database';
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: @emp/database import successful');


console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to import local libs');
import { CollectionRewardService } from "./lib/collection-rewards";
import { CollectionsService } from "./lib/collections";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: local libs import successful');
import { CreditsCalculator, CreditsService } from "./lib/credits";
import { CRUDAuthenticatedResource } from "./lib/crud";
import {
  OneTimePaymentWebhookHandler,
  RecurringPaymentWebhookHandler,
} from "./lib/payments";
import logger from "./logger";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to import art-gen nodes-v2');
import { GeneratorV2, generatorUserId } from "./modules/art-gen/nodes-v2";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: art-gen nodes-v2 import successful');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to import routes');
// Re-enabling route imports now that telemetry is working
import generatePrompt from "./routes/ai/prompts";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: ai/prompts import successful');
import { createApiKey, deleteApiKey, listApiKeys } from "./routes/api-keys";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: api-keys import successful');
import createAuthMeHandler from "./routes/auth/me";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: auth/me import successful');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to import collection-rewards');
import collectionRewardsByChainId from "./routes/collection-rewards";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: collection-rewards import successful');
import collectionRewardsClaim from "./routes/collection-rewards/[id]/claim";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: collection-rewards/claim import successful');
import collectionRewardsInfo from "./routes/collection-rewards/[id]/rewards";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: collection-rewards/rewards import successful');
import {
  createComponent,
  deleteComponent,
} from "./routes/collections/[id]/component";
import collectionCredits from "./routes/collections/[id]/credits";
import { CollectionHistoryService } from "./routes/collections/[id]/history";
import {
  getPreviewByCollection as getCollectionPreview,
  handleCollectionPreviewUpdate as updateCollectionPreview,
} from "./routes/collections/[id]/preview";
import { CollectionReceiverService } from "./routes/collections/[id]/receivers";
import {
  createSamplesImages,
  getSampleImages,
} from "./routes/collections/[id]/sample-images";
import collectionVerification from "./routes/collections/[id]/verification";
import { getCollectionDependencies } from "./routes/collections/dependencies";
// Archived IPFS-dependent routes - removed imports
import setCollectionVisibility from "./routes/collections/visibility";
import credits from "./routes/credits";
import {
  createCustomNode,
  deleteCustomNode,
  getCustomNode,
  getCustomNodeByName,
  getCustomNodes,
  getDefaultCustomNodes,
  updateCustomNode,
} from "./routes/custom-nodes";
import { getDynamicUser } from "./routes/dynamic/users";
import getFeed from "./routes/feed/index";
import addFile from "./routes/files";
import {
  countFlatFiles,
  createFlatFile,
  getComponentFlatFiles,
  getFlatFileById,
  getFlatFiles,
  updateBulkFlatFiles,
  updateFlatFile,
} from "./routes/flat-files";
import {
  createFormConfig,
  deleteFormConfig,
  getFormConfig,
  getFormConfigByName,
  getFormConfigs,
} from "./routes/form-config";
import generate from "./routes/generator/v1";
import {
  runCollectionGeneration,
  streamJobEvents,
} from "./routes/generator/v2";
import { dbHealthCheck } from "./routes/health/db-status";
import linter from "./routes/instruction-set/lint";
import { getJobHistory, getJobStatus, getUserJobs } from "./routes/jobs";
import migrate from "./routes/migrate";
import {
  createModel,
  deleteModel,
  getBatchModels,
  getModel,
  getModelByName,
  getModels,
  updateModel,
  validateModelAuth,
} from "./routes/models";
import { generatePFP } from "./routes/pfp";
import { createProfile, getProfileByAddress } from "./routes/profiles";
import { getById, update } from "./routes/profiles/[id]";
import projectTemplateHandler from "./routes/project-templates";
import projectListHandler, { getDefaultProject } from "./routes/projects";
import convertProject from "./routes/projects/conversions";
import migrateProjects from "./routes/projects/migration";
import projectFromTemplateHandler from "./routes/projects/templates/[id]";
import untitledProjectHandler from "./routes/projects/untitled";
import {
  createCustodialCollectionFromTemplate,
  createFork,
  getFork,
} from "./routes/remix";
import createEditHandler from "./routes/remix/edit";
import { post as createServer, get as getServers } from "./routes/servers";
import userCredits from "./routes/users/[id]/credits";
import creditsOnboarding from "./routes/users/[id]/credits-onboarding";
import walletHasAssignments from "./routes/wallets/[address]/assignments";
import walletRecords from "./routes/wallets/[address]/records";
import dynamicWebhook from "./routes/webhook/dynamic";
import syncUserWebhook from "./routes/webhook/dynamic/syncUser";
import stripeWebhook from "./routes/webhook/stripe";
import { WebSocketEventManager } from "./routes/websocket";
import {
  createWorkflow,
  getWorkflowByName,
  getWorkflows,
} from "./routes/workflows";
import {
  deleteWorkflow,
  getWorkflow,
  getWorkflowModels,
  updateWorkflow,
} from "./routes/workflows/[id]";
import { testWorkflow } from "./routes/workflows/[id]/test";
import { getWorkflowDependencies } from "./routes/workflows/dependencies";
// Routes re-enabled
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: all route imports re-enabled');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: importing utilities');
import { isErrorTrackingEnabled } from "./utils";
import { verifyJwt } from "./utils/jwt";
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: utilities imported successfully');

interface CommandLineArgs {
  port?: number;
}

console.log('🚨🚨🚨 AGGRESSIVE DEBUG: parsing CLI args');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: using simple args parsing instead of ts-command-line-args');
// Simple CLI args parsing to avoid hanging issues
const portArg = process.argv.find(arg => arg.startsWith('--port='));
const parsedPort = portArg ? parseInt(portArg.split('=')[1]) : null;
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: CLI args parsed successfully');

console.log('🚨🚨🚨 AGGRESSIVE DEBUG: setting up basic config variables');
const port = parsedPort || process.env.PORT || 8080;
const isAuthEnabled = process.env.ENABLE_AUTH === "true";
const serviceKey = process.env.SERVICE_KEY as string;
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: CLI args and basic config setup complete');

// @clients
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to create PlatformApiClient');
const platformClient = new PlatformApiClient(process.env.PLATFORM_API_URL);
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: PlatformApiClient created successfully');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to create DynamicClient');
const dynamicClient = new DynamicClient(
  process.env.DYNAMIC_API_URL,
  process.env.DYNAMIC_ENVIRONMENT_ID,
  process.env.DYNAMIC_API_KEY,
);
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: DynamicClient created successfully');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to setup GCP credentials');

// Only create GCP credentials file if the environment variable is provided
if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
  fs.writeFileSync(
    "/tmp/credentials.json",
    Buffer.from(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON, "base64"),
  );
}

console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to create GCP storage client');
// Only initialize GCP storage client if credentials are available
const gcpStorageClient = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON 
  ? new GcpStorageClient(
      {
        keyFilename: "/tmp/credentials.json",
      },
      {
        bucket: process.env.GOOGLE_GCS_BUCKET,
        projectId: process.env.GOOGLE_GCS_PROJECT_ID,
      },
    )
  : null;
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: GCP storage client setup complete');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to create Azure storage client');

// Initialize Azure Storage client
const azureStorageClient = new AzureStorageClient({
  container: process.env.AZURE_STORAGE_CONTAINER,
  cdnUrl: process.env.AZURE_CDN_URL,
  // Use connection string if available, otherwise use account name and key
  connectionString: process.env.AZURE_STORAGE_CONNECTION_STRING,
  accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME,
  accountKey: process.env.AZURE_STORAGE_ACCOUNT_KEY,
});
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: Azure storage client created successfully');

console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to create unified storage client');
const storageClient = new StorageClient(gcpStorageClient, azureStorageClient);
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: unified storage client created successfully');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to create OpenAI API client');

const openAiApi = new OpenAIApi(
  new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  }),
);
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: OpenAI API client created successfully');

console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to get Prisma client');
const prisma = getPrismaClient();
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: Prisma client obtained successfully');
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to create services');

const creditsService = new CreditsService(prisma);
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: CreditsService created');

const creditsCalculator = new CreditsCalculator(prisma);
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: CreditsCalculator created');

console.log('🚨🚨🚨 AGGRESSIVE DEBUG: about to create CollectionRewardService');
// Handle RPC_REGISTRY that may have single quotes from env:build script
let rpcRegistry = process.env.RPC_REGISTRY || '{}';
// Strip leading and trailing single quotes if present
if (rpcRegistry.startsWith("'") && rpcRegistry.endsWith("'")) {
  rpcRegistry = rpcRegistry.slice(1, -1);
}
const collectionRewardService = new CollectionRewardService(
  prisma,
  dynamicClient,
  platformClient,
  JSON.parse(rpcRegistry),
);
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: CollectionRewardService created');
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const oneTimePaymentWebhookHandler = new OneTimePaymentWebhookHandler(
  stripe,
  creditsService,
);
const recurringPaymentWebhookHandler = new RecurringPaymentWebhookHandler(
  prisma,
  creditsService,
);
const collectionsService = new CollectionsService(prisma);
const selfApi = new SelfApi(
  process.env.OPEN_API_PRODUCTION_URL,
  process.env.OPEN_API_PRODUCTION_KEY,
);

// Initialize PostgreSQL pool for WebSocket connections
const pool = createPgPool();
monitorPool(pool, "WebSocket");

function _jwtAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const bearerToken = header?.split(" ")[1];
  if (!bearerToken) {
    res.status(401).json({
      data: null,
      error: "Unauthorized",
    });
    return;
  }

  if (bearerToken == serviceKey) {
    next();
    return;
  }

  verifyJwt(bearerToken)
    .then((data) => {
      req.headers["user_id"] = data.sub;
      req.headers["user_scope"] = data.scope;
      req.headers["user_email"] = data.email;
      next();
    })
    .catch((e) => {
      res.status(401).json({
        data: e.message,
        error: "Unauthorized",
      });
    });
}

function _serviceKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  const bearerToken = header?.split(" ")[1];
  if (bearerToken !== serviceKey) {
    res.status(401).json({
      data: null,
      error: "Unauthorized",
    });
    return;
  }
  next();
}

// Simple API key middleware
async function _apiKeyAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const apiKey =
    (req.headers["x-api-key"] as string) ||
    (req.headers.authorization as string)?.replace("Bearer ", "");

  if (!apiKey) {
    return res.status(401).json({
      data: null,
      error: "API key required",
    });
  }

  // Check service key first
  if (apiKey === serviceKey) {
    return next();
  }

  try {
    // Hash the API key to compare with database
    const crypto = await import("crypto");
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // Look up the API key in database
    const userApiKey = await prisma.user_api_keys.findUnique({
      where: { key_hash: keyHash },
    });

    if (!userApiKey || !userApiKey.is_active) {
      return res.status(401).json({
        data: null,
        error: "Invalid API key",
      });
    }

    // Check expiration
    if (userApiKey.expires_at && new Date() > userApiKey.expires_at) {
      return res.status(401).json({
        data: null,
        error: "API key expired",
      });
    }

    // Set user context in headers (similar to JWT)
    req.headers["user_id"] = userApiKey.user_id;
    next();
  } catch (error) {
    return res.status(500).json({
      data: null,
      error: "Authentication error",
    });
  }
}

// Combined middleware that accepts JWT OR API key
async function _jwtOrApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  console.log("🔑 Auth middleware called for:", req.method, req.path);

  // Try API key first (check headers)
  const apiKey =
    (req.headers["x-api-key"] as string) ||
    (req.headers.authorization as string)?.replace("Bearer ", "");

  console.log(
    "🔍 API key found:",
    apiKey ? `${apiKey.substring(0, 10)}...` : "none",
  );

  if (apiKey) {
    // Check service key first
    if (apiKey === serviceKey) {
      console.log("✅ Service key matched");
      return next();
    }

    try {
      // Hash the API key to compare with database
      const crypto = await import("crypto");
      const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");
      console.log("🔐 Generated hash:", keyHash.substring(0, 16) + "...");

      // Look up the API key in database
      const userApiKey = await prisma.user_api_keys.findUnique({
        where: { key_hash: keyHash },
      });

      console.log(
        "🔍 DB lookup result:",
        userApiKey
          ? {
              id: userApiKey.id,
              user_id: userApiKey.user_id,
              is_active: userApiKey.is_active,
              expires_at: userApiKey.expires_at,
            }
          : "not found",
      );

      if (userApiKey && userApiKey.is_active) {
        // Check expiration
        if (!userApiKey.expires_at || new Date() <= userApiKey.expires_at) {
          console.log("✅ API key valid, user_id:", userApiKey.user_id);
          // API key is valid, set user context
          req.headers["user_id"] = userApiKey.user_id;
          return next();
        } else {
          console.log("❌ API key expired");
        }
      } else {
        console.log("❌ API key invalid or inactive");
      }
    } catch (error) {
      console.log("❌ API key validation error:", error);
      // If API key validation fails, fall through to JWT
    }
  }

  // If no API key or API key invalid, try JWT
  console.log("🔄 Falling back to JWT authentication");
  const header = req.headers.authorization;
  const bearerToken = header?.split(" ")[1];

  if (!bearerToken) {
    console.log("❌ No bearer token found");
    return res.status(401).json({
      data: null,
      error: "JWT token or API key required",
    });
  }

  if (bearerToken === serviceKey) {
    console.log("✅ Service key matched (JWT path)");
    return next();
  }

  console.log("🔍 Verifying JWT token:", bearerToken.substring(0, 10) + "...");

  // Try JWT verification
  verifyJwt(bearerToken)
    .then((data) => {
      console.log("✅ JWT valid, user_id:", data.sub);
      req.headers["user_id"] = data.sub;
      req.headers["user_scope"] = data.scope;
      req.headers["user_email"] = data.email;
      next();
    })
    .catch((e) => {
      console.log("❌ JWT verification failed:", e.message);
      res.status(401).json({
        data: e.message,
        error: "Invalid JWT token or API key",
      });
    });
}

const jwtAuthMiddleware = isAuthEnabled
  ? _jwtAuthMiddleware
  : (_: Request, __: Response, next: NextFunction) => next();
const serviceKeyAuthMiddleware = isAuthEnabled
  ? _serviceKeyAuthMiddleware
  : (_: Request, __: Response, next: NextFunction) => next();
const apiKeyAuthMiddleware = isAuthEnabled
  ? _apiKeyAuthMiddleware
  : (_: Request, __: Response, next: NextFunction) => next();
const jwtOrApiKeyMiddleware = isAuthEnabled
  ? _jwtOrApiKeyMiddleware
  : (_: Request, __: Response, next: NextFunction) => next();

const pfpGeneratorRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per minute
  standardHeaders: true,
  handler: (_: Request, res: Response) => {
    // Accessing the Retry-After header if it exists
    const retryAfterHeaderValue = res.get("Retry-After");

    // Sending the response with custom data and error message
    res.status(429).json({
      data: null,
      error: `Generation requests limit exceeded. Try again in ${
        retryAfterHeaderValue || "60"
      } seconds.`,
    });
  },
});

// Create Express app.
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: About to create Express app - all imports completed');
const app = express();
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: Express app created - imports completed successfully');

// Sentry removed to eliminate Node.js compatibility issues
// Error tracking now handled through structured logging and telemetry

const webhookApp = express.Router();
const server = http.createServer(app);
const io = new Server(server, { transports: ["websocket"] });

app.use(webhookApp);
app.use(fileUpload());
app.use(bodyParser.json({ limit: "512mb" }));
app.use(cors());

// Routes.
app.get("/", (_: Request, res: Response) => res.send("Hello, World!"));
app.get("/health", (_: Request, res: Response) => res.send("OK"));

// Route handlers re-enabled
app.post("/instruction-sets/linter", linter);
app.get("/health", (_: Request, res: Response) => res.send("OK"));
app.get("/health/db", dbHealthCheck(pool));
// Sentry sample endpoint removed - error tracking now through structured logging
app.post("/generator", generate(creditsService, storageClient, prisma));
app.post("/v2/generator", async (req, res) => {
  new GeneratorV2(storageClient, prisma, creditsService, openAiApi)
    .on("complete", (data) => {
      res.json({
        data,
        error: null,
      });
    })
    .on("error", (error) => {
      res.status(500).json({ data: null, error: error.message });
    })
    .start(uuid(), req.body, {
      userId: generatorUserId,
    });
});
app.post("/files", jwtAuthMiddleware, addFile(storageClient));
app.post("/ai/prompts", jwtAuthMiddleware, generatePrompt(openAiApi));
app.get("/collections", (req, res) =>
  collectionsService.findAllPublic(req, res),
);
app.get("/collections/users", (req, res) => {
  collectionsService.findAllUsers(req, res);
});
app.get("/collections/:id/public", (req, res) =>
  collectionsService.findOnePublic(req, res),
);
app.get("/collections/:id/miniapp", (req, res) =>
  collectionsService.findOneMiniapp(req, res),
);
app.post("/collections/visibility", jwtAuthMiddleware, setCollectionVisibility);
app.post("/collections/:id/publish", jwtAuthMiddleware, (req, res) =>
  collectionsService.publish(req, res),
);
app.get("/collections/:id/verification", collectionVerification);
// IPFS-dependent route commented out - IPFS client moved to archive
// app.post(
//   "/collections/tezos/metadata",
//   jwtAuthMiddleware,
//   computeMintMetadata(ipfsClient, storageClient, creditsService),
// );
// app.post(
//   "/collections/tezos/tokens/metadata",
//   jwtAuthMiddleware,
//   computeTezosTokensMetadata(ipfsClient, storageClient),
// );
// app.post(
//   "/collections/ethereum/metadata",
//   jwtAuthMiddleware,
//   computeMintMetadata(ipfsClient, storageClient, creditsService),
// );
app.get("/me", jwtAuthMiddleware, (req, res) => {
  res.json({
    data: {
      user_id: req.headers["user_id"],
      user_scope: req.headers["user_scope"],
      user_email: req.headers["user_email"],
    },
    error: null,
  });
});

// Server-side auth endpoint for Studio v2 frontend
app.get(
  "/api/auth/me",
  jwtAuthMiddleware,
  createAuthMeHandler(creditsService, prisma),
);
app.post("/migrate", jwtAuthMiddleware, migrate(prisma));

// @projects
const projectResource = new CRUDAuthenticatedResource(
  prisma,
  "project",
  z.object({
    name: z.string(),
  }),
  z.object({
    name: z.string().optional(),
    data: z.string().optional().nullable(),
    current_project_history_id: z.string().optional().nullable(),
    archived: z.boolean().optional(),
  }),
);
app.get("/projects/default", jwtAuthMiddleware, getDefaultProject(prisma));
app.post(
  "/projects/migrate",
  jwtAuthMiddleware,
  migrateProjects(prisma, selfApi, dynamicClient),
);
app.post(
  "/projects/:id/migrate",
  jwtAuthMiddleware,
  migrateProjects(prisma, selfApi, dynamicClient),
);
app.get("/projects/migrate", serviceKeyAuthMiddleware, async (req, res) => {
  try {
    const result = await dynamicClient.getAllUsersForEnvironment({
      filterColumn: "email",
      filterValue: req.query.email as string,
    });
    const user = result.users[0];
    if (!user) {
      return res.status(404).json({
        data: null,
        error: "User not found",
      });
    }
    const id = user.id;
    const projects = await prisma.project.findMany({
      where: { user_id: id },
    });
    const projectHistory = await prisma.project_history.findMany({
      where: {
        project_id: {
          in: projects.map((project) => project.id),
        },
      },
    });
    const projectsWithHistory = projects.map((project) => {
      const history = projectHistory.filter(
        (history) => history.project_id === project.id,
      );
      return {
        ...project,
        project_history: history,
      };
    });
    res.json({
      data: projectsWithHistory,
      error: null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    logger.error(message);
  }
});
app.post(
  "/projects/untitled",
  jwtAuthMiddleware,
  untitledProjectHandler(prisma),
);
app.post(
  "/projects/templates/:id",
  jwtAuthMiddleware,
  projectFromTemplateHandler(prisma),
);
app.get("/projects", jwtAuthMiddleware, projectListHandler(prisma));
app.get("/projects/count", jwtAuthMiddleware, (req, res) =>
  projectResource.count(req, res),
);
app.get("/projects/:id", jwtAuthMiddleware, (req, res) =>
  projectResource.fetchById(req, res),
);
app.post("/projects", jwtAuthMiddleware, (req, res) =>
  projectResource.insert(req, res),
);
app.put("/projects/:id", jwtAuthMiddleware, (req, res) =>
  projectResource.update(req, res),
);
app.delete("/projects/:id", jwtAuthMiddleware, (req, res) =>
  projectResource.delete(req, res),
);
app.post(
  "/projects/:id/conversions",
  jwtAuthMiddleware,
  convertProject(prisma),
);

// @flat-files
app.get("/flat-files", jwtAuthMiddleware, getFlatFiles(prisma));
app.get("/flat-files/count", jwtAuthMiddleware, countFlatFiles(prisma));
app.get("/flat-files/:id", jwtAuthMiddleware, getFlatFileById(prisma));
app.post("/flat-files", jwtAuthMiddleware, createFlatFile(prisma));
app.put("/flat-files/:id", jwtAuthMiddleware, updateFlatFile(prisma));
app.put("/flat-files", jwtAuthMiddleware, updateBulkFlatFiles(prisma));

// @assignments
const assignmentResource = new CRUDAuthenticatedResource(
  prisma,
  "assignment",
  z.object({
    address: z.string(),
    token_id: z.string(),
  }),
);
const retoolClient = new RetoolClient();
app.get("/assignments/count", jwtAuthMiddleware, (req, res) =>
  assignmentResource.count(req, res),
);
app.get("/assignments", jwtAuthMiddleware, (req, res) =>
  assignmentResource.fetchAll(req, res),
);
app.get("/assignments/:id", jwtAuthMiddleware, (req, res) =>
  assignmentResource.fetchById(req, res),
);
app.post("/assignments", jwtAuthMiddleware, (req, res) =>
  assignmentResource.insert(req, res),
);
app.delete("/assignments/:id", jwtAuthMiddleware, (req, res) =>
  assignmentResource.delete(req, res),
);

// @roles
const roleResource = new CRUDAuthenticatedResource(
  prisma,
  "role",
  z.object({
    name: z.string(),
  }),
);
app.get("/roles", jwtAuthMiddleware, (req, res) =>
  roleResource.fetchAll(req, res),
);
app.get("/roles/count", jwtAuthMiddleware, (req, res) =>
  roleResource.count(req, res),
);
app.get("/roles/:id", jwtAuthMiddleware, (req, res) =>
  roleResource.fetchById(req, res),
);
app.post("/roles", jwtAuthMiddleware, (req, res) => {
  if (req.query.bulk) {
    roleResource.bulkInsert(req, res);
  } else {
    roleResource.insert(req, res);
  }
});
app.delete("/roles/:id", jwtAuthMiddleware, (req, res) =>
  roleResource.delete(req, res),
);

app.delete("/roles", jwtAuthMiddleware, (req, res) => {
  roleResource.bulkDelete(req, res);
});

// @wallets
const walletResource = new CRUDAuthenticatedResource(
  prisma,
  "wallet",
  z.object({
    address: z.string(),
  }),
);
app.get("/wallets", jwtAuthMiddleware, (req, res) =>
  walletResource.fetchAll(req, res),
);
app.get("/wallets/count", jwtAuthMiddleware, (req, res) =>
  walletResource.count(req, res),
);
app.get("/wallets/:id", jwtAuthMiddleware, (req, res) =>
  walletResource.fetchById(req, res),
);
app.post("/wallets", jwtAuthMiddleware, (req, res) =>
  walletResource.insert(req, res),
);
app.delete("/wallets/:id", jwtAuthMiddleware, (req, res) =>
  walletResource.delete(req, res),
);
app.get("/wallets/:address/records", walletRecords(prisma));
app.get("/wallets/:address/assignments", walletHasAssignments(prisma));

// @project-history
const projectHistoryResource = new CRUDAuthenticatedResource(
  prisma,
  "project_history",
  z.object({
    name: z.string(),
    data: z.string(),
    project_id: z.string(),
  }),
  z.object({
    name: z.string().optional(),
    data: z.string().optional(),
    project_id: z.string().optional(),
  }),
);
app.get("/project-history", jwtAuthMiddleware, (req, res) =>
  projectHistoryResource.fetchAll(req, res),
);
app.get("/project-history/count", jwtAuthMiddleware, (req, res) =>
  projectHistoryResource.count(req, res),
);
app.get("/project-history/:id", jwtAuthMiddleware, (req, res) =>
  projectHistoryResource.fetchById(req, res),
);
app.post("/project-history", jwtAuthMiddleware, (req, res) =>
  projectHistoryResource.insert(req, res),
);
app.put("/project-history/:id", jwtAuthMiddleware, (req, res) =>
  projectHistoryResource.update(req, res),
);
app.delete("/project-history/:id", jwtAuthMiddleware, (req, res) =>
  projectHistoryResource.delete(req, res),
);

// @collections
app.get("/projects/:projectId/collections", jwtAuthMiddleware, (req, res) =>
  collectionsService.findAll(req, res),
);
app.post("/projects/collections", jwtAuthMiddleware, (req, res) =>
  collectionsService.create(req, res),
);
app.get(
  "/projects/:projectId/collections/current",
  jwtAuthMiddleware,
  (req, res) => collectionsService.findCurrent(req, res),
);
app.get(
  "/projects/:projectId/collections/:collectionId",
  jwtAuthMiddleware,
  (req, res) => collectionsService.findOne(req, res),
);
app.put(
  "/projects/:projectId/collections/:collectionId",
  jwtAuthMiddleware,
  (req, res) => collectionsService.update(req, res),
);

// @collection-receivers
const collectionReceivers = new CollectionReceiverService(prisma);
app.get(
  "/projects/:projectId/collections/:id/receivers",
  jwtAuthMiddleware,
  async (req, res) => collectionReceivers.getAll(req, res),
);
app.post(
  "/projects/:projectId/collections/:id/receivers",
  jwtAuthMiddleware,
  (req, res) => collectionReceivers.insert(req, res),
);
app.put(
  "/projects/:projectId/collections/:collectionId/receivers/:id",
  jwtAuthMiddleware,
  (req, res) => collectionReceivers.update(req, res),
);
app.put(
  "/projects/:projectId/collections/:id/receivers",
  jwtAuthMiddleware,
  (req, res) => collectionReceivers.bulkPatch(req, res),
);
app.delete(
  "/projects/:projectId/collections/:collectionId/receivers/:id",
  jwtAuthMiddleware,
  (req, res) => collectionReceivers.delete(req, res),
);

// @collection-history
const collectionHistoryResource = new CollectionHistoryService(prisma);

app.get(
  "/projects/:projectId/collections/:id/history",
  jwtAuthMiddleware,
  async (req, res) => collectionHistoryResource.getAll(req, res),
);
app.post(
  "/projects/:projectId/collections/:id/history",
  jwtAuthMiddleware,
  (req, res) => collectionHistoryResource.insert(req, res),
);
// @customers
const customerResource = new CRUDAuthenticatedResource(
  prisma,
  "customer",
  undefined,
  undefined,
  "id",
);
app.get("/customers", jwtAuthMiddleware, (req, res) =>
  customerResource.fetchAll(req, res),
);
app.get("/customers/count", jwtAuthMiddleware, (req, res) =>
  customerResource.count(req, res),
);
app.get("/customers/:id", jwtAuthMiddleware, (req, res) =>
  customerResource.fetchById(req, res),
);

// @subscriptions
const subscriptionResource = new CRUDAuthenticatedResource(
  prisma,
  "subscription",
);
app.get("/subscriptions", jwtAuthMiddleware, (req, res) =>
  subscriptionResource.fetchAll(req, res),
);
app.get("/subscriptions/count", jwtAuthMiddleware, (req, res) =>
  subscriptionResource.count(req, res),
);
app.get("/subscriptions/:id", jwtAuthMiddleware, (req, res) =>
  subscriptionResource.fetchById(req, res),
);

// @credits
app.get("/credits", jwtAuthMiddleware, credits(creditsService));
app.post(
  "/collections/credits",
  collectionCredits(prisma, creditsService, dynamicClient),
);
app.post("/instruction-sets/credits", async (req, res) => {
  const { body } = req;
  try {
    const credits = await creditsCalculator.calculateCost(body.request, {
      source: body.source,
    });
    res.json({ data: credits, error: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    res.status(500).json({ data: null, error: message });
  }
});
app.get("/users/:id/credits", userCredits(creditsService));
app.post("/users/:id/credits", jwtAuthMiddleware, userCredits(creditsService));

// @products
const productResource = new CRUDAuthenticatedResource(prisma, "product");
app.get("/products", jwtAuthMiddleware, (req, res) =>
  productResource.fetchAll(req, res),
);
app.get("/products/count", jwtAuthMiddleware, (req, res) =>
  productResource.count(req, res),
);
app.get("/products/:id", jwtAuthMiddleware, (req, res) =>
  productResource.fetchById(req, res),
);

app.get("/project-templates", projectTemplateHandler(prisma));
app.post(
  "/project-templates",
  serviceKeyAuthMiddleware,
  projectTemplateHandler(prisma),
);

// @collection-rewards
app.get(
  "/collection-rewards",
  jwtAuthMiddleware,
  collectionRewardsByChainId(collectionRewardService),
);
app.get(
  "/collection-rewards/:id/redemptions/:walletAddress",
  jwtAuthMiddleware,
  collectionRewardsInfo(collectionRewardService),
);

app.post(
  "/collection-rewards/:id/redemptions",
  jwtAuthMiddleware,
  collectionRewardsClaim(collectionRewardService, creditsService),
);

// @feed
app.get("/feed", getFeed(prisma));

// @stripe
webhookApp.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  stripeWebhook(
    oneTimePaymentWebhookHandler,
    recurringPaymentWebhookHandler,
    stripe,
  ),
);

// @dynamic
app.get("/dynamic/users/:userId", (req, res) =>
  getDynamicUser(req, res, dynamicClient),
);
app.post("/webhook/dynamic", dynamicWebhook(prisma));
app.post("/webhook/dynamic/sync_user", syncUserWebhook(prisma));

// @onboarding
app.post(
  "/users/credits/onboarding",
  jwtAuthMiddleware,
  creditsOnboarding(prisma, platformClient),
);

// @profiles
app.get("/profiles", (req, res) => getProfileByAddress(req, res, prisma));
app.post("/profiles", jwtAuthMiddleware, (req, res) =>
  createProfile(req, res, prisma),
);
app.get("/profiles/:profileId", (req, res) => getById(req, res, prisma));
app.post("/profiles/picture", pfpGeneratorRateLimiter, async (_, res) => {
  const generator = new GeneratorV2(
    storageClient,
    prisma,
    creditsService,
    openAiApi,
  );
  generatePFP(res, generator);
});
app.put("/profiles/:profileId", (req, res) =>
  update(req, res, prisma, storageClient),
);

// @collections
app.put("/collections/:id/move", jwtAuthMiddleware, (req, res) =>
  collectionsService.moveProject(req, res),
);

// @previews
app.get("/collections/:id/preview", getCollectionPreview(prisma));
app.put(
  "/collections/:id/preview",
  jwtAuthMiddleware,
  updateCollectionPreview(prisma),
);

// @remix
app.get("/collections/:collectionId/remix", jwtAuthMiddleware, getFork(prisma));
app.post(
  "/collections/:collectionId/remix",
  jwtAuthMiddleware,
  createFork(prisma),
);
app.put("/collections/:id/edit", jwtAuthMiddleware, createEditHandler(prisma));

// @custodial-collections
app.post(
  "/collections/custodial/from-template",
  jwtOrApiKeyMiddleware,
  createCustodialCollectionFromTemplate(prisma, storageClient),
);

// @collection-dependencies
app.post("/collections/dependencies", getCollectionDependencies(prisma));

// @collection-sample-images
app.get("/collections/:id/samples", getSampleImages(prisma));
app.post(
  "/collections/:id/samples",
  jwtAuthMiddleware,
  createSamplesImages(prisma),
);

// @components
app.get(
  "/collections/:collectionId/components/flat-files",
  jwtAuthMiddleware,
  getComponentFlatFiles(prisma),
);
app.get(
  "/collections/:collectionId/components/:componentId/flat-files",
  jwtAuthMiddleware,
  getComponentFlatFiles(prisma),
);

// @collections
app.post(
  "/collections/:id/components",
  jwtAuthMiddleware,
  createComponent(prisma),
);
app.delete(
  "/collections/:collectionId/components/:componentId",
  jwtAuthMiddleware,
  deleteComponent(prisma),
);

// @workflows
app.get("/workflows", getWorkflows(prisma));
app.get("/workflows/name/:name", getWorkflowByName(prisma));
app.get("/workflows/:id", getWorkflow(prisma));
app.get("/workflows/:id/models", getWorkflowModels(prisma));
app.put("/workflows/:id", updateWorkflow(prisma));
app.delete("/workflows/:id", deleteWorkflow(prisma));
app.post("/workflows", createWorkflow(prisma));
app.post("/workflows/:id/test", testWorkflow(prisma));
app.post("/workflows/dependencies", getWorkflowDependencies(prisma));

// @models
app.get("/models", getModels(prisma));
app.get("/models/validate-auth", validateModelAuth(prisma));
app.get("/models/:id", getModel(prisma));
app.get("/models/name/:name", getModelByName(prisma));
app.post("/models", createModel(prisma));
app.post("/models/batch", getBatchModels(prisma));
app.put("/models/:id", updateModel(prisma));
app.delete("/models/:id", deleteModel(prisma));

// @custom-nodes
app.get("/custom-nodes", getCustomNodes(prisma));
app.get("/custom-nodes/defaults", getDefaultCustomNodes(prisma));
app.get("/custom-nodes/:id", getCustomNode(prisma));
app.get("/custom-nodes/name/:name", getCustomNodeByName(prisma));
app.post("/custom-nodes", createCustomNode(prisma));
app.put("/custom-nodes/:id", updateCustomNode(prisma));
app.delete("/custom-nodes/:id", deleteCustomNode(prisma));

// @forms
app.get("/form-configs", getFormConfigs(prisma));
app.get("/form-configs/:id", getFormConfig(prisma));
app.delete("/form-configs/:id", deleteFormConfig(prisma));
app.get("/form-configs/name/:name", getFormConfigByName(prisma));
app.post("/form-configs", createFormConfig(prisma));

// @servers
app.get("/servers", getServers(prisma));
app.post("/servers", createServer(prisma));

app.post(
  "/collections/:id/generations",
  jwtOrApiKeyMiddleware,
  runCollectionGeneration(
    storageClient,
    prisma,
    creditsService,
    openAiApi,
  ),
);

// @websocket
const wsLogger = logger.getSubLogger({
  name: "websocket",
});

const emitter = new Emitter(pool);

pool.on("error", (e) => {
  wsLogger.error(e);
});
io.adapter(createAdapter(pool));

io.on("connection", (socket) => {
  const eventManager = new WebSocketEventManager(
    emitter,
    socket,
    creditsService,
    storageClient,
    prisma,
    openAiApi,
  );
  socket.on("ping", () => eventManager.pong());
  socket.on("generate", (msg) => eventManager.generate(msg));
  socket.on("generate_preview", (msg) => eventManager.generatePreview(msg));
  socket.on("request_chat_messages", (msg) => eventManager.getMessages(msg));
  socket.on("add_chat_message", (msg) => eventManager.addMessage(msg));
});

// @api-keys
app.get("/api-keys", jwtAuthMiddleware, listApiKeys(prisma));
app.post("/api-keys", jwtAuthMiddleware, createApiKey(prisma));
app.delete("/api-keys/:id", jwtAuthMiddleware, deleteApiKey(prisma));

// @jobs
app.get("/jobs/:id", jwtOrApiKeyMiddleware, getJobStatus(prisma));
app.get("/jobs/:id/history", jwtOrApiKeyMiddleware, getJobHistory(prisma));
app.get("/jobs/:id/events", streamJobEvents(prisma));
app.get("/jobs", jwtAuthMiddleware, getUserJobs(prisma));
// All routes re-enabled
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: all route handlers re-enabled');

// Initialize telemetry
async function initializeTelemetry() {
  console.log('🚨🚨🚨 AGGRESSIVE DEBUG: initializeTelemetry function entered!');
  logger.info('🚀 initializeTelemetry: Starting telemetry initialization for EmProps API service');

  try {
    // Generate EmProps API server IDs using EMPROPS_API_BASE_ID + TELEMETRY_ENV pattern
    logger.debug(`🔍 initializeTelemetry: Checking MACHINE_ID environment variable`);
    if (!process.env.MACHINE_ID) {
      logger.debug(
        `🔍 initializeTelemetry: MACHINE_ID not set, generating from EMPROPS_API_BASE_ID + TELEMETRY_ENV`
      );
      const empropsApiBaseId = process.env.EMPROPS_API_BASE_ID;
      const telemetryEnv = process.env.TELEMETRY_ENV;

      logger.debug(
        `🔍 initializeTelemetry: EMPROPS_API_BASE_ID: ${empropsApiBaseId}, TELEMETRY_ENV: ${telemetryEnv}`
      );

      if (!empropsApiBaseId) {
        console.error('❌ initializeTelemetry: EMPROPS_API_BASE_ID environment variable missing');
        throw new Error(
          'FATAL: EMPROPS_API_BASE_ID environment variable is required for EmProps API server identification.'
        );
      }
      if (!telemetryEnv) {
        console.error('❌ initializeTelemetry: TELEMETRY_ENV environment variable missing');
        throw new Error(
          'FATAL: TELEMETRY_ENV environment variable is required for EmProps API server identification.'
        );
      }

      const machineId = `${empropsApiBaseId}-${telemetryEnv}`;
      process.env.MACHINE_ID = machineId;
      logger.info(`✅ initializeTelemetry: Generated MACHINE_ID: ${machineId}`);
    }

    if (!process.env.WORKER_ID) {
      process.env.WORKER_ID = process.env.MACHINE_ID;
      logger.info(`✅ initializeTelemetry: Set WORKER_ID: ${process.env.WORKER_ID}`);
    }

    // Log environment variables for debugging OTEL connection issues
    logger.info('📋 Environment variables before OTEL initialization:');
    const relevantEnvVars = Object.keys(process.env)
      .filter(key => key.includes('OTEL') || key.includes('DASH0') || key.includes('TELEMETRY'))
      .sort();
    
    for (const key of relevantEnvVars) {
      // Mask sensitive values but show they exist
      const value = process.env[key];
      const displayValue = key.includes('TOKEN') || key.includes('KEY') || key.includes('SECRET') 
        ? value ? `[REDACTED: ${value.length} chars]` : '[NOT_SET]'
        : value || '[NOT_SET]';
      logger.info(`📋   ${key}=${displayValue}`);
    }

    logger.info('🔧 initializeTelemetry: Creating telemetry client');
    // const telemetryClient = createTelemetryClient('emprops-api');
    const telemetryClient = null; // Disabled

    // Monitor log files - DISABLED
    const logDir = process.env.LOG_DIR || '/tmp';
    // await telemetryClient.log.addFile(`${logDir}/error.log`, 'emprops-api-error');
    // await telemetryClient.log.addFile(`${logDir}/combined.log`, 'emprops-api-combined');
    logger.info(`✅ initializeTelemetry: Log files monitoring DISABLED`);

    // Telemetry startup - DISABLED
    console.log('🚨🚨🚨 AGGRESSIVE DEBUG: telemetryClient.startup() DISABLED');
    logger.info('✅ Telemetry completely disabled');

    logger.info('✅ initializeTelemetry: Telemetry client initialized successfully');
    return telemetryClient;
  } catch (error) {
    logger.error('❌ initializeTelemetry: Failed to initialize telemetry:', error);
    // Don't fail the server startup if telemetry fails
    return null;
  }
}

// Skip telemetry initialization for now - just start the server
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: Skipping telemetry initialization, starting server directly');

// Start the server immediately
console.log('🚨🚨🚨 AGGRESSIVE DEBUG: About to call server.listen()');
server.listen(port, () => {
  logger.info(`Server started at port: ${port}`);
  console.log('🚨🚨🚨 AGGRESSIVE DEBUG: Server listening on port:', port);
  console.log('🚨🚨🚨 AGGRESSIVE DEBUG: Server startup completed successfully');
  
  // Add process monitoring
  console.log('🚨🚨🚨 AGGRESSIVE DEBUG: Setting up process monitoring');
  
  process.on('uncaughtException', (error) => {
    console.error('🚨🚨🚨 UNCAUGHT EXCEPTION:', error);
    console.error('🚨🚨🚨 STACK:', error.stack);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨🚨🚨 UNHANDLED REJECTION at:', promise);
    console.error('🚨🚨🚨 REASON:', reason);
    process.exit(1);
  });
  
  console.log('🚨🚨🚨 AGGRESSIVE DEBUG: Process monitoring set up');
});

console.log('🚨🚨🚨 AGGRESSIVE DEBUG: server.listen() called, waiting for callback...');

// Graceful shutdown.
async function shutdown() {
  server.close(async () => {
    logger.info("Server closed.");

    await disconnectPrisma();
    logger.info("Prisma disconnected.");

    await pool.end();
    logger.info("WebSocket pool closed.");

    posthog.shutdown();
    logger.info("Posthog shutdown.");

    process.exit(0);
  });
}

process.on("SIGINT", () => {
  logger.info("SIGINT signal received.");
  shutdown();
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM signal received.");
  shutdown();
});
