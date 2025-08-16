// Base Log Interpreter - Intelligent log analysis and user-friendly feedback translation
// Provides framework for service-specific log interpretation with pattern matching

export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface InterpretedMessage {
  // User-friendly information
  userMessage: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  category: 'progress' | 'resource' | 'validation' | 'service' | 'system';

  // Actionable information
  suggestedAction?: string;
  documentationUrl?: string;
  retryRecommended?: boolean;

  // Technical context (for debugging)
  originalMessage?: string;
  errorCode?: string;
  technicalDetails?: Record<string, unknown>;

  // Progress context
  progressImpact?: {
    shouldUpdateProgress?: boolean;
    newProgressPercent?: number;
    estimatedTimeRemaining?: number;
  };
}

export interface PatternMatchResult {
  matched: boolean;
  confidence: number; // 0-1
  interpretation?: InterpretedMessage;
}

export interface LogPattern {
  id: string;
  name: string;
  description: string;
  pattern: RegExp | ((message: string) => boolean);
  confidence: number;
  interpreter: (match: RegExpMatchArray | string, context?: LogContext) => InterpretedMessage;
}

export interface LogContext {
  jobId?: string;
  serviceType: string;
  connectorId: string;
  currentStep?: string;
  progressPercent?: number;
  metadata?: Record<string, unknown>;
}

export abstract class BaseLogInterpreter {
  protected patterns: Map<string, LogPattern> = new Map();
  protected serviceType: string;

  constructor(serviceType: string) {
    this.serviceType = serviceType;
    this.initializePatterns();
  }

  /**
   * Subclasses must implement this to register service-specific patterns
   */
  protected abstract initializePatterns(): void;

  /**
   * Add a pattern for log interpretation
   */
  protected registerPattern(pattern: LogPattern): void {
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Interpret a log entry and return user-friendly information
   */
  async interpretLog(entry: LogEntry, context?: LogContext): Promise<InterpretedMessage | null> {
    const bestMatch = await this.findBestPatternMatch(entry.message, context);

    if (!bestMatch || !bestMatch.interpretation) {
      return this.createFallbackInterpretation(entry, context);
    }

    return {
      ...bestMatch.interpretation,
      originalMessage: entry.message,
      technicalDetails: {
        ...bestMatch.interpretation.technicalDetails,
        timestamp: entry.timestamp,
        level: entry.level,
        source: entry.source,
        confidence: bestMatch.confidence,
        patternId: this.findMatchingPatternId(entry.message, context),
        metadata: entry.metadata,
      },
    };
  }

  /**
   * Interpret multiple log entries for comprehensive analysis
   */
  async interpretLogs(entries: LogEntry[], context?: LogContext): Promise<InterpretedMessage[]> {
    const interpretations: InterpretedMessage[] = [];

    for (const entry of entries) {
      const interpretation = await this.interpretLog(entry, context);
      if (interpretation) {
        interpretations.push(interpretation);
      }
    }

    return this.consolidateInterpretations(interpretations);
  }

  /**
   * Find the best matching pattern for a log message
   */
  private async findBestPatternMatch(
    message: string,
    context?: LogContext
  ): Promise<PatternMatchResult | null> {
    let bestMatch: PatternMatchResult | null = null;
    let highestConfidence = 0;

    for (const pattern of this.patterns.values()) {
      const matchResult = await this.testPattern(pattern, message, context);

      if (matchResult.matched && matchResult.confidence > highestConfidence) {
        highestConfidence = matchResult.confidence;
        bestMatch = matchResult;
      }
    }

    return bestMatch;
  }

  /**
   * Test a specific pattern against a message
   */
  private async testPattern(
    pattern: LogPattern,
    message: string,
    context?: LogContext
  ): Promise<PatternMatchResult> {
    try {
      if (pattern.pattern instanceof RegExp) {
        const match = message.match(pattern.pattern);
        if (match) {
          return {
            matched: true,
            confidence: pattern.confidence,
            interpretation: pattern.interpreter(match, context),
          };
        }
      } else if (typeof pattern.pattern === 'function') {
        const matches = pattern.pattern(message);
        if (matches) {
          return {
            matched: true,
            confidence: pattern.confidence,
            interpretation: pattern.interpreter(message, context),
          };
        }
      }
    } catch (error) {
      console.warn(`Pattern ${pattern.id} failed to match:`, error);
    }

    return { matched: false, confidence: 0 };
  }

  /**
   * Find the ID of the pattern that matches a message
   */
  private findMatchingPatternId(message: string, context?: LogContext): string | undefined {
    for (const [id, pattern] of this.patterns.entries()) {
      try {
        if (pattern.pattern instanceof RegExp && message.match(pattern.pattern)) {
          return id;
        } else if (typeof pattern.pattern === 'function' && pattern.pattern(message)) {
          return id;
        }
      } catch (error) {
        // Ignore pattern matching errors
      }
    }
    return undefined;
  }

  /**
   * Create fallback interpretation for unmatched messages
   */
  private createFallbackInterpretation(
    entry: LogEntry,
    context?: LogContext
  ): InterpretedMessage | null {
    // Only create fallback for error/warning messages
    if (entry.level !== 'error' && entry.level !== 'warn') {
      return null;
    }

    return {
      userMessage: this.createGenericUserMessage(entry),
      severity: entry.level === 'error' ? 'error' : 'warning',
      category: 'system',
      originalMessage: entry.message,
      suggestedAction: 'Check logs for more details or contact support',
      technicalDetails: {
        timestamp: entry.timestamp,
        level: entry.level,
        source: entry.source,
        serviceType: this.serviceType,
        unmatched: true,
        metadata: entry.metadata,
      },
    };
  }

  /**
   * Create a generic user-friendly message from a log entry
   */
  private createGenericUserMessage(entry: LogEntry): string {
    const service = this.serviceType.charAt(0).toUpperCase() + this.serviceType.slice(1);

    if (entry.level === 'error') {
      return `${service} encountered an error during processing`;
    } else if (entry.level === 'warn') {
      return `${service} reported a warning that may affect processing`;
    }

    return `${service} reported an issue`;
  }

  /**
   * Consolidate multiple interpretations to avoid duplicates and prioritize important messages
   */
  private consolidateInterpretations(interpretations: InterpretedMessage[]): InterpretedMessage[] {
    // Group by category and severity
    const grouped = new Map<string, InterpretedMessage[]>();

    for (const interpretation of interpretations) {
      const key = `${interpretation.category}_${interpretation.severity}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(interpretation);
    }

    // Keep the most recent interpretation per category/severity combination
    const consolidated: InterpretedMessage[] = [];

    for (const group of grouped.values()) {
      // Sort by technical details timestamp if available
      const sorted = group.sort((a, b) => {
        const aTime = (a.technicalDetails?.timestamp as Date) || new Date(0);
        const bTime = (b.technicalDetails?.timestamp as Date) || new Date(0);
        return bTime.getTime() - aTime.getTime();
      });

      consolidated.push(sorted[0]);
    }

    // Sort final results by severity (critical > error > warning > info)
    const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };

    return consolidated.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  /**
   * Get all registered patterns (for debugging)
   */
  getRegisteredPatterns(): LogPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get service type
   */
  getServiceType(): string {
    return this.serviceType;
  }
}
