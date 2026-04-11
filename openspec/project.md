# Project: hexagonal-nest-express-mysql (Starter)

Backend REST API starter template based on NestJS + Express + Prisma (MariaDB), Hexagonal Architecture.

This project serves as the base starter pack aligned with atago-nest-api conventions.

---

## Purpose

Backend REST API (admin-only) covering:

- **Implemented**: authentication (login / logout / refresh / forgot-password / reset-password), member management, role & permission management, security management (IP whitelist / blacklist / account unlock), health check.
- **Planned**: extend as needed per project.

---

## Tech Stack

| Layer           | Choice                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| Runtime         | Node.js 20+                                                                     |
| Framework       | NestJS 11 + Express 5                                                           |
| Language        | TypeScript 5 (strict)                                                           |
| ORM             | Prisma 7 with `@prisma/adapter-mariadb`                                         |
| Database        | MySQL / MariaDB, timezone enforced to UTC at driver level                       |
| Validation      | Zod 4 (request DTOs) + `ParseUUIDPipe` (route params)                           |
| Auth            | JWT (`@nestjs/jwt`) + Redis-backed token blacklist + Redis member-context cache |
| Logging         | Pino + `pino-roll` (file rotation) + DB via `SaveSystemLogPort`                 |
| Rate limit      | `@nestjs/throttler`                                                             |
| Mail            | Nodemailer                                                                      |
| Files           | AWS S3 (`@aws-sdk/client-s3`, presigned URLs)                                   |
| Push            | Firebase Admin SDK                                                              |
| API Docs        | Swagger 3, split into per-endpoint yaml + bundled via `swagger-cli`             |
| Testing         | Jest 29 (unit + e2e via `supertest`)                                            |
| Package manager | npm                                                                             |

---

## Architecture — Hexagonal (Ports & Adapters)

```
src/
├── adapter/
│   ├── in/web/        # Controllers, DTOs (per-module subdirectory), guards, filters
│   └── out/           # Persistence (Prisma), redis, firebase, mail, s3 adapters
├── application/
│   ├── facade/        # Public API of application layer (one per domain area)
│   ├── port/
│   │   ├── in/{domain}/   # Use case interfaces (auth/ member/)
│   │   └── out/{domain}/  # Repository / service interfaces (auth/ member/ security/)
│   └── service/       # Use case implementations (auth/ member/ subdirectories)
├── domain/
│   ├── model/         # Domain entities
│   ├── value-object/  # Value objects
│   └── exception/     # Domain exceptions (plain Error subclasses)
├── infrastructure/
│   ├── prisma/        # PrismaModule, PrismaService
│   └── redis/         # Redis setup
└── modules/           # NestJS module wiring
```
