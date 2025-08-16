#!/usr/bin/env python3
"""
GPU Information Utility
Simple script to get comprehensive GPU information at runtime
"""

import json
import sys
import subprocess
from typing import Dict, List, Any

def get_nvidia_smi_info() -> Dict[str, Any]:
    """Get GPU info using nvidia-smi command"""
    try:
        result = subprocess.run([
            'nvidia-smi', '--query-gpu=index,name,memory.total,memory.used,memory.free,utilization.gpu,utilization.memory,temperature.gpu,power.draw,power.limit',
            '--format=csv,noheader,nounits'
        ], capture_output=True, text=True, check=True)
        
        gpus = []
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                parts = [p.strip() for p in line.split(',')]
                if len(parts) >= 10:
                    gpus.append({
                        'index': int(parts[0]),
                        'name': parts[1],
                        'memory_total_mb': int(parts[2]),
                        'memory_used_mb': int(parts[3]),
                        'memory_free_mb': int(parts[4]),
                        'utilization_gpu_percent': int(parts[5]),
                        'utilization_memory_percent': int(parts[6]),
                        'temperature_c': int(parts[7]) if parts[7] != 'N/A' else None,
                        'power_draw_w': float(parts[8]) if parts[8] != 'N/A' else None,
                        'power_limit_w': float(parts[9]) if parts[9] != 'N/A' else None
                    })
        
        return {'gpus': gpus, 'count': len(gpus)}
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return {'gpus': [], 'count': 0, 'error': 'nvidia-smi not available'}

def get_nvml_info() -> Dict[str, Any]:
    """Get GPU info using nvidia-ml-py3 (more detailed)"""
    try:
        import pynvml
        pynvml.nvmlInit()
        
        device_count = pynvml.nvmlDeviceGetCount()
        gpus = []
        
        for i in range(device_count):
            handle = pynvml.nvmlDeviceGetHandleByIndex(i)
            
            # Basic info
            name = pynvml.nvmlDeviceGetName(handle).decode('utf-8')
            
            # Memory info
            mem_info = pynvml.nvmlDeviceGetMemoryInfo(handle)
            
            # Utilization
            try:
                util = pynvml.nvmlDeviceGetUtilizationRates(handle)
                gpu_util = util.gpu
                mem_util = util.memory
            except:
                gpu_util = None
                mem_util = None
            
            # Temperature
            try:
                temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
            except:
                temp = None
            
            # Power
            try:
                power = pynvml.nvmlDeviceGetPowerUsage(handle) / 1000.0  # Convert mW to W
            except:
                power = None
            
            try:
                power_limit = pynvml.nvmlDeviceGetPowerManagementLimitConstraints(handle)[1] / 1000.0
            except:
                power_limit = None
            
            # Compute capability
            try:
                major, minor = pynvml.nvmlDeviceGetCudaComputeCapability(handle)
                compute_capability = f"{major}.{minor}"
            except:
                compute_capability = None
            
            gpus.append({
                'index': i,
                'name': name,
                'memory_total_mb': mem_info.total // 1024 // 1024,
                'memory_used_mb': mem_info.used // 1024 // 1024,
                'memory_free_mb': mem_info.free // 1024 // 1024,
                'utilization_gpu_percent': gpu_util,
                'utilization_memory_percent': mem_util,
                'temperature_c': temp,
                'power_draw_w': power,
                'power_limit_w': power_limit,
                'compute_capability': compute_capability
            })
        
        return {'gpus': gpus, 'count': device_count}
    except Exception as e:
        return {'gpus': [], 'count': 0, 'error': f'NVML error: {str(e)}'}

def main():
    """Main function - outputs JSON with GPU information"""
    if len(sys.argv) > 1 and sys.argv[1] == '--simple':
        # Simple mode: just count and basic info
        info = get_nvidia_smi_info()
        simple_info = {
            'gpu_count': info['count'],
            'gpus_available': info['count'] > 0,
            'gpu_names': [gpu['name'] for gpu in info.get('gpus', [])]
        }
        print(json.dumps(simple_info, indent=2))
    else:
        # Detailed mode: try NVML first, fallback to nvidia-smi
        nvml_info = get_nvml_info()
        if nvml_info['count'] > 0:
            print(json.dumps(nvml_info, indent=2))
        else:
            smi_info = get_nvidia_smi_info()
            print(json.dumps(smi_info, indent=2))

if __name__ == '__main__':
    main()