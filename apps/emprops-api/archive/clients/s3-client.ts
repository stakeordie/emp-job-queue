import { S3Client } from "@aws-sdk/client-s3";

type Config = {
  bucket: string;
  cloudfrontUrl: string;
};

export class S3ClientWrapper {
  constructor(
    public s3Client: S3Client,
    public config: Config,
  ) {
    this.s3Client = s3Client;
    this.config = config;
  }
}
