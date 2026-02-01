# Phase 3.7: Admin Configuration UI

**Version**: 1.0
**Status**: Complete
**Target**: Expose hidden configurations through a unified admin UI with layered defaults
**Last Updated**: 2026-01-28
**Prerequisite**: Phase 3.6 (LangGraph infrastructure)

---

## Overview

Phase 3.7 establishes a **layered configuration system** that exposes the ~45+ hidden configurations identified in the configuration audit. The system follows a clear precedence: **Code Defaults → Environment Variables → Database/UI Overrides**.

### Design Principles

1. **Layered Precedence**: Environment sets deployment defaults; UI allows runtime tuning
2. **Logical Grouping**: Configs organized by domain (Agent, Resilience, Safety, Observability)
3. **Progressive Disclosure**: Basic settings visible by default; advanced settings expandable
4. **Audit Trail**: All configuration changes logged with who/when/what
5. **Safe Defaults**: System works without any UI configuration; UI enables tuning

### Configuration Precedence Model

```
┌─────────────────────────────────────────────────────────────────┐
│                 CONFIGURATION PRECEDENCE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HIGHEST ──────────────────────────────────────────────► LOWEST │
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │  UI/Database │ → │ Environment  │ → │ Code Default │        │
│  │  (Runtime)   │   │ (Deployment) │   │ (Fallback)   │        │
│  └──────────────┘   └──────────────┘   └──────────────┘        │
│                                                                  │
│  Examples:                                                       │
│  ─────────────────────────────────────────────────────────────  │
│  • Admin sets timeout=60s in UI     → Uses 60s                  │
│  • No UI override, .env has 120s    → Uses 120s                 │
│  • No UI, no .env, code has 30s     → Uses 30s (fallback)       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Why This Pattern?

| Scenario | Environment Only | UI Only | **Layered (Recommended)** |
|----------|------------------|---------|---------------------------|
| New deployment | ✅ Set via .env | ❌ Must use UI after deploy | ✅ .env works immediately |
| Runtime tuning | ❌ Requires restart | ✅ Instant change | ✅ UI overrides without restart |
| Infrastructure-as-Code | ✅ Version controlled | ❌ Manual state | ✅ .env = baseline, UI = exceptions |
| Multi-tenant | ❌ Same for all | ✅ Per-tenant | ✅ Per-tenant overrides |

---

## Architecture

### Configuration Domain Model

```typescript
// Unified configuration with source tracking
interface ConfigValue<T> {
  value: T;
  source: 'code' | 'environment' | 'database';
  effectiveAt: Date;
  changedBy?: string;
}

interface SystemConfiguration {
  // Agent Behavior
  agent: AgentConfiguration;

  // Resilience (Circuit Breaker, Retry, Rate Limit)
  resilience: ResilienceConfiguration;

  // Safety & Security
  safety: SafetyConfiguration;

  // Observability (Logging, Tracing, Metrics)
  observability: ObservabilityConfiguration;

  // Feature Flags
  features: FeatureFlagsConfiguration;
}
```

### Database Schema Extension

```sql
-- New table for layered configuration
CREATE TABLE system_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain VARCHAR(50) NOT NULL,        -- 'agent', 'resilience', 'safety', etc.
  key VARCHAR(100) NOT NULL,          -- 'chat_temperature', 'circuit_breaker_threshold'
  value JSONB NOT NULL,               -- Actual value (typed in code)
  value_type VARCHAR(20) NOT NULL,    -- 'number', 'boolean', 'string', 'json'
  description TEXT,
  env_var_name VARCHAR(100),          -- Corresponding env var if any
  code_default JSONB,                 -- What code uses as fallback
  is_sensitive BOOLEAN DEFAULT false, -- Hide value in UI (show *****)
  requires_restart BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by VARCHAR(255),
  UNIQUE(domain, key)
);

-- Audit log for all changes
CREATE TABLE configuration_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID REFERENCES system_configurations(id),
  domain VARCHAR(50) NOT NULL,
  key VARCHAR(100) NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by VARCHAR(255) NOT NULL,
  changed_at TIMESTAMP DEFAULT NOW(),
  change_reason TEXT
);
```

---

## Part 1: Configuration Service Foundation

### 1.1 ConfigurationService Core

**File**: `src/common/configuration/configuration.service.ts`

```typescript
@Injectable()
export class ConfigurationService implements OnModuleInit {
  private cache: Map<string, ConfigValue<unknown>> = new Map();

  async get<T>(domain: string, key: string): Promise<ConfigValue<T>> {
    // 1. Check database (highest priority)
    const dbValue = await this.repository.findOne({ domain, key });
    if (dbValue) {
      return { value: dbValue.value as T, source: 'database', effectiveAt: dbValue.updatedAt };
    }

    // 2. Check environment variable
    const envVarName = this.getEnvVarName(domain, key);
    const envValue = process.env[envVarName];
    if (envValue !== undefined) {
      return { value: this.parseEnvValue<T>(envValue), source: 'environment', effectiveAt: this.startupTime };
    }

    // 3. Fall back to code default
    const codeDefault = this.getCodeDefault<T>(domain, key);
    return { value: codeDefault, source: 'code', effectiveAt: this.startupTime };
  }

  async set<T>(domain: string, key: string, value: T, changedBy: string, reason?: string): Promise<void> {
    // Validate value against schema
    await this.validateValue(domain, key, value);

    // Log to audit trail
    await this.auditLog(domain, key, value, changedBy, reason);

    // Update database
    await this.repository.upsert({ domain, key, value, updatedBy: changedBy });

    // Invalidate cache
    this.cache.delete(`${domain}:${key}`);

    // Emit event for live reload (if supported)
    this.eventEmitter.emit('config.changed', { domain, key, value });
  }
}
```

### 1.2 Configuration Definitions

**File**: `src/common/configuration/definitions/agent.definitions.ts`

```typescript
export const AGENT_CONFIG_DEFINITIONS: ConfigDefinition[] = [
  // Chat Agent
  {
    domain: 'agent',
    key: 'chat_temperature',
    valueType: 'number',
    description: 'Temperature for chat agent responses (0.0 = deterministic, 1.0 = creative)',
    envVarName: 'AGENT_CHAT_TEMPERATURE',
    codeDefault: 0.7,
    validation: { min: 0, max: 1 },
    category: 'behavior',
    requiresRestart: false,
  },
  {
    domain: 'agent',
    key: 'atomization_temperature',
    valueType: 'number',
    description: 'Temperature for atomization analysis (lower = more consistent)',
    envVarName: 'AGENT_ATOMIZATION_TEMPERATURE',
    codeDefault: 0.2,
    validation: { min: 0, max: 1 },
    category: 'behavior',
    requiresRestart: false,
  },
  // Confidence Thresholds
  {
    domain: 'agent',
    key: 'confidence_threshold_atomicity',
    valueType: 'number',
    description: 'Minimum confidence score for atomicity analysis to be accepted',
    envVarName: 'LLM_CONFIDENCE_THRESHOLD_ATOMICITY',
    codeDefault: 0.7,
    validation: { min: 0, max: 1 },
    category: 'quality',
    requiresRestart: false,
  },
  // ... more definitions
];
```

### 1.3 Integration Points

Update existing services to use ConfigurationService:

```typescript
// Before (hardcoded)
const response = await this.llmService.invoke({
  temperature: 0.7,  // Hardcoded!
  ...
});

// After (configurable)
const temperature = await this.configService.get<number>('agent', 'chat_temperature');
const response = await this.llmService.invoke({
  temperature: temperature.value,
  ...
});
```

### Tasks

- [x] 1.1.1 Create `system_configurations` table migration
- [x] 1.1.2 Create `configuration_audit_log` table migration
- [x] 1.1.3 Implement `ConfigurationService` with layered lookup
- [x] 1.1.4 Implement `ConfigurationRepository`
- [x] 1.1.5 Add caching with invalidation
- [x] 1.1.6 Add event emission for live reload
- [x] 1.2.1 Define agent config definitions
- [x] 1.2.2 Define resilience config definitions
- [x] 1.2.3 Define safety config definitions
- [x] 1.2.4 Define observability config definitions
- [x] 1.2.5 Define feature flag definitions
- [ ] 1.3.1 Integrate with ChatAgentService (deferred - requires service updates)
- [ ] 1.3.2 Integrate with AtomizationService (deferred - requires service updates)
- [ ] 1.3.3 Integrate with LLMService (deferred - requires service updates)
- [ ] 1.3.4 Integrate with safety constitution (deferred - requires service updates)

---

## Part 2: Admin API Endpoints

### 2.1 Configuration Controller

**File**: `src/modules/admin/configuration.controller.ts`

```typescript
@Controller('admin/config')
@UseGuards(AdminGuard)
export class ConfigurationController {

  @Get()
  async getAllConfigurations(): Promise<SystemConfigurationResponse> {
    // Returns all configs grouped by domain with source indicators
  }

  @Get(':domain')
  async getByDomain(@Param('domain') domain: string): Promise<DomainConfigResponse> {
    // Returns all configs for a domain
  }

  @Get(':domain/:key')
  async getValue(
    @Param('domain') domain: string,
    @Param('key') key: string,
  ): Promise<ConfigValueResponse> {
    // Returns single config with metadata
  }

  @Put(':domain/:key')
  async setValue(
    @Param('domain') domain: string,
    @Param('key') key: string,
    @Body() dto: SetConfigValueDto,
    @User() user: AuthUser,
  ): Promise<ConfigValueResponse> {
    // Sets value, logs audit, returns updated config
  }

  @Delete(':domain/:key')
  async resetToDefault(
    @Param('domain') domain: string,
    @Param('key') key: string,
    @User() user: AuthUser,
  ): Promise<ConfigValueResponse> {
    // Removes database override, falls back to env/code
  }

  @Get('audit')
  async getAuditLog(
    @Query() filters: AuditLogFilters,
  ): Promise<PaginatedAuditLog> {
    // Returns audit log with filtering
  }
}
```

### 2.2 Response DTOs

```typescript
interface ConfigValueResponse {
  domain: string;
  key: string;
  value: unknown;
  valueType: 'number' | 'boolean' | 'string' | 'json';
  source: 'code' | 'environment' | 'database';
  description: string;
  category: string;

  // Metadata
  envVarName?: string;
  codeDefault: unknown;
  envValue?: unknown;  // Only if different from current

  // Constraints
  validation?: ValidationRules;
  requiresRestart: boolean;
  isSensitive: boolean;

  // Audit
  lastChangedAt?: Date;
  lastChangedBy?: string;
}

interface SystemConfigurationResponse {
  agent: ConfigValueResponse[];
  resilience: ConfigValueResponse[];
  safety: ConfigValueResponse[];
  observability: ConfigValueResponse[];
  features: ConfigValueResponse[];
}
```

### Tasks

- [x] 2.1.1 Create `ConfigurationController`
- [x] 2.1.2 Implement `GET /admin/config` - all configs
- [x] 2.1.3 Implement `GET /admin/config/:domain` - by domain
- [x] 2.1.4 Implement `GET /admin/config/:domain/:key` - single config
- [x] 2.1.5 Implement `PUT /admin/config/:domain/:key` - set value
- [x] 2.1.6 Implement `DELETE /admin/config/:domain/:key` - reset to default
- [x] 2.1.7 Implement `GET /admin/config/audit` - audit log
- [x] 2.2.1 Create response DTOs
- [x] 2.2.2 Create request DTOs with validation
- [x] 2.2.3 Add OpenAPI/Swagger documentation

---

## Part 3: Frontend Admin UI

### 3.1 Settings Page Structure

```
frontend/app/settings/
├── page.tsx                    # Settings overview/dashboard
├── layout.tsx                  # Settings layout with sidebar nav
├── agent/
│   └── page.tsx                # Agent behavior settings
├── resilience/
│   └── page.tsx                # Circuit breaker, retry, rate limit
├── safety/
│   └── page.tsx                # Safety thresholds (view-only for most)
├── observability/
│   └── page.tsx                # Logging, tracing, metrics
├── features/
│   └── page.tsx                # Feature flags
└── audit/
    └── page.tsx                # Configuration audit log
```

### 3.2 Reusable Components

**ConfigSection**: Groups related configs with progressive disclosure

```tsx
<ConfigSection
  title="Agent Temperatures"
  description="Control creativity vs determinism for different agent tasks"
  advanced={false}
>
  <ConfigSlider
    domain="agent"
    configKey="chat_temperature"
    label="Chat Agent"
    min={0}
    max={1}
    step={0.1}
  />
  <ConfigSlider
    domain="agent"
    configKey="atomization_temperature"
    label="Atomization"
    min={0}
    max={1}
    step={0.1}
  />
</ConfigSection>
```

**ConfigField**: Self-contained config editor with source indicator

```tsx
interface ConfigFieldProps {
  domain: string;
  configKey: string;
  label: string;
  description?: string;
}

function ConfigField({ domain, configKey, label }: ConfigFieldProps) {
  const { data: config, mutate } = useConfig(domain, configKey);

  return (
    <div className="config-field">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          value={config.value}
          onChange={(e) => mutate(e.target.value)}
          disabled={config.source === 'code' && !canOverride}
        />
        <SourceBadge source={config.source} />
        {config.source === 'database' && (
          <Button variant="ghost" onClick={resetToDefault}>
            Reset
          </Button>
        )}
      </div>
      {config.requiresRestart && (
        <Alert variant="warning">Requires restart to take effect</Alert>
      )}
    </div>
  );
}
```

**SourceBadge**: Visual indicator of config source

```tsx
function SourceBadge({ source }: { source: ConfigSource }) {
  const badges = {
    code: { label: 'Default', variant: 'secondary' },
    environment: { label: 'Env', variant: 'outline' },
    database: { label: 'Custom', variant: 'default' },
  };

  return <Badge variant={badges[source].variant}>{badges[source].label}</Badge>;
}
```

### 3.3 Agent Settings Page

```tsx
// frontend/app/settings/agent/page.tsx
export default function AgentSettingsPage() {
  return (
    <SettingsLayout>
      <PageHeader
        title="Agent Behavior"
        description="Configure AI agent parameters"
      />

      {/* Basic Settings */}
      <ConfigSection title="Temperature Settings" defaultOpen>
        <ConfigSlider domain="agent" configKey="chat_temperature"
          label="Chat Agent" helpText="Higher = more creative responses" />
        <ConfigSlider domain="agent" configKey="atomization_temperature"
          label="Atomization" helpText="Lower = more consistent analysis" />
        <ConfigSlider domain="agent" configKey="commitment_temperature"
          label="Commitment" helpText="Balanced for proposals" />
      </ConfigSection>

      {/* Quality Thresholds */}
      <ConfigSection title="Quality Thresholds" defaultOpen>
        <ConfigSlider domain="agent" configKey="confidence_threshold_atomicity"
          label="Atomicity Confidence" min={0.5} max={1.0} step={0.05}
          helpText="Minimum confidence for atomization to be accepted" />
        <ConfigSlider domain="agent" configKey="confidence_threshold_testability"
          label="Testability Confidence" min={0.5} max={1.0} step={0.05} />
        <ConfigSlider domain="agent" configKey="confidence_threshold_translation"
          label="Translation Confidence" min={0.5} max={1.0} step={0.05} />
      </ConfigSection>

      {/* Timeouts - Advanced */}
      <ConfigSection title="Timeouts" advanced>
        <ConfigNumber domain="agent" configKey="default_timeout"
          label="Default LLM Timeout (ms)" min={10000} max={300000} step={5000} />
        <ConfigNumber domain="agent" configKey="synthesize_timeout"
          label="Synthesize Timeout (ms)" min={30000} max={180000} step={5000} />
        <ConfigNumber domain="agent" configKey="max_iterations"
          label="Max Graph Iterations" min={3} max={20} />
      </ConfigSection>
    </SettingsLayout>
  );
}
```

### 3.4 Resilience Settings Page

```tsx
// frontend/app/settings/resilience/page.tsx
export default function ResilienceSettingsPage() {
  return (
    <SettingsLayout>
      <PageHeader title="Resilience" description="Circuit breaker, retry, and rate limiting" />

      {/* Circuit Breaker */}
      <ConfigSection title="Circuit Breaker" icon={<ShieldIcon />}>
        <ConfigToggle domain="resilience" configKey="circuit_breaker_enabled"
          label="Enable Circuit Breaker" />
        <ConfigNumber domain="resilience" configKey="circuit_breaker_failure_threshold"
          label="Failure Threshold" helpText="Open circuit after N failures" />
        <ConfigNumber domain="resilience" configKey="circuit_breaker_success_threshold"
          label="Success Threshold" helpText="Close circuit after N successes" />
        <ConfigNumber domain="resilience" configKey="circuit_breaker_timeout"
          label="Recovery Timeout (ms)" helpText="Try to close after this duration" />
      </ConfigSection>

      {/* Retry Policy */}
      <ConfigSection title="Retry Policy" icon={<RefreshIcon />}>
        <ConfigToggle domain="resilience" configKey="retry_enabled" label="Enable Retries" />
        <ConfigNumber domain="resilience" configKey="retry_max_retries"
          label="Max Retries" min={0} max={10} />
        <ConfigNumber domain="resilience" configKey="retry_initial_delay"
          label="Initial Delay (ms)" />
        <ConfigNumber domain="resilience" configKey="retry_max_delay"
          label="Max Delay (ms)" />
        <ConfigNumber domain="resilience" configKey="retry_backoff_multiplier"
          label="Backoff Multiplier" min={1} max={5} step={0.5} />
      </ConfigSection>

      {/* Rate Limiting */}
      <ConfigSection title="Rate Limiting" icon={<GaugeIcon />}>
        <ConfigToggle domain="resilience" configKey="rate_limit_enabled"
          label="Enable Rate Limiting" />
        <ConfigNumber domain="resilience" configKey="rate_limit_requests_per_minute"
          label="Requests per Minute" min={10} max={1000} />
        <ConfigNumber domain="resilience" configKey="rate_limit_burst_size"
          label="Burst Size" min={1} max={100} />
      </ConfigSection>
    </SettingsLayout>
  );
}
```

### Tasks

- [x] 3.1.1 Create settings layout with sidebar navigation
- [x] 3.1.2 Create settings overview/dashboard page
- [x] 3.2.1 Create `ConfigSection` component
- [x] 3.2.2 Create `ConfigField` base component (handles all input types)
- [x] 3.2.3 Create `ConfigSlider` component (included in ConfigField)
- [x] 3.2.4 Create `ConfigNumber` component (included in ConfigField)
- [x] 3.2.5 Create `ConfigToggle` component (included in ConfigField)
- [x] 3.2.6 Create `ConfigSelect` component (included in ConfigField)
- [x] 3.2.7 Create `ConfigJSON` component (included in ConfigField)
- [x] 3.2.8 Create `SourceBadge` component (included in ConfigField)
- [x] 3.3.1 Create Agent Settings page (via unified system settings page)
- [x] 3.4.1 Create Resilience Settings page (via unified system settings page)
- [x] 3.5.1 Create Observability Settings page (via unified system settings page)
- [x] 3.6.1 Create Feature Flags page (via unified system settings page)
- [x] 3.7.1 Create Audit Log page

---

## Part 4: React Query Hooks

### 4.1 Configuration Hooks

**File**: `frontend/hooks/admin/use-config.ts`

```typescript
// Fetch single config value
export function useConfig(domain: string, key: string) {
  return useQuery({
    queryKey: ['config', domain, key],
    queryFn: () => adminApi.getConfig(domain, key),
  });
}

// Fetch all configs for a domain
export function useDomainConfig(domain: string) {
  return useQuery({
    queryKey: ['config', domain],
    queryFn: () => adminApi.getDomainConfig(domain),
  });
}

// Fetch all system configs
export function useSystemConfig() {
  return useQuery({
    queryKey: ['config'],
    queryFn: () => adminApi.getAllConfig(),
  });
}

// Mutation for setting config
export function useSetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domain, key, value, reason }: SetConfigParams) =>
      adminApi.setConfig(domain, key, value, reason),

    onMutate: async ({ domain, key, value }) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: ['config', domain, key] });
      const previous = queryClient.getQueryData(['config', domain, key]);

      queryClient.setQueryData(['config', domain, key], (old: ConfigValue) => ({
        ...old,
        value,
        source: 'database',
      }));

      return { previous };
    },

    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(
        ['config', variables.domain, variables.key],
        context?.previous,
      );
      toast.error('Failed to update configuration');
    },

    onSuccess: (data) => {
      toast.success('Configuration updated');
      if (data.requiresRestart) {
        toast.warning('Restart required for this change to take effect');
      }
    },

    onSettled: (_, __, { domain, key }) => {
      queryClient.invalidateQueries({ queryKey: ['config', domain, key] });
      queryClient.invalidateQueries({ queryKey: ['config', domain] });
    },
  });
}

// Reset to default
export function useResetConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ domain, key }: ResetConfigParams) =>
      adminApi.resetConfig(domain, key),

    onSuccess: (data) => {
      toast.success(`Reset to ${data.source} default`);
    },

    onSettled: (_, __, { domain, key }) => {
      queryClient.invalidateQueries({ queryKey: ['config', domain, key] });
      queryClient.invalidateQueries({ queryKey: ['config', domain] });
    },
  });
}
```

### Tasks

- [x] 4.1.1 Create `useConfig` hook (useConfigValue)
- [x] 4.1.2 Create `useDomainConfig` hook
- [x] 4.1.3 Create `useSystemConfig` hook
- [x] 4.1.4 Create `useSetConfig` mutation (useSetConfigValue)
- [x] 4.1.5 Create `useResetConfig` mutation (useResetConfigValue)
- [x] 4.1.6 Create `useConfigAuditLog` hook
- [x] 4.2.1 Create admin API client functions
- [x] 4.2.2 Add types for config API

---

## Part 5: Safety Configuration (Read-Only Display)

Some configurations are intentionally NOT user-editable for security reasons. These should be displayed but not modifiable.

### 5.1 Safety Settings Page

```tsx
// frontend/app/settings/safety/page.tsx
export default function SafetySettingsPage() {
  return (
    <SettingsLayout>
      <PageHeader
        title="Safety Configuration"
        description="Security settings (view-only for most settings)"
      />

      <Alert variant="info" className="mb-6">
        <InfoIcon className="h-4 w-4" />
        <AlertTitle>Protected Settings</AlertTitle>
        <AlertDescription>
          Most safety settings are protected and cannot be modified through the UI
          to prevent accidental security weaknesses. Contact your administrator to
          modify these via environment variables.
        </AlertDescription>
      </Alert>

      {/* Hard Limits - View Only */}
      <ConfigSection title="Hard Limits" locked>
        <ConfigDisplay domain="safety" configKey="max_input_length"
          label="Max Input Length" format="number" />
        <ConfigDisplay domain="safety" configKey="max_output_length"
          label="Max Output Length" format="number" />
        <ConfigDisplay domain="safety" configKey="max_tool_calls"
          label="Max Tool Calls per Request" format="number" />
        <ConfigDisplay domain="safety" configKey="max_file_read_size"
          label="Max File Read Size" format="bytes" />
      </ConfigSection>

      {/* Modifiable Safety Settings */}
      <ConfigSection title="Adjustable Thresholds">
        <ConfigSlider domain="safety" configKey="block_threshold"
          label="Risk Block Threshold" min={50} max={100}
          helpText="Block requests with risk score above this threshold" />
        <ConfigToggle domain="safety" configKey="log_violations"
          label="Log Violations" />
      </ConfigSection>

      {/* Blocked Patterns - View Only */}
      <ConfigSection title="Blocked File Patterns" locked collapsible defaultClosed>
        <BlockedPatternsList domain="safety" configKey="blocked_file_patterns" />
      </ConfigSection>
    </SettingsLayout>
  );
}
```

### Tasks

- [x] 5.1.1 Create Safety Settings page (via unified system settings with safety tab)
- [x] 5.1.2 Create `ConfigDisplay` component (ConfigField with disabled state)
- [x] 5.1.3 Create `BlockedPatternsList` component (via JSON config display)
- [x] 5.1.4 Add "locked" visual indicator for protected settings (isEditable: false disables field)

---

## Part 6: Feature Flags

### 6.1 Feature Flags Page

```tsx
// frontend/app/settings/features/page.tsx
export default function FeatureFlagsPage() {
  return (
    <SettingsLayout>
      <PageHeader
        title="Feature Flags"
        description="Enable or disable experimental features"
      />

      <ConfigSection title="Agent Features">
        <FeatureFlagToggle
          domain="features"
          configKey="use_graph_agent"
          label="Graph-Based Agent"
          description="Use the new LangGraph-based agent instead of legacy implementation"
          requiresRestart
        />
        <FeatureFlagToggle
          domain="features"
          configKey="enable_streaming"
          label="Response Streaming"
          description="Stream LLM responses in real-time"
        />
      </ConfigSection>

      <ConfigSection title="Experimental">
        <FeatureFlagToggle
          domain="features"
          configKey="enable_multi_agent"
          label="Multi-Agent Collaboration"
          description="Allow multiple agents to collaborate on complex tasks"
          experimental
        />
      </ConfigSection>
    </SettingsLayout>
  );
}
```

### Tasks

- [x] 6.1.1 Create Feature Flags page (via unified system settings with features tab)
- [x] 6.1.2 Create `FeatureFlagToggle` component (via ConfigField boolean type)
- [x] 6.1.3 Add experimental flag indicator (category badge)
- [x] 6.1.4 Add restart-required indicator (in ConfigField)

---

## Part 7: Audit Log & Change History

### 7.1 Audit Log Page

```tsx
// frontend/app/settings/audit/page.tsx
export default function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>({});
  const { data: logs, isLoading } = useConfigAuditLog(filters);

  return (
    <SettingsLayout>
      <PageHeader title="Configuration Audit Log" />

      <AuditFilters value={filters} onChange={setFilters} />

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Timestamp</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Setting</TableHead>
            <TableHead>Old Value</TableHead>
            <TableHead>New Value</TableHead>
            <TableHead>Reason</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs?.items.map((log) => (
            <TableRow key={log.id}>
              <TableCell>{formatDate(log.changedAt)}</TableCell>
              <TableCell>{log.changedBy}</TableCell>
              <TableCell>
                <code>{log.domain}.{log.key}</code>
              </TableCell>
              <TableCell>
                <ConfigValueDiff value={log.oldValue} />
              </TableCell>
              <TableCell>
                <ConfigValueDiff value={log.newValue} />
              </TableCell>
              <TableCell>{log.changeReason || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Pagination {...logs?.pagination} />
    </SettingsLayout>
  );
}
```

### Tasks

- [x] 7.1.1 Create Audit Log page
- [x] 7.1.2 Create `AuditFilters` component (inline filters in audit page)
- [x] 7.1.3 Create `ConfigValueDiff` component (JSON.stringify display)
- [ ] 7.1.4 Add export to CSV functionality (deferred - nice-to-have)
- [x] 7.1.5 Add date range filtering

---

## Part 8: Environment Variable Documentation

### 8.1 Auto-Generated .env.example

Create a script that generates `.env.example` from config definitions:

```typescript
// scripts/generate-env-example.ts
async function generateEnvExample() {
  const definitions = [
    ...AGENT_CONFIG_DEFINITIONS,
    ...RESILIENCE_CONFIG_DEFINITIONS,
    ...SAFETY_CONFIG_DEFINITIONS,
    ...OBSERVABILITY_CONFIG_DEFINITIONS,
    ...FEATURE_CONFIG_DEFINITIONS,
  ];

  let output = '# Pact Configuration\n';
  output += '# Generated from config definitions\n\n';

  const byCategory = groupBy(definitions, 'domain');

  for (const [domain, configs] of Object.entries(byCategory)) {
    output += `# === ${domain.toUpperCase()} ===\n`;

    for (const config of configs) {
      output += `# ${config.description}\n`;
      output += `# Default: ${config.codeDefault}\n`;
      if (config.validation) {
        output += `# Validation: ${JSON.stringify(config.validation)}\n`;
      }
      output += `${config.envVarName}=${config.codeDefault}\n\n`;
    }
  }

  await writeFile('.env.example', output);
}
```

### Tasks

- [ ] 8.1.1 Create env example generator script (deferred - nice-to-have)
- [ ] 8.1.2 Add to CI to verify .env.example is up-to-date (deferred)
- [ ] 8.1.3 Update CLAUDE.md with new env variables (deferred - configs are self-documenting via UI)

---

## Part 9: Testing

### 9.1 Backend Tests

```typescript
describe('ConfigurationService', () => {
  // @atom IA-XXX
  it('should return database value when set', async () => {
    await service.set('agent', 'chat_temperature', 0.5, 'test');
    const result = await service.get('agent', 'chat_temperature');
    expect(result.value).toBe(0.5);
    expect(result.source).toBe('database');
  });

  // @atom IA-XXX
  it('should fall back to environment when no database value', async () => {
    process.env.AGENT_CHAT_TEMPERATURE = '0.8';
    const result = await service.get('agent', 'chat_temperature');
    expect(result.value).toBe(0.8);
    expect(result.source).toBe('environment');
  });

  // @atom IA-XXX
  it('should fall back to code default when no env or database', async () => {
    delete process.env.AGENT_CHAT_TEMPERATURE;
    const result = await service.get('agent', 'chat_temperature');
    expect(result.value).toBe(0.7);  // Code default
    expect(result.source).toBe('code');
  });

  // @atom IA-XXX
  it('should create audit log entry on change', async () => {
    await service.set('agent', 'chat_temperature', 0.5, 'test-user', 'Testing');
    const logs = await auditRepo.find({ domain: 'agent', key: 'chat_temperature' });
    expect(logs).toHaveLength(1);
    expect(logs[0].changedBy).toBe('test-user');
  });
});
```

### 9.2 Frontend Tests

```typescript
describe('ConfigField', () => {
  it('should display current value with source badge', () => {
    render(<ConfigField domain="agent" configKey="chat_temperature" />);
    expect(screen.getByText('0.7')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('should show reset button when value is from database', () => {
    // Mock database value
    render(<ConfigField domain="agent" configKey="chat_temperature" />);
    expect(screen.getByText('Reset')).toBeInTheDocument();
  });
});
```

### Tasks

- [x] 9.1.1 Test ConfigurationService layered lookup
- [x] 9.1.2 Test ConfigurationService caching
- [x] 9.1.3 Test audit log creation
- [x] 9.1.4 Test API endpoints
- [ ] 9.2.1 Test ConfigField component (deferred - frontend component tests)
- [ ] 9.2.2 Test ConfigSection component (deferred - frontend component tests)
- [ ] 9.2.3 Test config hooks (deferred - frontend hook tests)

---

## Summary

### Files to Create

| File | Purpose |
|------|---------|
| `src/common/configuration/configuration.service.ts` | Core service |
| `src/common/configuration/configuration.repository.ts` | Database access |
| `src/common/configuration/definitions/*.ts` | Config definitions |
| `src/modules/admin/configuration.controller.ts` | API endpoints |
| `src/migrations/XXXXXX-CreateSystemConfigurations.ts` | Database schema |
| `frontend/app/settings/layout.tsx` | Settings layout |
| `frontend/app/settings/agent/page.tsx` | Agent settings |
| `frontend/app/settings/resilience/page.tsx` | Resilience settings |
| `frontend/app/settings/safety/page.tsx` | Safety settings (view-only) |
| `frontend/app/settings/features/page.tsx` | Feature flags |
| `frontend/app/settings/audit/page.tsx` | Audit log |
| `frontend/components/config/*.tsx` | Reusable config components |
| `frontend/hooks/admin/use-config.ts` | React Query hooks |

### Total Task Count

| Part | Tasks |
|------|-------|
| Part 1: Configuration Service | 14 |
| Part 2: Admin API | 10 |
| Part 3: Frontend UI | 14 |
| Part 4: React Query Hooks | 8 |
| Part 5: Safety Configuration | 4 |
| Part 6: Feature Flags | 4 |
| Part 7: Audit Log | 5 |
| Part 8: Env Documentation | 3 |
| Part 9: Testing | 7 |
| **Total** | **69** |

### Estimated Effort

- **Backend**: 2-3 days
- **Frontend**: 3-4 days
- **Testing**: 1-2 days
- **Total**: ~1 week

### Dependencies

- Phase 3.6 (LangGraph) - for integrating with agent configs
- Existing LLM configuration entity - for migration/compatibility

### Migration Path

1. Create new `system_configurations` table
2. Migrate existing `llm_configurations` fields to new structure
3. Update services to use `ConfigurationService`
4. Deploy backend changes
5. Deploy frontend admin UI
6. Document new environment variables
