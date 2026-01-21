# Pact Architecture Documentation

This directory contains architecture documentation for Pact's core services and components.

## AI Agent Services

| Document | Service | Description |
|----------|---------|-------------|
| [intent-refinement.md](./intent-refinement.md) | `IntentRefinementService` | AI-powered iterative refinement of Intent Atoms |
| [atomicity-checker.md](./atomicity-checker.md) | `AtomicityCheckerService` | Hybrid heuristic + LLM atomicity validation |

## Service Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                     API Layer (Controllers)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                     │
│  │ AtomsController │    │ AtomizationCtrl │                     │
│  └────────┬────────┘    └────────┬────────┘                     │
│           │                      │                               │
│           ▼                      ▼                               │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Service Layer                             ││
│  │                                                              ││
│  │  ┌──────────────────┐    ┌────────────────────────┐        ││
│  │  │   AtomsService   │◀───│ IntentRefinementService│        ││
│  │  │   (CRUD)         │    │ (AI Refinement)        │        ││
│  │  └──────────────────┘    └───────────┬────────────┘        ││
│  │                                      │                      ││
│  │                          ┌───────────┴───────────┐         ││
│  │                          ▼                       ▼         ││
│  │            ┌─────────────────────┐  ┌─────────────────────┐││
│  │            │ AtomicityChecker    │  │ AtomQualityService  │││
│  │            │ (Heuristics + LLM)  │  │ (5-dimension score) │││
│  │            └──────────┬──────────┘  └─────────────────────┘││
│  │                       │                                     ││
│  │                       ▼                                     ││
│  │            ┌─────────────────────┐                         ││
│  │            │    LLMService       │                         ││
│  │            │ (Optional, Anthropic)│                         ││
│  │            └─────────────────────┘                         ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                    Data Layer                                ││
│  │                                                              ││
│  │  ┌──────────────────┐    ┌─────────────────────┐           ││
│  │  │ AtomRepository   │    │ LLMUsageTracking    │           ││
│  │  │ (PostgreSQL)     │    │ (Cost monitoring)   │           ││
│  │  └──────────────────┘    └─────────────────────┘           ││
│  │                                                              ││
│  └─────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### 1. Heuristics-First Approach

The `AtomicityCheckerService` uses fast deterministic heuristics before optional LLM analysis. This ensures:
- Sub-5ms response for most checks
- Consistent, reproducible results
- Graceful degradation when LLM unavailable

### 2. Optional LLM Integration

All AI services accept `LLMService` as an optional dependency (`@Optional()`). When unavailable:
- Core functionality works without AI
- Heuristic-based suggestions still provided
- No runtime errors from missing service

### 3. Refinement History

The `IntentRefinementService` maintains an append-only refinement history on each atom, enabling:
- Full traceability of intent evolution
- Audit trail for AI-assisted changes
- Learning from refinement patterns

### 4. Quality Gate Integration

Both services integrate with `AtomQualityService` to:
- Preview quality scores before commitment
- Re-evaluate after each refinement
- Enforce 80+ score threshold for commit

## Related Documentation

- [Database Schema](../schema.md) - Entity definitions and relationships
- [User Guide: Refinement](../user-guide/refinement-workflow.md) - End-user workflow
- [API Documentation](../api/CHANGELOG.md) - API endpoints and changes
