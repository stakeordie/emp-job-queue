#!/usr/bin/env node

/**
 * Simple Hello World server for testing
 */

import { createServer } from 'http';

const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Basic Machine - Hello World</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .status { 
            padding: 10px; 
            margin: 10px 0; 
            border-radius: 5px; 
        }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .warning { background: #fff3cd; color: #856404; border: 1px solid #ffeaa7; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background: #d1ecf1; color: #0c5460; border: 1px solid #bee5eb; }
        pre { background: #f8f9fa; padding: 15px; border-radius: 5px; overflow-x: auto; }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Basic Machine - Hello World</h1>
        
        <div class="status success">
            <strong>✅ Server Status:</strong> Running on port 1111
        </div>
        
        <div class="status info">
            <strong>📋 Current Issues:</strong>
            <ul>
                <li>ComfyUI installation missing (expected - this is Sprint 3-5)</li>
                <li>Health server not starting due to ComfyUI dependency</li>
                <li>This is normal for current development phase</li>
            </ul>
        </div>
        
        <h2>🔧 Development Status</h2>
        <div class="status warning">
            <strong>Sprint 2 Completed:</strong> Worker Health Integration<br>
            <strong>Next:</strong> ComfyUI Installation (Sprint 3-5)
        </div>
        
        <h2>📊 Expected Service Endpoints</h2>
        <ul>
            <li><strong>Health Server:</strong> <a href="http://localhost:9090/health">http://localhost:9090/health</a> <span style="color: red;">(Not working - ComfyUI dependency)</span></li>
            <li><strong>ComfyUI:</strong> <a href="http://localhost:3190">http://localhost:3190</a> <span style="color: red;">(Not installed)</span></li>
            <li><strong>This Server:</strong> <a href="http://localhost:1111">http://localhost:1111</a> <span style="color: green;">(Working)</span></li>
        </ul>
        
        <h2>🐳 Docker Container Info</h2>
        <pre>Container: basic-machine-local
Environment: Development (.env.local.dev)
ComfyUI Status: Not installed (expected)
Health Server: Disabled due to ComfyUI dependency</pre>

        <h2>🛠️ Quick Fixes</h2>
        <div class="status info">
            <strong>To test health server independently:</strong><br>
            <code>node test-worker-health.js</code><br>
            <code>node test-comfyui-connector.js</code>
        </div>
        
        <div class="status info">
            <strong>To skip ComfyUI and test health server only:</strong><br>
            Set <code>ENABLE_COMFYUI=false</code> in .env.local.dev
        </div>
        
        <p><em>Generated at: ${new Date().toISOString()}</em></p>
    </div>
</body>
</html>
`;

const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(html);
});

const port = 1111;
server.listen(port, () => {
    console.log(`🚀 Hello World server running at http://localhost:${port}`);
    console.log(`📊 Server started at: ${new Date().toISOString()}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Shutting down Hello World server...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('\n👋 Received SIGTERM, shutting down...');
    server.close(() => {
        console.log('✅ Server stopped');
        process.exit(0);
    });
});