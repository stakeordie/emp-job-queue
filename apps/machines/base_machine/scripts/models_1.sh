#!/bin/bash

cd /workspace/shared/models/checkpoints && wget https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-13b-0.9.7-dev-fp8.safetensors

cd /workspace/shared/models/clip && wget https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files/text_encoders/clip_g_hidream.safetensors https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files/text_encoders/clip_l_hidream.safetensors https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files/text_encoders/llama_3.1_8b_instruct_fp8_scaled.safetensors https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp16.safetensors https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn_scaled.safetensors

cd /workspace/shared/models/diffusion_models && wget https://huggingface.co/Comfy-Org/HiDream-I1_ComfyUI/resolve/main/split_files/diffusion_models/hidream_i1_dev_bf16.safetensors

cd /workspace/shared/models/upscale_models && wget https://huggingface.co/Lightricks/LTX-Video/resolve/main/ltxv-spatial-upscaler-0.9.7.safetensors

cd /workspace/shared/models/vae && wget https://huggingface.co/lovis93/testllm/resolve/ed9cf1af7465cebca4649157f118e331cf2a084f/ae.safetensors

mkdir -p /workspace/shared/models/text_encoder/PixArt-XL-2-1024-MS/text_encoder && cd /workspace/shared/models/text_encoder/PixArt-XL-2-1024-MS/text_encoder && wget https://huggingface.co/PixArt-alpha/PixArt-XL-2-1024-MS/resolve/main/text_encoder/config.json https://huggingface.co/PixArt-alpha/PixArt-XL-2-1024-MS/resolve/main/text_encoder/model-00001-of-00002.safetensors https://huggingface.co/PixArt-alpha/PixArt-XL-2-1024-MS/resolve/main/text_encoder/model-00002-of-00002.safetensors https://huggingface.co/PixArt-alpha/PixArt-XL-2-1024-MS/resolve/main/text_encoder/model.safetensors.index.json