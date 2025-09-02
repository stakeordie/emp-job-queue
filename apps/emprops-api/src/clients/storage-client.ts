import { AzureStorageClient } from "./azure-storage-client";
import { AzureUploadServiceClient } from "./azure-upload-service-client";
import { GcpStorageClient } from "./gcp-storage-client";

export class StorageClient {
  private azureService: AzureUploadServiceClient;

  constructor(
    private gcpStorageClient: GcpStorageClient,
    private azureStorageClient: AzureStorageClient,
  ) {
    // Use Azure upload service as hotfix - deployed on Railway
    this.azureService = new AzureUploadServiceClient(
      `${process.env.AZURE_UPLOAD_SERVICE_URL}`,
    );
  }

  async storeFile(path: string, mimeType: string, content: Buffer) {
    // HOTFIX: Use standalone Azure upload service
    const base64Data = content.toString("base64");
    const blobUrl = await this.azureService.uploadBase64(
      path,
      base64Data,
      mimeType,
    );

    // Return CDN URL if configured, otherwise blob URL
    if (process.env.CLOUDFRONT_URL) {
      return `${process.env.CLOUDFRONT_URL}/${path}`;
    }
    return blobUrl;
  }
}
