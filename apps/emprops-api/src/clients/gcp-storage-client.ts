import { Storage, StorageOptions } from "@google-cloud/storage";

type Config = {
  bucket: string;
  projectId: string;
};

export class GcpStorageClient {
  private storage: Storage;

  constructor(
    storageOptions: StorageOptions,
    public config: Config,
  ) {
    this.storage = new Storage(storageOptions);
    this.config = config;
  }

  /**
   * Uploads a file to Google Cloud Storage
   * @param fileName The name of the file in the bucket
   * @param content The file content as a Buffer
   * @param contentType The MIME type of the file
   * @returns Promise with the public URL of the uploaded file
   */
  async uploadFile(
    fileName: string,
    content: Buffer,
    contentType: string,
  ): Promise<string> {
    const bucket = this.storage.bucket(this.config.bucket);
    const file = bucket.file(fileName);

    // Set file metadata
    const metadata = {
      contentType: contentType,
    };

    // Upload file to GCP Storage
    await file.save(content, {
      metadata: metadata,
      validation: "md5",
    });

    // Return the public URL
    return `${process.env.CLOUDFRONT_URL}/${fileName}`;
  }
}
