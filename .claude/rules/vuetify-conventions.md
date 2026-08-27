---
description: Vuetify 3 component usage patterns, theme conventions, and UI patterns
paths: ["src/**/*.vue", "src/plugins/vuetify.ts"]
---

# Vuetify Conventions

## Global Defaults (vuetify.ts)

These defaults are configured in `src/plugins/vuetify.ts` and apply globally. Do NOT override them inline unless intentionally deviating:

| Component | Defaults |
|---|---|
| VCard | `elevation: 0`, `rounded: 'xl'` |
| VBtn | `rounded: 'lg'`, `elevation: 0` |
| VTextField / VSelect | `variant: 'outlined'`, `density: 'comfortable'`, `rounded: 'lg'` |
| VAlert | `rounded: 'lg'`, `variant: 'tonal'` |
| VDialog | `rounded: 'xl'` |
| VNavigationDrawer / VAppBar | `elevation: 0` |

## Card Variants

Use the correct variant for each context:

| Variant | Use For |
|---|---|
| `outlined` | Default data display cards, metric cards, list containers |
| `tonal` | Alert boxes, informational callouts, status banners |
| `flat` | Primary action buttons inside cards |
| `text` | Secondary buttons, icon-only buttons |
| `elevated` | Form submit buttons only — nowhere else |

## Semantic Colors

MUST use Vuetify semantic color names consistently:

| Color | Meaning |
|---|---|
| `success` | Positive values, gains, income, growth, on-track status |
| `error` | Negative values, losses, expenses, decline, at-risk status |
| `primary` | Neutral emphasis, brand actions, navigation highlights |
| `warning` | Caution indicators, TDS deductions, approaching limits |
| `info` | Informational text, help tooltips, secondary context |

Custom theme colors: `fire-orange`, `fire-green`, `fire-blue`, `fire-gold` — used for FIRE-specific branding elements.

## Trend Indicators

Display financial trends with consistent icon + color pairing:

```vue
<v-icon :icon="trend > 0 ? 'mdi-trending-up' : trend < 0 ? 'mdi-trending-down' : 'mdi-trending-neutral'"
        :color="trend > 0 ? 'success' : trend < 0 ? 'error' : 'grey'" size="small" />
<span :class="trend > 0 ? 'text-success' : trend < 0 ? 'text-error' : ''">
  {{ trend > 0 ? '+' : '' }}{{ formatINRCompact(trend) }}
</span>
```

Always prefix positive values with `+`.

## Deletion Confirmation

Two-step deletion pattern — NEVER delete on single click:

1. Set `deletingItem` ref to the target item
2. Show confirmation dialog with `max-width="400"`
3. Display "This action cannot be undone" warning
4. Confirm button triggers mutation, then closes dialog

```vue
<v-dialog v-model="showDeleteDialog" max-width="400">
  <v-card>
    <v-card-title>Delete {{ deletingItem?.name }}?</v-card-title>
    <v-card-text>This action cannot be undone.</v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn variant="outlined" @click="showDeleteDialog = false">Cancel</v-btn>
      <v-btn color="error" variant="flat" @click="confirmDelete">Delete</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

## Domain Config Records

Map enum values to display properties using typed record objects:

```ts
const goalCategoryConfig: Record<GoalCategory, { icon: string; color: string; label: string }> = {
  retirement: { icon: 'mdi-beach', color: 'fire-orange', label: 'Retirement' },
  education: { icon: 'mdi-school', color: 'info', label: 'Education' },
  housing: { icon: 'mdi-home', color: 'primary', label: 'Housing' },
}
```

Similar patterns: `getInsuranceTypeIcon()`, `getLoanTypeLabel()`, status-to-color functions returning Vuetify color names.

## Icons

- Material Design Icons (`mdi-*`) exclusively via `@mdi/font`
- Always use prop syntax: `<v-icon :icon="'mdi-piggy-bank'" />`
- NEVER use slot content for icon names

## v-chip

```vue
<!-- Status chip -->
<v-chip size="small" variant="tonal" :color="statusColor">{{ status }}</v-chip>
<!-- Interactive chip -->
<v-chip size="small" variant="outlined" @click="filter">{{ label }}</v-chip>
<!-- Removable chip -->
<v-chip size="small" closable @click:close="remove">{{ tag }}</v-chip>
```

## v-data-table

```vue
<v-data-table
  :headers="headers"
  :items="filteredItems"
  density="comfortable"
  hover
>
  <template #item.amount="{ value }">
    <span class="text-currency">{{ formatINR(value) }}</span>
  </template>
  <template #bottom>
    <div class="pa-2 text-caption">{{ items.length }} records</div>
  </template>
</v-data-table>
```

Headers type: `{ title: string; key: string; align?: string; sortable?: boolean }[]`

## v-dialog

| Context | max-width |
|---|---|
| Forms (add/edit) | `600` |
| Confirmations (delete) | `400` |

Body height (mandatory): every `<v-card-text>` inside a `<v-dialog>`
MUST carry `style="max-height: 70vh; overflow-y: auto"` (or an
equivalent constrained class) so the action buttons stay pinned
within the viewport on 1366×768 laptops and below. Without this,
the action row gets pushed below the fold once the form's content
exceeds ~600 px. See gh-issue #113 and the locking regression spec
at `src/regression/dialog-actions-in-viewport.spec.ts`.

Structure: `v-card > v-card-title + v-divider + v-card-text + v-divider + v-card-actions`

Actions layout: `v-spacer` → Cancel (`variant="outlined"`) → Submit (`color="primary" variant="flat"`)

NOTE: `variant="text"` is forbidden on Cancel / Close / Discard
buttons because it produces a button with no visible affordance
(transparent background, no border, no shadow) that reads as plain
copy rather than an interactive control. See gh-issue #112 and the
locking spec at `src/regression/cancel-button-affordance.spec.ts`.

Add `persistent` prop on form dialogs to prevent accidental close.

## Responsive Grid

```vue
<!-- 4 metrics row -->
<v-col cols="12" sm="6" md="3">
<!-- 2 column layout -->
<v-col cols="12" md="6">
<!-- Asymmetric layout -->
<v-col cols="12" lg="5"> <!-- sidebar -->
<v-col cols="12" lg="7"> <!-- main content -->
```

## CSS Variables

Use Vuetify CSS variables for theme-aware styling:

```css
background: rgba(var(--v-theme-primary), 0.08);
color: rgb(var(--v-theme-on-surface));
border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
```

## Deep Selectors and Scoped Styles

- Always use `<style scoped>` on component styles
- Use `:deep(.v-data-table__td)` sparingly for Vuetify internal overrides
- Exception: unscoped `@media print` blocks for hiding nav/controls during print
