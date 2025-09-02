import {
  BlobServiceClient,
  BlockBlobClient,
  ContainerClient,
  StorageSharedKeyCredential,
  newPipeline,
} from "@azure/storage-blob";

type Config = {
  container: string;
  cdnUrl?: string;
  // Authentication options
  accountName?: string;
  accountKey?: string;
  connectionString?: string;
  sasToken?: string;
};

export class AzureStorageClient {
  private containerClient: ContainerClient;
  private blobServiceClient: BlobServiceClient;

  constructor(public config: Config) {
    // Initialize the BlobServiceClient based on provided authentication options
    this.blobServiceClient = this.createBlobServiceClient(config);
    this.containerClient = this.blobServiceClient.getContainerClient(
      this.config.container,
    );
  }

  /**
   * Creates a BlobServiceClient based on the provided authentication options
   * @param config Configuration with authentication options
   * @returns BlobServiceClient instance
   */
  private createBlobServiceClient(config: Config): BlobServiceClient {
    // If a connection string is provided, use it
    if (config.connectionString) {
      return BlobServiceClient.fromConnectionString(config.connectionString);
    }

    // If account name and key are provided, use shared key authentication
    if (config.accountName && config.accountKey) {
      const sharedKeyCredential = new StorageSharedKeyCredential(
        config.accountName,
        config.accountKey,
      );
      const pipeline = newPipeline(sharedKeyCredential);
      return new BlobServiceClient(
        `https://${config.accountName}.blob.core.windows.net`,
        pipeline,
      );
    }

    // If account name and SAS token are provided, use SAS authentication
    if (config.accountName && config.sasToken) {
      // Make sure the SAS token starts with '?'
      const sasToken = config.sasToken.startsWith("?")
        ? config.sasToken
        : `?${config.sasToken}`;

      return new BlobServiceClient(
        `https://${config.accountName}.blob.core.windows.net${sasToken}`,
      );
    }

    throw new Error(
      "No valid authentication options provided for Azure Storage",
    );
  }

  /**
   * Uploads a file to Azure Blob Storage
   * @param fileName The name of the file in the container
   * @param content The file content as a Buffer
   * @param contentType The MIME type of the file
   * @returns Promise with the public URL of the uploaded file
   */
  async uploadFile(
    fileName: string,
    content: Buffer,
    contentType: string,
  ): Promise<string> {
    // Get a block blob client for the file
    const blockBlobClient: BlockBlobClient =
      this.containerClient.getBlockBlobClient(fileName);

    // Upload file to Azure Storage
    await blockBlobClient.upload(content, content.length, {
      blobHTTPHeaders: {
        blobContentType: contentType,
      },
    });

    // Return the public URL
    // If CDN URL is provided, use it, otherwise use the blob URL
    if (this.config.cdnUrl) {
      return `${this.config.cdnUrl}/${fileName}`;
    } else {
      return blockBlobClient.url;
    }
  }
}
