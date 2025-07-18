#!/usr/bin/env python3
# Added: 2025-04-14T18:45:00-04:00 - Model loader for Automatic1111
# Updated: 2025-05-29T22:18:28-04:00 - Added port parameter for multi-GPU support

import argparse
import requests  # type: ignore
import json
import sys

parser = argparse.ArgumentParser(description='Load a model into Automatic1111')
parser.add_argument('-m', '--model', type=str, required=True, help='Model name')
parser.add_argument('-p', '--port', type=int, default=3001, help='Port for Automatic1111 API (default: 3001)')
parser.add_argument('-g', '--gpu', type=int, help='GPU ID (alternative to specifying port directly)')
args = parser.parse_args()

# Determine the port to use
port = args.port
if args.gpu is not None:
    # If GPU ID is provided, calculate port based on base port (3001) + GPU ID
    port = 3001 + args.gpu
    print(f"Using calculated port {port} for GPU {args.gpu}")

try:
    url = f"http://localhost:{port}/sdapi/v1/options"
    print(f"Connecting to Automatic1111 API at {url}")
    response = requests.get(url, timeout=10)
    response.raise_for_status()  # Raise exception for 4XX/5XX responses
    
    options = json.loads(response.text)
    options["sd_model_checkpoint"] = args.model
    
    post_response = requests.post(url, json=options, timeout=10)
    post_response.raise_for_status()
    
    print(f"Successfully loaded model: {args.model} on port {port}")
    sys.exit(0)
except Exception as e:
    print(f"ERROR: Failed to load model: {e}", file=sys.stderr)
    sys.exit(1)
