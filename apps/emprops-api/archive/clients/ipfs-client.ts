import { S3 } from "aws-sdk";
import { create } from "ipfs-http-client";

export class IpfsClient {
  private s3: S3;
  private bucket: string;
  private ipfsClient;

  constructor(
    endpoint: string,
    bucket: string,
    accessKeyId: string,
    secretAccessKey: string,
    ipfsApiUrl: string,
  ) {
    this.s3 = new S3({
      apiVersion: "2006-03-01",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint,
      region: "us-east-1",
    });
    this.bucket = bucket;
    this.ipfsClient = create({ url: ipfsApiUrl });
  }

  async uploadFile(
    fileName: string,
    content: Buffer,
    contentType: string,
  ): Promise<string> {
    const result = await this.ipfsClient.add(content);
    return new Promise((resolve, reject) => {
      const request = this.s3.putObject({
        Bucket: this.bucket,
        Key: fileName,
        ContentType: contentType,
        Body: content,
        ACL: "public-read",
      });
      request.on("httpHeaders", () => resolve(result.path));
      request.on("error", (error: Error) => reject(error));
      request.send();
    });
  }
}
