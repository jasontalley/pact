# API Changelog

All notable changes to the Pact API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2026-02-09

### Added

#### GitHub Integration (`/admin/repository`)

- `PATCH /admin/repository/github` - Update GitHub configuration (owner, repo, PAT, default branch)
- `POST /admin/repository/test-github` - Test GitHub connectivity via `git ls-remote`
- `GET /admin/repository/github` - Get current GitHub configuration (PAT masked)

#### API Key Authentication (`/admin/api-keys`)

- `POST /admin/api-keys` - Create a new API key (returns raw key once)
- `GET /admin/api-keys` - List all API keys (prefix only, never hash)
- `DELETE /admin/api-keys/:id` - Revoke an API key

#### GitHub-Triggered Reconciliation

- `POST /agents/reconciliation/start/github` - Start reconciliation by cloning from GitHub (dashboard use)
- `POST /agents/reconciliation/hooks/github/push` - Webhook endpoint for CI/CLI-triggered reconciliation (requires API key)

#### MCP Server Tools

- `trigger_reconciliation` - MCP tool to trigger GitHub-based reconciliation runs
- `get_reconciliation_status` - MCP tool to check run status or list active runs

#### Client SDK

- `PactApiClient.triggerReconciliation()` - Trigger reconciliation from CLI/CI via API key

### Changed

- GitHub PAT stored in `ProjectSettings.github` JSONB (no migration needed)
- API key auth uses SHA-256 hashed keys with `pact_` prefix format
- `@RequireApiKey()` decorator for selective endpoint protection
- Docker images now include `git` for GitHub clone operations
- PAT sanitization in all error messages and logs (`x-access-token:***@`)

### Security

- API keys stored as SHA-256 hashes (never plaintext)
- PAT never returned in API responses (only `patSet: boolean`)
- Error messages sanitized to prevent PAT leakage in logs
- `git remote remove origin` after clone to prevent PAT in git state

---

## [1.0.0] - 2026-01-21

### Added

#### Atoms API (`/atoms`)

- `POST /atoms` - Create a new Intent Atom
- `GET /atoms` - List atoms with filtering and pagination
- `GET /atoms/:id` - Get a single atom by UUID or atomId
- `PATCH /atoms/:id` - Update a draft atom
- `DELETE /atoms/:id` - Delete a draft atom
- `PATCH /atoms/:id/commit` - Commit an atom (make immutable)
- `PATCH /atoms/:id/supersede` - Supersede a committed atom
- `GET /atoms/:id/supersession-chain` - Get supersession history
- `POST /atoms/:id/tags` - Add a tag to an atom
- `DELETE /atoms/:id/tags/:tag` - Remove a tag from an atom
- `GET /atoms/tags` - Get popular tags with usage counts
- `GET /atoms/statistics` - Get atom statistics

#### Refinement API (`/atoms`)

- `POST /atoms/analyze` - Analyze raw intent for atomicity
- `POST /atoms/:id/suggest-refinements` - Get AI refinement suggestions
- `POST /atoms/:id/refine` - Apply refinement with feedback
- `GET /atoms/:id/refinement-history` - Get refinement history
- `POST /atoms/:id/accept-suggestion` - Accept a refinement suggestion

#### Agents API (`/agents`)

- `POST /agents/atomization/atomize` - Atomize raw intent into structured atoms

#### Quality API (`/quality`)

- `GET /quality/analyze` - Analyze test quality across codebase
- `GET /quality/report` - Generate HTML quality report
- `GET /quality/trends` - Get quality trends over time
- `GET /quality/dashboard` - Get quality dashboard data
- `POST /quality/snapshot` - Save quality snapshot
- `GET /quality/check` - Check quality gate status

### Quality Gates

- Minimum quality score for commitment: 80
- Test quality threshold: 90%
- Test-atom coupling threshold: 80%

### Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input data or validation failure |
| 403 | Forbidden - Cannot modify committed/superseded atoms |
| 404 | Not Found - Resource does not exist |
| 500 | Internal Server Error |
| 503 | Service Unavailable - LLM service not configured |

---

## [0.1.0] - 2026-01-01

### Added

- Initial API scaffolding
- Basic atom CRUD operations
- Database schema with PostgreSQL
