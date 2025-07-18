export type {
  NodeMetadata,
  AssetDownloadConfig,
  CloudStorageConfig,
  ModelLoaderConfig,
} from './types.js';

// Re-export Python utilities
export const NODE_MAPPINGS = {
  EmProps_Asset_Downloader: 'emprops_asset_downloader',
  EmProps_Cloud_Storage_Saver: 'emprops_cloud_storage_saver',
  EmProps_S3_Video_Combine: 'emprops_s3_video_combine',
  EmProps_Checkpoint_Loader: 'emprops_checkpoint_loader',
  EmProps_Clip_Loader: 'emprops_clip_loader',
  EmProps_ControlNet_Loader: 'emprops_controlnet_loader',
  EmProps_VAE_Loader: 'emprops_vae_loader',
  EmProps_LoRA_Loader: 'emprops_lora_loader',
  EmProps_Upscaler_Loader: 'emprops_upscaler_loader',
} as const;

export type NodeName = keyof typeof NODE_MAPPINGS;
