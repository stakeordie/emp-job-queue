#!/bin/bash
set -euo pipefail

# =====================================================
# EMP Base Entrypoint - Common Foundation
# =====================================================
# Purpose: Common functionality for all EMP services
# Gold Standard: Machine service telemetry approach
# Pattern: Parent script for inheritance
# =====================================================

# Color codes for better logging
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# =====================================================
# Common Logging Functions (from machine gold standard)
# =====================================================
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_section() {
    echo -e "\n${BLUE}========================================${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}========================================${NC}\n"
}

# =====================================================
# Environment Decryption (for Docker containers)
# =====================================================
decrypt_environment() {
    log_section "Environment Decryption"
    
    local encrypted_file="/service-manager/env.encrypted"
    local target_env_file="/service-manager/.env"
    
    # Check if encryption is disabled
    if [ "${DISABLE_ENV_ENCRYPTION:-false}" = "true" ]; then
        log_info "Environment encryption disabled via DISABLE_ENV_ENCRYPTION=true"
        return 0
    fi
    
    # Check if encrypted file exists
    if [ ! -f "$encrypted_file" ]; then
        log_warn "No encrypted environment file found at $encrypted_file"
        return 0
    fi
    
    # Check if decryption key is provided
    if [ -z "${EMP_ENV_DECRYPT_KEY:-}" ]; then
        log_error "❌ EMP_ENV_DECRYPT_KEY environment variable is required for decryption"
        log_error "💡 Set EMP_ENV_DECRYPT_KEY in your Docker run command or compose file"
        log_error "💡 Or set DISABLE_ENV_ENCRYPTION=true to skip decryption"
        return 1
    fi
    
    log_info "Decrypting environment variables..."
    
    # Use Node.js for decryption (matches prepare-docker-build.js encryption)
    node -e "
    const crypto = require('crypto');
    const zlib = require('zlib');
    const fs = require('fs');
    
    try {
        // Read encrypted data
        const encryptedData = fs.readFileSync('$encrypted_file', 'utf8');
        const encryptedBuffer = Buffer.from(encryptedData, 'base64');
        
        // Get decryption key and hash it to 32 bytes (matches encryption)
        const keyString = process.env.EMP_ENV_DECRYPT_KEY;
        let keyBuffer;
        try {
            keyBuffer = Buffer.from(keyString, 'base64');
            if (keyBuffer.length !== 32) throw new Error('Invalid key length');
        } catch (e) {
            keyBuffer = crypto.createHash('sha256').update(keyString).digest();
        }
        
        // Extract encrypted data and HMAC (last 32 bytes)
        const encrypted = encryptedBuffer.slice(0, -32);
        const receivedHmac = encryptedBuffer.slice(-32);
        
        // Verify HMAC
        const hmac = crypto.createHmac('sha256', keyBuffer);
        hmac.update(encrypted);
        const computedHmac = hmac.digest();
        
        if (!crypto.timingSafeEqual(receivedHmac, computedHmac)) {
            throw new Error('HMAC verification failed - invalid decryption key');
        }
        
        // Extract IV and encrypted data
        const iv = encrypted.slice(0, 16);
        const ciphertext = encrypted.slice(16);
        
        // Decrypt with AES-256-CBC
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
        const compressedData = Buffer.concat([
            decipher.update(ciphertext),
            decipher.final()
        ]);
        
        // Decompress
        const jsonString = zlib.gunzipSync(compressedData).toString('utf8');
        const envVars = JSON.parse(jsonString);
        
        // Convert to .env format
        let envContent = '';
        for (const [key, value] of Object.entries(envVars)) {
            envContent += \`\${key}=\${value}\n\`;
        }
        
        // Write decrypted .env file
        fs.writeFileSync('$target_env_file', envContent);
        console.log(\`✅ Decrypted \${Object.keys(envVars).length} environment variables\`);
        
    } catch (error) {
        console.error('❌ Decryption failed:', error.message);
        process.exit(1);
    }
    " || {
        log_error "❌ Environment decryption failed"
        return 1
    }
    
    log_info "✅ Environment variables decrypted to $target_env_file"
}

# =====================================================
# Common Environment Setup
# =====================================================
base_setup_environment() {
    log_section "Base Environment Setup"
    
    # First, try to decrypt environment if encrypted file exists
    decrypt_environment || return 1
    
    # Core environment variables (from machine gold standard)
    export NODE_ENV=${NODE_ENV:-production}
    export LOG_LEVEL=${LOG_LEVEL:-info}
    
    # Telemetry environment variables (required by unified telemetry client)
    export TELEMETRY_ENV=${TELEMETRY_ENV:-development}
    export SERVICE_NAME=${SERVICE_NAME:-emp-service}
    export SERVICE_VERSION=${SERVICE_VERSION:-1.0.0}
    
    # Load decrypted environment variables
    if [ -f "/service-manager/.env" ]; then
        log_info "Loading environment from /service-manager/.env"
        set -a
        . /service-manager/.env
        set +a
    else
        log_warn "No .env file found after decryption"
    fi
    
    log_info "✅ Base environment configured"
}

# =====================================================
# Common Directory Setup
# =====================================================
base_setup_directories() {
    log_section "Base Directory Setup"
    
    # Common directories all services need
    mkdir -p logs tmp
    
    log_info "✅ Base directories created"
}

# =====================================================
# Common Health Check
# =====================================================
base_health_check() {
    log_section "Base Health Check"
    
    # Check Node.js availability (all services need this)
    if ! command -v node >/dev/null 2>&1; then
        log_error "❌ Node.js not found"
        return 1
    fi
    
    log_info "✅ Base health checks passed"
}

# =====================================================
# Enhanced TelemetryClient Message (Machine Gold Standard)
# =====================================================
base_telemetry_message() {
    # This is the machine's gold standard telemetry approach
    log_info "🔧 Enhanced TelemetryClient will start ALL telemetry processes during Node.js startup"
    log_info "🔧 This includes: nginx proxy + OTEL Collector + Fluent Bit"
}

# =====================================================
# Common Cleanup Function (from machine)
# =====================================================
base_cleanup() {
    log_warn "Received shutdown signal, cleaning up..."
    
    # Stop Node.js service if running (common to all)
    if [[ -n "${NODE_PID:-}" ]] && kill -0 $NODE_PID 2>/dev/null; then
        log_info "Stopping Node.js service..."
        kill -TERM $NODE_PID 2>/dev/null || true
        wait $NODE_PID 2>/dev/null || true
    fi
    
    log_info "Base cleanup complete"
}

# =====================================================
# Base Main Function Template
# =====================================================
# Services should override this but can call base_main_setup for common parts
base_main_setup() {
    local service_name="$1"
    local version="$2"
    
    log_section "EMP $service_name Starting"
    log_info "Entrypoint script version: $version"
    log_info "Build date: ${BUILD_DATE:-unknown}"
    log_info "Runtime: $(date '+%Y-%m-%d %H:%M:%S')"
}

# =====================================================
# Signal Handlers (from machine)
# =====================================================
setup_signal_handlers() {
    trap 'cleanup' SIGTERM SIGINT
}

# =====================================================
# Default implementations (services can override)
# =====================================================
setup_environment() {
    base_setup_environment
}

setup_directories() {
    base_setup_directories
}

perform_health_check() {
    base_health_check
}

cleanup() {
    base_cleanup
}

# Services must implement start_application
start_application() {
    log_error "start_application must be implemented by the service"
    exit 1
}