import { ConfigDefinition } from './types';

/**
 * Feature flag configuration definitions
 *
 * Controls experimental and optional features.
 */
export const FEATURES_CONFIG_DEFINITIONS: ConfigDefinition[] = [
  // === Agent Features ===
  {
    domain: 'features',
    key: 'use_graph_agent',
    valueType: 'boolean',
    description: 'Use LangGraph-based agent instead of legacy implementation',
    envVarName: 'USE_GRAPH_AGENT',
    codeDefault: true,
    category: 'agent',
    requiresRestart: true,
  },
  {
    domain: 'features',
    key: 'enable_streaming',
    valueType: 'boolean',
    description: 'Enable streaming responses from LLM providers',
    envVarName: 'ENABLE_STREAMING',
    codeDefault: false,
    category: 'agent',
    requiresRestart: false,
  },
  {
    domain: 'features',
    key: 'enable_discovery_first',
    valueType: 'boolean',
    description: 'Enable discovery-first pattern in search node',
    envVarName: 'ENABLE_DISCOVERY_FIRST',
    codeDefault: true,
    category: 'agent',
    requiresRestart: false,
  },

  // === LLM Features ===
  {
    domain: 'features',
    key: 'prefer_local_models',
    valueType: 'boolean',
    description: 'Prefer local models (Ollama) when available',
    envVarName: 'PREFER_LOCAL_MODELS',
    codeDefault: false,
    category: 'llm',
    requiresRestart: false,
  },
  {
    domain: 'features',
    key: 'enable_model_fallback',
    valueType: 'boolean',
    description: 'Enable automatic fallback to alternative models on failure',
    envVarName: 'ENABLE_MODEL_FALLBACK',
    codeDefault: true,
    category: 'llm',
    requiresRestart: false,
  },
  {
    domain: 'features',
    key: 'enable_response_cache',
    valueType: 'boolean',
    description: 'Enable caching of LLM responses',
    envVarName: 'ENABLE_RESPONSE_CACHE',
    codeDefault: true,
    category: 'llm',
    requiresRestart: false,
  },

  // === UI Features ===
  {
    domain: 'features',
    key: 'enable_realtime_updates',
    valueType: 'boolean',
    description: 'Enable WebSocket real-time updates in UI',
    envVarName: 'ENABLE_REALTIME_UPDATES',
    codeDefault: true,
    category: 'ui',
    requiresRestart: false,
  },
  {
    domain: 'features',
    key: 'enable_atom_canvas',
    valueType: 'boolean',
    description: 'Enable visual atom canvas view',
    envVarName: 'ENABLE_ATOM_CANVAS',
    codeDefault: true,
    category: 'ui',
    requiresRestart: false,
  },

  // === Experimental Features ===
  {
    domain: 'features',
    key: 'enable_multi_agent',
    valueType: 'boolean',
    description: 'Enable multi-agent collaboration (experimental)',
    envVarName: 'ENABLE_MULTI_AGENT',
    codeDefault: false,
    category: 'experimental',
    requiresRestart: true,
  },
  {
    domain: 'features',
    key: 'enable_auto_refinement',
    valueType: 'boolean',
    description: 'Enable automatic intent refinement suggestions (experimental)',
    envVarName: 'ENABLE_AUTO_REFINEMENT',
    codeDefault: false,
    category: 'experimental',
    requiresRestart: false,
  },
];
