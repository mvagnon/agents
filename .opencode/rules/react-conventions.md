# React Conventions

## Core Rules

- List of dependencies in `./package.json`;
- Suggest new dependencies if needed;
- Functional components only;
- Destructure props in the signature;
- One file = one exported component (+ private helpers if needed);
- Recommended max size for components: ~150 lines.

## Patterns

### Presentational vs Container

```typescript
// Presentational — Pure UI, no business logic
function UserCard({ name, avatar, onEdit }: UserCardProps) {
  return (/* JSX */);
}

// Container — Connects to domain via hooks
function UserCardContainer({ userId }: { userId: string }) {
  const { user, updateUser } = useUser(userId);
  return <UserCard {...user} onEdit={updateUser} />;
}
```

### Compound Components

For related components that share implicit state:

```typescript
<Tabs defaultValue="tab1">
  <Tabs.List>
    <Tabs.Trigger value="tab1">Tab 1</Tabs.Trigger>
  </Tabs.List>
  <Tabs.Content value="tab1">Content</Tabs.Content>
</Tabs>
```

## Props

- Prefer unions over booleans: `variant: 'primary' | 'secondary'` instead of `isPrimary`
- Use `children` for composition
- Defaults via destructuring: `{ size = 'md' }`

## Performance (measure before optimizing)

| Tool          | When                                           |
| ------------- | ---------------------------------------------- |
| `React.memo`  | Component re-renders often with same props     |
| `useMemo`     | Expensive calculation in render                |
| `useCallback` | Stable reference for callbacks passed as props |
| `React.lazy`  | Code splitting by route/feature                |

## Hooks

- `use` prefix required
- Call at top-level only (not in conditions/loops)
- Extract complex logic into custom hooks
