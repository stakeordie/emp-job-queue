import { ILogObjMeta, Logger } from "tslog";

const logger = new Logger({
  minLevel: Number(process.env.LOG_LEVEL || "1"),
  attachedTransports: [
    (data: ILogObjMeta) => {
      // Error logging now handled through structured logs and telemetry
      // Sentry integration removed for Node.js compatibility
      if (data?._meta.logLevelId == 5) {
        const msg = (data["0"] as unknown as string) || "";
        // Errors are still logged to console/files for debugging
        console.error(`[ERROR] ${msg}`, data._meta);
      }
    },
  ],
});

export default logger;
