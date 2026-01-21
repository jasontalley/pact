# Pact Database Schema Documentation

**Version**: 1.0  
**Last Updated**: 2026-01-16  
**Database**: PostgreSQL 16  
**ORM**: TypeORM

---

## Table of Contents

1. [Overview](#overview)
2. [Core Tables](#core-tables)
3. [LLM Tracking Tables](#llm-tracking-tables)
4. [Relationships](#relationships)
5. [Indexes](#indexes)
6. [Views](#views)
7. [Constraints](#constraints)
8. [Data Types and Conventions](#data-types-and-conventions)
9. [Entity Mappings](#entity-mappings)

---

## Overview

The Pact database schema consists of **10 tables** organized into two categories:

- **Core Tables (8)**: Intent management, validation, evidence, and system tracking
- **LLM Tracking Tables (2)**: Configuration and usage tracking for AI agents

### Schema Statistics

- **Total Tables**: 10
- **Total Indexes**: 15+ (including composite and partial indexes)
- **Total Views**: 2 (cost aggregation views)
- **Foreign Key Relationships**: 8
- **JSONB Columns**: 8 (for flexible metadata storage)

### Design Principles

1. **Immutability**: Committed intent cannot be modified (INV-004)
2. **Traceability**: All artifacts reference their source (INV-005)
3. **Auditability**: Agent actions and changes are logged
4. **Flexibility**: JSONB columns for extensible metadata
5. **Performance**: Strategic indexes on frequently queried columns

---

## Core Tables

### 1. `atoms`

**Purpose**: Stores Intent Atoms - irreducible behavioral primitives that are observable, falsifiable, and implementation-agnostic.

**TypeORM Entity**: `Atom` (`src/modules/atoms/atom.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `uuid_generate_v4()` | Internal unique identifier |
| `atom_id` | VARCHAR(20) | UNIQUE, NOT NULL | Human-readable ID (e.g., "IA-001") |
| `description` | TEXT | NOT NULL | Behavioral description of the atom |
| `category` | VARCHAR(50) | NOT NULL | Category: functional, performance, security, reliability, etc. |
| `quality_score` | DECIMAL(5,2) | NULLABLE, CHECK (0-100) | Quality score from validator (0-100) |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'draft' | Status: draft, committed, superseded |
| `superseded_by` | UUID | NULLABLE, FK → `atoms(id)` | Reference to superseding atom (if superseded) |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `committed_at` | TIMESTAMP | NULLABLE | Commitment timestamp (when status = 'committed') |
| `created_by` | VARCHAR(255) | NULLABLE | Creator identifier (user/agent) |
| `metadata` | JSONB | DEFAULT '{}' | Extensible metadata (analysis results, tags, etc.) |
| `observable_outcomes` | JSONB | DEFAULT '[]' | Phase 1: Observable outcomes with measurement criteria |
| `falsifiability_criteria` | JSONB | DEFAULT '[]' | Phase 1: Conditions that would disprove the atom's intent |
| `tags` | JSONB | DEFAULT '[]' | Phase 1: User-defined tags for filtering/organization |
| `canvas_position` | JSONB | NULLABLE | Phase 1: Position {x, y} on Canvas UI |
| `parent_intent` | TEXT | NULLABLE | Phase 1: Original user input that spawned this atom |
| `refinement_history` | JSONB | DEFAULT '[]' | Phase 1: History of refinement iterations |

**Indexes**:
- `idx_atoms_status` on `status`
- `idx_atoms_atom_id` on `atom_id` (unique)

**Relationships**:
- Self-referential: `superseded_by` → `atoms(id)` (for supersession chain)
- Referenced by: `molecule_atoms`, `validators`, `evidence`, `clarifications`

**Business Rules**:
- `atom_id` must match pattern `IA-\d{3}` (enforced in application)
- `quality_score` must be between 0 and 100 (database constraint)
- Once `status = 'committed'`, atom becomes immutable (INV-004)
- Superseded atoms cannot be modified; new atom must be created

**Phase 1 JSONB Schemas**:

**`observable_outcomes`** - Array of observable outcomes:

```json
[
  {
    "description": "User receives confirmation email",
    "measurementCriteria": "Email delivered within 30 seconds"
  }
]
```

**`falsifiability_criteria`** - Array of falsification conditions:

```json
[
  {
    "condition": "Response time exceeds 2 seconds",
    "expectedBehavior": "Performance violation logged"
  }
]
```

**`canvas_position`** - Position on Canvas UI:

```json
{
  "x": 150,
  "y": 200
}
```

**`refinement_history`** - Array of refinement records:

```json
[
  {
    "timestamp": "2026-01-21T10:30:00Z",
    "feedback": "Add time constraint",
    "previousDescription": "User can login",
    "newDescription": "User can login within 3 seconds",
    "source": "ai"
  }
]
```

**Example**:
```sql
INSERT INTO atoms (atom_id, description, category, quality_score, status, created_by)
VALUES (
  'IA-001',
  'User authentication must complete within 2 seconds',
  'performance',
  85.5,
  'draft',
  'user@example.com'
);
```

---

### 2. `molecules`

**Purpose**: Stores Molecules - descriptive groupings of atoms that represent features or capabilities. Molecules are mutable "lenses" for human understanding.

**TypeORM Entity**: `Molecule` (`src/modules/molecules/molecule.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `uuid_generate_v4()` | Internal unique identifier |
| `molecule_id` | VARCHAR(20) | UNIQUE, NOT NULL | Human-readable ID (e.g., "MOL-001") |
| `name` | VARCHAR(255) | NOT NULL | Molecule name |
| `description` | TEXT | NULLABLE | Human-readable description |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Last update timestamp |
| `created_by` | VARCHAR(255) | NULLABLE | Creator identifier |
| `metadata` | JSONB | DEFAULT '{}' | Extensible metadata |

**Indexes**:
- `idx_molecules_molecule_id` on `molecule_id` (unique)

**Relationships**:
- Many-to-many with `atoms` via `molecule_atoms` join table

**Business Rules**:
- `molecule_id` must match pattern `MOL-\d{3}` (enforced in application)
- Molecules are mutable (unlike atoms)
- Molecules are non-authoritative (atoms are truth)

**Example**:
```sql
INSERT INTO molecules (molecule_id, name, description, created_by)
VALUES (
  'MOL-001',
  'Secure Checkout',
  'Complete payment flow with authentication and security',
  'user@example.com'
);
```

---

### 3. `molecule_atoms`

**Purpose**: Join table for many-to-many relationship between molecules and atoms.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `molecule_id` | UUID | PRIMARY KEY, FK → `molecules(id)` ON DELETE CASCADE | Molecule reference |
| `atom_id` | UUID | PRIMARY KEY, FK → `atoms(id)` ON DELETE CASCADE | Atom reference |
| `position` | INTEGER | NULLABLE | Order within molecule (for display) |

**Indexes**:
- Composite primary key on (`molecule_id`, `atom_id`)

**Business Rules**:
- Same atom can appear in multiple molecules (reusability)
- Deleting a molecule cascades to remove all associations
- `position` allows ordering atoms within a molecule

**Example**:
```sql
INSERT INTO molecule_atoms (molecule_id, atom_id, position)
VALUES (
  (SELECT id FROM molecules WHERE molecule_id = 'MOL-001'),
  (SELECT id FROM atoms WHERE atom_id = 'IA-003'),
  1
);
```

---

### 4. `validators`

**Purpose**: Stores validators (tests and validation rules) linked to atoms. Validators are the "substrate" that prove atoms are satisfied.

**TypeORM Entity**: `Validator` (`src/modules/validators/validator.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `uuid_generate_v4()` | Internal unique identifier |
| `atom_id` | UUID | NOT NULL, FK → `atoms(id)` ON DELETE CASCADE | Reference to atom |
| `validator_type` | VARCHAR(50) | NOT NULL | Type: gherkin, executable, declarative |
| `content` | TEXT | NOT NULL | Validator content (Gherkin, code, etc.) |
| `format` | VARCHAR(20) | NOT NULL | Format: gherkin, typescript, json |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `metadata` | JSONB | DEFAULT '{}' | Extensible metadata |

**Relationships**:
- Many-to-one with `atoms` (each validator belongs to one atom)
- Referenced by `evidence` (evidence links to validator that produced it)

**Business Rules**:
- Validators must reference a committed atom (enforced in application)
- Multiple validators can exist for the same atom
- Validator content format must match `format` field

**Example**:
```sql
INSERT INTO validators (atom_id, validator_type, content, format)
VALUES (
  (SELECT id FROM atoms WHERE atom_id = 'IA-003'),
  'gherkin',
  'Given a payment request\nWhen user submits payment\nThen payment processes within 5 seconds',
  'gherkin'
);
```

---

### 5. `evidence`

**Purpose**: Stores immutable execution results that prove atoms are satisfied or violated. Evidence is first-class and immutable (INV-007).

**TypeORM Entity**: `Evidence` (`src/modules/evidence/evidence.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `uuid_generate_v4()` | Internal unique identifier |
| `atom_id` | UUID | NOT NULL, FK → `atoms(id)` ON DELETE CASCADE | Reference to atom |
| `validator_id` | UUID | NULLABLE, FK → `validators(id)` | Reference to validator (if applicable) |
| `result` | VARCHAR(20) | NOT NULL | Result: pass, fail, error |
| `output` | TEXT | NULLABLE | Execution output (test results, logs, etc.) |
| `timestamp` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Execution timestamp |
| `execution_context` | JSONB | NULLABLE | Test environment, CI run info, etc. |
| `metadata` | JSONB | DEFAULT '{}' | Extensible metadata |

**Indexes**:
- `idx_evidence_atom_id` on `atom_id`
- `idx_evidence_timestamp` on `timestamp` (DESC for recent-first queries)

**Relationships**:
- Many-to-one with `atoms` (evidence proves atom satisfaction)
- Many-to-one with `validators` (evidence from validator execution)

**Business Rules**:
- Evidence is immutable once created (INV-007)
- Evidence must reference a committed atom (enforced in application)
- `result` must be one of: pass, fail, error
- `execution_context` stores environment details (CI run ID, test environment, etc.)

**Example**:
```sql
INSERT INTO evidence (atom_id, validator_id, result, output, execution_context)
VALUES (
  (SELECT id FROM atoms WHERE atom_id = 'IA-003'),
  (SELECT id FROM validators WHERE id = '...'),
  'pass',
  'All tests passed. Execution time: 1.2s',
  '{"ci_run_id": "12345", "environment": "staging", "test_runner": "jest"}'
);
```

---

### 6. `clarifications`

**Purpose**: Stores Clarification Artifacts for resolving post-commitment ambiguity (INV-009). Allows minor clarifications without requiring full supersession.

**TypeORM Entity**: `Clarification` (`src/modules/clarifications/clarification.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `uuid_generate_v4()` | Internal unique identifier |
| `atom_id` | UUID | NOT NULL, FK → `atoms(id)` ON DELETE CASCADE | Reference to atom |
| `question` | TEXT | NOT NULL | The ambiguity question |
| `answer` | TEXT | NOT NULL | Human-provided answer |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `created_by` | VARCHAR(255) | NULLABLE | Creator identifier (must be human) |
| `metadata` | JSONB | DEFAULT '{}' | Extensible metadata |

**Relationships**:
- Many-to-one with `atoms` (clarifications resolve ambiguity in atoms)

**Business Rules**:
- Clarifications are immutable once created
- Clarifications cannot contradict committed intent (enforced in application)
- Only humans can create clarifications (INV-006)
- Clarifications are logged and auditable

**Example**:
```sql
INSERT INTO clarifications (atom_id, question, answer, created_by)
VALUES (
  (SELECT id FROM atoms WHERE atom_id = 'IA-003'),
  'Does "securely" mean TLS 1.2 or TLS 1.3?',
  'TLS 1.3 is required. Minimum version is TLS 1.2.',
  'user@example.com'
);
```

---

### 7. `agent_actions`

**Purpose**: Audit log of all agent decisions and actions. Enables traceability and accountability for agent behavior.

**TypeORM Entity**: `AgentAction` (`src/modules/agents/agent-action.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `uuid_generate_v4()` | Internal unique identifier |
| `agent_name` | VARCHAR(100) | NOT NULL | Agent identifier (e.g., "atomization-agent") |
| `action_type` | VARCHAR(50) | NOT NULL | Action type (e.g., "atomize", "validate-quality") |
| `input` | JSONB | NULLABLE | Input data to agent |
| `output` | JSONB | NULLABLE | Output from agent |
| `confidence_score` | DECIMAL(5,2) | NULLABLE | LLM confidence score (0-1) |
| `human_approved` | BOOLEAN | NULLABLE | Whether human approved the action |
| `timestamp` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Action timestamp |
| `metadata` | JSONB | DEFAULT '{}' | Extensible metadata |

**Indexes**:
- `idx_agent_actions_agent_name` on `agent_name`
- `idx_agent_actions_timestamp` on `timestamp` (DESC for recent-first queries)

**Business Rules**:
- All agent actions must be logged (enforced in application)
- `confidence_score` is required for LLM-based actions
- `human_approved` tracks whether human reviewed/approved the action
- Logs are immutable (append-only)

**Example**:
```sql
INSERT INTO agent_actions (agent_name, action_type, input, output, confidence_score, human_approved)
VALUES (
  'atomization-agent',
  'atomize',
  '{"intent": "User authentication must complete within 2 seconds"}',
  '{"atom_id": "IA-001", "confidence": 0.85, "analysis": "Atomic and testable"}',
  0.85,
  true
);
```

---

### 8. `bootstrap_scaffolds`

**Purpose**: Tracks temporary scaffolding code with explicit demolition charges. Ensures bootstrap code is eventually removed.

**TypeORM Entity**: `BootstrapScaffold` (`src/modules/bootstrap/bootstrap-scaffold.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `uuid_generate_v4()` | Internal unique identifier |
| `scaffold_id` | VARCHAR(20) | UNIQUE, NOT NULL | Human-readable ID (e.g., "BS-001") |
| `scaffold_type` | VARCHAR(20) | NOT NULL | Type: seed, migration, tooling, runtime |
| `purpose` | TEXT | NOT NULL | Purpose description |
| `exit_criterion` | TEXT | NOT NULL | Testable condition for removal |
| `target_removal` | VARCHAR(20) | NOT NULL | Target phase: Phase 0, Phase 1, Phase 2 |
| `owner` | VARCHAR(255) | NULLABLE | Owner identifier |
| `removal_ticket` | VARCHAR(100) | NULLABLE | Tracking ticket for removal |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'active' | Status: active, demolished |
| `created_at` | TIMESTAMP | DEFAULT CURRENT_TIMESTAMP | Creation timestamp |
| `demolished_at` | TIMESTAMP | NULLABLE | Demolition timestamp |
| `demolished_by` | VARCHAR(255) | NULLABLE | Who demolished it |
| `notes` | TEXT | NULLABLE | Additional notes |

**Indexes**:
- `idx_bootstrap_scaffolds_status` on `status`

**Business Rules**:
- `scaffold_id` must match pattern `BS-\d{3}` (enforced in application)
- `scaffold_type` must be one of: seed, migration, tooling, runtime
- `target_removal` must be one of: Phase 0, Phase 1, Phase 2
- Once `status = 'demolished'`, scaffold is considered removed

**Example**:
```sql
INSERT INTO bootstrap_scaffolds (
  scaffold_id, scaffold_type, purpose, exit_criterion, target_removal, owner, status
)
VALUES (
  'BS-001',
  'tooling',
  'Test quality analyzer',
  'Pact runtime provides built-in test quality analysis',
  'Phase 1',
  '@jasontalley',
  'active'
);
```

---

## LLM Tracking Tables

### 9. `llm_configurations`

**Purpose**: Stores user-configurable LLM service settings. Enables UI-based management of LLM behavior, cost control, and reliability features.

**TypeORM Entity**: `LLMConfiguration` (`src/modules/llm/llm-configuration.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Internal unique identifier |
| `config_name` | VARCHAR(255) | UNIQUE, NOT NULL | Configuration name (e.g., "default") |
| `description` | TEXT | NULLABLE | Human-readable description |
| `is_active` | BOOLEAN | DEFAULT false | Whether this config is active |
| `primary_model` | JSONB | NOT NULL | Primary model configuration |
| `fallback_models` | JSONB | DEFAULT '[]' | Array of fallback model configs |
| `default_timeout` | INTEGER | DEFAULT 30000 | Default timeout in milliseconds |
| `streaming_enabled` | BOOLEAN | DEFAULT false | Whether streaming is enabled |
| `circuit_breaker_config` | JSONB | DEFAULT `{...}` | Circuit breaker settings |
| `retry_config` | JSONB | DEFAULT `{...}` | Retry policy settings |
| `rate_limit_config` | JSONB | DEFAULT `{...}` | Rate limiting settings |
| `cache_config` | JSONB | DEFAULT `{...}` | Caching settings |
| `budget_config` | JSONB | DEFAULT `{...}` | Cost budget settings |
| `observability_config` | JSONB | DEFAULT `{...}` | Logging/metrics settings |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Creation timestamp |
| `updated_at` | TIMESTAMP | DEFAULT NOW() | Last update timestamp (auto-updated) |
| `created_by` | VARCHAR(255) | NULLABLE | Creator identifier |
| `updated_by` | VARCHAR(255) | NULLABLE | Last updater identifier |

**Indexes**:
- `idx_llm_configurations_active` on `is_active` WHERE `is_active = true` (partial index)
- `idx_llm_configurations_name` on `config_name` (unique)

**Triggers**:
- `trigger_update_llm_configurations_updated_at`: Auto-updates `updated_at` on row update

**JSONB Schema**:

**`primary_model`**:
```json
{
  "provider": "openai",
  "modelName": "gpt-4-turbo-preview",
  "temperature": 0.2,
  "maxTokens": 4096,
  "costPerInputToken": 0.00001,
  "costPerOutputToken": 0.00003
}
```

**`circuit_breaker_config`**:
```json
{
  "enabled": true,
  "failureThreshold": 5,
  "successThreshold": 2,
  "timeout": 60000,
  "monitoringWindow": 120000
}
```

**`retry_config`**:
```json
{
  "enabled": true,
  "maxRetries": 3,
  "initialDelay": 1000,
  "maxDelay": 10000,
  "backoffMultiplier": 2,
  "retryableStatusCodes": [429, 500, 502, 503, 504],
  "retryableErrors": ["ECONNRESET", "ETIMEDOUT", "rate_limit_exceeded"]
}
```

**`rate_limit_config`**:
```json
{
  "enabled": true,
  "requestsPerMinute": 60,
  "burstSize": 10,
  "queueEnabled": true,
  "maxQueueSize": 100
}
```

**`cache_config`**:
```json
{
  "enabled": true,
  "ttl": 3600,
  "keyPrefix": "llm:cache:",
  "excludePatterns": []
}
```

**`budget_config`**:
```json
{
  "enabled": true,
  "dailyLimit": 10.0,
  "monthlyLimit": 200.0,
  "alertThreshold": 80,
  "hardStop": true
}
```

**`observability_config`**:
```json
{
  "metricsEnabled": true,
  "detailedLogging": true,
  "tracingEnabled": true,
  "logLevel": "info"
}
```

**Default Configuration**:
The schema includes a default configuration inserted on initialization:
- `config_name`: "default"
- `is_active`: true
- Primary model: OpenAI GPT-4 Turbo Preview
- Fallback model: OpenAI GPT-3.5 Turbo

---

### 10. `llm_usage_tracking`

**Purpose**: Tracks all LLM API calls for cost monitoring, performance analysis, and budget enforcement.

**TypeORM Entity**: `LLMUsageTracking` (`src/modules/llm/llm-usage-tracking.entity.ts`)

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | UUID | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Internal unique identifier |
| `request_id` | VARCHAR(255) | UNIQUE, NOT NULL | Unique request identifier |
| `config_id` | UUID | NULLABLE, FK → `llm_configurations(id)` | Reference to LLM configuration used |
| `provider` | VARCHAR(50) | NOT NULL | LLM provider (e.g., "openai") |
| `model_name` | VARCHAR(255) | NOT NULL | Model name (e.g., "gpt-4-turbo-preview") |
| `input_tokens` | INTEGER | NOT NULL | Input token count |
| `output_tokens` | INTEGER | NOT NULL | Output token count |
| `total_tokens` | INTEGER | NOT NULL | Total token count |
| `input_cost` | DECIMAL(10,6) | NOT NULL | Cost for input tokens |
| `output_cost` | DECIMAL(10,6) | NOT NULL | Cost for output tokens |
| `total_cost` | DECIMAL(10,6) | NOT NULL | Total cost |
| `latency_ms` | INTEGER | NULLABLE | Request latency in milliseconds |
| `cache_hit` | BOOLEAN | DEFAULT false | Whether response was from cache |
| `retry_count` | INTEGER | DEFAULT 0 | Number of retries attempted |
| `circuit_breaker_open` | BOOLEAN | DEFAULT false | Whether circuit breaker was open |
| `agent_name` | VARCHAR(255) | NULLABLE | Agent that made the request |
| `purpose` | TEXT | NULLABLE | Purpose of the request |
| `success` | BOOLEAN | NOT NULL | Whether request succeeded |
| `error_message` | TEXT | NULLABLE | Error message (if failed) |
| `created_at` | TIMESTAMP | DEFAULT NOW() | Request timestamp |

**Indexes**:
- `idx_llm_usage_tracking_created_at` on `created_at` (DESC for recent-first queries)
- `idx_llm_usage_tracking_config_id` on `config_id`
- `idx_llm_usage_tracking_agent_name` on `agent_name`
- `idx_llm_usage_tracking_success` on `success`

**Relationships**:
- Many-to-one with `llm_configurations` (tracks which config was used)

**Business Rules**:
- All LLM API calls must be logged (enforced in application)
- `total_tokens = input_tokens + output_tokens` (enforced in application)
- `total_cost = input_cost + output_cost` (enforced in application)
- Logs are immutable (append-only)

**Example**:
```sql
INSERT INTO llm_usage_tracking (
  request_id, config_id, provider, model_name,
  input_tokens, output_tokens, total_tokens,
  input_cost, output_cost, total_cost,
  latency_ms, agent_name, purpose, success
)
VALUES (
  'req-12345',
  (SELECT id FROM llm_configurations WHERE config_name = 'default'),
  'openai',
  'gpt-4-turbo-preview',
  150, 75, 225,
  0.0015, 0.00225, 0.00375,
  1250,
  'atomization-agent',
  'Analyze intent for atomicity',
  true
);
```

---

## Relationships

### Entity Relationship Diagram

```
atoms (1) ──< (N) molecule_atoms (N) >── (1) molecules
  │
  ├──< (N) validators
  │
  ├──< (N) evidence
  │
  ├──< (N) clarifications
  │
  └──< (1) atoms (superseded_by self-reference)

validators (1) ──< (N) evidence

llm_configurations (1) ──< (N) llm_usage_tracking
```

### Foreign Key Constraints

| From Table | From Column | To Table | To Column | On Delete |
|------------|-------------|----------|-----------|-----------|
| `atoms` | `superseded_by` | `atoms` | `id` | SET NULL |
| `molecule_atoms` | `molecule_id` | `molecules` | `id` | CASCADE |
| `molecule_atoms` | `atom_id` | `atoms` | `id` | CASCADE |
| `validators` | `atom_id` | `atoms` | `id` | CASCADE |
| `evidence` | `atom_id` | `atoms` | `id` | CASCADE |
| `evidence` | `validator_id` | `validators` | `id` | SET NULL |
| `clarifications` | `atom_id` | `atoms` | `id` | CASCADE |
| `llm_usage_tracking` | `config_id` | `llm_configurations` | `id` | SET NULL |

**Cascade Behavior**:
- Deleting an atom cascades to delete related validators, evidence, and clarifications
- Deleting a molecule cascades to delete molecule-atom associations
- Deleting a validator sets `validator_id` to NULL in evidence (preserves evidence)

---

## Indexes

### Performance Indexes

| Index Name | Table | Column(s) | Type | Purpose |
|------------|-------|-----------|------|---------|
| `idx_atoms_status` | `atoms` | `status` | B-tree | Filter by status (draft/committed/superseded) |
| `idx_atoms_atom_id` | `atoms` | `atom_id` | B-tree (unique) | Fast lookup by human-readable ID |
| `idx_molecules_molecule_id` | `molecules` | `molecule_id` | B-tree (unique) | Fast lookup by human-readable ID |
| `idx_evidence_atom_id` | `evidence` | `atom_id` | B-tree | Find all evidence for an atom |
| `idx_evidence_timestamp` | `evidence` | `timestamp` | B-tree | Recent-first evidence queries |
| `idx_agent_actions_agent_name` | `agent_actions` | `agent_name` | B-tree | Filter by agent |
| `idx_agent_actions_timestamp` | `agent_actions` | `timestamp` | B-tree | Recent-first action queries |
| `idx_bootstrap_scaffolds_status` | `bootstrap_scaffolds` | `status` | B-tree | Filter active vs. demolished |
| `idx_llm_configurations_active` | `llm_configurations` | `is_active` | B-tree (partial) | Fast lookup of active configs |
| `idx_llm_configurations_name` | `llm_configurations` | `config_name` | B-tree (unique) | Fast lookup by name |
| `idx_llm_usage_tracking_created_at` | `llm_usage_tracking` | `created_at` | B-tree | Recent-first usage queries |
| `idx_llm_usage_tracking_config_id` | `llm_usage_tracking` | `config_id` | B-tree | Filter by configuration |
| `idx_llm_usage_tracking_agent_name` | `llm_usage_tracking` | `agent_name` | B-tree | Filter by agent |
| `idx_llm_usage_tracking_success` | `llm_usage_tracking` | `success` | B-tree | Filter successful vs. failed requests |

**Partial Indexes**:
- `idx_llm_configurations_active`: Only indexes rows where `is_active = true` (reduces index size)

---

## Views

### 1. `llm_daily_costs`

**Purpose**: Aggregates LLM usage and costs by day for reporting and budget monitoring.

**Columns**:
- `date` (DATE): Aggregation date
- `config_id` (UUID): LLM configuration used
- `agent_name` (VARCHAR): Agent that made requests
- `provider` (VARCHAR): LLM provider
- `model_name` (VARCHAR): Model used
- `request_count` (BIGINT): Number of requests
- `total_input_tokens` (BIGINT): Sum of input tokens
- `total_output_tokens` (BIGINT): Sum of output tokens
- `total_tokens` (BIGINT): Sum of total tokens
- `total_cost` (DECIMAL): Sum of costs
- `avg_latency_ms` (DECIMAL): Average latency
- `cache_hits` (BIGINT): Number of cache hits
- `total_retries` (BIGINT): Sum of retry counts
- `successful_requests` (BIGINT): Count of successful requests
- `failed_requests` (BIGINT): Count of failed requests

**Usage**:
```sql
SELECT * FROM llm_daily_costs
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC, total_cost DESC;
```

---

### 2. `llm_monthly_costs`

**Purpose**: Aggregates LLM usage and costs by month for long-term budget analysis.

**Columns**:
- `month` (TIMESTAMP): Month (truncated to first day)
- `config_id` (UUID): LLM configuration used
- `agent_name` (VARCHAR): Agent that made requests
- `provider` (VARCHAR): LLM provider
- `model_name` (VARCHAR): Model used
- `request_count` (BIGINT): Number of requests
- `total_tokens` (BIGINT): Sum of total tokens
- `total_cost` (DECIMAL): Sum of costs
- `avg_latency_ms` (DECIMAL): Average latency

**Usage**:
```sql
SELECT * FROM llm_monthly_costs
WHERE month >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '3 months')
ORDER BY month DESC, total_cost DESC;
```

---

## Constraints

### Check Constraints

| Table | Constraint | Description |
|-------|------------|-------------|
| `atoms` | `quality_score >= 0 AND quality_score <= 100` | Quality score must be 0-100 |

### Unique Constraints

| Table | Column(s) | Description |
|-------|-----------|-------------|
| `atoms` | `atom_id` | Human-readable atom IDs must be unique |
| `molecules` | `molecule_id` | Human-readable molecule IDs must be unique |
| `bootstrap_scaffolds` | `scaffold_id` | Human-readable scaffold IDs must be unique |
| `llm_configurations` | `config_name` | Configuration names must be unique |
| `llm_usage_tracking` | `request_id` | Request IDs must be unique |

### Not Null Constraints

All primary keys, foreign keys (except nullable ones), and core business fields are NOT NULL to ensure data integrity.

---

## Data Types and Conventions

### UUIDs

- **Usage**: All primary keys and foreign keys use UUID v4
- **Generation**: `uuid_generate_v4()` or `gen_random_uuid()`
- **Rationale**: Distributed system compatibility, no sequential ID exposure

### Timestamps

- **Type**: `TIMESTAMP` (without timezone)
- **Default**: `CURRENT_TIMESTAMP` or `NOW()`
- **Convention**: Use `created_at`, `updated_at`, `timestamp`, `committed_at`, `demolished_at` naming

### JSONB

- **Usage**: Flexible metadata storage, configuration objects
- **Benefits**: Queryable, indexable, schema-less
- **Tables Using JSONB**: `atoms.metadata`, `molecules.metadata`, `validators.metadata`, `evidence.execution_context`, `evidence.metadata`, `clarifications.metadata`, `agent_actions.input`, `agent_actions.output`, `agent_actions.metadata`, `llm_configurations.*_config`

### VARCHAR Lengths

- **Short IDs**: `VARCHAR(20)` - atom_id, molecule_id, scaffold_id
- **Names**: `VARCHAR(255)` - names, emails, identifiers
- **Types**: `VARCHAR(50)` - categories, types, providers
- **Tickets**: `VARCHAR(100)` - removal tickets

### DECIMAL Precision

- **Quality Scores**: `DECIMAL(5,2)` - 0.00 to 100.00
- **Confidence Scores**: `DECIMAL(5,2)` - 0.00 to 1.00
- **Costs**: `DECIMAL(10,6)` - Up to 9999.999999

---

## Entity Mappings

### TypeORM Entities

All tables have corresponding TypeORM entities in `src/modules/{module}/{entity}.entity.ts`:

| Table | Entity Class | Module |
|-------|--------------|--------|
| `atoms` | `Atom` | `atoms` |
| `molecules` | `Molecule` | `molecules` |
| `molecule_atoms` | (Join table, no entity) | `molecules` |
| `validators` | `Validator` | `validators` |
| `evidence` | `Evidence` | `evidence` |
| `clarifications` | `Clarification` | `clarifications` |
| `agent_actions` | `AgentAction` | `agents` |
| `bootstrap_scaffolds` | `BootstrapScaffold` | `bootstrap` |
| `llm_configurations` | `LLMConfiguration` | `llm` |
| `llm_usage_tracking` | `LLMUsageTracking` | `llm` |

### Naming Conventions

- **Database**: snake_case (e.g., `atom_id`, `created_at`)
- **TypeORM**: camelCase (e.g., `atomId`, `createdAt`)
- **Column Mapping**: TypeORM `@Column({ name: 'snake_case' })` decorator maps camelCase to snake_case

### Relationships

TypeORM relationships are defined using decorators:
- `@ManyToOne()` / `@OneToMany()`: One-to-many relationships
- `@ManyToMany()`: Many-to-many relationships (with `@JoinTable()`)
- `@JoinColumn()`: Foreign key column specification

---

## Migration Strategy

### Current State

- **Initialization**: Schema created via `docker/postgres/init.sql` on container startup
- **TypeORM Migrations**: Migration infrastructure exists but not yet used
- **Future**: Migrations will be used for schema evolution

### Migration Commands

```bash
# Generate migration
npm run migration:generate -- -n MigrationName

# Run migrations
npm run migration:run

# Revert migration
npm run migration:revert
```

---

## Query Examples

### Find All Committed Atoms

```sql
SELECT atom_id, description, category, quality_score, committed_at
FROM atoms
WHERE status = 'committed'
ORDER BY committed_at DESC;
```

### Find Evidence for an Atom

```sql
SELECT e.result, e.output, e.timestamp, v.validator_type
FROM evidence e
LEFT JOIN validators v ON e.validator_id = v.id
WHERE e.atom_id = (SELECT id FROM atoms WHERE atom_id = 'IA-001')
ORDER BY e.timestamp DESC;
```

### Find Orphan Atoms (No Validators)

```sql
SELECT a.atom_id, a.description
FROM atoms a
LEFT JOIN validators v ON a.id = v.atom_id
WHERE a.status = 'committed' AND v.id IS NULL;
```

### Calculate Daily LLM Costs

```sql
SELECT date, agent_name, total_cost, request_count
FROM llm_daily_costs
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY date DESC, total_cost DESC;
```

### Find Active Bootstrap Scaffolds

```sql
SELECT scaffold_id, scaffold_type, purpose, target_removal, owner
FROM bootstrap_scaffolds
WHERE status = 'active'
ORDER BY target_removal, scaffold_id;
```

---

## Schema Evolution

### Versioning

- Schema version is tracked in application code (not in database)
- Future: Add `schema_version` table for migration tracking

### Backward Compatibility

- New columns are added as NULLABLE when possible
- JSONB columns allow schema evolution without migrations
- Deprecated columns are marked in application code before removal

### Breaking Changes

Breaking changes require:
1. Migration script
2. Application code update
3. Data migration (if needed)
4. Documentation update

---

## Performance Considerations

### Index Strategy

- Indexes on frequently queried columns (status, timestamps, foreign keys)
- Partial indexes for filtered queries (active configurations)
- Composite indexes for multi-column queries (future)

### Query Optimization

- Use indexes for WHERE clauses
- Limit result sets with LIMIT/OFFSET
- Use EXPLAIN ANALYZE for query planning

### JSONB Queries

- Use GIN indexes for JSONB columns (future optimization)
- Query JSONB with `->` and `->>` operators
- Use `@>` operator for containment queries

---

## Security Considerations

### Data Protection

- Sensitive data (API keys, tokens) stored in environment variables, not database
- User identifiers stored as VARCHAR (not PII unless required)
- Audit trail via `agent_actions` and timestamps

### Access Control

- Database access controlled via PostgreSQL roles
- Application-level authorization (future: RBAC)

### Immutability

- Committed atoms cannot be modified (application-level enforcement)
- Evidence is append-only (application-level enforcement)
- Audit logs are append-only (application-level enforcement)

---

## References

- **Database Initialization**: `docker/postgres/init.sql`
- **TypeORM Entities**: `src/modules/*/*.entity.ts`
- **Database Config**: `src/config/database/database.config.ts`
- **Migration Guide**: See [CLAUDE.md](../CLAUDE.md) for migration workflow

---

**Last Updated**: 2026-01-16  
**Schema Version**: 1.0  
**PostgreSQL Version**: 16
