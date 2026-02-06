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
