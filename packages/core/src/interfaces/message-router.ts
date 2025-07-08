// Message Router Interface - direct port from Python core/interfaces/message_router_interface.py
// Defines contract for message routing and pub/sub operations

import { BaseMessage, MessageType } from '../types/messages.js';

export interface MessageRouterInterface {
  // Router lifecycle
  start(): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;

  // Message routing
  routeMessage(message: BaseMessage): Promise<void>;
  routeToWorkers(message: BaseMessage, workerIds?: string[]): Promise<number>;
  routeToClients(message: BaseMessage, clientIds?: string[]): Promise<number>;
  routeToMonitors(message: BaseMessage): Promise<number>;
  routeToSpecificTarget(
    targetId: string,
    targetType: 'worker' | 'client' | 'monitor',
    message: BaseMessage
  ): Promise<boolean>;

  // Pub/Sub operations
  publishMessage(channel: string, message: BaseMessage): Promise<void>;
  subscribeToChannel(channel: string, callback: (message: BaseMessage) => void): Promise<void>;
  unsubscribeFromChannel(channel: string): Promise<void>;
  getActiveSubscriptions(): string[];

  // Message filtering and transformation
  addMessageFilter(messageType: MessageType, filter: MessageFilter): void;
  removeMessageFilter(messageType: MessageType, filterId: string): void;
  addMessageTransformer(messageType: MessageType, transformer: MessageTransformer): void;
  removeMessageTransformer(messageType: MessageType, transformerId: string): void;

  // Routing rules
  addRoutingRule(rule: RoutingRule): void;
  removeRoutingRule(ruleId: string): void;
  getRoutingRules(): RoutingRule[];
  updateRoutingRule(ruleId: string, rule: Partial<RoutingRule>): void;

  // Message queue management
  queueMessage(message: BaseMessage, priority?: number): Promise<void>;
  processMessageQueue(): Promise<number>;
  getQueueSize(): Promise<number>;
  clearMessageQueue(): Promise<number>;

  // Error handling and dead letter queue
  handleRoutingError(message: BaseMessage, error: Error): Promise<void>;
  getDeadLetterQueue(): Promise<BaseMessage[]>;
  reprocessDeadLetterMessage(messageId: string): Promise<boolean>;
  clearDeadLetterQueue(): Promise<number>;

  // Statistics and monitoring
  getRoutingStatistics(): Promise<{
    messages_routed: number;
    messages_failed: number;
    messages_queued: number;
    messages_dead_letter: number;
    routes_active: number;
    channels_subscribed: number;
    routing_latency_ms: number;
  }>;

  getChannelStatistics(): Promise<
    Record<
      string,
      {
        subscribers: number;
        messages_published: number;
        messages_received: number;
        last_activity: string;
      }
    >
  >;

  // Event hooks
  onMessageRouted(callback: (message: BaseMessage, route: string) => void): void;
  onRoutingError(callback: (message: BaseMessage, error: Error) => void): void;
  onChannelSubscribed(callback: (channel: string) => void): void;
  onChannelUnsubscribed(callback: (channel: string) => void): void;

  // Configuration
  setRoutingTimeout(timeoutMs: number): void;
  setMaxQueueSize(maxSize: number): void;
  setDeadLetterRetentionHours(hours: number): void;
  getConfiguration(): MessageRouterConfig;
}

export interface MessageFilter {
  id: string;
  name: string;
  condition: (message: BaseMessage) => boolean;
  action: 'allow' | 'deny' | 'modify';
  priority: number;
  enabled: boolean;
}

export interface MessageTransformer {
  id: string;
  name: string;
  transform: (message: BaseMessage) => BaseMessage | Promise<BaseMessage>;
  priority: number;
  enabled: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  messageTypes: MessageType[];
  sourceTypes: ('worker' | 'client' | 'hub' | 'system')[];
  targetTypes: ('worker' | 'client' | 'monitor' | 'redis')[];
  conditions: RoutingCondition[];
  actions: RoutingAction[];
  priority: number;
  enabled: boolean;
}

export interface RoutingCondition {
  field: string;
  operator:
    | 'equals'
    | 'not_equals'
    | 'contains'
    | 'not_contains'
    | 'regex'
    | 'exists'
    | 'not_exists';
  value;
  caseSensitive?: boolean;
}

export interface RoutingAction {
  type: 'route' | 'filter' | 'transform' | 'log' | 'alert';
  target?: string;
  parameters?: Record<string, unknown>;
}

export interface MessageRouterConfig {
  routingTimeoutMs: number;
  maxQueueSize: number;
  deadLetterRetentionHours: number;
  enableBatching: boolean;
  batchSize: number;
  batchTimeoutMs: number;
  enableMetrics: boolean;
  metricsIntervalMs: number;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
