---
description: Form validation approaches using manual validation and VeeValidate+Zod
paths: ["src/components/**/*.vue"]
---

# Form Validation Patterns

## Two Approaches Based on Complexity

### Simple Forms — Manual Validation

For forms with fewer than 5 fields and straightforward rules (e.g., ExpenseForm, quick-add dialogs):

```vue
<v-text-field
  v-model.number="amount"
  prefix="₹"
  type="number"
  :rules="[(v: number) => v > 0 || 'Amount must be positive']"
  variant="outlined"
  density="comfortable"
/>
```

Combine with a computed validity check:

```ts
const isValid = computed(() =>
  amount.value > 0 && category.value !== '' && description.value.trim().length > 0
)
```

### Complex Forms — VeeValidate + Zod

For forms with 5+ fields, conditional validation, or cross-field dependencies (e.g., LoanForm, GoalForm, InsuranceForm):

```ts
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(1, 'Name is required'),
  amount: z.number().positive('Must be positive'),
  startDate: z.string().min(1, 'Start date is required'),
  tenure: z.number().int().min(1, 'Minimum 1 year'),
  interestRate: z.number().min(0).max(100, 'Invalid rate'),
})

const { handleSubmit, defineField, errors } = useForm({
  validationSchema: toTypedSchema(schema),
})

const [name, nameAttrs] = defineField('name')
const [amount, amountAttrs] = defineField('amount')
```

### Submit Handler

```ts
const onSubmit = handleSubmit(async (values) => {
  await createMutation.mutateAsync(values)
  emit('update:modelValue', false)
})
```

## Vuetify Field Conventions in Forms

| Prop | Value | When |
|---|---|---|
| `variant` | `"outlined"` | Always in forms |
| `density` | `"comfortable"` | Always |
| `type` | `"number"` | Numeric fields, paired with `v-model.number` |
| `type` | `"date"` | Date fields — use native date input, NOT a date picker component |
| `prepend-inner-icon` | `"mdi-*"` | Field-specific icons for visual context |
| `hint` + `persistent-hint` | descriptive text | Field descriptions that should always show |

## Dialog v-model Pattern

Forms in dialogs use the v-model convention:

```ts
const props = defineProps<{
  modelValue: boolean
  item?: LoanRecord | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const dialogOpen = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val),
})
```

## Form Initialization with Watch

### Reset on Dialog Open

```ts
watch(() => props.modelValue, (open) => {
  if (open) {
    resetForm()
  }
})
```

### Populate for Edit Mode

```ts
watch(() => props.item, (newItem) => {
  if (newItem) {
    name.value = newItem.name
    amount.value = newItem.amount
    // ... populate all fields
  }
}, { immediate: true })
```

## Auto-Calculation Watches

Derived fields that update automatically when inputs change:

```ts
// Set maturity date from start date + tenure
watch([startDate, tenureYears], ([start, tenure]) => {
  if (start && tenure > 0) {
    const maturity = new Date(start)
    maturity.setFullYear(maturity.getFullYear() + tenure)
    maturityDate.value = maturity.toISOString().split('T')[0]
  }
})
```

## Conditional Form Sections

Use `v-expand-transition` for sections that appear/disappear based on selections:

```vue
<v-expand-transition>
  <div v-if="loanType === 'home'">
    <v-text-field v-model.number="propertyValue" prefix="₹" label="Property Value" />
    <v-text-field v-model.number="downPayment" prefix="₹" label="Down Payment" />
  </div>
</v-expand-transition>
```

NEVER use `v-show` for conditional form sections — `v-expand-transition` provides visual feedback and `v-if` ensures hidden fields do not participate in validation.
