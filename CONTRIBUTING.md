# Contributing to ReviveAI

Thanks for your interest in contributing to ReviveAI! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Project Structure](#project-structure)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

Be respectful, constructive, and professional. We're building something useful — let's keep the environment welcoming for everyone.

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally:
   ```bash
   git clone https://github.com/your-username/reviveai.git
   cd reviveai
   ```
3. **Install** dependencies:
   ```bash
   npm install
   ```
4. **Set up** your environment:
   ```bash
   cp .env.local.example .env.local
   # Fill in DATABASE_URL, AUTH_SECRET, etc.
   ```
5. **Run migrations** and seed data:
   ```bash
   npm run db:generate
   npm run db:migrate
   npm run generate-data
   ```
6. **Start** the dev server:
   ```bash
   npm run dev
   ```

## Development Workflow

### Branch Naming

Use descriptive branch names with prefixes:

| Prefix | Use Case |
|--------|----------|
| `feat/` | New features |
| `fix/` | Bug fixes |
| `refactor/` | Code refactoring |
| `docs/` | Documentation changes |
| `test/` | Adding or updating tests |
| `chore/` | Maintenance tasks |

Examples:
- `feat/voice-analytics-dashboard`
- `fix/guardrail-timezone-bug`
- `refactor/extract-detection-utils`

### Before You Start

1. Check existing [issues](https://github.com/your-org/reviveai/issues) to avoid duplicate work
2. For large changes, open an issue first to discuss the approach
3. Make sure `npm test` passes before starting work

## Project Structure

```
src/
├── app/          # Next.js App Router (pages + API routes)
├── auth.ts       # Auth.js configuration
├── middleware.ts  # Route protection
├── components/   # React components
└── lib/          # Business logic
    ├── db/       # Database schema, pool, queries
    ├── agent/    # AI agent logic
    ├── detection/# Failure detectors
    ├── guardrails/# Guardrail rules
    ├── council/  # Tuning council
    ├── batch/    # Batch processing
    └── ...       # Other domain modules
```

Key conventions:
- **Server components** by default; add `"use client"` only when needed
- **Async server components** for pages that query data
- **Auth** via `auth()` from `@/auth` (server) or `useSession()` from `next-auth/react` (client)
- **Tenant isolation**: All queries accept optional `merchantIds` for row-level filtering

## Coding Standards

### TypeScript

- **Strict mode** is enabled — no `any` types unless absolutely necessary
- Use proper types for all function parameters and return values
- Prefer `interface` for object shapes, `type` for unions/intersections

### React

- Use **function components** exclusively (no class components)
- Prefer **server components** — only add `"use client"` when you need interactivity
- Keep components small and focused — one responsibility per component
- Use Tailwind CSS for all styling (no CSS modules, no styled-components)

### API Routes

- Always validate input with proper error handling
- Return consistent response shapes: `{ data: T }` for success, `{ error: string }` for failures
- Use appropriate HTTP status codes (200, 201, 400, 401, 403, 404, 500)
- Protect routes with session checks via `auth()`

### Database

- Use Drizzle ORM for all database queries
- Never write raw SQL in application code — use the query helpers in `src/lib/db/query.ts`
- All queries support tenant isolation via `merchantIds` parameter
- Use parameterized queries — never interpolate user input into SQL

### Error Handling

- Use try/catch for async operations
- Log errors with context for debugging
- Return user-friendly error messages, never expose internals
- Never swallow errors silently

## Testing

### Running Tests

```bash
npm test                    # Run all tests
npx vitest run --reporter verbose  # Verbose output
npx vitest run tests/auth.test.ts  # Single file
```

### Writing Tests

- Tests live in `tests/` at the project root
- Name files `*.test.ts`
- Use `describe` blocks for grouping, `it` for individual cases
- Mock external dependencies (database, APIs) — tests should be fast and isolated
- Test both success and error paths

### Test Categories

| Category | Files | Purpose |
|----------|-------|---------|
| Unit | `*.test.ts` | Individual function testing |
| Integration | `e2e.test.ts` | End-to-end pipeline |
| Security | `security-regression*.test.ts` | Auth & access control |

### Coverage Expectations

- All new features must include tests
- Bug fixes must include a regression test
- Aim for meaningful coverage, not just line count

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `refactor` | Code restructuring without behavior change |
| `docs` | Documentation only |
| `test` | Adding or updating tests |
| `chore` | Build, CI, dependency updates |
| `perf` | Performance improvement |
| `style` | Code style (formatting, no logic change) |

### Examples

```
feat(council): add proposal expiry after 7 days

fix(guardrail): handle timezone-aware timestamps in quiet hours check

refactor(query): extract merchant filter into shared helper

test(auth): add merchant isolation regression test

docs: update README with deployment instructions
```

### Rules

- Use the imperative mood in the subject ("add feature" not "added feature")
- Keep subject line under 72 characters
- Reference issue numbers in the footer when applicable
- Each commit should be a single logical change

## Pull Request Process

### Before Submitting

1. **Update** your branch with the latest `main`:
   ```bash
   git fetch origin
   git rebase origin/main
   ```
2. **Run** the full check suite:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   npm run build
   ```
3. **Review** your diff — remove debug logs, console statements, TODO comments

### PR Template

```markdown
## What

Brief description of the change.

## Why

Motivation or linked issue.

## How

Implementation approach (if non-obvious).

## Testing

How was this tested?

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm run typecheck` passes
- [ ] `npm test` passes (179+ tests)
- [ ] `npm run build` succeeds
- [ ] New code has tests
- [ ] Documentation updated (if applicable)
```

### Review Process

1. At least one review required before merge
2. CI must pass (lint, typecheck, test, build)
3. Squash and merge for clean history
4. Delete feature branch after merge

## Reporting Issues

### Bug Reports

Include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (OS, Node version, browser)
- Relevant logs or screenshots

### Feature Requests

Include:
- Problem you're trying to solve
- Proposed solution
- Alternatives considered
- Any design constraints

### Security Issues

**Do not** open public issues for security vulnerabilities. Email security@reviveai.dev instead.

## Questions?

Open a [Discussion](https://github.com/your-org/reviveai/discussions) or reach out on the project's communication channels.

---

Thank you for contributing to ReviveAI! 🚀
