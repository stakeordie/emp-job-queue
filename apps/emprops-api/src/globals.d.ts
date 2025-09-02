declare global {
  namespace NodeJS {
    interface ProcessEnv {
      FILEBASE_URL: string;
      FILEBASE_BUCKET: string;
      FILEBASE_ACCESS_KEY: string;
      FILEBASE_SECRET_KEY: string;
      AWS_ACCESS_KEY_ID: string;
      AWS_SECRET_ACCESS_KEY: string;
      AWS_REGION: string;
      AWS_BUCKET_NAME: string;
      KMS_KEY_ID: string;
      CLOUDFRONT_URL: string;
      IPFS_API_URL: string;
      OPENAI_API_KEY: string;
      ENABLE_AUTH: string;
      PLATFORM_API_URL: string;
      LOG_LEVEL: string | undefined;
      PFP_GENERATION_IS: string;

      DYNAMIC_API_URL: string;
      DYNAMIC_API_KEY: string;
      DYNAMIC_ENVIRONMENT_ID: string;
      DYNAMIC_PUBLIC_KEY: string;

      SERVICE_KEY: string;

      STRIPE_SECRET_KEY: string;
      STRIPE_WEBHOOK_SECRET: string;

      POSTHOG_HOST: string;
      POSTHOG_API_KEY: string;

      LOG_GENERATION: string;
      RPC_REGISTRY: string;
      SENTRY_DNS: string;

      // retool
      RETOOL_ASSIGN_MEMBER_TOKEN_WH: string;

      ENCRYPTION_SECRET_KEY: string;

      STABLE_DIFFUSION_URL: string;
      STABLE_DIFFUSION_USERNAME: string;
      STABLE_DIFFUSION_PASSWORD: string;

      PUPPETEER_API_URL: string;

      RUNPOD_API_KEY: string;

      OPEN_API_PRODUCTION_URL: string;
      OPEN_API_PRODUCTION_KEY: string;

      REDIS_SERVER_URL: string;
      REDIS_SERVER_TOKEN: string;

      GOOGLE_APPLICATION_CREDENTIALS_JSON: string;
      GOOGLE_GCS_BUCKET: string;
      GOOGLE_GCS_PROJECT_ID: string;

      // Azure Storage
      AZURE_STORAGE_ACCOUNT_NAME: string;
      AZURE_STORAGE_ACCOUNT_KEY: string;
      AZURE_STORAGE_CONNECTION_STRING: string;
      AZURE_STORAGE_CONTAINER: string;
      AZURE_CDN_URL: string;
    }
  }
}

// If this file has no import/export statements (i.e. is a script)
// convert it into a module by adding an empty export statement.
export {};
