# Using Pact Agents

**Version**: 1.0
**Last Updated**: 2026-01-27

---

## Overview

Pact provides AI-powered agents to help you work with intent atoms. These agents can analyze requirements, improve atom quality, and infer atoms from existing code.

### Available Agents

| Agent | Purpose | Access |
|-------|---------|--------|
| **Atomization** | Convert ideas to intent atoms | Sidebar panel, wizard |
| **Refinement** | Improve atom quality | Detail panel, wizard |
| **Brownfield** | Infer atoms from tests | Sidebar panel, wizard |
| **Chat** | Conversational interface | Bottom-right chat button |

---

## Accessing Agents

### Agent Panel

The agent panel is accessible from the sidebar on any page:

1. Click the **Agents** icon in the sidebar
2. View available agents with descriptions
3. Click an agent to launch its wizard

### Chat Interface

For conversational interaction:

1. Click the **chat bubble** button (bottom-right corner)
2. Type natural language requests
3. The agent will invoke the appropriate tools

---

## Atomization Agent

### Purpose

Convert unstructured ideas or requirements into properly-formed intent atoms.

### How to Use

**Via Wizard:**

1. Open the **Atomization Wizard** from the Agent Panel
2. Enter your raw intent in the text area:
   ```
   Users should be able to reset their password via email
   ```
3. Click **Analyze Intent**
4. Review the analysis results:
   - Atomicity score (0-100)
   - Whether it's atomic or needs decomposition
   - Suggested improvements
5. Accept the generated atom(s) or request refinement
6. Click **Create Atom** to save

**Via Chat:**

Type a message like:
```
Analyze this intent: Users can export their data as CSV
```

### Analysis Output

The agent evaluates:

- **Atomicity**: Is this the smallest testable unit?
- **Observability**: Can you see this behavior in a running system?
- **Falsifiability**: Can you prove it wrong?
- **Implementation Independence**: Does it describe WHAT, not HOW?

### Tips

- Start with user-facing behaviors
- Avoid technical implementation details
- Focus on one behavior per atom
- Include measurable criteria when possible

---

## Refinement Agent

### Purpose

Improve the quality score of existing atoms to meet the commitment threshold (≥80).

### How to Use

**Via Panel:**

1. Open an atom's detail page
2. Click the **Refine** button
3. Review the quality breakdown:
   - Observable (0-25)
   - Falsifiable (0-25)
   - Implementation-Agnostic (0-20)
   - Unambiguous Language (0-15)
   - Clear Success Criteria (0-15)
4. Click **Get Suggestions**
5. Review and apply suggestions
6. Re-validate to confirm improvement

**Via Wizard:**

1. Open the **Refinement Wizard** from the Agent Panel
2. Select the atom to refine
3. View current quality score
4. Get AI-powered suggestions
5. Apply suggestions with one click

**Via Chat:**

Type a message like:
```
Improve the quality of atom IA-042
```

### Suggestion Types

The agent may suggest:

- Adding measurable success criteria
- Removing implementation details
- Clarifying ambiguous language
- Making outcomes more observable
- Adding specific thresholds or boundaries

### Tips

- Address the lowest-scoring dimension first
- Add concrete metrics when possible
- Replace vague terms ("fast", "secure") with specifics
- Ensure outcomes are user-visible

---

## Brownfield Analysis Agent

### Purpose

Analyze existing test files to infer intent atoms, helping adopt Pact in existing codebases.

### How to Use

1. Open the **Brownfield Wizard** from the Agent Panel
2. Configure analysis options:
   - **Test patterns**: Which test files to analyze (e.g., `**/*.spec.ts`)
   - **Exclude patterns**: Files to skip (e.g., `**/node_modules/**`)
   - **Max tests**: Safety limit for processing
   - **Analyze docs**: Include README and documentation files
3. Click **Start Analysis**
4. Wait for analysis to complete (progress indicator shown)
5. Review inferred atoms:
   - Description extracted from tests
   - Confidence score (0-100)
   - Source test file and line number
   - Related documentation snippets
6. Select atoms to create (high confidence selected by default)
7. Click **Create Atoms** to save selected atoms

### Analysis Process

The agent:

1. Scans for test files matching patterns
2. Parses test names and assertions
3. Correlates with source files and documentation
4. Infers behavioral intent from test code
5. Generates atom descriptions
6. Assigns confidence scores

### Tips

- Start with a small subset of tests
- Review low-confidence atoms carefully
- Link inferred atoms back to original tests
- Use this to establish baseline coverage

---

## Chat Agent

### Purpose

Conversational interface for all agent capabilities with natural language.

### How to Use

1. Click the **chat button** (bottom-right)
2. Type your request in natural language
3. The agent processes your request and invokes appropriate tools
4. Review the response and suggested actions
5. Click suggestion buttons for quick actions

### Example Commands

**Analyzing Intent:**
```
Analyze this intent: Users can bookmark favorite items
```

**Searching Atoms:**
```
Find atoms related to authentication
```

**Getting Atom Details:**
```
Show me the details of IA-023
```

**Refining Atoms:**
```
How can I improve the quality of IA-015?
```

**Creating Atoms:**
```
Create an atom for: System logs all admin actions
```

### Available Tools

The chat agent has access to:

| Tool | Description |
|------|-------------|
| `analyze_intent` | Analyze raw intent for atomicity |
| `search_atoms` | Search existing atoms by keyword |
| `get_atom` | Get details of a specific atom |
| `refine_atom` | Get refinement suggestions |
| `create_atom` | Create a new draft atom |

### Session Management

- Sessions persist for 30 minutes of inactivity
- Include `sessionId` in requests to continue conversations
- Export sessions as markdown for documentation

### Tips

- Be specific about what you want to accomplish
- Reference atom IDs directly when available
- Use follow-up questions for clarification
- Click suggested actions for efficiency

---

## Provider Status

### Checking Provider Status

Before invoking agents, check provider availability:

1. Look at the **Provider Status** indicator in the agent panel
2. Green dot = provider available
3. Gray dot = provider unavailable

### Cost Awareness

The agent panel shows:

- Estimated cost for the operation
- Current budget utilization
- Which provider/model will be used

### Using Local Models

For privacy or cost concerns:

1. Go to **Settings > LLM**
2. Enable Ollama provider
3. Set "Prefer Local Models" option
4. Local models have $0 cost

---

## Troubleshooting

### "No providers available"

**Cause**: No LLM providers are configured or accessible.

**Solution**:
1. Check API keys in Settings > LLM
2. Verify Ollama is running (if using local)
3. Test provider connectivity

### "Budget exceeded"

**Cause**: Daily or monthly spending limit reached.

**Solution**:
1. Wait for next period
2. Increase limits in Settings > LLM > Budget
3. Use local models (free)

### "Low confidence" warnings

**Cause**: The agent is uncertain about its analysis.

**Solution**:
1. Provide more context or detail
2. Review and refine the atom manually
3. Consider breaking down complex intents

### Agent not responding

**Cause**: Provider timeout or connection issue.

**Solution**:
1. Check provider status
2. Retry after a moment
3. Try a different provider/model

---

## Best Practices

### General

1. **Start with clear intent**: The clearer your input, the better the output
2. **Review all suggestions**: AI suggestions should be validated by humans
3. **Iterate incrementally**: Refine atoms in small steps
4. **Maintain context**: Use sessions for multi-step workflows

### For Atomization

1. Focus on user-visible behaviors
2. Include success criteria upfront
3. Avoid technical jargon
4. One behavior per atom

### For Refinement

1. Target the lowest-scoring dimension
2. Add concrete metrics
3. Make outcomes measurable
4. Keep language precise

### For Brownfield

1. Start with well-documented tests
2. Validate inferred atoms against original intent
3. Link back to source tests
4. Use as a starting point, not final truth

---

## Related Documentation

- [docs/architecture/llm-providers.md](../architecture/llm-providers.md) - Provider architecture
- [docs/user-guide/configuring-llm.md](configuring-llm.md) - Configuration guide
- [docs/user-guide/creating-atoms.md](creating-atoms.md) - Manual atom creation
- [docs/user-guide/refinement-workflow.md](refinement-workflow.md) - Refinement workflow

---

*Agents help you work faster, but human judgment remains essential. Always review AI suggestions before committing.*
