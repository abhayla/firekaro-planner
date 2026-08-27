---
description: Centralized chart theming via @/utils/chartTheme for all Chart.js and custom SVG charts
paths: ["src/components/**/*.vue", "src/utils/chartTheme.ts"]
---

# Chart Theme System

## Centralized Theme — No Inline Configuration

ALL charts MUST import colors, options, and helpers from `@/utils/chartTheme`. NEVER configure Chart.js colors or options inline in components.

```ts
import {
  chartColors,
  lineChartOptions,
  barChartOptions,
  doughnutChartOptions,
  createDataset,
  createGradientFill,
  getFireProgressColor,
} from '@/utils/chartTheme'
```

## Color Palette

The `chartColors` object provides all color constants:

- **`primary[]`** — sequential palette for multi-series charts
- **`assetClasses{}`** — `equity: '#1976d2'`, `debt: '#7cb342'`, `gold: '#ffc107'`, `retirement: '#00acc1'`
- **`fireProgress{}`** — milestone-based colors for FIRE journey charts
- **`incomeExpense{}`** — income (green tones) vs expense (red tones)
- **`sentiment{}`** — positive/negative/neutral indicator colors
- **`gradients{}`** — start/end pairs for gradient fills
- **`confidenceBands{}`** — semi-transparent fills for projection ranges

## Pre-Built Options

Use the pre-built option objects as base configurations:

- `lineChartOptions` — responsive, aspect ratio, grid styling, tooltip config
- `barChartOptions` — stacked/grouped defaults, bar thickness
- `doughnutChartOptions` — cutout percentage, legend positioning

## Fonts

- **Labels and titles**: Inter font family
- **Numeric data** (axes, tooltips, data labels): JetBrains Mono for tabular alignment

## Tooltip Styling

All tooltips use a consistent dark theme:
- Background: slate-900 (`#1e293b`)
- Rounded corners (`borderRadius: 8`)
- Point-style colored boxes matching dataset colors
- Padding: 12px

## Helper Functions

- `createDataset(label, data, colorIndex)` — returns a fully themed dataset object
- `createGradientFill(ctx, startColor, endColor)` — canvas gradient for area charts
- `createConfidenceBandDataset(label, upperData, lowerData)` — paired fill-between datasets
- `createAssetAllocationDataset(allocations)` — doughnut dataset with asset class colors
- `getFireProgressColor(percentage)` — returns threshold-based color: <25% red, 25-50% orange, 50-75% blue, 75-100% green

## Dark Mode

Merge dark mode overrides at the component level:

```ts
import { getChartOptionsWithDarkMode } from '@/utils/chartTheme'

const options = computed(() =>
  getChartOptionsWithDarkMode(lineChartOptions, isDark.value)
)
```

`darkModeOverrides` adjusts grid lines, tick colors, legend text, and tooltip background for dark themes.

## Two Rendering Approaches

### vue-chartjs for Standard Charts

```ts
import { Doughnut, Bar, Line } from 'vue-chartjs'
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend) // Module-level registration
```

Use for bar, line, doughnut, pie — any standard Chart.js type.

### Hand-Built SVG for Custom Charts

Use SVG with `viewBox` for custom visualizations (FIRE thermometer, milestone timeline):

```vue
<svg :viewBox="`0 0 ${width} ${height}`" preserveAspectRatio="xMidYMid meet">
  <path :d="computedPath" />
</svg>
```

- Compute paths in `computed` properties with a `padding` object (`{ top, right, bottom, left }`)
- Sample data for performance: `Math.max(1, Math.floor(data.length / 50))` step size
- Hover interaction: transparent large circles (r=8) overlaying visible dots (r=3)

## Container Sizing

Chart.js charts MUST be wrapped in a fixed-height container div:

```css
.chart-container { height: 300px; position: relative; }
.chart-container-sm { height: 200px; position: relative; }
.chart-container-lg { height: 400px; position: relative; }
```

SVG charts use `viewBox` and scale responsively — no fixed height needed on the SVG element itself.
