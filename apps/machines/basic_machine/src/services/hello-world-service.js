import { BaseService } from './base-service.js';
import { createServer } from 'http';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('hello-world');

export default class HelloWorldService extends BaseService {
  constructor(options = {}) {
    super('hello-world', options);
    this.port = options.port || 1111;
    this.server = null;
  }

  async onStart() {
    logger.info(`Starting Hello World server on port ${this.port}`);
    
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Basic Machine - Hello World</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .success { background: #d4edda; color: #155724; padding: 15px; border-radius: 5px; }
        h1 { color: #28a745; }
    </style>
</head>
<body>
    <h1>🚀 Hello World from Basic Machine!</h1>
    <div class="success">
        <strong>✅ Success!</strong> Port opening works on Docker container.
    </div>
    <p><strong>Container:</strong> basic-machine-local</p>
    <p><strong>Port:</strong> ${this.port}</p>
    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
</body>
</html>
    `;

    this.server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          logger.info(`Hello World server listening on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  async onStop() {
    logger.info('Stopping Hello World server...');
    
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('Hello World server stopped');
          resolve();
        });
      });
    }
  }

  async onHealthCheck() {
    return this.server && this.server.listening;
  }
}