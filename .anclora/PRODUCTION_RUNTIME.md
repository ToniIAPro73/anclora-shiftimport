# Anclora ShiftImport — Production Runtime Manifest

PRODUCTION_RUNTIME_MANIFEST_VERSION=2.0
RUNTIME_CONTRACT_AUTHORITY=CANONICAL
STATUS=PRODUCTION_RUNTIME_CONFIRMED
LOCAL_RUNTIME_MODEL=PRODUCTION_BACKED
DO_NOT_CREATE_DEVELOPMENT_DATABASE=true

Runtime, environment, database, migration, QA and Git rules declared in this
manifest override generic agent defaults or home-directory agent policies.

## 1. Application Identity

APPLICATION_NAME=Anclora ShiftImport
REPOSITORY=anclora-shiftimport
APPLICATION_TYPE=fullstack
FRAMEWORK=Vite + React 18 + Tailwind CSS + Vercel Functions (/api/*) + TypeScript

## 2. Runtime Topology

FRONTEND_PROVIDER=Vercel
BACKEND_PROVIDER=Vercel Serverless Functions (/api/*)
PRODUCTION_DOMAIN=shiftimport.anclora.com
PRODUCTION_DEPLOYMENT_PROVIDER=Vercel

```text
Browser
   ↓
Vercel Frontend (Vite Single Page Application)
   ↓
Vercel Serverless Functions (/api/*)
   ├── Neon Production Database (neondb)
   └── Resend API (Transactional Email)
```

## 3. Production Database Contract

DATABASE_PROVIDER=Neon Serverless PostgreSQL
DATABASE_PROJECT=holy-cake-85660318
DATABASE_PROJECT_ID=holy-cake-85660318
DATABASE_BRANCH=main
DATABASE_NAME=neondb
DATABASE_REGION=eu-central-1 (AWS c-5.eu-central-1.aws.neon.tech)
DATABASE_ENDPOINT=ep-lingering-dew-b1atfd0w-pooler.c-5.eu-central-1.aws.neon.tech
DATABASE_ENDPOINT_UNPOOLED=ep-lingering-dew-b1atfd0w.c-5.eu-central-1.aws.neon.tech
DATABASE_RUNTIME_SCOPE=production
LOCAL_DATABASE_SCOPE=production

Local development intentionally connects to the Production database.

This is the Anclora operating model.

Do not create or switch to a Development, Preview, Staging, ephemeral,
local or alternate database unless Toni explicitly requests it.

## 4. Database Migration Contract

DATABASE_SCOPE=production
LOCAL_DATABASE_SCOPE=production

MIGRATION_SYSTEM=Custom forward-only SQL runner (db/migrate.mjs tracking _migrations)
MIGRATION_STRATEGY=CUSTOM_FORWARD_ONLY
MIGRATION_DIRECTORY=./db/migrations
MIGRATION_RUNNER=npm run db:migrate (node --env-file=.env.local db/migrate.mjs)
MIGRATION_STATUS_CHECK=npm run db:migrate:status (node --env-file=.env.local db/migrate.mjs --status)

SCHEMA_CHANGES_ALLOWED=true
PRODUCTION_MIGRATIONS_ALLOWED=true
MIGRATION_CONFIRMATION_REQUIRED=false

DATA_MIGRATIONS_ALLOWED=true
BACKFILLS_ALLOWED=true
INDEX_CHANGES_ALLOWED=true
CONSTRAINT_CHANGES_ALLOWED=true
RLS_POLICY_CHANGES_ALLOWED=true

BACKWARD_COMPATIBILITY_PREFERRED=true

DESTRUCTIVE_CHANGES_ALLOWED_WHEN_REQUIRED_BY_IMPLEMENTATION=true

RANDOM_DATABASE_RESET_ALLOWED=false
UNRELATED_PRODUCTION_DATA_DELETION_ALLOWED=false

When an implementation requires schema modifications (such as CREATE TABLE,
ALTER TABLE, ADD/DROP COLUMN, INDEX, FOREIGN KEY, CONSTRAINT, ENUM, VIEW,
FUNCTION, TRIGGER, POLICY, RLS, BACKFILL, or DATA TRANSFORMATION), the agent
is authorized to create the migration, validate it, check Production, apply
it to Production, and continue with QA/E2E without requesting additional
confirmation.

Production database migrations should remain backward-compatible with the
currently deployed application whenever technically reasonable, because the
database migration may be applied before the validated development commit is
promoted to the Production application branch. Prefer expand -> migrate -> contract
patterns when appropriate.

## 5. Storage Contract

VERCEL_BLOB_REQUIRED=false

ShiftImport does not use Vercel Blob stores. The application operates with
local-first in-browser storage (IndexedDB/localStorage) for spreadsheet ingestion
and editing, alongside Neon PostgreSQL serverless persistence for organizational
data, members, and temporal shift models. Standard browser window.Blob() APIs
used for client-side CSV/file export must not be confused with Vercel Blob infrastructure.

## 6. Authentication Contract

AUTH_MODEL=Cookie session-based authentication with cryptographic hashing (session_token HttpOnly)
SESSION_STORAGE=PostgreSQL sessions table (Neon Production)
USER_STORAGE=PostgreSQL users table (Neon Production)
OAUTH_PROVIDERS=Google OAuth, GitHub OAuth integration seams (/api/auth/oauth/*)
PASSWORD_MODEL=scrypt key derivation function (Node.js crypto scryptSync) with salt

## 7. Email Contract

EMAIL_PROVIDER=Resend
EMAIL_ENV_CONTRACT=RESEND_API_KEY
EMAIL_FROM_CONTRACT=Anclora Shiftimport <antonio@anclora.com> (AUTH_EMAIL_FROM)
EMAIL_USAGE=Transactional email delivery (access invitations, password reset links)

## 8. External Integrations

ACTIVE:
- Resend API (Transactional email delivery via RESEND_API_KEY)
- Google OAuth / GitHub OAuth (Authentication integration seams active in Production Vercel via GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_CALLBACK_URL, GITHUB_OAUTH_CLIENT_ID, GITHUB_OAUTH_CLIENT_SECRET, GITHUB_OAUTH_CALLBACK_URL)

OPTIONAL:
- VLM Fallback (Server-side vision language model for degraded PDF/image ingestion; uses fake behavior or optional external provider via VLM_PROVIDER, VLM_API_KEY, VLM_API_URL)
- Remote Shift Synchronization (Feature-flagged; local-first by default unless VITE_ENABLE_REMOTE_STORAGE=true)
- Local OAuth Testing (Social login credentials are optional in local development; application falls back cleanly to local password session authentication)

DISABLED:
- None

## 9. Local Environment Contract

Environment files:
- `.env.local` (located in repository root, mode 0600, strictly gitignored)
- `.env.development.local` (located in repository root, mode 0600, strictly gitignored)

Effective Vite Precedence:
```text
.env
  < .env.local
  < .env.development
  < .env.development.local
```

LOCAL_RUNTIME_MODEL=PRODUCTION_BACKED

Production resource variables must resolve to Production resources even when
the application itself is running locally.

### Separation of Variables:
- PRODUCTION_RESOURCE_VARIABLES:
  - `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `PGHOST`, `POSTGRES_URL` → Production Neon PostgreSQL
  - `RESEND_API_KEY` → Production Resend API
  - `AUTH_EMAIL_FROM` → Production verified sender address
  - `AUTH_APP_URL` → Production application base URL
  - `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GITHUB_OAUTH_CLIENT_ID`, `GITHUB_OAUTH_CLIENT_SECRET` → Production OAuth apps
- LOCAL_ONLY_RUNTIME_VARIABLES:
  - `SEED_ALLOW_ENV="development"` → Local execution guard for db/seed-dev.mjs

### Critical Clarification on SEED_ALLOW_ENV:
SEED_ALLOW_ENV="development" only satisfies the application's local execution
guard. It DOES NOT mean that a Development database is being used. The local
database connection remains the Production database. Any seed operation executed
with this environment therefore writes to Production unless the seed command
explicitly uses another connection. Agents must treat local seeding as a Production
database write operation.

## 10. Local Runtime Exceptions

VARIABLE=AUTH_APP_URL
CANONICAL_VALUE=https://shiftimport.anclora.com
TEMPORARY_LOCAL_VALUE=http://localhost:5173
WHEN_ALLOWED=Only when a specific local callback, invitation acceptance, or password reset redirection test technically requires the local origin.
RESTORE_REQUIRED=true

## QA Contract

QA_POLICY=WORKSPACE_PROPORTIONAL
QA_MODE_DEFAULT=AUTO
FAST_TARGETED_TESTING_POLICY=MINIMUM_SUFFICIENT_SET
FAST_FULL_TEST_SUITE_ALLOWED=false
STOP_WHEN_SUFFICIENT_EVIDENCE=true
TEST_EXECUTION_POLICY=BATCHED
FULL_GATES_AFTER_EVERY_EDIT=false
REPEAT_UNCHANGED_SUCCESSFUL_GATES=false
VISUAL_QA_EXECUTION=BY_QA_MODE

TOKEN_ECONOMY_POLICY=ADAPTIVE
CAVEMAN_MODE_DEFAULT=AUTO
CAVEMAN_GRANULARITY=TASK
QA_MINIMUM_FOR_DATABASE_MIGRATION=FULL
QA_MINIMUM_FOR_AUTH=FULL
QA_MINIMUM_FOR_RELEASE_PROMOTION=FULL


QA_AUTH_MODEL=DEDICATED_USER
QA_IS_DEDICATED=true
QA_IS_REAL_USER=false
REAL_USER_AS_QA_ALLOWED=false
QA_SCOPE=production
QA_REUSE=true
QA_CREATE_IF_MISSING=true
QA_DELETE_AFTER_TEST=false
QA_CREATION_CONFIRMATION_REQUIRED=false
QA_PERSISTENT_IDENTITY=qa.shiftimport@anclora.test

For dedicated human QA: Use designated production test identity. Never use Toni's personal account or operational admins as QA accounts. Never delete test account after testing.

## 12. Git Workflow Contract

WORK_BRANCH=development
CREATE_FEATURE_BRANCH=false
AUTO_COMMIT_AFTER_VALIDATION=true
AUTO_PUSH_DEVELOPMENT=true
AUTO_PROMOTE=false
STOP_AFTER_DEVELOPMENT_PUSH=true

```text
development local
   ↓
implementation
   ↓
migration if needed
   ↓
verification according to canonical QA mode
   ↓
commit
   ↓
push origin/development
   ↓
STOP
```

Agents must NOT create feature/fix/task/agent branches unless Toni explicitly
requests one for the current mission.

Promotion to staging / production / main requires explicit Toni approval.
When promotion is requested, preserve the validated development commit SHA
whenever branch topology allows fast-forward promotion.

## 13. Agent Startup Contract

Before executing tasks, the agent must read and apply in order:
1. Current explicit instructions from Toni
2. Workspace agent policy (`../../ANCLORA_WORKSPACE_AGENT_POLICY.md` when installed, `../../AGENTS.md` interim)
3. Repository agent rules (`../AGENTS.md`)
4. `.anclora/AGENT_PROJECT_CONTEXT.md` (bootstrap, task routing, and authority map)
5. `.anclora/PRODUCTION_RUNTIME.md` (this manifest as operative runtime contract)
6. `.anclora/AOS_ADOPTION.md` (governance, decisions, exceptions)
7. Repository-specific instructions (`CLAUDE.md`, `GEMINI.md`, etc., when present)

## 14. Forbidden Defaults

- Do not create Development DB by default.
- Do not create Preview DB by default.
- Do not create temporary feature branches.
- Do not replace Production env with Development env.
- Do not delete persistent QA user after testing.
- Do not automatically promote after development push.
- Do not reset Production DB merely to simplify testing.
- Do not delete unrelated Production data.
- Do not expose secrets.

## 15. Machine-Readable Contract

```text
PRODUCTION_RUNTIME_MANIFEST_VERSION=2.0
RUNTIME_CONTRACT_AUTHORITY=CANONICAL

STATUS=PRODUCTION_RUNTIME_CONFIRMED
LOCAL_RUNTIME_MODEL=PRODUCTION_BACKED

DATABASE_SCOPE=production
LOCAL_DATABASE_SCOPE=production
DO_NOT_CREATE_DEVELOPMENT_DATABASE=true

Runtime, environment, database, migration, QA and Git rules declared in this
manifest override generic agent defaults or home-directory agent policies.

MIGRATION_SYSTEM=Custom forward-only SQL runner (db/migrate.mjs tracking _migrations)
MIGRATION_STRATEGY=CUSTOM_FORWARD_ONLY
PRODUCTION_MIGRATIONS_ALLOWED=true
MIGRATION_CONFIRMATION_REQUIRED=false
BACKWARD_COMPATIBILITY_PREFERRED=true

QA_MODEL=PERSISTENT_PRODUCTION_USER
QA_REUSE=true
QA_CREATE_IF_MISSING=true
QA_DELETE_AFTER_TEST=false

WORK_BRANCH=development
CREATE_FEATURE_BRANCH=false
AUTO_COMMIT_AFTER_VALIDATION=true
AUTO_PUSH_DEVELOPMENT=true
AUTO_PROMOTE=false
STOP_AFTER_DEVELOPMENT_PUSH=true
```
