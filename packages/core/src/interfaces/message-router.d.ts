import { BaseMessage, MessageType } from '../types/messages.js';
export interface MessageRouterInterface {
    start(): Promise<void>;
    stop(): Promise<void>;
    isRunning(): boolean;
    routeMessage(message: BaseMessage): Promise<void>;
    routeToWorkers(message: BaseMessage, workerIds?: string[]): Promise<number>;
    routeToClients(message: BaseMessage, clientIds?: string[]): Promise<number>;
    routeToMonitors(message: BaseMessage): Promise<number>;
    routeToSpecificTarget(targetId: string, targetType: 'worker' | 'client' | 'monitor', message: BaseMessage): Promise<boolean>;
    publishMessage(channel: string, message: BaseMessage): Promise<void>;
    subscribeToChannel(channel: string, callback: (message: BaseMessage) => void): Promise<void>;
    unsubscribeFromChannel(channel: string): Promise<void>;
    getActiveSubscriptions(): string[];
    addMessageFilter(messageType: MessageType, filter: MessageFilter): void;
    removeMessageFilter(messageType: MessageType, filterId: string): void;
    addMessageTransformer(messageType: MessageType, transformer: MessageTransformer): void;
    removeMessageTransformer(messageType: MessageType, transformerId: string): void;
    addRoutingRule(rule: RoutingRule): void;
    removeRoutingRule(ruleId: string): void;
    getRoutingRules(): RoutingRule[];
    updateRoutingRule(ruleId: string, rule: Partial<RoutingRule>): void;
    queueMessage(message: BaseMessage, priority?: number): Promise<void>;
    processMessageQueue(): Promise<number>;
    getQueueSize(): Promise<number>;
    clearMessageQueue(): Promise<number>;
    handleRoutingError(message: BaseMessage, error: Error): Promise<void>;
    getDeadLetterQueue(): Promise<BaseMessage[]>;
    reprocessDeadLetterMessage(messageId: string): Promise<boolean>;
    clearDeadLetterQueue(): Promise<number>;
    getRoutingStatistics(): Promise<{
        messages_routed: number;
        messages_failed: number;
        messages_queued: number;
        messages_dead_letter: number;
        routes_active: number;
        channels_subscribed: number;
        routing_latency_ms: number;
    }>;
    getChannelStatistics(): Promise<Record<string, {
        subscribers: number;
        messages_published: number;
        messages_received: number;
        last_activity: string;
    }>>;
    onMessageRouted(callback: (message: BaseMessage, route: string) => void): void;
    onRoutingError(callback: (message: BaseMessage, error: Error) => void): void;
    onChannelSubscribed(callback: (channel: string) => void): void;
    onChannelUnsubscribed(callback: (channel: string) => void): void;
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
    operator: 'equals' | 'not_equals' | 'contains' | 'not_contains' | 'regex' | 'exists' | 'not_exists';
    value: any;
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
//# sourceMappingURL=message-router.d.ts.map