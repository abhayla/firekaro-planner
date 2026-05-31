---
description: Standard documentation template for dashboard section plan docs in docs/
globs: ["docs/*-Section-*.md", "docs/*-Implementation*.md"]
---

# Section Plan Document Template

All dashboard section plan documents in `docs/` MUST follow this standardized structure.
The Salary section plan (`docs/Salary-Section-Plan.md`) is the canonical reference implementation.

## Required Sections (in order)

### 1. Header Block

Every section plan MUST begin with:
- **Title**: `# {Section} Section — Dashboard Plan`
- **Status badge**: One of `🟢 Complete`, `🟡 In Progress`, `🔴 Planned`
- **Created / Updated dates**: ISO format (YYYY-MM-DD)
- **Related docs**: Links to CLAUDE.md, STYLING-GUIDE.md, TEST-PLAN.md, and adjacent section plans

### 2. Executive Summary

A single paragraph (3-5 sentences) explaining what this section covers, its primary user value,
and how it fits into the overall FIREKaro dashboard. MUST NOT exceed one paragraph.

### 3. URL Structure / Route Table

A markdown table mapping routes to pages:

| Route | Page Component | Description |
|-------|---------------|-------------|
| `/dashboard/{section}` | `{Section}Page.vue` | Main section view with Overview + Details tabs |

### 4. Page Details

Per-page breakdown documenting the two-tab pattern:
- **Overview Tab**: Summary cards, charts, key metrics at a glance
- **Details Tab**: Data tables, CRUD forms, granular records

Every section page MUST implement both tabs. The Salary section plan is the canonical
reference for this two-tab (Overview + Details) pattern.

### 5. Frontend Implementation

Two tables are REQUIRED:

**Components Table:**
| Component | Path | Purpose |
|-----------|------|---------|
| `{Section}OverviewTab.vue` | `src/components/{section}/` | Summary view with cards and charts |
| `{Section}DetailsTab.vue` | `src/components/{section}/` | Data table and record management |
| `{Section}Form.vue` | `src/components/{section}/` | Add/edit form dialog |

**Composables Table:**
| Composable | Path | Exports |
|------------|------|---------|
| `use{Section}.ts` | `src/composables/` | Queries, mutations, computed summaries |

### 6. API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/{section}` | List all records for current user |
| GET | `/api/{section}/:id` | Get single record |
| POST | `/api/{section}` | Create new record |
| PUT | `/api/{section}/:id` | Update existing record |
| DELETE | `/api/{section}/:id` | Delete record |
| GET | `/api/{section}/overview` | Aggregated summary for overview tab |

### 7. Database Models

Include the Prisma model excerpt with key fields. MUST show:
- `id`, `createdAt`, `updatedAt`, `userId` fields
- All domain-specific fields with types and defaults
- `@@index([userId])` directive
- Relations and cascade rules

### 8. E2E Tests

| Test File | Tests | Description |
|-----------|-------|-------------|
| `00-data-setup.spec.ts` | N | Seed test data via API |
| `01-navigation.spec.ts` | N | Tab switching, breadcrumbs, sidebar |
| `02-overview.spec.ts` | N | Overview tab cards and charts |
| `03-details-crud.spec.ts` | N | Create, read, update, delete records |
| `10-formula-verification.spec.ts` | N | Calculation accuracy checks |
| `25-cross-page-consistency.spec.ts` | N | Data matches across sections |

### 9. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tab pattern | Overview + Details | Consistent UX across all sections per STYLING-GUIDE.md |
| Form validation | VeeValidate + Zod | Type-safe validation shared with backend |
| Money fields | `Float @default(0)` | Prisma convention for currency values in INR |

### 10. Files Summary

Three tables listing files by change type:

**Created:** paths of new files added by this section
**Modified:** paths of existing files changed (e.g., router, layout, CLAUDE.md)
**Deleted:** paths of files removed (usually empty for new sections)

### 11. Related Documentation

MUST include links to:
- `CLAUDE.md` — project conventions and architecture
- `STYLING-GUIDE.md` — Vuetify component patterns and theme
- Adjacent section plans (previous and next in dashboard order)
- `TEST-PLAN.md` — companion test strategy for this section
- `POST-IMPLEMENTATION.md` — merge and deployment instructions

### 12. Changelog

Version history at the bottom of the document:
```
## Changelog
- v1.0 (YYYY-MM-DD): Initial section plan
- v1.1 (YYYY-MM-DD): Added E2E test details
```

## Cross-Reference Requirements

- Every section plan MUST link to CLAUDE.md, STYLING-GUIDE.md, and adjacent section plans
- Every section plan MUST have a matching test plan entry in TEST-PLAN.md
- POST-IMPLEMENTATION.md MUST be referenced for merge/deploy instructions
- Section plans MUST be kept in sync with actual implementation — update status badges when work completes
