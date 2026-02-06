# Pact Frontend

Next.js-based UI for the Pact Intent Atom Management System.

## Technology Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Canvas**: ReactFlow
- **Styling**: TailwindCSS
- **Components**: shadcn/ui
- **State Management**:
  - Server State: @tanstack/react-query
  - Client State: Zustand
  - URL State: nuqs
- **Real-time**: Socket.io-client

## Getting Started

### Docker (Recommended)

```bash
# From project root
docker-compose up frontend
```

Frontend will be available at http://localhost:3001

### Local Development

```bash
cd frontend
npm install
npm run dev
```

## Project Structure

```
frontend/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout with providers
│   ├── page.tsx            # Dashboard
│   ├── canvas/             # Canvas view
│   └── atoms/              # Atoms list and detail
├── components/
│   ├── atoms/              # Atom-related components
│   ├── canvas/             # ReactFlow canvas components
│   ├── dashboard/          # Dashboard components
│   ├── quality/            # Quality score components
│   ├── shared/             # Shared components
│   └── ui/                 # shadcn/ui components
├── hooks/
│   ├── atoms/              # Atom CRUD hooks
│   └── socket/             # WebSocket hooks
├── stores/                 # Zustand stores
├── lib/
│   ├── api/                # API client
│   ├── socket/             # WebSocket client
│   └── utils/              # Utilities
├── types/                  # TypeScript types
└── styles/                 # Global styles
```

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000
```

## Key Features

- **Dashboard**: Overview of atom statistics and recent activity
- **Canvas**: Visual atom organization with drag-and-drop
- **Atom Creation Wizard**: AI-assisted multi-step atom creation
- **Real-time Updates**: WebSocket-powered live updates
- **Commitment Ceremony**: Explicit acknowledgment for immutable commits

## Documentation

- [UI Architecture](../docs/ui.md) - Technical architecture decisions
- [UX Specification](../docs/ux.md) - Interaction semantics and principles
