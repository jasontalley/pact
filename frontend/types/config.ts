/**
 * Configuration Types
 *
 * Types for the admin configuration UI.
 */

/**
 * Configuration value types
 */
export type ConfigValueType = 'string' | 'number' | 'boolean' | 'json';

/**
 * Configuration source - indicates where the value came from
 */
export type ConfigSource = 'code' | 'environment' | 'database';

/**
 * Configuration domain
 */
export type ConfigDomain = 'agent' | 'resilience' | 'safety' | 'observability' | 'features';

/**
 * Configuration category (varies by domain)
 */
export type ConfigCategory =
  | 'temperature'
  | 'threshold'
  | 'timeout'
  | 'limits'
  | 'circuit-breaker'
  | 'retry'
  | 'rate-limit'
  | 'fallback'
  | 'constraints'
  | 'logging'
  | 'tracing'
  | 'metrics'
  | 'alerting'
  | 'health'
  | 'feature-flag'
  | 'experimental';

/**
 * Validation rules for a configuration value
 */
export interface ConfigValidation {
  min?: number;
  max?: number;
  pattern?: string;
  enum?: string[];
}

/**
 * Configuration value with full metadata
 */
export interface ConfigValue {
  domain: string;
  key: string;
  value: unknown;
  valueType: ConfigValueType;
  source: ConfigSource;
  description: string;
  category: ConfigCategory;
  envVarName?: string;
  codeDefault: unknown;
  envValue?: unknown;
  validation?: ConfigValidation;
  requiresRestart: boolean;
  isSensitive: boolean;
  isEditable: boolean;
  effectiveAt: string;
  lastChangedAt?: string;
  lastChangedBy?: string;
}

/**
 * Response with all configurations grouped by domain
 */
export interface SystemConfigResponse {
  agent: ConfigValue[];
  resilience: ConfigValue[];
  safety: ConfigValue[];
  observability: ConfigValue[];
  features: ConfigValue[];
}

/**
 * Response with configurations for a single domain
 */
export interface DomainConfigResponse {
  domain: string;
  configs: ConfigValue[];
}

/**
 * Request to set a configuration value
 */
export interface SetConfigValueRequest {
  value: unknown;
  reason?: string;
}

/**
 * Audit log entry
 */
export interface AuditLogEntry {
  id: string;
  domain: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
  changeReason?: string;
}

/**
 * Paginated audit log response
 */
export interface PaginatedAuditLog {
  items: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Audit log filter parameters
 */
export interface AuditLogFilters {
  domain?: string;
  key?: string;
  changedBy?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * Domain metadata
 */
export interface DomainInfo {
  id: ConfigDomain;
  name: string;
  description: string;
  icon: string;
}

/**
 * Configuration domains with metadata
 */
export const CONFIG_DOMAINS: DomainInfo[] = [
  {
    id: 'agent',
    name: 'Agent Settings',
    description: 'AI agent temperatures, thresholds, and timeouts',
    icon: 'Bot',
  },
  {
    id: 'resilience',
    name: 'Resilience',
    description: 'Circuit breakers, retries, and rate limits',
    icon: 'Shield',
  },
  {
    id: 'safety',
    name: 'Safety',
    description: 'Safety constraints and validation rules',
    icon: 'ShieldAlert',
  },
  {
    id: 'observability',
    name: 'Observability',
    description: 'Logging, tracing, and metrics',
    icon: 'Activity',
  },
  {
    id: 'features',
    name: 'Features',
    description: 'Feature flags and experimental settings',
    icon: 'Zap',
  },
];
