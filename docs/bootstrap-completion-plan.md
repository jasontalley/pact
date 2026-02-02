# Pact Bootstrap Completion Plan

## Overview

This document outlines the remaining work to complete Pact's bootstrap phase. Once complete, a stable external instance of Pact can manage Pact's own development (self-hosting).

**Current State**: ~35% complete across 5 core capabilities
**Target**: 100% of bootstrap capabilities functional

---

## Bootstrap Exit Criteria

The bootstrap phase is complete when:

1. Pact can reconcile its own codebase without self-referential issues
2. External coding agents (Claude, Cursor) can query Pact via MCP
3. Users can create atoms/molecules through conversational interface
4. All coupling metrics are visible on dashboard
5. Conversation history persists across sessions

---

## Capability 1: Reconciliation Agent

**Status**: ✅ ~80% Complete

### What Works
- Full LangGraph pipeline (structure → discover → context → infer → synthesize → verify → persist)
- Delta mode with INV-R001 (no new atoms from linked tests) and INV-R002 (delta closure)
- Quality validation with 5-dimension LLM scoring
- Human-in-the-loop review via NodeInterrupt
- UI wizard: config → analyzing → review → apply → complete
- Persistence: `reconciliation_runs`, `atom_recommendations`, `test_records`, `molecule_recommendations`

### Remaining Work

| Task | Priority | Effort |
|------|----------|--------|
| ~~Investigate quality scorer returning 0 for some atoms~~ | ~~High~~ | ~~M~~ | **FIXED** |
| Add path exclusion config (optional, for large repos) | Low | S |
| Add "decoupled test" detection (test refs non-existent atom) | Medium | M |
| Track atom→code file coupling | Medium | L |
| Add reconciliation scheduling (cron/CI hook) | Low | M |

### Bug Fix: Score=0 Issue (RESOLVED)

The quality scorer was returning 0 for some atoms due to a bug in `atom-quality.service.ts`:

**Root cause**: When LLM returns malformed JSON, `parseAllDimensionsResponse()` returned `{}`, causing all dimension scores to default to `|| 0`.

**Fix**: Added validation to detect empty/invalid parsed responses and fall back to heuristic scoring instead of returning zeros.

```typescript
// atom-quality.service.ts - Line 275+
const hasValidDimensions =
  parsed.observable !== undefined ||
  parsed.falsifiable !== undefined ||
  // ... other dimensions

if (!hasValidDimensions) {
  this.logger.warn(`LLM response missing all dimensions, falling back to heuristics`);
  return {
    observable: this.heuristicObservable(atom),
    // ... heuristic fallbacks for all dimensions
  };
}
```

Now the agent can properly reconcile its own tests without workarounds.

---

## Capability 2: Interview/Molecule Creation Agent

**Status**: ❌ ~10% Complete

### What Works
- Basic `intent-refinement.service.ts` for single-pass refinement
- `atomization.service.ts` for LLM-based atomization
- Generic chat routing in `chat-agent.service.ts`

### Remaining Work

| Task | Priority | Effort |
|------|----------|--------|
| Design interview agent graph (multi-turn) | High | L |
| Implement clarification question generator | High | M |
| Add molecule composition from clarified intent | High | L |
| Create interview session persistence | Medium | M |
| Add molecule preview before commit | Medium | S |
| Integrate with existing atomization flow | Medium | M |

### Proposed Architecture

```
User Intent (vague)
    │
    ▼
┌─────────────────────────────────────────────────┐
│            Interview Agent Graph                 │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────┐    ┌───────────────┐    ┌──────┐ │
│  │ Analyze  │───▶│ Ask Questions │───▶│ Wait │ │
│  │ Intent   │    │ (if unclear)  │    │      │ │
│  └──────────┘    └───────────────┘    └──┬───┘ │
│       ▲                                   │     │
│       └───────────────────────────────────┘     │
│                    (user responds)              │
│                                                  │
│  ┌──────────┐    ┌───────────────┐    ┌──────┐ │
│  │ Extract  │───▶│   Validate    │───▶│Commit│ │
│  │ Atoms    │    │   Quality     │    │      │ │
│  └──────────┘    └───────────────┘    └──────┘ │
│                                                  │
│  ┌──────────┐    ┌───────────────┐             │
│  │ Compose  │───▶│   Preview     │             │
│  │ Molecule │    │   & Confirm   │             │
│  └──────────┘    └───────────────┘             │
└─────────────────────────────────────────────────┘
    │
    ▼
Molecule with constituent Atoms
```

### New Files Needed

```
src/modules/agents/
├── graphs/
│   └── graphs/
│       └── interview.graph.ts           # Multi-turn interview graph
├── graphs/
│   └── nodes/
│       └── interview/
│           ├── analyze-intent.node.ts   # Initial intent analysis
│           ├── generate-questions.node.ts  # Clarification questions
│           ├── extract-atoms.node.ts    # Extract atoms from clarified intent
│           └── compose-molecule.node.ts # Build molecule from atoms
└── interview.service.ts                 # Interview session management
```

---

## Capability 3: Pact Dashboard

**Status**: ⚠️ ~30% Complete

### What Works
- Atom counts by status (draft/committed/superseded)
- Recent atoms list
- Quick actions (create atom, run reconciliation)
- Reconciliation results page with atom/molecule review

### Remaining Work

| Task | Priority | Effort |
|------|----------|--------|
| Add Atom ↔ Test coupling rate metric | High | M |
| Add Test ↔ Code coupling rate metric | High | M |
| Show orphan atoms (atoms with no tests) | High | S |
| Show orphan tests (tests with no atoms) | High | S |
| Show uncovered code (code with no atoms) | Medium | M |
| Add test quality metrics | Medium | L |
| Add reconciliation history timeline | Low | M |
| Add trend charts for metrics | Low | L |

### Proposed Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                          PACT DASHBOARD                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │ Total Atoms  │  │  Committed   │  │    Draft     │           │
│  │     127      │  │     98       │  │     29       │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    COUPLING HEALTH                        │   │
│  ├──────────────────────────────────────────────────────────┤   │
│  │                                                           │   │
│  │  Atom → Test Coupling     ████████████░░░░  78%          │   │
│  │  Test → Code Coupling     █████████████░░░  85%          │   │
│  │  Code → Atom Coverage     ██████░░░░░░░░░░  45%          │   │
│  │                                                           │   │
│  │  Orphan Atoms: 12    Orphan Tests: 41    Uncovered: 156  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐   │
│  │     TEST QUALITY        │  │   RECONCILIATION HISTORY    │   │
│  │                         │  │                             │   │
│  │  Average Score: 82      │  │  Jan 31: 17 atoms inferred  │   │
│  │  Passing: 44 (52%)      │  │  Jan 30: Delta - 3 new      │   │
│  │  Needs Work: 41 (48%)   │  │  Jan 28: Full scan          │   │
│  └─────────────────────────┘  └─────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Backend Changes Needed

```typescript
// New endpoint: GET /api/metrics/coupling
interface CouplingMetrics {
  atomTestCoupling: {
    totalAtoms: number;
    atomsWithTests: number;
    rate: number;  // 0-100%
    orphanAtoms: AtomSummary[];
  };
  testAtomCoupling: {
    totalTests: number;
    testsWithAtoms: number;
    rate: number;
    orphanTests: TestSummary[];
  };
  codeAtomCoverage: {
    totalSourceFiles: number;
    filesWithAtoms: number;
    rate: number;
    uncoveredFiles: string[];
  };
  testQuality: {
    averageScore: number;
    passing: number;
    needsWork: number;
    distribution: Record<string, number>;  // score ranges
  };
}
```

---

## Capability 4: Persistent Pact-Chat

**Status**: ❌ ~15% Complete

### What Works
- In-memory `ChatSession` with messages array
- `agent_actions` table for action logging
- Session context passing between turns

### Remaining Work

| Task | Priority | Effort |
|------|----------|--------|
| Create `conversations` entity | High | S |
| Create `conversation_messages` entity | High | S |
| Implement conversation persistence service | High | M |
| Add conversation compaction/summarization | High | L |
| Add conversation search | Medium | M |
| Add conversation resume from history | Medium | M |
| Add conversation export | Low | S |

### Proposed Schema

```typescript
// src/modules/conversations/conversation.entity.ts
@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  title: string;  // Auto-generated from first message or user-set

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, unknown>;  // Agent context (atoms discussed, etc.)

  @Column({ nullable: true })
  compactedSummary: string;  // Summarized history for long conversations

  @Column({ default: 0 })
  messageCount: number;

  @Column({ default: false })
  isArchived: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastMessageAt: Date;

  @OneToMany(() => ConversationMessage, (m) => m.conversation)
  messages: ConversationMessage[];
}

// src/modules/conversations/conversation-message.entity.ts
@Entity('conversation_messages')
export class ConversationMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Conversation, (c) => c.messages)
  conversation: Conversation;

  @Column()
  conversationId: string;

  @Column({ type: 'enum', enum: ['user', 'assistant', 'system'] })
  role: 'user' | 'assistant' | 'system';

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: {
    toolCalls?: ToolCallDto[];
    atomsReferenced?: string[];
    tokensUsed?: number;
  };

  @Column({ default: false })
  isCompacted: boolean;  // Part of summary, original not needed

  @CreateDateColumn()
  createdAt: Date;
}
```

### Compaction Strategy

When conversation exceeds N messages (e.g., 50):

1. Summarize oldest 40 messages into a compact summary
2. Mark summarized messages as `isCompacted: true`
3. Keep most recent 10 messages intact
4. On load: inject summary as system message + recent messages

---

## Capability 5: MCP Server

**Status**: ❌ 0% Complete

### What Works
- Nothing

### Remaining Work

| Task | Priority | Effort |
|------|----------|--------|
| Create MCP server scaffolding | High | M |
| Implement `read_atom` tool | High | S |
| Implement `list_atoms` tool | High | S |
| Implement `get_atom_for_test` tool | High | S |
| Implement `get_coupling_status` tool | Medium | S |
| Implement `search_atoms` tool | Medium | M |
| Add authentication/localhost restriction | Medium | S |
| Create MCP client SDK for testing | Low | M |

### Proposed Tool Definitions

```typescript
// MCP Tools for external coding agents

/**
 * read_atom: Get full atom details by ID
 * Used by coding agents to understand expected behavior before implementing
 */
interface ReadAtomTool {
  name: 'read_atom';
  description: 'Get the full description and acceptance criteria for an atom';
  input: { atomId: string };  // e.g., "IA-042"
  output: {
    atomId: string;
    description: string;
    category: string;
    status: 'draft' | 'committed' | 'superseded';
    observableOutcomes: ObservableOutcome[];
    falsifiabilityCriteria: FalsifiabilityCriterion[];
    tags: string[];
    linkedTests: TestReference[];
  };
}

/**
 * list_atoms: List atoms with optional filtering
 * Used by coding agents to discover what behaviors exist
 */
interface ListAtomsTool {
  name: 'list_atoms';
  description: 'List atoms, optionally filtered by status, category, or tags';
  input: {
    status?: 'draft' | 'committed' | 'superseded';
    category?: string;
    tags?: string[];
    search?: string;
    limit?: number;
  };
  output: {
    atoms: AtomSummary[];
    total: number;
  };
}

/**
 * get_atom_for_test: Find the atom that a test file should validate
 * Used by coding agents before writing tests
 */
interface GetAtomForTestTool {
  name: 'get_atom_for_test';
  description: 'Given a test file path, return the atom(s) it should validate';
  input: { testFilePath: string };
  output: {
    linkedAtoms: AtomSummary[];  // Existing @atom annotations
    suggestedAtoms: AtomSummary[];  // Atoms that might be relevant
    isOrphan: boolean;  // True if test has no @atom annotation
  };
}

/**
 * get_coupling_status: Get overall coupling health
 * Used by coding agents to understand test coverage gaps
 */
interface GetCouplingStatusTool {
  name: 'get_coupling_status';
  description: 'Get atom-test-code coupling metrics and identify gaps';
  input: { directory?: string };
  output: {
    atomTestCoupling: number;
    testCodeCoupling: number;
    orphanAtoms: string[];
    orphanTests: string[];
    uncoveredCode: string[];
  };
}
```

### Implementation Approach

Use the official `@modelcontextprotocol/sdk` package:

```typescript
// src/mcp/pact-mcp-server.ts
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server(
  { name: 'pact-mcp-server', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    { name: 'read_atom', description: '...', inputSchema: {...} },
    { name: 'list_atoms', description: '...', inputSchema: {...} },
    { name: 'get_atom_for_test', description: '...', inputSchema: {...} },
    { name: 'get_coupling_status', description: '...', inputSchema: {...} },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Delegate to Pact API
});
```

### Deployment

```json
// ~/.claude/claude_desktop_config.json (for Claude Desktop)
{
  "mcpServers": {
    "pact": {
      "command": "node",
      "args": ["/path/to/pact/dist/mcp/pact-mcp-server.js"],
      "env": {
        "PACT_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Implementation Order

Based on dependencies and value:

### Phase 1: Foundation (Weeks 1-2)
1. **Fix reconciliation path filtering** - Unblock self-reconciliation
2. **Add coupling metrics endpoint** - Backend for dashboard
3. **Create conversation entities** - Foundation for persistent chat

### Phase 2: Visibility (Weeks 2-3)
4. **Dashboard coupling health section** - Show metrics
5. **Basic conversation persistence** - Save/load conversations

### Phase 3: External Access (Weeks 3-4)
6. **MCP server with read_atom tool** - Enable external agents
7. **Add remaining MCP tools** - Full external API

### Phase 4: Conversation (Weeks 4-5)
8. **Conversation compaction** - Handle long conversations
9. **Interview agent graph** - Multi-turn intent extraction

### Phase 5: Polish (Week 5+)
10. **Interview UI integration** - Frontend for molecule creation
11. **Reconciliation scheduling** - Automate analysis
12. **Trend charts and history** - Dashboard polish

---

## Success Metrics

Bootstrap is complete when:

| Metric | Target |
|--------|--------|
| Atom → Test coupling rate | > 90% |
| Test → Atom coupling rate | > 95% |
| Reconciliation can run on Pact repo | Yes (no exclusions needed) |
| External agent can read atoms via MCP | Yes |
| Conversation history persists | Yes |
| Can create molecule via interview | Yes |

---

## References

- [CLAUDE.md](../CLAUDE.md) - Project context and conventions
- [Implementation Checklist Phase 5](implementation-checklist-phase5.md) - Reconciliation agent details
- [UX Specification](ux.md) - User experience principles
- [UI Architecture](ui.md) - Frontend implementation guide
