# Changelog

All notable changes to the EMP MGPU project will be documented in this file.

## [Unreleased]

### Added
- [2025-06-04T14:04:20-04:00] Enhanced error handling in ollama and mgpu_ollama scripts to safely source environment files, preventing script failures due to errors in /etc/environment.
- [2025-06-04T14:01:22-04:00] Fixed Ollama GPU usage by replacing CUDA_VISIBLE_DEVICES=all with explicit GPU indices (0,1,2,...) in ollama init script and mgpu_ollama management script. This resolves an issue where Ollama would fall back to CPU instead of using available GPUs.
- [2025-06-04T12:45:54-04:00] Fixed service verification in start.sh by making all_services_ok a global variable, resolving the issue where verification would incorrectly report failures even when all services were running correctly.
- [2025-06-03T22:46:12-04:00] Enhanced service verification error reporting in start.sh to provide detailed failure information, including specific service errors from log files. This helps diagnose issues when services fail to start properly.
- [2025-06-03T21:16:01-04:00] Replaced langflow with ollama in the mgpu environment. Added ollama init script, management script (mgpu_ollama), updated Dockerfile and start.sh to install and configure ollama instead of langflow. This change allows for local LLM inference using ollama models that can be connected to ComfyUI.
- [2025-05-29T22:22:28-04:00] Enhanced model loading for multi-GPU setups: Updated `a1111_loader.py` to accept port/GPU parameters and modified `load_a1111_models` function to load models on all GPU instances. This fixes issues where models were only loaded on the first GPU in multi-GPU environments and ensures consistent model availability across all worker instances.
- [2025-05-25T22:00:00-04:00] Added log rotation functionality to the wgpu script. Users can now rotate logs for specific GPUs or all GPUs with `./scripts/wgpu rotate [gpu_id|all]`. This creates a backup of the current log file and starts a fresh log, improving log management and debugging capabilities.
- [2025-05-07T12:39:06-04:00] Modified start.sh to install requirements.txt for custom nodes in manage_custom_nodes. This ensures Python dependencies like azure-storage-blob for EmProps_Cloud_Storage_Saver are installed, fixing 'Unsupported provider: azure' errors.
- [2025-04-17 13:33] Fixed Automatic1111 JSON decoding error by initializing configuration files with valid JSON structure. Updated a1111_config.py to handle empty files gracefully and added configuration initialization to the setup_a1111 function. This prevents webui.sh from failing when trying to load empty configuration files.
- [2025-04-17 13:18] Changed A1111 launch command to use absolute path (/workspace/a1111_gpu${GPU_NUM}/webui.sh) instead of relative path (./webui.sh). This improves reliability by eliminating potential path-related issues and makes the launch process more robust across different environments.
- [2025-04-16 20:34] Fixed model symlink target to use shared models directory directly. Added error checking and detailed logging for symlink creation. This ensures models are properly symlinked to the shared directory and are accessible to all worker instances.
- [2025-04-16 20:24] Optimized A1111 model search process by removing unnecessary ComfyUI directory path check. This improves performance by eliminating redundant filesystem operations and simplifies the code for better maintainability.
- [2025-04-15 21:26] Fixed A1111 template copying to include hidden files like .git by using rsync instead of cp. This prevents webui.sh from creating nested installations and ensures proper repository structure. The change improves stability and consistency across worker instances.
- [2025-04-15 17:38] Updated port verification in start.sh to use WORKER_BASE_A1111_PORT and WORKER_BASE_COMFYUI_PORT environment variables with appropriate fallbacks. This ensures consistent port checking across all services and aligns with the dynamic port assignment approach implemented earlier.
- [2025-04-15 17:23] Enhanced ComfyUI script with environment variable loading function and dynamic port configuration using WORKER_BASE_COMFYUI_PORT. Added consistent environment variable loading from /etc/profile.d/env.sh across all functions (start, stop, restart, status). This ensures consistent port assignment and configuration across all worker instances.
- [2025-04-15 10:12] Refactored worker setup to use a single shared models directory at /workspace/shared/a1111_models, with each a1111_gpuX worker folder containing a symlink to this location. The a1111_template is now created in /tmp and used for worker creation, keeping the workspace clean and preventing model duplication. All model downloads and syncs now target the shared folder. This improves storage efficiency, consistency, and maintainability.
- [2025-04-15 09:44] Blocked all model downloads in mgpu script when STORAGE_TEST_MODE=true. If test mode is active, missing models are not downloaded and a warning is logged for each. This prevents any network/model download activity in test environments and is fully traceable in the code.
- [2025-04-15 09:07] Prevented all model downloads in Automatic1111 setup when STORAGE_TEST_MODE=true. If test mode is active, the service will not attempt to download missing models and will log a clear message. This ensures test environments do not trigger unwanted downloads and is fully traceable in the code.
- [2025-04-15 08:58] Dynamic worker port assignment: For every WORKER_BASE_*_PORT environment variable, the worker .env file now includes a corresponding WORKER_X_PORT variable, calculated as WORKER_X_PORT=WORKER_BASE_X_PORT+GPU_NUM. This ensures deterministic, future-proof port assignment for all worker services. See start.sh for details and timestamped implementation.
- [2025-04-14 22:45] Optimized Azure sync fallback to only download models that should be in shared storage
- [2025-04-14 21:29] Added support for model aliases to handle different capitalizations of model filenames
- [2025-04-14 21:26] Enhanced model management to download individual missing models automatically
- [2025-04-14 21:22] Changed Automatic1111 port from 3100 to 3001 and removed unnecessary --listen flag
- [2025-04-14 20:47] Optimized Automatic1111 setup process by moving one-time setup logic from service start to initial setup
- [2025-04-14 20:45] Enhanced model management with direct fallback to model repository cloning
- [2025-04-14 20:45] Simplified configuration symlink setup with consistent approach
- [2025-04-14 18:52] Added Automatic1111 integration with pinned version (cf2772fab0af5573da775e7437e6acdca424f26e)
- [2025-04-14 18:52] Added template-based approach for multi-GPU Automatic1111 instances
- [2025-04-14 18:52] Added custom virtual environment setup for Automatic1111
- [2025-04-14 18:52] Added tcmalloc for memory leak prevention in Automatic1111
- [2025-04-14 18:52] Added model loader and error handling scripts for Automatic1111
- [2025-04-14 18:52] Added smart model management with symlinks to existing ComfyUI models
- [2025-04-14 18:52] Added configuration persistence through symlinks
- [2025-04-14 18:05] Added Azure Blob Storage support with SAS token authentication
- [2025-04-14 18:05] Added provider-agnostic storage configuration system (supports AWS and Azure)
- [2025-04-14 18:05] Added support for separate test and production Azure storage containers
- [2025-04-14 18:05] Added progress tracking for Azure Blob Storage downloads
- [2025-04-14 18:05] Added comprehensive error handling and logging for Azure operations
- [2025-04-07 16:17] Added worker auto-restart mechanism with configurable retry limits and delays
- [2025-04-07 16:17] Added worker_watchdog.sh script to monitor worker processes and restart them if they crash
- [2025-04-07 16:18] Added init.d compatible script for the worker watchdog (Docker-friendly)
- [2025-04-07 16:24] Updated Dockerfile to include worker watchdog scripts and set them to start automatically

### Changed
- [2025-04-07 16:00] Updated worker script to check for worker_main.py as the primary entry point and fall back to worker.py if needed
- [2025-04-07 16:00] Updated process detection in worker script to also look for worker_main.py processes
