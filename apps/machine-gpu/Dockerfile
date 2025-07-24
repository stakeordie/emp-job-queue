# GPU Machine - Extends base machine with ComfyUI and GPU support
FROM apps/machine-base:latest

# Build args for layer cache control
ARG GPU_BUST=0
RUN echo "GPU cache bust: $GPU_BUST" > /dev/null

# NVIDIA Runtime support
ENV NVIDIA_VISIBLE_DEVICES all
ENV NVIDIA_DRIVER_CAPABILITIES compute,utility

# Install CUDA toolkit and GPU dependencies (changes infrequently)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # GPU monitoring tools
    nvidia-ml-py \
    # Python packages for GPU acceleration
    python3-dev \
    python3-pip \
    # System dependencies for ComfyUI
    wget \
    curl \
    git \
    libgl1-mesa-glx \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    # Image processing libraries
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies for ComfyUI (changes infrequently)
RUN pip3 install --no-cache-dir \
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118 \
    opencv-python \
    pillow \
    numpy \
    requests \
    pyyaml \
    safetensors \
    transformers \
    diffusers \
    accelerate \
    xformers

# Create ComfyUI directories
RUN mkdir -p /workspace/ComfyUI \
    /workspace/ComfyUI/models \
    /workspace/ComfyUI/models/checkpoints \
    /workspace/ComfyUI/models/loras \
    /workspace/ComfyUI/models/vae \
    /workspace/ComfyUI/models/controlnet \
    /workspace/ComfyUI/models/upscale_models \
    /workspace/ComfyUI/input \
    /workspace/ComfyUI/output \
    /workspace/ComfyUI/custom_nodes \
    /workspace/ComfyUI/logs

# Clone ComfyUI (changes occasionally)
WORKDIR /workspace/ComfyUI
RUN git clone https://github.com/comfyanonymous/ComfyUI.git . && \
    pip3 install --no-cache-dir -r requirements.txt

# Copy ComfyUI configuration and custom nodes installer
COPY comfyui-config/ /workspace/ComfyUI/
COPY comfyui-installer.js /workspace/

# Install custom nodes (can be cached if config doesn't change)
ARG CUSTOM_NODES_BUST=0
RUN echo "Custom nodes cache bust: $CUSTOM_NODES_BUST" > /dev/null
RUN node /workspace/comfyui-installer.js

# Copy GPU-specific service configurations
COPY gpu-services/ /service-manager/src/gpu-services/

# Set machine type for GPU machine
ENV MACHINE_TYPE=gpu
ENV MACHINE_ENABLE_COMFYUI=true
ENV MACHINE_ENABLE_REDIS_WORKERS=true

# GPU-specific health check (checks GPU availability)
HEALTHCHECK --interval=30s --timeout=15s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:9090/health && nvidia-smi > /dev/null || exit 1

# Default GPU count (can be overridden)
ENV MACHINE_NUM_GPUS=1

WORKDIR /workspace
CMD ["node", "src/index.js"]