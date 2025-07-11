#!/usr/bin/env python3
# Added: 2025-04-14T18:55:00-04:00 - Configuration script for Automatic1111

import json
import sys
import os

# Default configuration for Automatic1111
default_config = {
    "outdir_samples": "",
    "outdir_txt2img_samples": "/output/txt2img-images",
    "outdir_img2img_samples": "/output/img2img-images",
    "outdir_extras_samples": "/output/extras-images",
    "outdir_grids": "",
    "outdir_txt2img_grids": "/output/txt2img-grids",
    "outdir_img2img_grids": "/output/img2img-grids",
    "outdir_save": "/output/saved",
    "save_to_dirs": True,
    "grid_save_to_dirs": True,
    "use_save_to_dirs_for_ui": True,
    "directories_filename_pattern": "[date]",
    "directories_max_prompt_words": 8,
    "ESRGAN_tile": 192,
    "ESRGAN_tile_overlap": 8,
    "realesrgan_enabled_models": ["R-ESRGAN 4x+", "R-ESRGAN 4x+ Anime6B"],
    "upscaler_for_img2img": None,
    "face_restoration_model": "CodeFormer",
    "code_former_weight": 0.5,
    "face_restoration_unload": False,
    "show_warnings": False,
    "memmon_poll_rate": 8,
    "samples_log_stdout": False,
    "multiple_tqdm": True,
    "unload_models_when_training": False,
    "pin_memory": False,
    "save_optimizer_state": False,
    "save_training_settings_to_txt": True,
    "dataset_filename_word_regex": "",
    "dataset_filename_join_string": " ",
    "training_image_repeats_per_epoch": 1,
    "training_write_csv_every": 500,
    "training_xattention_optimizations": False,
    "training_enable_tensorboard": False,
    "training_tensorboard_save_images": False,
    "training_tensorboard_flush_every": 120,
    "sd_model_checkpoint": "v1-5-pruned.safetensors",
    "sd_checkpoint_cache": 0,
    "sd_vae_checkpoint_cache": 0,
    "sd_vae": "Automatic",
    "sd_vae_as_default": True,
    "inpainting_mask_weight": 1.0,
    "initial_noise_multiplier": 1.0,
    "img2img_color_correction": False,
    "img2img_fix_steps": False,
    "img2img_background_color": "#ffffff",
    "enable_quantization": False,
    "enable_emphasis": True,
    "enable_batch_seeds": True,
    "comma_padding_backtrack": 20,
    "CLIP_stop_at_last_layers": 1,
    "upcast_attn": False,
    "use_old_emphasis_implementation": False,
    "use_old_karras_scheduler_sigmas": False,
    "no_dpmpp_sde_batch_determinism": False,
    "use_old_hires_fix_width_height": False,
    "interrogate_keep_models_in_memory": False,
    "interrogate_return_ranks": False,
    "interrogate_clip_num_beams": 1,
    "interrogate_clip_min_length": 24,
    "interrogate_clip_max_length": 48,
    "interrogate_clip_dict_limit": 1500,
    "interrogate_clip_skip_categories": [],
    "interrogate_deepbooru_score_threshold": 0.5,
    "deepbooru_sort_alpha": True,
    "deepbooru_use_spaces": False,
    "deepbooru_escape": True,
    "deepbooru_filter_tags": "",
    "extra_networks_default_view": "cards",
    "extra_networks_default_multiplier": 1.0,
    "extra_networks_card_width": 0,
    "extra_networks_card_height": 0,
    "extra_networks_add_text_separator": " ",
    "sd_hypernetwork": "None",
    "return_grid": True,
    "do_not_show_images": False,
    "send_seed": True,
    "send_size": True,
    "font": "",
    "js_modal_lightbox": True,
    "js_modal_lightbox_initially_zoomed": True,
    "show_progress_in_title": True,
    "samplers_in_dropdown": True,
    "dimensions_and_batch_together": True,
    "keyedit_precision_attention": 0.1,
    "keyedit_precision_extra": 0.05,
    "quicksettings": "sd_model_checkpoint",
    "hidden_tabs": [],
    "ui_reorder": "inpaint, sampler, checkboxes, hires_fix, dimensions, cfg, seed, batch, override_settings, scripts",
    "ui_extra_networks_tab_reorder": "",
    "localization": "None",
    "show_progressbar": True,
    "live_previews_enable": True,
    "show_progress_grid": True,
    "show_progress_every_n_steps": 10,
    "show_progress_type": "Approx NN",
    "live_preview_content": "Prompt",
    "live_preview_refresh_period": 1000,
    "hide_samplers": [],
    "eta_ddim": 0.0,
    "eta_ancestral": 1.0,
    "ddim_discretize": "uniform",
    "s_churn": 0.0,
    "s_tmin": 0.0,
    "s_noise": 1.0,
    "eta_noise_seed_delta": 0,
    "always_discard_next_to_last_sigma": False,
    "postprocessing_enable_in_main_ui": [],
    "postprocessing_operation_order": [],
    "upscaling_max_images_in_cache": 5,
    "disabled_extensions": [],
    "sd_checkpoint_hash": "",
    "sd_lora": "None",
    "lora_preferred_name": "Alias from file",
    "lora_add_hashes_to_infotext": True,
    "sd_lyco": "None"
}

def main():
    if len(sys.argv) < 2:
        print("Usage: python config.py <config_file>")
        return
    
    config_file = sys.argv[1]
    
    # [2025-04-17T13:33:51-04:00] Enhanced to handle empty files and invalid JSON
    # If the config file exists and is not empty, load it and update with defaults
    if os.path.exists(config_file) and os.path.getsize(config_file) > 0:
        try:
            with open(config_file, 'r') as f:
                config = json.load(f)
            
            # Update with defaults for any missing keys
            for key, value in default_config.items():
                if key not in config:
                    config[key] = value
        except json.JSONDecodeError:
            # If JSON is invalid, use default config
            print(f"Warning: Invalid JSON in {config_file}, using default configuration")
            config = default_config
    else:
        # Use default config for empty or non-existent files
        print(f"Note: Using default configuration for {config_file} (file empty or not found)")
        config = default_config
    
    # Write the updated config back to the file
    with open(config_file, 'w') as f:
        json.dump(config, f, indent=4)
    
    print(f"Configuration saved to {config_file}")

if __name__ == "__main__":
    main()
