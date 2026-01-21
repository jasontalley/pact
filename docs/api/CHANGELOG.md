# API Changelog

All notable changes to the Pact API will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
