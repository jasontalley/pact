export * from './types';
export * from './agent.definitions';
export * from './resilience.definitions';
export * from './safety.definitions';
export * from './observability.definitions';
export * from './features.definitions';

import { ConfigDefinition } from './types';
import { AGENT_CONFIG_DEFINITIONS } from './agent.definitions';
import { RESILIENCE_CONFIG_DEFINITIONS } from './resilience.definitions';
import { SAFETY_CONFIG_DEFINITIONS } from './safety.definitions';
import { OBSERVABILITY_CONFIG_DEFINITIONS } from './observability.definitions';
import { FEATURES_CONFIG_DEFINITIONS } from './features.definitions';

/**
 * All configuration definitions combined
 */
export const ALL_CONFIG_DEFINITIONS: ConfigDefinition[] = [
  ...AGENT_CONFIG_DEFINITIONS,
  ...RESILIENCE_CONFIG_DEFINITIONS,
  ...SAFETY_CONFIG_DEFINITIONS,
  ...OBSERVABILITY_CONFIG_DEFINITIONS,
  ...FEATURES_CONFIG_DEFINITIONS,
];

/**
 * Get all definitions for a specific domain
 */
export function getDefinitionsByDomain(domain: string): ConfigDefinition[] {
  return ALL_CONFIG_DEFINITIONS.filter((d) => d.domain === domain);
}

/**
 * Get a specific definition by domain and key
 */
export function getDefinition(domain: string, key: string): ConfigDefinition | undefined {
  return ALL_CONFIG_DEFINITIONS.find((d) => d.domain === domain && d.key === key);
}

/**
 * Get all unique domains
 */
export function getAllDomains(): string[] {
  return [...new Set(ALL_CONFIG_DEFINITIONS.map((d) => d.domain))];
}

/**
 * Get all categories for a domain
 */
export function getCategoriesByDomain(domain: string): string[] {
  const definitions = getDefinitionsByDomain(domain);
  return [...new Set(definitions.map((d) => d.category))];
}
