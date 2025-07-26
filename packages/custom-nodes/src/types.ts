// Types for EmProps Custom Nodes

export interface NodeMetadata {
  name: string;
  category: string;
  description: string;
  version: string;
  author: string;
}

export interface AssetDownloadConfig {
  url: string;
  filename?: string;
  headers?: Record<string, string>;
  timeout?: number;
}

export interface CloudStorageConfig {
  provider: 'aws' | 'azure';
  bucket?: string;
  container?: string;
  key: string;
  region?: string;
}

export interface ModelLoaderConfig {
  model_path: string;
  model_type: string;
  device?: string;
  precision?: string;
}
