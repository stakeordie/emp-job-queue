# API Machine - Extends base machine with API connectors
FROM apps/machine-base:latest

# Build args for layer cache control
ARG API_BUST=0
RUN echo "API cache bust: $API_BUST" > /dev/null

# Install API-specific dependencies (changes infrequently)
RUN apt-get update && apt-get install -y --no-install-recommends \
    # For API integrations
    curl \
    wget \
    jq \
    # For image processing (lighter than GPU version)
    python3-pil \
    python3-requests \
    # For video processing (if needed)
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages for API processing (no GPU dependencies)
RUN pip3 install --no-cache-dir \
    # Core packages
    requests \
    pillow \
    numpy \
    pyyaml \
    # API client libraries
    openai \
    replicate \
    # Utility packages
    python-dotenv \
    aiohttp \
    httpx

# Install Node.js packages for API connectors
COPY api-connectors/package.json /workspace/api-connectors/
WORKDIR /workspace/api-connectors
RUN npm install --production

# Copy API connector implementations
COPY api-connectors/ /workspace/api-connectors/
COPY api-services/ /service-manager/src/api-services/

# Copy API-specific configurations
COPY api-config/ /workspace/api-config/

# Set machine type for API machine
ENV MACHINE_TYPE=api
ENV MACHINE_ENABLE_API=true
ENV MACHINE_ENABLE_REDIS_WORKERS=true
ENV API_WORKER_COUNT=2

# API-specific environment variables (with defaults)
ENV OPENAI_API_KEY=""
ENV OPENAI_BASE_URL="https://api.openai.com/v1"
ENV OPENAI_MAX_CONCURRENT_JOBS=2

ENV REPLICATE_API_TOKEN=""
ENV REPLICATE_BASE_URL="https://api.replicate.com/v1"
ENV REPLICATE_MAX_CONCURRENT_JOBS=2

ENV RUNPOD_API_KEY=""
ENV RUNPOD_BASE_URL="https://api.runpod.ai/v2"
ENV RUNPOD_MAX_CONCURRENT_JOBS=2

# API machine health check (no GPU required)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:9090/health || exit 1

WORKDIR /workspace
CMD ["node", "src/index.js"]