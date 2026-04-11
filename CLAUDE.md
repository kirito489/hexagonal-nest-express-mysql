# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Session Start Checklist

At the start of every new session:

1. Ensure `tasks/lessons.md` and `tasks/todo.md` exist. If missing, create each with a one-line title `# Lessons Learned` / `# TODO` plus a short subtitle.
2. Read `tasks/lessons.md` — known pitfalls from past corrections.
3. Read `tasks/todo.md` — pending cross-change items and deferred features.
4. Read `openspec/project.md` — project context and conventions.
5. If working on a feature: check `openspec/changes/` for active (non-archived) changes and read their `tasks.md`.

---

## Critical Rules

- **Never execute `git commit` or `git push`** unless explicitly asked. Provide the commands for the user to run manually.
- **Do not over-engineer**: implement exactly what is asked — no extra endpoints, migration scripts, debug APIs, or entity files. When in doubt, do less.
- **Output data directly**: when asked for data or JSON, print it to stdout. Do not provide placeholder values, setup instructions, or scripts unless explicitly requested.
- **Verify schema before modifying queries**: always check `prisma/schema.prisma` before assuming a field exists on a model.
- **Reuse before creating**: search `src/` for existing facades / ports / adapters / helpers before writing a new one.

---

## AI Development Workflow

Three systems work together as one pipeline:

| Layer       | Tool                                 | Purpose                                                       |
| ----------- | ------------------------------------ | ------------------------------------------------------------- |
| **Memory**  | `tasks/todo.md` + `tasks/lessons.md` | Cross-session deferred items and lessons                      |
| **Spec**    | `openspec/changes/<name>/`           | Proposal, design, specs, tasks per change                     |
| **Process** | openspec + select superpowers skills | Change management + TDD / verification / debugging discipline |

### Phase 1 — Explore & Design (new feature)

- Gather design context from available sources — design files via MCP (Pencil, Figma, etc.), PNG / screenshot assets in `openspec/assets/`, or referenced docs.
- Invoke `openspec-explore` — clarify requirements as a thinking partner.
- Write approved design → `openspec/changes/<name>/design.md`.

### Phase 2 — Specify

- Invoke `openspec-propose` → generates `proposal.md`, `specs/`, `tasks.md` in the change folder.
- API changes must define request body and response schema in the change's `specs/` folder before any controller code is written.
- `tasks.md` phases must follow this order: Schema/Migration → Domain/Port → Exceptions/Filter → Services (TDD) → Out Adapter → Controller/DTO → Facade + Module → Swagger → Unit Tests → E2E Tests → Verification → Wrap-up.
- User reviews and approves before any code is written.

### Phase 3 — Implement

- Invoke `openspec-apply` to work through `openspec/changes/<name>/tasks.md` task by task.
- For service / use case implementation, invoke `superpowers:test-driven-development` — write spec first, then implementation.
- Before marking a task done, invoke `superpowers:verification-before-completion` — never claim "done" without running the verification command.
- Run Pre-Change Checklist before suggesting a commit.
- Create `smoke-test.md` in the change folder with curl commands for manual verification of each endpoint.

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

## Communication Style

- Default to **Traditional Chinese (繁體中文)** unless the user switches to English.
- When the user says "不用" or interrupts, stop immediately and keep responses brief.
- Before making changes, outline the plan (which files, what changes) and wait for confirmation.
- Use headers / sections when the answer has multiple parts.
- **Bilingual responses** (when asked, or for domain / UI-facing terms): **Japanese first, Traditional Chinese second** — same ordering as in code comments. Format: `Japanese / Traditional Chinese`.

---

## Code Style

- Every non-trivial function must include a TSDoc comment (always bilingual, never single-language):
  ```typescript
  /**
   * ID でユーザーを取得 / 依 ID 查詢使用者
   * @param id - ユーザー ID / 使用者 ID
   * @returns ユーザー記録または null / 使用者記錄或 null
   */
  ```
- **Comment language**: This is a product for a Japanese company. Comments use a bilingual "Japanese / Traditional Chinese" format — **Japanese always goes first** (product's primary language).
  - Principle: add comments **only where necessary, in moderation** (the _why_, non-obvious logic, domain terms) — not too verbose, not too sparse.
  - Inline format: `// Japanese / Traditional Chinese` (e.g. `// カレンダー / 行事曆`).
  - Even when the Japanese and Traditional Chinese text look identical (e.g. 「案件管理」「在庫管理」), keep both sides for stylistic consistency.
  - Domain / UI-facing strings (e.g. the `name` field on `PermissionCode` rows, UI text) use Japanese only.
- Prefer arrow functions over `function` declarations unless a named function is strictly required (hoisting, recursion).

---

## Pre-Change Checklist

After making changes, before suggesting a commit:

1. `npx tsc --noEmit` — fix all type errors
2. `npm run lint` — fix all lint warnings/errors
3. `npm run test` — ensure no regressions (run `npm run test:e2e` if controllers/routes changed)

Once all checks pass, suggest a commit message (Traditional Chinese, conventional commits format). Do not execute `git commit`.

---

## Commands

```bash
# Development
npm run dev          # watch mode
npm run start        # start app
npm run build        # production bundle

# Testing
npm run test         # unit tests (*.spec.ts)
npm run test:watch   # watch mode
npm run test:cov     # with coverage
npm run test:e2e     # e2e tests (test/*.e2e-spec.ts)
npx jest src/path/to/file.spec.ts   # single file

# Code Quality
npm run lint         # ESLint
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier

# Database
npm run db:migrate   # prisma migrate dev
npm run db:generate  # regenerate Prisma client
npm run db:studio    # open Prisma Studio
npm run db:seed      # run seed scripts
npm run db:create    # create database
npm run db:drop      # drop database

# Swagger
npm run swagger:bundle   # bundle openapi.yaml → openapi.bundle.yaml
```

Migrations are managed via Prisma. Schema lives in `prisma/schema.prisma`.

---

## Architecture

> Full stack, models, and infrastructure details are in `openspec/project.md`.

**Module naming**: Controller + DTOs → `adapter/in/web/<module>/`; Prisma repositories → `adapter/out/persistence/<module>/`; services → `application/service/<module>/`. Shared infrastructure (guards, filters, decorators) stays in its own top-level directory.

**Dependency flow**: `adapter/in` → `application` → `port/out` ← `adapter/out`. The `application` and `domain` layers never import from `adapter`.

**Facade convention**: each domain area exposes a `*Facade` as its public API for controllers (e.g. `AuthFacade`, `MemberFacade`).

**Exception mapping**: domain exceptions are plain `Error` subclasses. HTTP status mapping happens in `src/adapter/in/web/filter/GlobalExceptionFilter.ts` — add a new `instanceof` branch when introducing a new domain exception.
