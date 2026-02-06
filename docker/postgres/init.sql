-- Initial database setup for Pact
-- This file is executed when the postgres container is first created

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Atoms table
CREATE TABLE atoms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atom_id VARCHAR(20) UNIQUE NOT NULL, -- e.g., "IA-001"
  description TEXT NOT NULL,
  category VARCHAR(50) NOT NULL, -- functional, performance, security, etc.
  quality_score DECIMAL(5,2), -- 0-100
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft, committed, superseded
  superseded_by UUID REFERENCES atoms(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  committed_at TIMESTAMP,
  created_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb,
  CHECK (quality_score >= 0 AND quality_score <= 100)
);

-- Molecules table
CREATE TABLE molecules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  molecule_id VARCHAR(20) UNIQUE NOT NULL, -- e.g., "MOL-001"
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Molecule-Atom relationships (many-to-many)
CREATE TABLE molecule_atoms (
  molecule_id UUID REFERENCES molecules(id) ON DELETE CASCADE,
  atom_id UUID REFERENCES atoms(id) ON DELETE CASCADE,
  position INTEGER, -- Order within molecule
  PRIMARY KEY (molecule_id, atom_id)
);

-- Validators table
CREATE TABLE validators (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atom_id UUID REFERENCES atoms(id) ON DELETE CASCADE,
  validator_type VARCHAR(50) NOT NULL, -- gherkin, executable, declarative
  content TEXT NOT NULL,
  format VARCHAR(20) NOT NULL, -- gherkin, typescript, json
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Evidence table
CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atom_id UUID REFERENCES atoms(id) ON DELETE CASCADE,
  validator_id UUID REFERENCES validators(id),
  result VARCHAR(20) NOT NULL, -- pass, fail, error
  output TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  execution_context JSONB, -- test environment, CI run, etc.
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Clarification Artifacts table (INV-009)
CREATE TABLE clarifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  atom_id UUID REFERENCES atoms(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Agent Actions Log (for auditing agent decisions)
CREATE TABLE agent_actions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_name VARCHAR(100) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  input JSONB,
  output JSONB,
  confidence_score DECIMAL(5,2),
  human_approved BOOLEAN,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Bootstrap Scaffolds Tracking
CREATE TABLE bootstrap_scaffolds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scaffold_id VARCHAR(20) UNIQUE NOT NULL, -- e.g., "BS-001"
  scaffold_type VARCHAR(20) NOT NULL, -- seed, migration, tooling, runtime
  purpose TEXT NOT NULL,
  exit_criterion TEXT NOT NULL,
  target_removal VARCHAR(20) NOT NULL, -- Phase 0, Phase 1, Phase 2
  owner VARCHAR(255),
  removal_ticket VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- active, demolished
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  demolished_at TIMESTAMP,
  demolished_by VARCHAR(255),
  notes TEXT
);

-- Indexes for performance
CREATE INDEX idx_atoms_status ON atoms(status);
CREATE INDEX idx_atoms_atom_id ON atoms(atom_id);
CREATE INDEX idx_molecules_molecule_id ON molecules(molecule_id);
CREATE INDEX idx_evidence_atom_id ON evidence(atom_id);
CREATE INDEX idx_evidence_timestamp ON evidence(timestamp);
CREATE INDEX idx_agent_actions_agent_name ON agent_actions(agent_name);
CREATE INDEX idx_agent_actions_timestamp ON agent_actions(timestamp);
CREATE INDEX idx_bootstrap_scaffolds_status ON bootstrap_scaffolds(status);

-- Comments for documentation
COMMENT ON TABLE atoms IS 'Core intent atoms - immutable behavioral primitives';
COMMENT ON TABLE molecules IS 'Descriptive groupings of atoms - mutable lenses';
COMMENT ON TABLE validators IS 'Tests and validation rules linked to atoms';
COMMENT ON TABLE evidence IS 'Immutable execution results';
COMMENT ON TABLE clarifications IS 'Post-commitment ambiguity resolutions (INV-009)';
COMMENT ON TABLE agent_actions IS 'Audit log of all agent decisions and actions';
COMMENT ON TABLE bootstrap_scaffolds IS 'Tracking for temporary scaffolding code';
-- LLM Configurations Table
-- Stores user-configurable LLM service settings
-- This enables UI-based management of LLM behavior

CREATE TABLE IF NOT EXISTS llm_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Configuration identity
  config_name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT false,

  -- Model configuration (stored as JSONB for flexibility)
  primary_model JSONB NOT NULL,
  fallback_models JSONB DEFAULT '[]'::jsonb,

  -- Request settings
  default_timeout INTEGER DEFAULT 30000,
  streaming_enabled BOOLEAN DEFAULT false,

  -- Circuit breaker settings
  circuit_breaker_config JSONB DEFAULT '{
    "enabled": true,
    "failureThreshold": 5,
    "successThreshold": 2,
    "timeout": 60000,
    "monitoringWindow": 120000
  }'::jsonb,

  -- Retry settings
  retry_config JSONB DEFAULT '{
    "enabled": true,
    "maxRetries": 3,
    "initialDelay": 1000,
    "maxDelay": 10000,
    "backoffMultiplier": 2,
    "retryableStatusCodes": [429, 500, 502, 503, 504],
    "retryableErrors": ["ECONNRESET", "ETIMEDOUT", "rate_limit_exceeded"]
  }'::jsonb,

  -- Rate limit settings
  rate_limit_config JSONB DEFAULT '{
    "enabled": true,
    "requestsPerMinute": 60,
    "burstSize": 10,
    "queueEnabled": true,
    "maxQueueSize": 100
  }'::jsonb,

  -- Cache settings
  cache_config JSONB DEFAULT '{
    "enabled": true,
    "ttl": 3600,
    "keyPrefix": "llm:cache:",
    "excludePatterns": []
  }'::jsonb,

  -- Budget settings
  budget_config JSONB DEFAULT '{
    "enabled": true,
    "dailyLimit": 10.0,
    "monthlyLimit": 200.0,
    "alertThreshold": 80,
    "hardStop": true
  }'::jsonb,

  -- Observability settings
  observability_config JSONB DEFAULT '{
    "metricsEnabled": true,
    "detailedLogging": true,
    "tracingEnabled": true,
    "logLevel": "info"
  }'::jsonb,

  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  updated_by VARCHAR(255)
);

-- Create index on active configurations for fast lookup
CREATE INDEX idx_llm_configurations_active ON llm_configurations(is_active) WHERE is_active = true;

-- Create index on config name for lookups
CREATE INDEX idx_llm_configurations_name ON llm_configurations(config_name);

-- Insert default configuration
INSERT INTO llm_configurations (
  config_name,
  description,
  is_active,
  primary_model,
  fallback_models
) VALUES (
  'default',
  'Default LLM configuration for development',
  true,
  '{
    "provider": "openai",
    "modelName": "gpt-4-turbo-preview",
    "temperature": 0.2,
    "maxTokens": 4096,
    "costPerInputToken": 0.00001,
    "costPerOutputToken": 0.00003
  }'::jsonb,
  '[
    {
      "provider": "openai",
      "modelName": "gpt-3.5-turbo",
      "temperature": 0.2,
      "maxTokens": 4096,
      "costPerInputToken": 0.0000005,
      "costPerOutputToken": 0.0000015
    }
  ]'::jsonb
);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_llm_configurations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_llm_configurations_updated_at
  BEFORE UPDATE ON llm_configurations
  FOR EACH ROW
  EXECUTE FUNCTION update_llm_configurations_updated_at();

-- Table for tracking LLM usage and costs
CREATE TABLE IF NOT EXISTS llm_usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Request identification
  request_id VARCHAR(255) UNIQUE NOT NULL,
  config_id UUID REFERENCES llm_configurations(id),

  -- Model used
  provider VARCHAR(50) NOT NULL,
  model_name VARCHAR(255) NOT NULL,

  -- Usage metrics
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,

  -- Cost calculation
  input_cost DECIMAL(10, 6) NOT NULL,
  output_cost DECIMAL(10, 6) NOT NULL,
  total_cost DECIMAL(10, 6) NOT NULL,

  -- Performance metrics
  latency_ms INTEGER,
  cache_hit BOOLEAN DEFAULT false,
  retry_count INTEGER DEFAULT 0,
  circuit_breaker_open BOOLEAN DEFAULT false,

  -- Request metadata
  agent_name VARCHAR(255),
  purpose TEXT,
  success BOOLEAN NOT NULL,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for usage tracking queries
CREATE INDEX idx_llm_usage_tracking_created_at ON llm_usage_tracking(created_at DESC);
CREATE INDEX idx_llm_usage_tracking_config_id ON llm_usage_tracking(config_id);
CREATE INDEX idx_llm_usage_tracking_agent_name ON llm_usage_tracking(agent_name);
CREATE INDEX idx_llm_usage_tracking_success ON llm_usage_tracking(success);

-- Create view for daily cost aggregation
CREATE OR REPLACE VIEW llm_daily_costs AS
SELECT
  DATE(created_at) as date,
  config_id,
  agent_name,
  provider,
  model_name,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(latency_ms) as avg_latency_ms,
  SUM(CASE WHEN cache_hit THEN 1 ELSE 0 END) as cache_hits,
  SUM(retry_count) as total_retries,
  SUM(CASE WHEN success THEN 1 ELSE 0 END) as successful_requests,
  SUM(CASE WHEN NOT success THEN 1 ELSE 0 END) as failed_requests
FROM llm_usage_tracking
GROUP BY DATE(created_at), config_id, agent_name, provider, model_name;

-- Create view for monthly cost aggregation
CREATE OR REPLACE VIEW llm_monthly_costs AS
SELECT
  DATE_TRUNC('month', created_at) as month,
  config_id,
  agent_name,
  provider,
  model_name,
  COUNT(*) as request_count,
  SUM(total_tokens) as total_tokens,
  SUM(total_cost) as total_cost,
  AVG(latency_ms) as avg_latency_ms
FROM llm_usage_tracking
GROUP BY DATE_TRUNC('month', created_at), config_id, agent_name, provider, model_name;
