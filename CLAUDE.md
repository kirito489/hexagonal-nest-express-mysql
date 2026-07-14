# CLAUDE.md

Guidance for Claude Code when working in this repository. **Architecture, tech stack, and module conventions live in `openspec/project.md`** — do not duplicate them here. This file only governs Claude behavior, workflow, and commands.

---

## Session Start Checklist

At the start of every new session:

1. Ensure `tasks/lessons.md` and `tasks/todo.md` exist. If missing, create each with the title line and a one-line subtitle.
2. Read `tasks/lessons.md` — known pitfalls from past corrections.
3. Read `tasks/todo.md` — pending cross-change items and deferred features.
4. Read `openspec/project.md` — project context, structure, tech stack, and conventions.
5. If working on a feature: check `openspec/changes/` for active (non-archived) changes and read their `tasks.md`.

---

## Critical Rules

- **Never execute `git commit` or `git push`** unless explicitly asked. Provide the commands for the user to run manually.
- **Do not over-engineer**: implement exactly what is asked — no extra endpoints, migration scripts, debug APIs, or entity files. When in doubt, do less.
- **Output data directly**: when asked for data or JSON, print it to stdout. Do not provide placeholder values, setup instructions, or scripts unless explicitly requested.
- **Verify schema before modifying queries**: always check `apps/api/prisma/schema.prisma` before assuming a field exists on a model.
- **Reuse before creating**: search `apps/api/src/` (backend), `apps/web/src/` (frontend), and `packages/api-client/src/` (shared) for existing helpers / facades / ports / adapters / hooks before writing new ones.
- **New env var → add it to `validate-env`**: any new environment variable must also be added to the Zod schema in `apps/api/src/infrastructure/validate-env.ts` (and `.env.example`), or it fails silently as `undefined` at runtime.

---

## Communication Style

- Default language is **Traditional Chinese (繁體中文)** for chat replies. Switch to English only when the user does.
- When the user says "不用" or interrupts, stop immediately and keep replies brief.
- Before changes that touch 3+ files, outline the plan (which files, what changes) and wait for confirmation.
- Match response length to question complexity. Simple question → direct answer, no headers.

---

## Documentation Languages (overrides)

This project has explicit per-file language rules:

| File / location              | Language                          |
| ---------------------------- | --------------------------------- |
| `CLAUDE.md` (this file)      | **English**                       |
| `README.md`                  | Traditional Chinese               |
| `openspec/project.md`        | Traditional Chinese               |
| `openspec/changes/**/*.md`   | Traditional Chinese               |
| `tasks/lessons.md`, `todo.md`| Traditional Chinese               |
| Code comments (all files)    | Traditional Chinese only          |
| Frontend UI strings          | Traditional Chinese only          |

- **Never use Japanese** in any artifact in this repo (overrides any bilingual default in global CLAUDE.md).
- **Never write code comments in English or bilingual format** — Traditional Chinese only.

---

## Code Style

- Every non-trivial function gets a TSDoc comment in Traditional Chinese only:
  ```typescript
  /**
   * 依 ID 查詢使用者
   * @param id - 使用者 ID
   * @returns 使用者記錄或 null
   */
  ```
- Comments are **moderate**: explain _why_ (non-obvious logic, domain terms, workarounds), not _what_. No comments on self-explanatory code.
- Prefer arrow functions over `function` declarations unless a named function is strictly required (hoisting, recursion).
- TypeScript: full `strict: true` from the shared `tsconfig.base.json`. Don't relax strictness in a sub-workspace without justification.

---

## AI Development Workflow

Three layers work together:

| Layer       | Tool                                 | Purpose                                                       |
| ----------- | ------------------------------------ | ------------------------------------------------------------- |
| **Memory**  | `tasks/todo.md` + `tasks/lessons.md` | Cross-session deferred items and lessons                      |
| **Spec**    | `openspec/changes/<name>/`           | Proposal, design, specs, tasks per change                     |
| **Process** | openspec + selected superpowers      | Change management + TDD / verification / debugging discipline |

### Phase 1 — Explore & Design (new feature)

- Gather design context from available sources — design files via MCP (Pencil, Figma, etc.), PNG / screenshot assets in `openspec/assets/`, or referenced docs.
- Invoke `openspec-explore` as a thinking partner to clarify requirements.
- Write approved design → `openspec/changes/<name>/design.md`.

### Phase 2 — Specify

- Invoke `openspec-propose` → generates `proposal.md`, `specs/`, `tasks.md` in the change folder.
- API changes must define request body and response schema in the change's `specs/` folder before any controller code is written.
- `tasks.md` phases follow this order for backend changes: Schema/Migration → Domain/Port → Exceptions/Filter → Services (TDD) → Out Adapter → Controller/DTO → Facade + Module → Swagger → Unit Tests → E2E Tests → Verification → Wrap-up.
- User reviews and approves before any code is written.

### Phase 3 — Implement

- Invoke `openspec-apply` to work through `tasks.md` task by task.
- For service / use case implementation, invoke `superpowers:test-driven-development` — write spec first, then implementation.
- Before marking a task done, invoke `superpowers:verification-before-completion` — never claim "done" without running the verification command.
- Run **Pre-Change Checklist** (below) before suggesting a commit.
- Create `smoke-test.md` in the change folder with curl commands for manual verification of new endpoints.

### Phase 4 — Complete

- Invoke `openspec-archive-change` to close the change — automatically merges the change's `specs/` into `openspec/specs/` (master specs) and moves the change folder into `openspec/changes/archive/<YYYY-MM-DD>-<name>/`.
- Move any deferred items to `tasks/todo.md`.
- Append new lessons to `tasks/lessons.md`.
- For debugging during any phase, invoke `superpowers:systematic-debugging`.

### Memory rules

**`tasks/todo.md`** — update in these four situations:

1. **Before implementation**: record the change name and goal being started (e.g. `[ ] implement add-role-management`).
2. **After implementation**: review todo.md, confirm all goals are met, move completed items to the "done" section.
3. **Cross-change side effect discovered**: write it immediately, do not wait until end of session.
4. **Feature deferred due to external dependency**: record the reason and condition.

**`tasks/lessons.md`** — append after corrections OR after the user confirms a non-obvious approach worked; never delete entries.

**Design docs** always live in `openspec/changes/<name>/design.md`.

---

## Pre-Change Checklist

After making changes, before suggesting a commit:

1. `pnpm typecheck` — fix all type errors across all three workspaces. If api typecheck fails with "Property X does not exist on PrismaService", run `pnpm --filter @app/api db:generate` first.
2. `pnpm lint` — fix all lint warnings / errors.
3. `pnpm test` — ensure no regressions. Run `pnpm --filter @app/api test:e2e` if controllers or routes changed (requires MySQL + Redis running locally).
4. `pnpm build` — when touching module wiring, path aliases, decorators, or build config. `nest build` / `vite build` catch path-alias resolution, decorator-metadata, and emit-stage errors that `tsc --noEmit` misses.
5. If swagger yaml changed: `pnpm --filter @app/api swagger:bundle` and `pnpm --filter @app/api-client generate` to keep frontend types in sync.

Once all checks pass, suggest a commit message (Traditional Chinese, conventional commits format). Do not execute `git commit`.

---

## Commands (top 5)

Package manager: **pnpm 11+**. Run from repo root.

```bash
pnpm install                                  # install all workspace deps
pnpm dev                                      # start apps/api + apps/web concurrently
pnpm typecheck && pnpm lint && pnpm test      # the pre-commit triad
pnpm --filter @app/api db:generate            # rerun this after any pnpm install before typecheck
pnpm --filter @app/api swagger:bundle && pnpm --filter @app/api-client generate   # after Swagger changes
```

**Full per-workspace command reference**: see `openspec/project.md` → "完整指令參考".

---

## Architecture & Conventions

See **`openspec/project.md`** for:

- Backend hexagonal layout (`adapter` / `application` / `domain` / `infrastructure`) and module naming.
- Frontend directory layout, path aliases, shadcn integration, form / API conventions.
- Swagger yaml inline-data convention (never `$ref: SuccessResponse`).
- Auth flow, token storage, CORS, environment variables.
- API client design (source-first, auto-unwrap of `{ success, data, timestamp }`).

Do not duplicate any of that here. When in doubt, read `openspec/project.md` first.
