// Log Interpretation Module - Intelligent log analysis and user-friendly feedback
// Main exports for the log interpretation system

export { BaseLogInterpreter } from './base-log-interpreter.js';
export type { 
  LogEntry, 
  InterpretedMessage, 
  PatternMatchResult, 
  LogPattern, 
  LogContext 
} from './base-log-interpreter.js';

export { 
  CommonErrorPatterns,
  ProgressPatterns,
  ModelPatterns,
  ConnectionPatterns,
  getAllCommonPatterns,
  getPatternsByCategory,
  createCustomPattern
} from './error-translation-library.js';

export { ComfyUILogInterpreter } from './comfyui-log-interpreter.js';
export { OpenAILogInterpreter } from './openai-log-interpreter.js';

export { 
  EnhancedProgressReporter,
  createEnhancedProgressCallback,
  createEnhancedProgressReporter,
  interpretLogMessage
} from './enhanced-progress-callback.js';
export type { 
  EnhancedJobProgress, 
  EnhancedProgressCallback 
} from './enhanced-progress-callback.js';