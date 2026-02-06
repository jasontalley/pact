# Reconciliation Agent User Guide

The Reconciliation Agent analyzes your repository to discover orphan tests (tests without `@atom` annotations) and infers Intent Atoms from them. This guide covers how to use the agent via API and chat commands.

## Overview

The Reconciliation Agent operates in two modes:

| Mode | When to Use | What It Does |
|------|-------------|--------------|
| **Full-scan** | First use, or "resync everything" | Analyzes all orphan tests in the repository |
| **Delta** | Incremental sync after changes | Only analyzes tests that changed since the last run |

## Quick Start

### Via Chat Command

The simplest way to run reconciliation is through the chat agent:

```
> reconcile my repo
```

Or with options:

```
> run reconciliation with review required
```

### Via REST API

Start a reconciliation analysis:

```bash
curl -X POST http://localhost:3000/agents/reconciliation/start \
  -H "Content-Type: application/json" \
  -d '{
    "rootDirectory": "/path/to/repo",
    "mode": "full-scan",
    "options": {
      "analyzeDocs": true,
      "qualityThreshold": 80,
      "requireReview": false
    }
  }'
```

## API Endpoints

### Start Analysis

```
POST /agents/reconciliation/start
```

Starts a reconciliation with interrupt support for human review.

**Request Body:**

```json
{
  "rootDirectory": "/path/to/repo",
  "mode": "full-scan",
  "deltaBaseline": {
    "runId": "REC-abc123",
    "commitHash": "abc123def"
  },
  "options": {
    "analyzeDocs": true,
    "maxTests": 100,
    "qualityThreshold": 80,
    "requireReview": true
  }
}
```

**Response (completed):**

```json
{
  "completed": true,
  "runId": "REC-abc123",
  "result": {
    "runId": "REC-abc123",
    "status": "completed",
    "summary": {
      "totalOrphanTests": 25,
      "inferredAtomsCount": 22,
      "inferredMoleculesCount": 5,
      "qualityPassCount": 18,
      "qualityFailCount": 4
    }
  }
}
```

**Response (interrupted for review):**

```json
{
  "completed": false,
  "runId": "REC-abc123",
  "threadId": "uuid-xxx",
  "pendingReview": {
    "summary": {
      "totalAtoms": 22,
      "passCount": 18,
      "failCount": 4,
      "qualityThreshold": 80
    },
    "pendingAtoms": [
      {
        "tempId": "temp-001",
        "description": "User can login with valid credentials",
        "category": "functional",
        "qualityScore": 85,
        "passes": true,
        "issues": []
      }
    ],
    "pendingMolecules": [
      {
        "tempId": "temp-mol-001",
        "name": "Authentication Functionality",
        "atomCount": 5,
        "confidence": 78
      }
    ]
  }
}
```

### Get Pending Review

```
GET /agents/reconciliation/runs/:runId/pending
```

Retrieves recommendations pending human review for an interrupted run.

### Submit Review

```
POST /agents/reconciliation/runs/:runId/review
```

Submits human review decisions and resumes the reconciliation.

**Request Body:**

```json
{
  "atomDecisions": [
    { "recommendationId": "temp-001", "decision": "approve" },
    { "recommendationId": "temp-002", "decision": "reject", "reason": "Too vague" }
  ],
  "moleculeDecisions": [
    { "recommendationId": "temp-mol-001", "decision": "approve" }
  ],
  "comment": "Reviewed batch 1"
}
```

### Apply Recommendations

```
POST /agents/reconciliation/runs/:runId/apply
```

Applies approved recommendations, creating Atoms and Molecules in the database.

**Request Body:**

```json
{
  "selections": ["temp-001", "temp-002"],
  "injectAnnotations": true
}
```

**Response:**

```json
{
  "runId": "REC-abc123",
  "status": "success",
  "atomsCreated": 18,
  "moleculesCreated": 5,
  "annotationsInjected": 18,
  "operations": [
    {
      "type": "createAtom",
      "recommendationId": "temp-001",
      "success": true,
      "entityId": "uuid-xxx"
    }
  ]
}
```

### Get Run Metrics

```
GET /agents/reconciliation/runs/:runId/metrics
```

Returns quality metrics for a reconciliation run.

### Get Run Details

```
GET /agents/reconciliation/runs/:runId
```

Returns full details of a reconciliation run.

### Get Recommendations

```
GET /agents/reconciliation/runs/:runId/recommendations
```

Returns all atom and molecule recommendations for a run.

### List Active Runs

```
GET /agents/reconciliation/runs
```

Lists all active reconciliation runs.

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `analyzeDocs` | boolean | true | Include documentation in context analysis |
| `maxTests` | number | unlimited | Maximum tests to process (for large repos) |
| `qualityThreshold` | number | 80 | Minimum quality score (0-100) for auto-approval |
| `requireReview` | boolean | false | Always require human review before persisting |

## Understanding the Results

### Atom Quality Scores

Each inferred atom receives a quality score based on:

- **Description quality** (20 points): Clear, behavioral description
- **Observable outcomes** (25 points): Verifiable outcomes defined
- **Category** (10 points): Proper categorization
- **Reasoning** (15 points): LLM reasoning provided
- **Confidence** (20 points): High inference confidence
- **No ambiguity** (10 points): No ambiguity reasons flagged

Atoms scoring below the `qualityThreshold` are marked as `quality_fail`.

### Molecule Synthesis

Molecules are created by clustering related atoms using:

- **Module clustering**: Groups atoms by source file module/path
- **Category clustering**: Groups by atom category (functional, security, etc.)
- **Domain concept clustering**: Groups by extracted domain terminology

## Best Practices

### First-Time Analysis (Full-Scan)

1. Start with `requireReview: true` to understand what the agent infers
2. Review inferred atoms for accuracy and completeness
3. Approve high-quality atoms, reject or refine low-quality ones
4. Apply approved recommendations to create atoms

### Ongoing Sync (Delta Mode)

1. Run delta reconciliation after adding new features
2. Focus review on newly inferred atoms only
3. Use `injectAnnotations: true` to automatically add `@atom` comments

### Large Repositories

1. Use `maxTests` to limit initial analysis scope
2. Run multiple incremental analyses by path or module
3. Consider setting a higher `qualityThreshold` (e.g., 85) to reduce review burden

## Troubleshooting

### No Orphan Tests Found

- Verify test file patterns match your project (`.spec.ts`, `.test.ts`)
- Check that tests are not already annotated with `@atom`
- Ensure `rootDirectory` points to the correct location

### Low Quality Scores

- Tests may be too implementation-focused (asserting internal details)
- Test names may be vague or not descriptive
- Consider manual atom creation for complex behaviors

### Transaction Rollback

If apply fails with "rolled_back" status:
- Check the `error` field for details
- Database operations are transactional (INV-R003)
- File annotation failures don't rollback DB changes

## Related Documentation

- [Architecture Proposal](../architecture/reconcilation-agent-architecture-proposal.md)
- [Creating Atoms](./creating-atoms.md)
- [Configuring Invariants](./configuring-invariants.md)
