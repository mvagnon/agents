# Hexagonal React Architecture

## Structure

```
src/
├── application/       # UI — Can freely use React
│   ├── components/    # React components
│   ├── hooks/         # Business hooks (consume domain)
│   ├── pages/         # Route components
│   └── providers/     # Context providers
├── domain/            # Business — Pure TypeScript, ZERO React dependencies
│   ├── entities/      # Business models
│   ├── ports/         # Interfaces/contracts
│   └── lib/           # Pure functions
└── infrastructure/    # External — Implements ports
    ├── api/           # HTTP/GraphQL clients
    └── config/        # Configuration, feature flags
```

## Layer Rules

### Domain (core)

- **No** React dependencies (no JSX, no hooks)
- Pure functions, testable in isolation
- Defines `ports` (interfaces) that infrastructure implements

### Application (UI)

- Consumes domain via custom hooks
- Components split by responsibility
- State management: `useState` → `useReducer` → Context → Zustand (progressive escalation)

### Infrastructure (adapters)

- Implements ports defined by domain
- Handles side effects (API, storage, analytics)
- Transforms external responses into domain entities

## Dependency Principle

```
Application → Domain ← Infrastructure
              ↑
         (ports/interfaces)
```

- Application and Infrastructure depend on Domain
- Domain depends on nothing external
