import { logger } from "@emp/core";
import { fetchWithRetry } from "../utils/fetch";

export class AzureUploadServiceClient {
  private serviceUrl: string;
  private apiKey: string;

  constructor(serviceUrl: string, apiKey?: string) {
    this.serviceUrl = serviceUrl.replace(/\/$/, ""); // Remove trailing slash
    this.apiKey =
      apiKey ||
      process.env.AZURE_UPLOAD_SERVICE_KEY ||
      "azure-upload-service-key-2025";
    logger.info(
      `🔧 AzureUploadServiceClient initialized with URL: ${this.serviceUrl}`,
    );
  }

  private getAuthHeaders() {
    return {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
    };
  }

  /**
   * Test the Azure upload service connectivity
   */
  async testConnectivity(): Promise<any> {
    try {
      logger.info(`🔍 Testing Azure upload service connectivity...`);

      const response = await fetchWithRetry(`${this.serviceUrl}/test-azure`, {
        headers: this.getAuthHeaders(),
      });
      const result = await response.json();

      logger.info(`📊 Azure service test result:`, result);

      if (!response.ok) {
        throw new Error(`Azure service test failed: ${result.error}`);
      }

      return result;
    } catch (error) {
      logger.error(`❌ Azure service connectivity test failed:`, error);
      throw error;
    }
  }

  /**
   * Upload base64 data via the Azure upload service
   */
  async uploadBase64(
    filename: string,
    base64Data: string,
    contentType: string = "image/png",
  ): Promise<string> {
    try {
      logger.info(`🚀 Uploading to Azure service: ${filename}`);
      logger.info(
        `📊 Upload details: type=${contentType}, size=${base64Data.length} chars`,
      );

      const response = await fetchWithRetry(
        `${this.serviceUrl}/upload-base64`,
        {
          method: "POST",
          headers: this.getAuthHeaders(),
          body: JSON.stringify({
            filename,
            base64Data,
            contentType,
          }),
        },
      );

      const result = await response.json();

      logger.info(`📊 Azure service upload result:`, {
        success: result.success,
        filename: result.filename,
        hasRequestId: result.response?.hasRequestId,
        requestId: result.response?.requestId,
        exists: result.exists,
      });

      if (!response.ok || !result.success) {
        throw new Error(`Azure service upload failed: ${result.error}`);
      }

      if (!result.response?.hasRequestId) {
        logger.warn(
          `⚠️ Azure service upload succeeded but no requestId - this indicates the same issue exists`,
        );
      }

      return result.blobUrl;
    } catch (error) {
      logger.error(`❌ Azure service upload failed:`, error);
      throw error;
    }
  }

  /**
   * Get service health status
   */
  async getHealth(): Promise<any> {
    try {
      const response = await fetchWithRetry(`${this.serviceUrl}/health`);
      return await response.json();
    } catch (error) {
      logger.error(`❌ Azure service health check failed:`, error);
      throw error;
    }
  }
}
