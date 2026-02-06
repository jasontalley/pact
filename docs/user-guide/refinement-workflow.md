# Refinement Workflow

This guide explains how to iteratively improve Intent Atoms using Pact's AI-assisted refinement system.

## Overview

The refinement workflow helps you transform vague or compound intents into high-quality, atomic behavioral specifications. The goal is to achieve a **quality score of 80+** for commitment.

## Refinement Process

```
┌─────────────┐
│   Analyze   │ ← Check atomicity and quality
└──────┬──────┘
       ▼
┌─────────────┐
│   Suggest   │ ← Get AI-powered improvements
└──────┬──────┘
       ▼
┌─────────────┐
│   Refine    │ ← Apply feedback or accept suggestion
└──────┬──────┘
       ▼
┌─────────────┐
│   Review    │ ← Check new quality score
└──────┬──────┘
       │
       ▼
   Score ≥ 80?
    ┌───┴───┐
    │ Yes   │ No
    ▼       ▼
 Commit   Loop back
```

## Step 1: Analyze Intent

Before creating an atom, analyze your raw intent:

```bash
POST /atoms/analyze
{
  "intent": "Users should be able to log in securely with good performance"
}
```

**Response**:
```json
{
  "atomicity": "compound",
  "confidence": 0.45,
  "violations": [
    "Contains multiple concerns: security AND performance",
    "Vague terms: 'securely', 'good performance'"
  ],
  "clarifyingQuestions": [
    "What specific security requirements (2FA, password rules)?",
    "What is the performance target (response time)?"
  ],
  "decompositionSuggestions": [
    "Login authentication must complete within 2 seconds",
    "Login must require password meeting complexity rules",
    "Failed login attempts must be rate-limited"
  ],
  "qualityPreview": {
    "estimatedScore": 35,
    "decision": "reject"
  }
}
```

## Step 2: Get Refinement Suggestions

For an existing draft atom with low quality:

```bash
POST /atoms/{id}/suggest-refinements
```

**Response**:
```json
[
  {
    "id": "sug-001",
    "type": "precision",
    "original": "System should be fast",
    "suggested": "API response time must be under 200ms for 95th percentile",
    "reasoning": "Added specific, measurable criteria",
    "confidence": 0.92
  },
  {
    "id": "sug-002",
    "type": "clarification",
    "original": "System should be fast",
    "suggested": "Database queries must complete within 100ms for indexed lookups",
    "reasoning": "Focused on specific operation type",
    "confidence": 0.88
  }
]
```

### Suggestion Types

| Type | Description |
|------|-------------|
| `precision` | Adds measurable criteria |
| `clarification` | Resolves ambiguity |
| `decomposition` | Splits compound intent |
| `rewrite` | Complete restructuring |

## Step 3: Apply Refinement

### Option A: Accept a Suggestion

```bash
POST /atoms/{id}/accept-suggestion
{
  "suggestionId": "sug-001",
  "type": "precision",
  "suggestedText": "API response time must be under 200ms for 95th percentile"
}
```

### Option B: Provide Custom Feedback

```bash
POST /atoms/{id}/refine
{
  "feedback": "Make it specific to the login endpoint with a 2-second timeout"
}
```

**Response**:
```json
{
  "success": true,
  "atom": {
    "id": "uuid-123",
    "atomId": "IA-001",
    "description": "Login API endpoint must respond within 2 seconds for 99% of requests",
    "qualityScore": 82
  },
  "previousDescription": "System should be fast",
  "refinementRecord": {
    "timestamp": "2026-01-21T12:00:00Z",
    "feedback": "Make it specific to the login endpoint...",
    "source": "ai-assisted"
  },
  "newQualityScore": 82,
  "message": "Quality improved from 35 to 82"
}
```

## Step 4: Review and Commit

Check the refinement history:

```bash
GET /atoms/{id}/refinement-history
```

**Response**:
```json
[
  {
    "timestamp": "2026-01-21T11:00:00Z",
    "previousDescription": "System should be fast",
    "newDescription": "API must be fast",
    "feedback": "Initial draft",
    "source": "manual"
  },
  {
    "timestamp": "2026-01-21T12:00:00Z",
    "previousDescription": "API must be fast",
    "newDescription": "Login API endpoint must respond within 2 seconds",
    "feedback": "Make it specific to login endpoint",
    "source": "ai-assisted"
  }
]
```

When quality score is 80+, commit:

```bash
PATCH /atoms/{id}/commit
```

## Quality Improvement Tips

### Problem: Low Behavioral Clarity

**Before**: "System handles errors gracefully"

**After**: "When an API request fails, the system returns a JSON error response with error code, message, and request ID within 500ms"

### Problem: Not Falsifiable

**Before**: "Data is stored securely"

**After**: "User passwords must be hashed using bcrypt with cost factor 12 and never stored in plaintext"

### Problem: Compound Intent

**Before**: "Users can register, log in, and reset passwords"

**After** (3 atoms):
1. "User registration must create account with unique email within 3 seconds"
2. "User login must validate credentials and return JWT within 2 seconds"
3. "Password reset must send email with token valid for 15 minutes"

### Problem: Implementation-Specific

**Before**: "Use PostgreSQL for data storage"

**After**: "User data must persist across system restarts with ACID guarantees"

## Refinement Metrics

Track your refinement efficiency:

- **Average iterations**: Target < 3 per atom
- **First-pass quality**: Aim for 60+ on initial draft
- **Acceptance rate**: What % of suggestions you accept

## Best Practices

1. **Start specific** - Vague intents need more iterations
2. **Accept suggestions** - AI suggestions often score higher
3. **Review decompositions** - Compound intents create multiple atoms
4. **Track history** - Learn from successful refinements
5. **Commit promptly** - Don't let drafts linger

## Troubleshooting

### Quality score not improving

- Check if description is still vague
- Add observable outcomes explicitly
- Define falsifiability criteria

### Suggestions not helpful

- Provide more context in feedback
- Break down the intent manually first
- Check if intent is actually compound

### Service unavailable (503)

- LLM service may not be configured
- Use manual refinement with heuristics

## Next Steps

- [Creating Atoms](./creating-atoms.md) - Start with quality
- [Canvas Navigation](./canvas-navigation.md) - Organize visually
