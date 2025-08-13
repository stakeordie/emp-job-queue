# Calyptia Fluentd Installation - Working Version
FROM ubuntu:20.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive

# Install required packages for Calyptia Fluentd
RUN apt-get update && \
    apt-get install -y \
    curl \
    sudo \
    gnupg \
    lsb-release \
    apt-transport-https \
    ca-certificates \
    gettext-base \
    && rm -rf /var/lib/apt/lists/*

# Create directories 
RUN mkdir -p /var/log/calyptia-fluentd

# Install Calyptia Fluentd first (without our config file present)
RUN curl -fsSL https://calyptia-fluentd.s3.us-east-2.amazonaws.com/calyptia-fluentd-1-ubuntu-focal.sh | sh

# Build-time environment variables for config generation
ARG ENV=dev
ARG DASH0_API_KEY
ARG DASH0_DATASET
ARG DASH0_LOGS_ENDPOINT

# Set environment variables for envsubst
ENV ENV=${ENV}
ENV DASH0_API_KEY=${DASH0_API_KEY}
ENV DASH0_DATASET=${DASH0_DATASET}
ENV DASH0_LOGS_ENDPOINT=${DASH0_LOGS_ENDPOINT}

# Copy template and generate static config at build time
COPY calyptia-fluentd.conf.template /tmp/calyptia-fluentd.conf.template
RUN envsubst < /tmp/calyptia-fluentd.conf.template > /etc/calyptia-fluentd/calyptia-fluentd.conf && \
    rm /tmp/calyptia-fluentd.conf.template

# Copy and setup entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose ports
# 8888 - HTTP input 
# 24220 - Monitoring
EXPOSE 8888 24220

# Use entrypoint script
ENTRYPOINT ["/entrypoint.sh"]