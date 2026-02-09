# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a multi-agent development project that uses specialized agent skills for different aspects of software development. The project is in early stages — `src/` is empty and `package.json` is uninitialized.

## Architecture

### Agent Skills System (`.agents/skills/`)

The project defines four specialized agent skills, each with a `SKILL.md` describing its role:

- **spec-writer** — Translates natural-language requests into structured specs (TITLE, GOAL, SCOPE, REQUIREMENTS, EDGE CASES, ACCEPTANCE CRITERIA, HANDOFF). Produces no code; makes reasonable assumptions instead of asking questions. Outputs hand off notes targeting the other three skills.
- **frontend-design** — Builds distinctive, production-grade frontend interfaces. Prioritizes bold aesthetic direction over generic "AI slop." Uses creative typography, color, motion, and spatial composition. Avoids default/common font choices (Inter, Roboto, Arial, Space Grotesk).
- **senior-backend** — Backend development with Node.js, Express, Go, Python, Postgres, GraphQL, REST. Includes Python utility scripts in `scripts/`: `api_scaffolder.py`, `database_migration_tool.py`, `api_load_tester.py`. Reference docs in `references/` cover API design patterns, database optimization, and backend security.
- **security-review** — Security review checklist activated when handling auth, user input, secrets, API endpoints, payments, or sensitive data. Covers OWASP top 10, Supabase RLS, Solana wallet verification, and cloud/infrastructure security.

### Workflow

The intended workflow follows: **spec-writer** produces a spec → **senior-backend** and **frontend-design** implement it → **security-review** audits the result. The spec-writer HANDOFF section contains targeted notes for each implementing skill.

## Commands

```bash
# Backend utility scripts
python .agents/skills/senior-backend/scripts/api_scaffolder.py <project-path> [options]
python .agents/skills/senior-backend/scripts/database_migration_tool.py <target-path> [--verbose]
python .agents/skills/senior-backend/scripts/api_load_tester.py [arguments] [options]
```

## Key Constraints

- Frontend skill must never use generic fonts (Inter, Roboto, Arial) or common AI aesthetic patterns (purple gradients on white). Every design should be unique and contextually appropriate.
- Spec-writer must never produce code — only structured specs with assumptions stated.
- Security review should be triggered whenever code touches authentication, user input, secrets, API endpoints, file uploads, payments, or blockchain transactions.

## Mandatory Execution Flow (Critical)

This workflow is NOT optional.

For every feature or request, agents MUST execute in the following order:

1. spec-writer defines the specification.
2. senior-backend implements the functionality.
3. frontend-design refines the interface and UX.
4. security-review performs the final audit.

A task is considered COMPLETE only if security-review responds with:

APPROVED

If the response is:

REJECTED

Then the implementation MUST return to senior-backend for fixes, and the review must run again.

This loop continues until APPROVED.

No agent may end, summarize, or present final results before approval.
