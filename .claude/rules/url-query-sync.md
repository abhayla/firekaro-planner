---
description: URL query parameter synchronization for tabs and financial year selection
paths: ["src/pages/**/*.vue"]
---

# URL Query Parameter Sync

## Core Pattern

Synchronize component state with URL query parameters using a computed getter/setter:

```ts
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

const activeTab = computed({
  get: () => (route.query.tab as string) || 'overview',
  set: (val: string) =>
    router.push({
      query: {
        ...route.query,
        tab: val === 'overview' ? undefined : val,
      },
    }),
})
```

## Rules

### Default Values Remove the Parameter

When the value equals the default, set the query param to `undefined` to remove it from the URL. This keeps URLs clean:

- `/fire-goals` instead of `/fire-goals?tab=overview`
- `/income/salary` instead of `/income/salary?fy=2025-26`

### Preserve Other Query Parameters

Always spread `...route.query` when updating, so other active query params are not lost.

### Type Cast Query Values

Vue Router query values are `string | (string | null)[]`. Always cast with `as string` and provide a fallback:

```ts
const fy = computed({
  get: () => (route.query.fy as string) || currentFinancialYear(),
  set: (val: string) =>
    router.push({
      query: {
        ...route.query,
        fy: val === currentFinancialYear() ? undefined : val,
      },
    }),
})
```

## Standard Query Parameters

| Parameter | Used In | Default | Example |
|---|---|---|---|
| `tab` | All section pages | `'overview'` | `?tab=planning`, `?tab=details`, `?tab=reports` |
| `fy` | Income, investments, tax pages | Current FY | `?fy=2024-25`, `?fy=2010-11` |

## What This Enables

- **Deep-linking**: Share `/fire-goals?tab=planning` and the recipient lands on the Planning tab
- **Browser navigation**: Back/forward buttons move between tabs naturally
- **Bookmark support**: Users can bookmark specific views
- **State persistence**: Refreshing the page preserves the active tab and FY selection

## Binding to Vuetify Tabs

```vue
<v-tabs v-model="activeTab">
  <v-tab value="overview">Overview</v-tab>
  <v-tab value="details">Details</v-tab>
  <v-tab value="reports">Reports</v-tab>
</v-tabs>

<v-tabs-window v-model="activeTab">
  <v-tabs-window-item value="overview">
    <SectionOverviewTab />
  </v-tabs-window-item>
  <v-tabs-window-item value="details">
    <SectionDetailsTab />
  </v-tabs-window-item>
</v-tabs-window>
```

The `v-model` on `v-tabs` directly binds to the URL-synced computed, so tab clicks update the URL and URL changes update the active tab.
