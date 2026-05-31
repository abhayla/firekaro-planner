---
description: Pinia store patterns for client-side state management
globs: ["src/stores/**/*.ts"]
---

# Pinia Store Conventions

## Setup Function Pattern

All stores MUST use Composition API (setup function) style — NOT Options API:

```typescript
export const useXStore = defineStore('storeName', () => {
  // State — ref() only, never reactive()
  const items = ref<Item[]>([])
  const isLoading = ref(false)

  // Computed — derived state
  const itemCount = computed(() => items.value.length)

  // Actions — async functions for side effects
  async function fetchItems() {
    isLoading.value = true
    try {
      const res = await fetch('/api/items')
      if (!res.ok) throw new Error('Failed to fetch items')
      items.value = await res.json()
    } finally {
      isLoading.value = false
    }
  }

  return { items, isLoading, itemCount, fetchItems }
})
```

## Store Responsibilities

Three stores with narrow, non-overlapping responsibilities:

### useUiStore — Client-side UI preferences

```typescript
export const useUiStore = defineStore('ui', () => {
  const sidebarOpen = ref(true)
  const darkMode = ref(false)
  const isFamilyView = ref(false)
  // Note: no member-id selector — family view is admin-only at the row level.
  // See rules/family-view-pattern.md for the schema rewrite (April 2026).

  // Initialize dark mode from localStorage with system preference fallback
  function initDarkMode() {
    const stored = localStorage.getItem('darkMode')
    if (stored !== null) {
      darkMode.value = stored === 'true'
    } else {
      darkMode.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    }
  }

  // Persist to localStorage on change
  watch(darkMode, (val) => localStorage.setItem('darkMode', String(val)))

  return { sidebarOpen, darkMode, isFamilyView, initDarkMode }
})
```

### useUserStore — Authentication and family members

Manages Better Auth session state, current user profile, family members list, and sign-out. API calls use raw `fetch()`:

```typescript
async function signOut() {
  await fetch('/api/auth/sign-out', { method: 'POST' })
  user.value = null
  router.push('/login')
}
```

### useNotificationsStore — Alerts, toasts, preferences

Manages notification CRUD, user alert preferences, toast display queue, and budget alert checking logic.

## State Declaration

Use `ref()` exclusively for all state declarations. NEVER use `reactive()` — the codebase standardizes on `ref()` for consistency and to avoid the well-known `reactive()` gotchas (destructuring loses reactivity, cannot reassign the whole object).

```typescript
// CORRECT
const user = ref<User | null>(null)
const settings = ref<Settings>({ theme: 'light', locale: 'en-IN' })

// WRONG — never use reactive()
const state = reactive({ user: null, settings: {} })
```

## Separation: Pinia vs Vue Query

| Concern | Tool | Example |
|---------|------|---------|
| Client-side UI state | Pinia | Sidebar toggle, dark mode, family view |
| Authentication session | Pinia | Current user, sign-out |
| Ephemeral UI state | Pinia | Toast queue, notification preferences |
| Server-fetched data | Vue Query | FIRE metrics, goals, loans, expenses |
| Server mutations | Vue Query | Create/update/delete any entity |

NEVER store server-fetched data in Pinia. NEVER use Vue Query for client-only state. This separation ensures cache invalidation, stale-while-revalidate, and background refetching work correctly via Vue Query without conflicting with Pinia's synchronous reactivity.

## API Calls in Stores

Stores that need server data use raw `fetch()` — same pattern as composables.
**CRITICAL:** every fetch consumer (composable OR store) MUST unwrap the response
envelope via `unwrapResponse` / `unwrapArrayResponse` from `@/utils/api-helpers`.
See `api-response-unwrapping.md`. Assigning `await res.json()` directly to state
sets the whole `{ success, data }` envelope on the ref and breaks every downstream
`.filter()` / `.map()` call.

```typescript
import { unwrapArrayResponse, unwrapResponse } from '@/utils/api-helpers'

// CORRECT — array endpoint
async function fetchAlerts() {
  const res = await fetch('/api/alerts')
  if (!res.ok) throw new Error('Failed to load alerts')
  alerts.value = unwrapArrayResponse<Alert>(await res.json())
}

// CORRECT — object endpoint
async function fetchPreferences() {
  const res = await fetch('/api/alerts/preferences')
  if (!res.ok) throw new Error('Failed to load preferences')
  preferences.value = unwrapResponse<AlertPreferences>(await res.json())
}

// WRONG — leaves state holding { success: true, data: [...] }
// alerts.value = await res.json()
```

For multi-domain server state with cache invalidation needs (loans, expenses,
investments, FIRE metrics, family membership, etc.), prefer a Vue Query
composable per `vue-query-patterns.md` over a Pinia store action.
