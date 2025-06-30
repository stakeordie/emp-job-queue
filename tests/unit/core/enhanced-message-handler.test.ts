// Enhanced Message Handler tests - comprehensive coverage of dynamic message routing
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EnhancedMessageHandler } from '@core/enhanced-message-handler';
import { MessageType } from '@core/types/messages';

describe('EnhancedMessageHandler', () => {
  let messageHandler: EnhancedMessageHandler;
  let mockRedisService: any;
  let mockConnectionManager: any;

  beforeEach(() => {
    // Create mocks
    mockRedisService = {
      submitJob: jest.fn(),
      updateJobProgress: jest.fn(),
      completeJob: jest.fn(),
      failJob: jest.fn(),
      cancelJob: jest.fn(),
      registerWorker: jest.fn(),
      updateWorkerStatus: jest.fn(),
      updateWorkerHeartbeat: jest.fn(),
      getJob: jest.fn(),
    };

    mockConnectionManager = {
      onWorkerMessage: jest.fn(),
      onClientMessage: jest.fn(),
      broadcastToWorkers: jest.fn(),
      broadcastToClients: jest.fn(),
      broadcastToMonitors: jest.fn(),
      sendToWorker: jest.fn(),
      sendToClient: jest.fn(),
      forwardJobCompletion: jest.fn(),
    };

    messageHandler = new EnhancedMessageHandler(mockRedisService, mockConnectionManager);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Dynamic Handler Registration', () => {
    it('should register custom message handlers', () => {
      const customHandler = jest.fn();
      const messageType = 'custom_message_type';

      messageHandler.registerHandler(messageType, customHandler);

      expect(messageHandler.hasHandler(messageType)).toBe(true);
      expect(messageHandler.getRegisteredHandlers()).toContain(messageType);
    });

    it('should unregister message handlers', () => {
      const customHandler = jest.fn();
      const messageType = 'custom_message_type';

      messageHandler.registerHandler(messageType, customHandler);
      expect(messageHandler.hasHandler(messageType)).toBe(true);

      messageHandler.unregisterHandler(messageType);
      expect(messageHandler.hasHandler(messageType)).toBe(false);
    });

    it('should handle custom message types', async () => {
      const customHandler = jest.fn();
      const messageType = 'custom_message';
      const testMessage = {
        type: messageType,
        timestamp: Date.now(),
        customData: 'test data',
      };

      messageHandler.registerHandler(messageType, customHandler);
      await messageHandler.handleMessage(testMessage);

      expect(customHandler).toHaveBeenCalledWith(testMessage);
    });

    it('should override default handlers when registered', async () => {
      const customHandler = jest.fn();
      const testMessage = {
        type: MessageType.SUBMIT_JOB,
        timestamp: Date.now(),
        job_type: 'test',
        priority: 50,
        payload: {},
      };

      // Register custom handler for job submission
      messageHandler.registerHandler(MessageType.SUBMIT_JOB, customHandler);
      await messageHandler.handleMessage(testMessage);

      expect(customHandler).toHaveBeenCalledWith(testMessage);
      expect(mockRedisService.submitJob).not.toHaveBeenCalled();
    });
  });

  describe('Default Message Handlers', () => {
    it('should have default handlers registered', () => {
      const handlers = messageHandler.getRegisteredHandlers();
      
      expect(handlers).toContain(MessageType.SUBMIT_JOB);
      expect(handlers).toContain(MessageType.UPDATE_JOB_PROGRESS);
      expect(handlers).toContain(MessageType.COMPLETE_JOB);
      expect(handlers).toContain(MessageType.REGISTER_WORKER);
      expect(handlers).toContain(MessageType.WORKER_HEARTBEAT);
    });

    it('should handle job submission messages', async () => {
      const message = {
        type: MessageType.SUBMIT_JOB,
        timestamp: Date.now(),
        job_type: 'text_to_image',
        priority: 100,
        payload: { prompt: 'test' },
        customer_id: 'test-customer',
      };

      mockRedisService.submitJob.mockResolvedValue('job-123');

      await messageHandler.handleMessage(message);

      expect(mockRedisService.submitJob).toHaveBeenCalledWith({
        service_required: 'text_to_image',
        priority: 100,
        payload: { prompt: 'test' },
        customer_id: 'test-customer',
        requirements: undefined,
        max_retries: 3,
      });
    });

    it('should handle worker registration messages', async () => {
      const message = {
        type: MessageType.REGISTER_WORKER,
        timestamp: Date.now(),
        worker_id: 'worker-123',
        capabilities: {
          services: ['text_to_image'],
          hardware: { gpu_memory_gb: 8 },
        },
      };

      await messageHandler.handleMessage(message);

      expect(mockRedisService.registerWorker).toHaveBeenCalledWith(message.capabilities);
      expect(mockConnectionManager.sendToWorker).toHaveBeenCalledWith(
        'worker-123',
        expect.objectContaining({
          type: MessageType.WORKER_REGISTERED,
          worker_id: 'worker-123',
          status: 'registered',
        })
      );
    });

    it('should handle job progress updates', async () => {
      const message = {
        type: MessageType.UPDATE_JOB_PROGRESS,
        timestamp: Date.now(),
        job_id: 'job-123',
        worker_id: 'worker-123',
        progress: 50,
        status: 'in_progress',
        message: 'Processing...',
      };

      await messageHandler.handleMessage(message);

      expect(mockRedisService.updateJobProgress).toHaveBeenCalledWith(
        'job-123',
        expect.objectContaining({
          job_id: 'job-123',
          worker_id: 'worker-123',
          progress: 50,
          status: 'in_progress',
          message: 'Processing...',
        })
      );
      expect(mockConnectionManager.broadcastToMonitors).toHaveBeenCalledWith(message);
    });
  });

  describe('Unknown Message Handling', () => {
    it('should handle unknown message types gracefully', async () => {
      const message = {
        type: 'unknown_message_type',
        timestamp: Date.now(),
        source: 'test-client',
      };

      await messageHandler.handleMessage(message);

      expect(mockConnectionManager.sendToClient).toHaveBeenCalledWith(
        'test-client',
        expect.objectContaining({
          type: MessageType.ERROR,
          error: 'Unknown message type: unknown_message_type',
        })
      );
    });

    it('should not crash on unknown message types', async () => {
      const message = {
        type: 'completely_unknown',
        timestamp: Date.now(),
      };

      await expect(messageHandler.handleMessage(message)).resolves.not.toThrow();
    });
  });

  describe('Message Context Handling', () => {
    it('should handle worker messages with context', async () => {
      const message = {
        type: MessageType.WORKER_HEARTBEAT,
        timestamp: Date.now(),
        worker_id: 'worker-123',
      };

      await messageHandler.handleWorkerMessage('worker-123', message);

      expect(message.source).toBe('worker-123');
      expect(mockRedisService.updateWorkerHeartbeat).toHaveBeenCalledWith(
        'worker-123',
        undefined
      );
    });

    it('should handle client messages with context', async () => {
      const message = {
        type: MessageType.SUBMIT_JOB,
        timestamp: Date.now(),
        job_type: 'test',
        priority: 50,
        payload: {},
      };

      mockRedisService.submitJob.mockResolvedValue('job-123');

      await messageHandler.handleClientMessage('client-123', message);

      expect(message.source).toBe('client-123');
      expect(mockRedisService.submitJob).toHaveBeenCalled();
    });
  });

  describe('Event Callbacks', () => {
    it('should notify message received callbacks', async () => {
      const callback = jest.fn();
      messageHandler.onMessageReceived(callback);

      const message = {
        type: MessageType.ACK,
        timestamp: Date.now(),
      };

      await messageHandler.handleMessage(message);

      expect(callback).toHaveBeenCalledWith(message);
    });

    it('should notify error callbacks on message failure', async () => {
      const errorCallback = jest.fn();
      messageHandler.onMessageError(errorCallback);

      const message = {
        type: MessageType.SUBMIT_JOB,
        timestamp: Date.now(),
        job_type: 'test',
        priority: 50,
        payload: {},
      };

      mockRedisService.submitJob.mockRejectedValue(new Error('Redis error'));

      await expect(messageHandler.handleMessage(message)).rejects.toThrow('Redis error');
      expect(errorCallback).toHaveBeenCalledWith(
        expect.any(Error),
        message
      );
    });
  });

  describe('Statistics', () => {
    it('should track message statistics', async () => {
      const message1 = { type: MessageType.ACK, timestamp: Date.now() };
      const message2 = { type: MessageType.ACK, timestamp: Date.now() };
      const message3 = { type: MessageType.ERROR, timestamp: Date.now(), error: 'test' };

      await messageHandler.handleMessage(message1);
      await messageHandler.handleMessage(message2);
      await messageHandler.handleMessage(message3);

      const stats = await messageHandler.getMessageStatistics();

      expect(stats.messages_processed).toBe(3);
      expect(stats.message_types[MessageType.ACK]).toBe(2);
      expect(stats.message_types[MessageType.ERROR]).toBe(1);
      expect(stats.messages_per_second).toBeGreaterThan(0);
    });

    it('should reset statistics', async () => {
      const message = { type: MessageType.ACK, timestamp: Date.now() };
      await messageHandler.handleMessage(message);

      let stats = await messageHandler.getMessageStatistics();
      expect(stats.messages_processed).toBe(1);

      await messageHandler.resetStatistics();
      stats = await messageHandler.getMessageStatistics();
      expect(stats.messages_processed).toBe(0);
    });
  });

  describe('Message Validation and Serialization', () => {
    it('should validate messages', async () => {
      const validMessage = {
        type: 'test',
        timestamp: Date.now(),
      };

      const invalidMessage = {
        timestamp: Date.now(),
        // missing type
      };

      expect(await messageHandler.validateMessage(validMessage)).toBe(true);
      expect(await messageHandler.validateMessage(invalidMessage)).toBe(false);
    });

    it('should parse and serialize messages', async () => {
      const message = {
        type: 'test',
        timestamp: Date.now(),
        data: 'test data',
      };

      const serialized = await messageHandler.serializeMessage(message);
      const parsed = await messageHandler.parseMessage(serialized);

      expect(parsed).toEqual(message);
    });

    it('should handle invalid JSON gracefully', async () => {
      const result = await messageHandler.parseMessage('invalid json');
      expect(result).toBeNull();
    });
  });
});