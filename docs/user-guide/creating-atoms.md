# Creating Intent Atoms

This guide explains how to create high-quality Intent Atoms in Pact.

## What is an Intent Atom?

An Intent Atom is an **irreducible behavioral primitive** that describes a single, testable aspect of your system. Good atoms are:

- **Observable**: The behavior can be verified externally
- **Falsifiable**: Clear conditions exist that would disprove the intent
- **Atomic**: Cannot be meaningfully decomposed into smaller intents
- **Implementation-agnostic**: Describes *what*, not *how*

## Creating an Atom via API

### Basic Creation

```bash
curl -X POST http://localhost:3000/atoms \
  -H "Content-Type: application/json" \
  -d '{
    "description": "User authentication must complete within 2 seconds under normal load",
    "category": "performance"
  }'
```

### Categories

Choose from these categories:
- `functional` - Core business logic and features
- `performance` - Speed, throughput, resource usage
- `security` - Authentication, authorization, data protection
- `reliability` - Fault tolerance, recovery, consistency
- `usability` - User experience, accessibility
- `maintainability` - Code quality, documentation

## Writing Good Descriptions

### Do

- Include measurable criteria: "within 2 seconds", "99.9% uptime"
- Specify observable outcomes: "user sees confirmation message"
- Define boundary conditions: "for files under 10MB"

### Don't

- Use vague terms: "should be fast", "needs to work well"
- Include implementation details: "use Redis", "call the API"
- Combine multiple behaviors: use "and" sparingly

## Quality Validation

Atoms must achieve a quality score of **80+** to be committed.

### Quality Dimensions

1. **Behavioral Clarity** (0-25)
   - Clear observable outcomes
   - Measurable criteria

2. **Falsifiability** (0-25)
   - Specific failure conditions
   - Testable assertions

3. **Atomicity** (0-25)
   - Single responsibility
   - Cannot be decomposed

4. **Implementation Independence** (0-25)
   - No technology specifics
   - Focuses on behavior

## Using the Refinement Workflow

If your atom scores below 80, use the refinement process:

1. **Analyze** your intent:
   ```bash
   curl -X POST http://localhost:3000/atoms/analyze \
     -H "Content-Type: application/json" \
     -d '{"intent": "your intent text"}'
   ```

2. **Get suggestions** for an existing atom:
   ```bash
   curl -X POST http://localhost:3000/atoms/{id}/suggest-refinements
   ```

3. **Apply feedback**:
   ```bash
   curl -X POST http://localhost:3000/atoms/{id}/refine \
     -H "Content-Type: application/json" \
     -d '{"feedback": "Make it more specific with a 200ms requirement"}'
   ```

## Atom Lifecycle

```
draft → committed → superseded
         ↑
         └── (cannot go back)
```

- **Draft**: Can be edited, refined, deleted
- **Committed**: Immutable, represents a binding contract
- **Superseded**: Replaced by a newer atom

## Examples

### Good Atom

```json
{
  "description": "Password reset tokens must expire exactly 15 minutes after generation",
  "category": "security",
  "observableOutcomes": [
    {
      "description": "Token becomes invalid after 15 minutes",
      "measurementCriteria": "API returns 401 when token is used after expiry"
    }
  ],
  "falsifiabilityCriteria": [
    {
      "condition": "Token used at 14:59 after generation",
      "expectedBehavior": "Token is still valid"
    },
    {
      "condition": "Token used at 15:01 after generation",
      "expectedBehavior": "Token is rejected with expiry error"
    }
  ]
}
```

### Needs Improvement

```json
{
  "description": "System should be secure",
  "category": "security"
}
```

**Why**: Too vague, not measurable, no specific behavior defined.

## Next Steps

- [Canvas Navigation](./canvas-navigation.md) - Organizing atoms visually
- [Refinement Workflow](./refinement-workflow.md) - Improving atom quality
