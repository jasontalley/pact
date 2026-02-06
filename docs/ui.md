# Pact – UI Architecture Specification

## 1. Purpose of This Document

This document defines the **technical UI architecture** for Pact. It complements `ux.md` (which defines interaction semantics and mental models) with concrete implementation decisions.

**Audience**: Developers, coding agents, contributors implementing the frontend.

**Scope**: Technology choices, state management, component patterns, project structure.

---

## 2. Technology Stack

| Layer | Technology | Version | Rationale |
|-------|------------|---------|-----------|
| Framework | Next.js (App Router) | 16.x | Turbopack default, React Compiler, `use cache`, React 19.2 |
| Language | TypeScript | 5.7+ | Strict mode enabled, full type safety |
| Canvas | @xyflow/react | 12.x | Renamed from ReactFlow, dark mode, CSS variables |
| Styling | TailwindCSS | 4.x | CSS-first config, @theme directive, oklch colors |
| Components | shadcn/ui | latest | Accessible, customizable, Tailwind v4 compatible |
| Server State | @tanstack/react-query | 5.90+ | Caching, deduplication, optimistic updates, devtools |
| Client State | Zustand | 5.x | SSR-safe middleware, selector-based subscriptions |
| URL State | nuqs | 2.8+ | Type-safe URL search params, SSR-compatible |
| Forms | React Hook Form + Zod | 7.71+ | Validation, type inference, Next.js 16 compatible |
| HTTP Client | Axios | 1.7+ | Interceptors, error handling, request cancellation |
| Real-time | Socket.io-client | 4.8+ | WebSocket connection to NestJS gateway |
| Testing | Vitest + Testing Library | 3.x | Fast, React 19-focused, compatible with Next.js 16 |
| E2E Testing | Playwright | 1.50+ | Cross-browser, visual regression, API mocking |
| Runtime | Node.js | 22.x LTS | Jod LTS (current), required for Next.js 16 |

---

## 3. State Management Architecture

### 3.1 State Categories

```text
┌─────────────────────────────────────────────────────────────────┐
│                        State Architecture                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │
│  │ React Query  │    │   Zustand    │    │    nuqs      │       │
│  │ Server State │    │  UI State    │    │  URL State   │       │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘       │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  • Atom CRUD          • Canvas zoom/pan    • Filter params      │
│  • Quality scores     • Node selection     • Search query       │
│  • Evidence data      • Sidebar state      • Sort order         │
│  • Validation         • Detail panel       • Active view        │
│  • LLM responses      • Wizard step        • Pagination         │
│  • Molecules          • Pending actions    • Selected atom ID   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Why This Architecture

1. **ReactFlow Alignment**: ReactFlow uses Zustand internally. Using Zustand for canvas state creates consistency and enables direct store integration.

2. **Performance**: Zustand's selector-based subscriptions prevent unnecessary re-renders during high-frequency canvas operations (drag, pan, zoom).

3. **Server State Best Practices**: React Query handles caching, background refresh, optimistic updates, and cache invalidation declaratively.

4. **Bookmarkable Views**: nuqs synchronizes filter/search state with URL, enabling shareable links and browser history navigation.

### 3.3 Store Organization

```typescript
// stores/canvas-ui.ts
interface CanvasUIState {
  zoom: number;
  panPosition: { x: number; y: number };
  selectedAtomIds: string[];
  // Actions
  setZoom: (zoom: number) => void;
  setPan: (position: { x: number; y: number }) => void;
  selectAtoms: (ids: string[]) => void;
  clearSelection: () => void;
}

// stores/layout.ts
interface LayoutState {
  sidebarOpen: boolean;
  detailPanelAtomId: string | null;
  activeTab: 'canvas' | 'list' | 'dashboard';
  // Actions
  toggleSidebar: () => void;
  openAtomDetail: (id: string) => void;
  closeAtomDetail: () => void;
}

// stores/refinement-wizard.ts
interface RefinementWizardState {
  step: number;
  rawIntent: string;
  analysisResult: AtomizationResult | null;
  pendingSuggestions: string[];
  // Actions
  setRawIntent: (intent: string) => void;
  nextStep: () => void;
  prevStep: () => void;
  acceptSuggestion: (index: number) => void;
  reset: () => void;
}
```

---

## 4. Project Structure

```text
frontend/
├── app/                          # Next.js App Router
│   ├── layout.tsx                # Root layout with providers
│   ├── page.tsx                  # Dashboard (home)
│   ├── canvas/
│   │   └── page.tsx              # Canvas view
│   ├── atoms/
│   │   ├── page.tsx              # Atoms list view
│   │   └── [id]/
│   │       └── page.tsx          # Atom detail page
│   └── providers.tsx             # Client-side providers
│
├── components/
│   ├── ui/                       # shadcn/ui components (generated)
│   │   ├── button.tsx
│   │   ├── dialog.tsx
│   │   ├── input.tsx
│   │   └── ...
│   ├── canvas/                   # Canvas-specific components
│   │   ├── Canvas.tsx            # Main ReactFlow canvas
│   │   ├── AtomNode.tsx          # Custom node for atoms
│   │   ├── AtomNodeControls.tsx  # Node action buttons
│   │   ├── CanvasControls.tsx    # Zoom, fit, etc.
│   │   └── Minimap.tsx           # Navigation minimap
│   ├── atoms/                    # Atom-related components
│   │   ├── AtomCard.tsx          # Card display for list view
│   │   ├── AtomDetailPanel.tsx   # Side panel with full details
│   │   ├── CreateAtomDialog.tsx  # Natural language input + AI
│   │   ├── CommitDialog.tsx      # Commitment ceremony
│   │   ├── RefinementWizard.tsx  # Multi-step refinement
│   │   └── SupersedeDialog.tsx   # Create superseding atom
│   ├── quality/                  # Quality-related components
│   │   ├── QualityBadge.tsx      # Score badge (color-coded)
│   │   ├── QualityBreakdown.tsx  # 5-dimension breakdown
│   │   └── QualityTrend.tsx      # Trend chart
│   ├── layout/                   # Layout components
│   │   ├── Sidebar.tsx           # Left sidebar with filters
│   │   ├── Header.tsx            # Top header/nav
│   │   ├── FilterBar.tsx         # Filter controls
│   │   └── SearchInput.tsx       # Global search
│   └── shared/                   # Shared/utility components
│       ├── StatusIndicator.tsx   # Draft/Committed/Superseded
│       ├── ConfirmDialog.tsx     # Generic confirmation
│       ├── LoadingSpinner.tsx
│       └── ErrorBoundary.tsx
│
├── hooks/                        # Custom hooks
│   ├── atoms/                    # React Query hooks for atoms
│   │   ├── use-atoms.ts          # List atoms
│   │   ├── use-atom.ts           # Single atom
│   │   ├── use-create-atom.ts    # Create mutation
│   │   ├── use-commit-atom.ts    # Commit mutation
│   │   ├── use-refine-atom.ts    # Refinement mutation
│   │   └── use-supersede-atom.ts # Supersede mutation
│   ├── quality/                  # Quality hooks
│   │   ├── use-quality-dashboard.ts
│   │   └── use-quality-trends.ts
│   ├── filters/                  # URL state hooks
│   │   └── use-atom-filters.ts   # nuqs-based filters
│   └── socket/                   # WebSocket hooks
│       └── use-atom-events.ts    # Real-time atom events
│
├── stores/                       # Zustand stores
│   ├── canvas-ui.ts
│   ├── layout.ts
│   └── refinement-wizard.ts
│
├── lib/
│   ├── api/                      # API client layer
│   │   ├── client.ts             # Axios instance with interceptors
│   │   ├── atoms.ts              # Atom API functions
│   │   ├── agents.ts             # Atomization agent API
│   │   ├── quality.ts            # Quality API functions
│   │   └── types.ts              # API request/response types
│   ├── socket/                   # WebSocket client
│   │   ├── client.ts             # Socket.io instance
│   │   └── events.ts             # Event type definitions
│   └── utils/
│       ├── cn.ts                 # Tailwind className utility
│       └── format.ts             # Date, number formatters
│
├── types/                        # TypeScript type definitions
│   ├── atom.ts                   # Atom-related types
│   ├── quality.ts                # Quality-related types
│   └── canvas.ts                 # Canvas/node types
│
├── styles/
│   └── globals.css               # Tailwind imports, CSS variables
│
├── __tests__/                    # Test files (or colocated)
│   ├── components/
│   ├── hooks/
│   └── e2e/
│
├── public/                       # Static assets
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── Dockerfile.dev
```

---

## 5. Component Patterns

### 5.1 Server vs Client Components

**Default to Server Components** for data fetching and static content.

**Use Client Components** (`'use client'`) for:

- Interactive elements (forms, buttons with handlers)
- Browser APIs (localStorage, WebSocket)
- Zustand stores
- React Query hooks

```tsx
// app/canvas/page.tsx - Server Component
import { getAtoms } from '@/lib/api/atoms';
import { CanvasClient } from '@/components/canvas/CanvasClient';

export default async function CanvasPage() {
  // Server-side data fetch
  const initialAtoms = await getAtoms();

  return (
    <main className="h-screen">
      <CanvasClient initialAtoms={initialAtoms} />
    </main>
  );
}

// components/canvas/CanvasClient.tsx - Client Component
'use client';

import { useAtoms } from '@/hooks/atoms/use-atoms';
import { useCanvasUIStore } from '@/stores/canvas-ui';

export function CanvasClient({ initialAtoms }: Props) {
  const { data: atoms } = useAtoms({ initialData: initialAtoms });
  const { zoom, selectedAtomIds } = useCanvasUIStore();

  return <ReactFlow nodes={...} />;
}
```

### 5.2 Commitment Ceremony Pattern

Per `ux.md`: "Atom creation should feel closer to signing a contract than writing a note."

```tsx
// components/atoms/CommitDialog.tsx
export function CommitDialog({ atom, onConfirm, onCancel }: Props) {
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Commit Intent Atom</DialogTitle>
          <DialogDescription>
            This action is <strong>permanent</strong>. Once committed, this atom
            cannot be edited or deleted—only superseded.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <AtomSummary atom={atom} />
          <QualityBreakdown score={atom.qualityScore} />
        </div>

        {/* Explicit acknowledgment - REQUIRED by UX spec */}
        <div className="flex items-center space-x-2">
          <Checkbox
            id="acknowledge"
            checked={acknowledged}
            onCheckedChange={setAcknowledged}
          />
          <label htmlFor="acknowledge" className="text-sm">
            I understand this atom will become immutable
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="default"
            disabled={!acknowledged || atom.qualityScore < 80}
            onClick={onConfirm}
          >
            Commit Atom
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

### 5.3 Optimistic Updates Pattern

```tsx
// hooks/atoms/use-commit-atom.ts
export function useCommitAtom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (atomId: string) => atomsApi.commit(atomId),

    // Optimistic update
    onMutate: async (atomId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['atoms'] });

      // Snapshot previous value
      const previous = queryClient.getQueryData<Atom[]>(['atoms']);

      // Optimistically update
      queryClient.setQueryData<Atom[]>(['atoms'], (old) =>
        old?.map((a) =>
          a.id === atomId
            ? { ...a, status: 'committed', committedAt: new Date() }
            : a
        )
      );

      return { previous };
    },

    // Rollback on error
    onError: (err, atomId, context) => {
      queryClient.setQueryData(['atoms'], context?.previous);
      toast.error('Failed to commit atom');
    },

    // Refetch after success or error
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['atoms'] });
    },

    onSuccess: (data) => {
      toast.success(`Atom ${data.atomId} committed successfully`);
    },
  });
}
```

---

## 6. Real-time Updates

### 6.1 WebSocket Events

```typescript
// lib/socket/events.ts
export type AtomEvent =
  | { type: 'atom:created'; data: Atom }
  | { type: 'atom:committed'; atomId: string; data: Atom }
  | { type: 'atom:superseded'; atomId: string; newAtomId: string }
  | { type: 'quality:updated'; atomId: string; score: number };

// lib/socket/client.ts
import { io, Socket } from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});
```

### 6.2 Event Hook

```tsx
// hooks/socket/use-atom-events.ts
export function useAtomEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    socket.connect();

    socket.on('atom:committed', ({ atomId, data }) => {
      // Update cache directly
      queryClient.setQueryData<Atom[]>(['atoms'], (old) =>
        old?.map((a) => (a.id === atomId ? data : a))
      );
      toast.info(`Atom ${data.atomId} was committed`);
    });

    socket.on('atom:created', ({ data }) => {
      queryClient.invalidateQueries({ queryKey: ['atoms'] });
      toast.info(`New atom ${data.atomId} created`);
    });

    return () => {
      socket.off('atom:committed');
      socket.off('atom:created');
      socket.disconnect();
    };
  }, [queryClient]);
}
```

### 6.3 Backend Gateway (NestJS)

Add to Phase 1 backend scope:

```typescript
// src/gateways/atoms.gateway.ts
@WebSocketGateway({ cors: true })
export class AtomsGateway {
  @WebSocketServer()
  server: Server;

  emitAtomCommitted(atom: Atom) {
    this.server.emit('atom:committed', { atomId: atom.id, data: atom });
  }

  emitAtomCreated(atom: Atom) {
    this.server.emit('atom:created', { data: atom });
  }
}
```

### 6.4 Reconciliation Events

```typescript
// lib/socket/events.ts (additions)
export type ReconciliationEvent =
  | { type: 'reconciliation:started'; runId: string }
  | { type: 'reconciliation:progress'; runId: string; phase: string; progress: number }
  | { type: 'reconciliation:completed'; runId: string; summary: ReconciliationSummary }
  | { type: 'reconciliation:failed'; runId: string; error: string }
  | { type: 'reconciliation:review_ready'; runId: string; atomCount: number };

// hooks/socket/use-reconciliation-events.ts
export function useReconciliationEvents(runId: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    socket.on('reconciliation:progress', ({ runId: id, phase, progress }) => {
      if (id === runId) {
        // Update local state for progress indicator
      }
    });

    socket.on('reconciliation:completed', ({ runId: id, summary }) => {
      if (id === runId) {
        queryClient.invalidateQueries({ queryKey: ['reconciliation', runId] });
        toast.success(`Reconciliation complete: ${summary.inferredAtomsCount} atoms inferred`);
      }
    });

    return () => {
      socket.off('reconciliation:progress');
      socket.off('reconciliation:completed');
    };
  }, [runId, queryClient]);
}
```

---

## 7. Reconciliation UI

The Reconciliation Agent has a dedicated UI for analyzing codebases and reviewing inferred atoms.

### 7.1 Wizard Flow

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Reconciliation Wizard                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Step 1: Configure          Step 2: Analyzing                   │
│  ┌──────────────────┐       ┌──────────────────┐                │
│  │ • Root directory │  ──▶  │ • Progress bar   │                │
│  │ • Mode (full/Δ)  │       │ • Current phase  │                │
│  │ • Path filters   │       │ • Tests found    │                │
│  │ • Options        │       │ • LLM calls      │                │
│  └──────────────────┘       └──────────────────┘                │
│                                     │                            │
│                                     ▼                            │
│  Step 4: Complete           Step 3: Review                      │
│  ┌──────────────────┐       ┌──────────────────┐                │
│  │ • Summary stats  │  ◀──  │ • Atom list      │                │
│  │ • Atoms created  │       │ • Accept/Reject  │                │
│  │ • Molecules      │       │ • Quality scores │                │
│  │ • Next actions   │       │ • Source links   │                │
│  └──────────────────┘       └──────────────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 Key Components

```text
frontend/
├── app/
│   └── reconciliation/
│       ├── page.tsx              # Reconciliation list/history
│       └── [runId]/
│           └── page.tsx          # Run detail with review UI
│
├── components/
│   └── agents/
│       ├── ReconciliationWizard.tsx    # Multi-step wizard
│       ├── ReconciliationConfig.tsx    # Step 1: Configuration form
│       ├── ReconciliationProgress.tsx  # Step 2: Progress display
│       ├── ReconciliationReview.tsx    # Step 3: Review interface
│       ├── ReconciliationComplete.tsx  # Step 4: Summary
│       ├── AtomRecommendationCard.tsx  # Single recommendation display
│       ├── PathFilterInput.tsx         # Glob pattern filter
│       └── QualityScoreDisplay.tsx     # 5-dimension breakdown
```

### 7.3 Review Interface Pattern

```tsx
// components/agents/AtomRecommendationCard.tsx
export function AtomRecommendationCard({ recommendation, onAccept, onReject }: Props) {
  return (
    <Card className={cn(
      'border-l-4',
      recommendation.qualityScore >= 80 ? 'border-l-green-500' : 'border-l-yellow-500'
    )}>
      <CardHeader>
        <div className="flex justify-between items-start">
          <div>
            <Badge variant="outline">{recommendation.category}</Badge>
            <CardTitle className="mt-2">{recommendation.description}</CardTitle>
          </div>
          <QualityScoreDisplay score={recommendation.qualityScore} />
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Source test info */}
        <div className="text-sm text-muted-foreground">
          <span className="font-mono">{recommendation.sourceTestFilePath}</span>
          <span className="ml-2">Line {recommendation.sourceTestLineNumber}</span>
        </div>

        {/* LLM reasoning (collapsible) */}
        <Collapsible>
          <CollapsibleTrigger>View reasoning</CollapsibleTrigger>
          <CollapsibleContent className="text-sm mt-2">
            {recommendation.reasoning}
          </CollapsibleContent>
        </Collapsible>

        {/* Observable outcomes */}
        {recommendation.observableOutcomes.length > 0 && (
          <div>
            <h4 className="text-sm font-medium">Observable Outcomes</h4>
            <ul className="list-disc list-inside text-sm">
              {recommendation.observableOutcomes.map((o, i) => (
                <li key={i}>{o.description}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>

      <CardFooter className="justify-end space-x-2">
        <Button variant="outline" onClick={() => onReject(recommendation.id)}>
          Reject
        </Button>
        <Button
          onClick={() => onAccept(recommendation.id)}
          disabled={recommendation.qualityScore < 80}
        >
          Accept
        </Button>
      </CardFooter>
    </Card>
  );
}
```

### 7.4 Path Filter Input

```tsx
// components/agents/PathFilterInput.tsx
export function PathFilterInput({ value, onChange }: Props) {
  const [patterns, setPatterns] = useState<string[]>(value || []);
  const [input, setInput] = useState('');

  const addPattern = () => {
    if (input && !patterns.includes(input)) {
      const newPatterns = [...patterns, input];
      setPatterns(newPatterns);
      onChange(newPatterns);
      setInput('');
    }
  };

  return (
    <div className="space-y-2">
      <Label>Path Exclusion Patterns (glob)</Label>
      <div className="flex space-x-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g., **/node_modules/**, **/*.mock.ts"
          onKeyDown={(e) => e.key === 'Enter' && addPattern()}
        />
        <Button variant="outline" onClick={addPattern}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {patterns.map((pattern, i) => (
          <Badge key={i} variant="secondary" className="pr-1">
            <code className="text-xs">{pattern}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0 ml-1"
              onClick={() => {
                const newPatterns = patterns.filter((_, j) => j !== i);
                setPatterns(newPatterns);
                onChange(newPatterns);
              }}
            >
              ×
            </Button>
          </Badge>
        ))}
      </div>
    </div>
  );
}
```

### 7.5 Reconciliation API Hooks

```typescript
// hooks/reconciliation/use-reconciliation.ts
export function useReconciliationRun(runId: string) {
  return useQuery({
    queryKey: ['reconciliation', runId],
    queryFn: () => reconciliationApi.getRun(runId),
    refetchInterval: (data) =>
      data?.status === 'running' ? 2000 : false, // Poll while running
  });
}

export function useStartReconciliation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: ReconciliationConfig) =>
      reconciliationApi.start(config),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation-runs'] });
      toast.info(`Reconciliation started: ${data.runId}`);
    },
  });
}

export function useAcceptRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, recommendationId }: AcceptParams) =>
      reconciliationApi.acceptRecommendation(runId, recommendationId),
    onSuccess: (_, { runId }) => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', runId] });
    },
  });
}

export function useRejectRecommendation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ runId, recommendationId, reason }: RejectParams) =>
      reconciliationApi.rejectRecommendation(runId, recommendationId, reason),
    onSuccess: (_, { runId }) => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', runId] });
    },
  });
}
```

---

## 8. Design System

### 8.1 Visual Style: Minimal/Professional

- **Clarity over flourish**: Focus on content, not decoration
- **Information density**: Show relevant data without overwhelming
- **Consistent patterns**: Same interactions behave the same way

### 8.2 Color Palette

```css
/* styles/globals.css */
:root {
  /* Semantic colors for atom status */
  --status-draft: theme('colors.blue.500');
  --status-committed: theme('colors.green.500');
  --status-superseded: theme('colors.gray.400');

  /* Quality score colors */
  --quality-reject: theme('colors.red.500');    /* < 60 */
  --quality-revise: theme('colors.yellow.500'); /* 60-79 */
  --quality-approve: theme('colors.green.500'); /* >= 80 */

  /* Category colors (for canvas nodes) */
  --category-functional: theme('colors.purple.500');
  --category-performance: theme('colors.orange.500');
  --category-security: theme('colors.red.500');
  --category-ux: theme('colors.cyan.500');
}
```

### 8.3 Typography

- **Font**: System font stack (via Tailwind defaults) or Inter
- **Atom IDs**: Monospace (`font-mono`), e.g., `IA-001`
- **Descriptions**: Prose-like, readable line height

### 8.4 Component Conventions

| Element | Pattern |
|---------|---------|
| Buttons | `variant="default"` for primary, `variant="outline"` for secondary, `variant="destructive"` for commit |
| Cards | Subtle border, hover state for interactive |
| Badges | Status-colored, small, rounded |
| Dialogs | Max-width constraint, clear hierarchy |
| Forms | Label above input, inline validation |

---

## 9. API Client Layer

### 9.1 Axios Instance

```typescript
// lib/api/client.ts
import axios, { AxiosError } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response.data,
  (error: AxiosError) => {
    // Consistent error handling
    const message = error.response?.data?.message || error.message;
    console.error('[API Error]', message);
    return Promise.reject(error);
  }
);
```

### 9.2 API Functions

```typescript
// lib/api/atoms.ts
export const atomsApi = {
  list: (params?: AtomFilters) =>
    apiClient.get<Atom[]>('/atoms', { params }),

  get: (id: string) =>
    apiClient.get<Atom>(`/atoms/${id}`),

  create: (data: CreateAtomDto) =>
    apiClient.post<Atom>('/atoms', data),

  commit: (id: string) =>
    apiClient.patch<Atom>(`/atoms/${id}/commit`),

  supersede: (id: string, newAtomId: string) =>
    apiClient.patch<Atom>(`/atoms/${id}/supersede`, { newAtomId }),

  addTag: (id: string, tag: string) =>
    apiClient.post(`/atoms/${id}/tags`, { tag }),

  removeTag: (id: string, tag: string) =>
    apiClient.delete(`/atoms/${id}/tags/${tag}`),
};

// lib/api/agents.ts
export const agentsApi = {
  atomize: (data: AtomizeIntentDto) =>
    apiClient.post<AtomizationResult>('/agents/atomization/atomize', data),

  refine: (atomId: string, feedback: string) =>
    apiClient.post(`/agents/atomization/refine/${atomId}`, { feedback }),
};
```

---

## 10. Testing Strategy

| Test Type | Tool | Target | Focus |
|-----------|------|--------|-------|
| Unit | Vitest | 70% | Hooks, stores, utilities |
| Component | Testing Library | 70% | User interactions, accessibility |
| Integration | Playwright | Key flows | Canvas operations, commit ceremony |
| E2E | Playwright | Critical paths | Full user journeys |

### 10.1 Example: Hook Test

```typescript
// __tests__/hooks/use-commit-atom.test.ts
import { renderHook, waitFor } from '@testing-library/react';
import { useCommitAtom } from '@/hooks/atoms/use-commit-atom';

describe('useCommitAtom', () => {
  it('optimistically updates atom status', async () => {
    const { result } = renderHook(() => useCommitAtom(), { wrapper });

    result.current.mutate('atom-123');

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });
});
```

---

## 11. Docker Integration

```yaml
# docker-compose.yml (addition to existing)
services:
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    ports:
      - "3001:3000"
    environment:
      - NEXT_PUBLIC_API_URL=http://app:3000
      - NEXT_PUBLIC_WS_URL=ws://app:3000
    volumes:
      - ./frontend:/app
      - /app/node_modules
      - /app/.next
    depends_on:
      - app
    command: npm run dev
```

```dockerfile
# frontend/Dockerfile.dev
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
```

---

## 12. Cross-References

- **UX Specification**: See [ux.md](ux.md) for interaction semantics and mental models
- **Schema Documentation**: See [schema.md](schema.md) for database tables including reconciliation entities
- **Implementation Checklist**: See [implementation-checklist-phase1.md](implementation-checklist-phase1.md) Part 5 for task breakdown
- **Backend API**: Swagger documentation at `http://localhost:3000/api`
- **Reconciliation Agent**: See [index.md](index.md) Section 5.5 for agent pipeline architecture

---

*This document is living. Changes must align with `ux.md` principles.*
