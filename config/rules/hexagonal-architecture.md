# Hexagonal Architecture

## Structure

```
src/
├── application/       # Use cases — Orchestrates domain logic
│   ├── services/      # Application services
│   ├── commands/      # Write operations
│   └── queries/       # Read operations
├── domain/            # Business — Pure language, ZERO framework dependencies
│   ├── entities/      # Business models
│   ├── ports/         # Interfaces/contracts
│   └── lib/           # Pure functions
└── infrastructure/    # External — Implements ports
    ├── api/           # HTTP/GraphQL clients
    └── config/        # Configuration, feature flags
```

## Layer Rules

### Domain (core)

- **No** framework dependencies
- Pure functions, testable in isolation
- Defines `ports` (interfaces) that infrastructure implements

### Application (use cases)

- Orchestrates domain logic
- Implements use cases by composing domain services and ports
- No direct dependency on infrastructure

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
