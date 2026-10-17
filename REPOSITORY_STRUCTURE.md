# App-Dev-Debuggers — Exact Repository Structure and Naming

**Source of truth:** [`instructions.md`](instructions.md), **§6**. This file is a concise index. **The NaSCon Part I PDF controls all external API requirements.**

## Ownership
- **Ismail**: `backend/` foundation and stateful domain modules; `docker-compose.yml`, `.env.example`, `README.md`.
- **Sufiyan**: fixture, standings, JWT/RBAC/rate-limiting modules inside `backend/`; `tests/`, `run_tests.sh`, `COVERAGE.json`, `TRACEABILITY.md`, `ADR.md`.
- **Zaheen**: **all `mobile/`**, including React Native screens and final Xcode iOS Simulator build.

## Mandatory naming
- Exact repository name: `App-Dev-Debuggers`.
- Python filenames/functions: `snake_case`; classes/Pydantic schemas: `PascalCase`.
- React screens/components: `PascalCase.tsx`; other TypeScript utilities: `camelCase.ts`.
- API paths, status/error codes, JSON fields, IDs, numeric units and timestamps: **exactly as printed in the PDF**, no case conversion on the wire.
- Docker host API: **`:8080`**. Service names: `api`, `postgres`, `redis`, `rabbitmq`, `minio`, `worker`.
- Root files required: `docker-compose.yml`, `.env.example`, `README.md`, `TRACEABILITY.md`, `COVERAGE.json`, `run_tests.sh`, `tests/`, `mobile/`.
- Xcode Simulator **on Zaheen's Mac**, **not Expo Go**.

## Code ownership/route mapping
Refer to the complete tree and endpoint-to-file mapping in `instructions.md` §6.1 and §6.4; do not create alternative modules or duplicate routers. Directories can be created via `python3 scripts/bootstrap_structure.py` after the allowed sprint start. The script creates no working business logic.

## Integration rule
API grader calls `http://localhost:8080`. Mobile Simulator on Zaheen's Mac accesses the laptop running Docker at `http://<ISMAIL_LAN_IP>:8080`, with a user-changeable setting. Ismail registers all routers in `backend/app/api/router.py`.
