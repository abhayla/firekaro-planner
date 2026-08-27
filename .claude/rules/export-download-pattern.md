---
description: Multi-format data export (CSV, JSON, PDF, Excel) pattern for reports
paths: ["src/components/**/*OverviewTab.vue", "src/components/**/*ReportsTab.vue"]
---

# Export / Download Pattern

## Export Menu Trigger

Every exportable section uses a v-menu with an activator slot:

```vue
<v-menu>
  <template #activator="{ props }">
    <v-btn v-bind="props" variant="text" prepend-icon="mdi-download">
      Export
    </v-btn>
  </template>
  <v-list density="compact">
    <v-list-item @click="exportCSV" prepend-icon="mdi-file-delimited">
      <v-list-item-title>CSV</v-list-item-title>
    </v-list-item>
    <v-list-item @click="exportJSON" prepend-icon="mdi-code-json">
      <v-list-item-title>JSON</v-list-item-title>
    </v-list-item>
    <v-list-item @click="exportPDF" prepend-icon="mdi-file-pdf-box">
      <v-list-item-title>PDF</v-list-item-title>
    </v-list-item>
    <v-list-item @click="exportExcel" prepend-icon="mdi-microsoft-excel">
      <v-list-item-title>Excel</v-list-item-title>
    </v-list-item>
  </v-list>
</v-menu>
```

## CSV Export

Generate header row from column definitions, then map data rows:

```ts
const exportCSV = () => {
  const headers = columns.map(c => c.title).join(',')
  const rows = data.value.map(item =>
    columns.map(c => {
      const val = item[c.key]
      // Escape commas and quotes in string values
      return typeof val === 'string' && (val.includes(',') || val.includes('"'))
        ? `"${val.replace(/"/g, '""')}"`
        : val
    }).join(',')
  )
  const csv = [headers, ...rows].join('\n')
  downloadBlob(csv, 'text/csv', `${section}-data-${dateStr}.csv`)
}
```

## JSON Export

```ts
const exportJSON = () => {
  const json = JSON.stringify(data.value, null, 2)
  downloadBlob(json, 'application/json', `${section}-data-${dateStr}.json`)
}
```

## PDF Export (jsPDF + jspdf-autotable)

```ts
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const exportPDF = () => {
  const doc = new jsPDF()

  // Title
  doc.setFontSize(16)
  doc.text(`${sectionTitle} Report`, 14, 20)

  // Subtitle with date
  doc.setFontSize(10)
  doc.setTextColor(128)
  doc.text(`Generated on ${new Date().toLocaleDateString('en-IN')}`, 14, 28)

  // Summary section (key metrics)
  doc.setFontSize(12)
  doc.setTextColor(0)
  doc.text(`Total: ${formatINR(totalAmount.value)}`, 14, 40)

  // Data table
  autoTable(doc, {
    startY: 50,
    head: [columns.map(c => c.title)],
    body: data.value.map(item => columns.map(c => item[c.key])),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [25, 118, 210] }, // primary blue
  })

  // Footer with page numbers
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10)
  }

  doc.save(`${section}-report-${dateStr}.pdf`)
}
```

## Excel Export (xlsx)

```ts
import * as XLSX from 'xlsx'

const exportExcel = () => {
  const wb = XLSX.utils.book_new()

  // Summary sheet
  const summaryData = [
    ['Metric', 'Value'],
    ['Total', totalAmount.value],
    ['Count', data.value.length],
    ['Average', avgAmount.value],
  ]
  const summaryWs = XLSX.utils.aoa_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary')

  // Details sheet
  const detailsWs = XLSX.utils.json_to_sheet(data.value)
  detailsWs['!cols'] = columns.map(c => ({ wch: c.width || 15 }))
  XLSX.utils.book_append_sheet(wb, detailsWs, 'Details')

  // Budget sheet (if applicable)
  if (budgetData.value) {
    const budgetWs = XLSX.utils.json_to_sheet(budgetData.value)
    XLSX.utils.book_append_sheet(wb, budgetWs, 'Budget')
  }

  XLSX.writeFile(wb, `${section}-report-${dateStr}.xlsx`)
}
```

## Download Helper

Shared download function used by CSV and JSON exports:

```ts
const downloadBlob = (content: string, mimeType: string, filename: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
```

## File Naming Convention

All exported files follow: `${section}-${type}-${YYYY-MM-DD}.${ext}`

Examples:
- `expenses-report-2025-01-15.pdf`
- `salary-data-2025-03-10.csv`
- `investments-report-2025-02-28.xlsx`
- `fire-goals-data-2025-01-01.json`

Generate the date string with: `new Date().toISOString().split('T')[0]`
