import { ConfigDefinition } from './types';

/**
 * Observability configuration definitions
 *
 * Controls logging, tracing, and metrics collection.
 */
export const OBSERVABILITY_CONFIG_DEFINITIONS: ConfigDefinition[] = [
  // === Logging ===
  {
    domain: 'observability',
    key: 'log_level',
    valueType: 'string',
    description: 'Application log level',
    envVarName: 'LOG_LEVEL',
    codeDefault: 'info',
    validation: { enum: ['error', 'warn', 'info', 'debug', 'verbose'] },
    category: 'logging',
    requiresRestart: true,
  },
  {
    domain: 'observability',
    key: 'detailed_logging',
    valueType: 'boolean',
    description: 'Enable detailed request/response logging',
    envVarName: 'DETAILED_LOGGING',
    codeDefault: false,
    category: 'logging',
    requiresRestart: false,
  },
  {
    domain: 'observability',
    key: 'log_llm_requests',
    valueType: 'boolean',
    description: 'Log all LLM requests and responses',
    envVarName: 'LOG_LLM_REQUESTS',
    codeDefault: true,
    category: 'logging',
    requiresRestart: false,
  },
  {
    domain: 'observability',
    key: 'log_tool_calls',
    valueType: 'boolean',
    description: 'Log all tool call executions',
    envVarName: 'LOG_TOOL_CALLS',
    codeDefault: true,
    category: 'logging',
    requiresRestart: false,
  },

  // === Tracing ===
  {
    domain: 'observability',
    key: 'tracing_enabled',
    valueType: 'boolean',
    description: 'Enable distributed tracing (LangSmith)',
    envVarName: 'LANGCHAIN_TRACING_V2',
    codeDefault: false,
    category: 'tracing',
    requiresRestart: true,
  },
  {
    domain: 'observability',
    key: 'langsmith_project',
    valueType: 'string',
    description: 'LangSmith project name for traces',
    envVarName: 'LANGCHAIN_PROJECT',
    codeDefault: 'pact-agents',
    category: 'tracing',
    requiresRestart: true,
  },

  // === Metrics ===
  {
    domain: 'observability',
    key: 'metrics_enabled',
    valueType: 'boolean',
    description: 'Enable metrics collection',
    envVarName: 'METRICS_ENABLED',
    codeDefault: true,
    category: 'metrics',
    requiresRestart: false,
  },
  {
    domain: 'observability',
    key: 'track_token_usage',
    valueType: 'boolean',
    description: 'Track token usage per request',
    envVarName: 'TRACK_TOKEN_USAGE',
    codeDefault: true,
    category: 'metrics',
    requiresRestart: false,
  },
  {
    domain: 'observability',
    key: 'track_costs',
    valueType: 'boolean',
    description: 'Track costs per request',
    envVarName: 'TRACK_COSTS',
    codeDefault: true,
    category: 'metrics',
    requiresRestart: false,
  },
  {
    domain: 'observability',
    key: 'track_latency',
    valueType: 'boolean',
    description: 'Track latency metrics',
    envVarName: 'TRACK_LATENCY',
    codeDefault: true,
    category: 'metrics',
    requiresRestart: false,
  },
];
