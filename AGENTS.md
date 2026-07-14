# Function FBTC Agent SDK

Monorepo with Yarn 4 workspaces + Turborepo for Function FBTC AI agent integrations.

## Monorepo Structure

```
packages/
  sdk-agent/        # Framework-agnostic tools (@functionFBTC/sdk-agent)
  sdk-agentkit/     # Coinbase AgentKit provider (@functionFBTC/sdk-agentkit)
apps/
  example-agent-chat/     # Web chat UI example
  example-agentkit-cli/   # CLI AgentKit example
```

## Commands

All commands use yarn. Never use npm.

### Root-level (turbo)

```bash
yarn build                    # Build all packages
yarn lint                     # Lint all packages
yarn test                     # Test all packages
yarn test:required            # CI gate tests
yarn format                   # Prettier format all
```

### Per-package

```bash
npx turbo build --filter=@functionFBTC/sdk-agent
npx turbo build --filter=@functionFBTC/sdk-agentkit
yarn workspace @functionFBTC/sdk-agent test
yarn workspace @functionFBTC/sdk-agentkit test
```

## Code Standards

### Linting (ESLint 9)

- `@typescript-eslint/no-explicit-any` - error
- `unused-imports/no-unused-imports` - error
- `simple-import-sort` - enforced import ordering
- `no-console` - error
- Max warnings: 0 (all warnings are errors in CI)
- Unused vars prefixed with `_` are allowed

### Formatting

Prettier 3.2 with default config. Run `yarn format` before committing.

### Commit Messages

Conventional commits. Body explains why, not what.

```
fix: description
feat: description
chore: description
```

### Git Rules

- Stage specific files, never `git add -A` or `git add .`
- Never force push to main
- Never skip pre-commit hooks

### Open Source Boundaries

This is a public repository. Never include references to internal tools, URLs, or ticket systems (Jira, Confluence, Slack, etc.) in code, commits, PRs, or comments visible in the repo.

## Development Rules

- Prefer editing existing files over creating new ones
- Do not add drive-by refactors or unrelated changes
- Keep PR scope focused
- Match existing style and naming
