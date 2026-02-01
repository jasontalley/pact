import {
  ConfigDomain,
  ConfigValueType,
  ConfigValidation,
} from '../entities/system-configuration.entity';

/**
 * Definition for a configurable setting.
 * Used to register all available configurations with their metadata.
 */
export interface ConfigDefinition {
  /** Configuration domain (agent, resilience, safety, etc.) */
  domain: ConfigDomain;

  /** Unique key within the domain */
  key: string;

  /** Data type of the value */
  valueType: ConfigValueType;

  /** Human-readable description */
  description: string;

  /** Corresponding environment variable name (optional) */
  envVarName?: string;

  /** Default value if not set in env or database */
  codeDefault: unknown;

  /** Validation rules */
  validation?: ConfigValidation;

  /** Category for UI grouping */
  category: string;

  /** Whether the value should be hidden in UI (e.g., API keys) */
  isSensitive?: boolean;

  /** Whether changing this requires a restart */
  requiresRestart?: boolean;

  /** Whether this config can be modified via UI (false = view-only) */
  isEditable?: boolean;
}

/**
 * Result of getting a configuration value with source tracking
 */
export interface ConfigValue<T = unknown> {
  value: T;
  source: 'code' | 'environment' | 'database';
  effectiveAt: Date;
  changedBy?: string;
}

/**
 * Full configuration response including metadata
 */
export interface ConfigValueResponse<T = unknown> extends ConfigValue<T> {
  domain: string;
  key: string;
  valueType: ConfigValueType;
  description: string;
  category: string;
  envVarName?: string;
  codeDefault: T;
  envValue?: T;
  validation?: ConfigValidation;
  requiresRestart: boolean;
  isSensitive: boolean;
  isEditable: boolean;
  lastChangedAt?: Date;
  lastChangedBy?: string;
}
