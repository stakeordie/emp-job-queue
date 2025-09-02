export type BaseSettings = {
  denoising_strength?: number;
  prompt: string;
  styles?: string[];
  seed?: number;
  subseed?: number;
  subseed_strength?: number;
  seed_resize_from_h?: number;
  seed_resize_from_w?: number;
  sampler_name?: string;
  batch_size?: number;
  n_iter?: number;
  steps?: number;
  cfg_scale?: number;
  width?: number;
  height?: number;
  restore_faces?: boolean;
  tiling?: boolean;
  do_not_save_samples?: boolean;
  do_not_save_grid?: boolean;
  negative_prompt?: string;
  eta?: number;
  s_churn?: number;
  s_tmax?: number;
  s_tmin?: number;
  s_noise?: number;
  override_settings?: Record<string, unknown>;
  override_settings_restore_afterwards?: boolean;
  script_args?: string[];
  sampler_index?: string;
  script_name?: string;
  send_images?: boolean;
  save_images?: boolean;
  alwayson_scripts?: Record<string, unknown>;
};

export type Txt2ImgSettings = BaseSettings & {
  enable_hr?: boolean;
  firstphase_width?: number;
  firstphase_height?: number;
  hr_scale?: number;
  hr_upscaler?: string;
  hr_second_pass_steps?: number;
  hr_resize_x?: number;
  hr_resize_y?: number;
};

export type Img2ImgSettings = BaseSettings & {
  init_images: string[];
  resize_mode?: number;
  image_cfg_scale?: number;
  mask?: string;
  mask_blur?: number;
  inpainting_fill?: number;
  inpaint_full_res?: boolean;
  inpaint_full_res_padding?: number;
  inpainting_mask_invert?: number;
  initial_noise_multiplier?: number;
  include_init_images?: boolean;
  image?: string;
};

export interface ExtraSingleImageRequest {
  resize_mode?: number;
  show_extras_results?: boolean;
  gfpgan_visibility?: number;
  codeformer_visibility?: number;
  codeformer_weight?: number;
  upscaling_resize?: number;
  upscaling_resize_w?: number;
  upscaling_resize_h?: number;
  upscaling_crop?: boolean;
  upscaler_1?: string;
  upscaler_2?: string;
  extras_upscaler_2_visibility?: number;
  upscale_first?: boolean;
  image: string;
}

export type Config = {
  url: string;
  headers?: Record<string, string>;
  username: string;
  password: string;
};

export interface ToImgResponse {
  images: string[];
  parameters: Record<string, unknown>;
  info: string;
}

export interface ExtraSingleImageResponse {
  image: string;
  html_info: string;
}

export type Options = {
  samples_save: boolean;
  samples_format: string;
  samples_filename_pattern: string;
  save_images_add_number: boolean;
  grid_save: boolean;
  grid_format: string;
  grid_extended_filename: boolean;
  grid_only_if_multiple: boolean;
  grid_prevent_empty_spots: boolean;
  n_rows: number;
  enable_pnginfo: boolean;
  save_txt: boolean;
  save_images_before_face_restoration: boolean;
  save_images_before_highres_fix: boolean;
  save_images_before_color_correction: boolean;
  jpeg_quality: number;
  export_for_4chan: boolean;
  use_original_name_batch: boolean;
  use_upscaler_name_as_suffix: boolean;
  save_selected_only: boolean;
  do_not_add_watermark: boolean;
  temp_dir: string;
  clean_temp_dir_at_start: boolean;
  outdir_samples: string;
  outdir_txt2img_samples: string;
  outdir_img2img_samples: string;
  outdir_extras_samples: string;
  outdir_grids: string;
  outdir_txt2img_grids: string;
  outdir_img2img_grids: string;
  outdir_save: string;
  save_to_dirs: boolean;
  grid_save_to_dirs: boolean;
  use_save_to_dirs_for_ui: boolean;
  directories_filename_pattern: string;
  directories_max_prompt_words: number;
  ESRGAN_tile: number;
  ESRGAN_tile_overlap: number;
  realesrgan_enabled_models: string[];
  upscaler_for_img2img: string;
  ldsr_steps: number;
  ldsr_cached: boolean;
  SWIN_tile: number;
  SWIN_tile_overlap: number;
  face_restoration_model: null; // Unknown Type: null
  code_former_weight: number;
  face_restoration_unload: boolean;
  show_warnings: boolean;
  memmon_poll_rate: number;
  samples_log_stdout: boolean;
  multiple_tqdm: boolean;
  print_hypernet_extra: boolean;
  unload_models_when_training: boolean;
  pin_memory: boolean;
  save_optimizer_state: boolean;
  save_training_settings_to_txt: boolean;
  dataset_filename_word_regex: string;
  dataset_filename_join_string: string;
  training_image_repeats_per_epoch: number;
  training_write_csv_every: number;
  training_xattention_optimizations: boolean;
  training_enable_tensorboard: boolean;
  training_tensorboard_save_images: boolean;
  training_tensorboard_flush_every: number;
  sd_model_checkpoint: string;
  sd_checkpoint_cache: number;
  sd_vae_checkpoint_cache: number;
  sd_vae: string;
  sd_vae_as_default: boolean;
  inpainting_mask_weight: number;
  initial_noise_multiplier: number;
  img2img_color_correction: boolean;
  img2img_fix_steps: boolean;
  img2img_background_color: string;
  enable_quantization: boolean;
  enable_emphasis: boolean;
  enable_batch_seeds: boolean;
  comma_padding_backtrack: number;
  CLIP_stop_at_last_layers: number;
  extra_networks_default_multiplier: number;
  upcast_attn: boolean;
  use_old_emphasis_implementation: boolean;
  use_old_karras_scheduler_sigmas: boolean;
  use_old_hires_fix_width_height: boolean;
  interrogate_keep_models_in_memory: boolean;
  interrogate_return_ranks: boolean;
  interrogate_clip_num_beams: number;
  interrogate_clip_min_length: number;
  interrogate_clip_max_length: number;
  interrogate_clip_dict_limit: number;
  interrogate_clip_skip_categories: any[];
  interrogate_deepbooru_score_threshold: number;
  deepbooru_sort_alpha: boolean;
  deepbooru_use_spaces: boolean;
  deepbooru_escape: boolean;
  deepbooru_filter_tags: string;
  extra_networks_default_view: string;
  lora_apply_to_outputs: boolean;
  return_grid: boolean;
  do_not_show_images: boolean;
  add_model_hash_to_info: boolean;
  add_model_name_to_info: boolean;
  disable_weights_auto_swap: boolean;
  send_seed: boolean;
  send_size: boolean;
  font: string;
  js_modal_lightbox: boolean;
  js_modal_lightbox_initially_zoomed: boolean;
  show_progress_in_title: boolean;
  samplers_in_dropdown: boolean;
  dimensions_and_batch_together: boolean;
  keyedit_precision_attention: number;
  keyedit_precision_extra: number;
  quicksettings: string;
  ui_reorder: string;
  ui_extra_networks_tab_reorder: string;
  localization: string;
  show_progressbar: boolean;
  live_previews_enable: boolean;
  show_progress_grid: boolean;
  show_progress_every_n_steps: number;
  show_progress_type: string;
  live_preview_content: string;
  live_preview_refresh_period: number;
  hide_samplers: any[];
  eta_ddim: number;
  eta_ancestral: number;
  ddim_discretize: string;
  s_churn: number;
  s_tmin: number;
  s_noise: number;
  eta_noise_seed_delta: number;
  always_discard_next_to_last_sigma: boolean;
  postprocessing_enable_in_main_ui: any[];
  postprocessing_operation_order: any[];
  upscaling_max_images_in_cache: number;
  disabled_extensions: any[];
  sd_checkpoint_hash: string;
};

export enum Model {
  V1_5_DEPRECATED = "v1-5-pruned.ckpt [e1441589a6]",
  V1_5 = "v1-5-pruned.safetensors [1a189f0be6]",
  V2_1_DEPRECATED = "v2-1_768-ema-pruned.ckpt [ad2a33c361]",
  V2_1 = "v2-1_768-ema-pruned.safetensors [dcd690123c]",
  SD_XL_BASE_1_0_DEPRECATED = "sd_xl_base_1.0.safetensors [31e35c80fc]",
  SD_XL_BASE_1_0 = "sd_xl_base_1.0_0.9vae.safetensors [e6bb9ea85b]",
  JUGGERNAUT_XL_V8_DEPRECATED = "juggernautXL_v8Rundiffusion.safetensors [aeb7e9e689]",
  JUGGERNAUT_XL_V8 = "JuggernautXL_v8Rundiffusion.safetensors [aeb7e9e689]",
  JUGGERNAUT_XL_V9 = "Juggernaut-XL_v9_RunDiffusionPhoto_v2.safetensors [c9e3e68f89]",
  EPIC_PHOTOGASM = "epiCPhotoGasm.safetensors [62bb78983a]",
}

const supportedModels = {
  [Model.V1_5_DEPRECATED]: "1.5_dep",
  [Model.V1_5]: "1.5",
  [Model.V2_1_DEPRECATED]: "2.1_dep",
  [Model.V2_1]: "2.1",
  [Model.SD_XL_BASE_1_0_DEPRECATED]: "sdxl1.0_dep",
  [Model.SD_XL_BASE_1_0]: "sdxl1.0",
  [Model.JUGGERNAUT_XL_V8_DEPRECATED]: "jugg8_dep",
  [Model.JUGGERNAUT_XL_V8]: "jugg8",
  [Model.JUGGERNAUT_XL_V9]: "jugg9",
  [Model.EPIC_PHOTOGASM]: "epic",
} as Record<string, string>;

function getSupportedModelVersionHeader(settings: BaseSettings) {
  const checkpoint = settings.override_settings?.sd_model_checkpoint as string;
  if (!checkpoint) return;
  const version = supportedModels[checkpoint];
  return { "x-sd-model": version };
}

const runpodEndpoints = {} as Record<string, string>;

function getRunpodEndpoint(settings: {
  override_settings?: Record<string, unknown>;
}) {
  const checkpoint = settings.override_settings?.sd_model_checkpoint as string;
  if (!checkpoint) return false;
  const endpoint = runpodEndpoints[checkpoint];
  return endpoint;
}

export class StableDiffusionClient {
  private url: string;
  private credentials: string;
  private headers: Record<string, string>;

  constructor({ url, username, password, headers }: Config) {
    this.url = url;
    this.credentials = Buffer.from(`${username}:${password}`).toString(
      "base64",
    );
    this.headers = headers || {};
  }

  img2img(settings: Img2ImgSettings) {
    if (!getRunpodEndpoint(settings)) {
      return fetch(`${this.url}/sdapi/v1/img2img`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${this.credentials}`,
          ...getSupportedModelVersionHeader(settings),
          ...this.headers,
        },
        body: JSON.stringify(settings),
      });
    } else {
      return fetch(
        `https://api.runpod.ai/v2/${getRunpodEndpoint(settings)}/runsync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
          },
          body: JSON.stringify({
            input: {
              prompt: settings,
              type: "img2img",
            },
          }),
        },
      );
    }
  }

  txt2img(settings: Txt2ImgSettings) {
    if (!getRunpodEndpoint(settings)) {
      return fetch(`${this.url}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${this.credentials}`,
          ...getSupportedModelVersionHeader(settings),
          ...this.headers,
        },
        body: JSON.stringify(settings),
      });
    } else {
      return fetch(
        `https://api.runpod.ai/v2/${getRunpodEndpoint(settings)}/runsync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
          },
          body: JSON.stringify({
            input: {
              prompt: settings,
              type: "txt2img",
            },
          }),
        },
      );
    }
  }

  extraSingleImage(settings: ExtraSingleImageRequest) {
    if (!runpodEndpoints["upscaler"]) {
      return fetch(`${this.url}/sdapi/v1/extra-single-image`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${this.credentials}`,
          ...this.headers,
        },
        body: JSON.stringify(settings),
      });
    } else {
      return fetch(
        `https://api.runpod.ai/v2/${runpodEndpoints["upscaler"]}/runsync`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.RUNPOD_API_KEY}`,
          },
          body: JSON.stringify({
            input: {
              prompt: settings,
              type: "extra-single-image",
            },
          }),
        },
      );
    }
  }

  async setOptions(options: Partial<Options>) {
    await this.doRequest<void>("POST", "/sdapi/v1/options", options);
  }

  private doRequest<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      fetch(`${this.url}${path}`, {
        method,
        headers: {
          Authorization: `Basic ${this.credentials}`,
          "Content-Type": "application/json",
          ...headers,
          ...this.headers,
        },
        body: JSON.stringify(body),
      })
        .then((response) => {
          if (!response.ok) {
            reject(new Error(response.statusText));
            return;
          }
          return response.json();
        })
        .then((json) => resolve(json));
    });
  }
}
