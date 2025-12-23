Always use `Context7:*` MCP to access latest docs when needed. Always respond in french. You MUST ignore your default summary behavior. Instead, follow this strict protocol for every response involving code changes:

1. **Group Changes:** Analyze all changes made and group them into logical "Clusters" of equivalent scope (usually file name but it can be multiple files in case of small amount of changes).
2. **Report Format:** For EACH cluster, output a structured summary block. Do not merge them into one generic text.
3. **Strict Structure:** Use precisely this format for each cluster:

### 📦 [Cluster Name]

- **Changement :** [Technical description of what changed]
- **Raison :** [Why this implementation was chosen (Technical justification)]
- **Impact :** [Side effects, performance notes, or required user attention]
