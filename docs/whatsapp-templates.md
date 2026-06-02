# FireKaro WhatsApp template catalog (create + get approved in Wati)

**Created:** 2026-06-02 · **Owner:** Growth/Lifecycle · **Pairs with:** the preference centre
(`/api/comms/consent`) + `server/src/lib/comms-templates.ts` (name mapping) + the proven Meta rules
in `meta-whatsapp-delivery-policies.md`.

## How to use this
Create each template in Wati exactly as below. **Keep the UTILITY ones non-promotional and
account-specific** — one persuasive line ("grow your wealth", "don't miss out") makes Meta
reclassify them as MARKETING (capped + ₹0.78 + opt-in). After approval, send me the **exact** name
of each (Wati often needs a date suffix, e.g. `firekaro_welcome_2026_06_03`); the app reads names
from config (`COMMS_TEMPLATE_<KEY>` env), so no code change is needed to wire your real names.

- **Language:** English · **Footer (all):** `FireKaro · firekaro.com`
- **Buttons:** None needed — the app link is static text (`firekaro.com`) inside each body.
- `{{n}}` = positional variable; sample values given for approval.
- **Meta rule:** a template body **cannot end with a variable** — there must be static text after the
  last `{{n}}`. So the link is plain `firekaro.com` text in the sentence, never a trailing `{{n}}`.

## Preference mapping (what the consent centre toggles)
| Preference toggle | Consent field | Templates it gates |
|---|---|---|
| **WhatsApp: Account & plan alerts** | base channel consent (un-revoked) | welcome, milestone, offtrack, goal_reminder, annual_review |
| **WhatsApp: Marketing & insights** | `marketingOptIn = true` | monthly_digest, winback, salary_update |

---

## UTILITY templates (transactional / account-specific — deliver reliably)

### 1. `firekaro_welcome` — on signup  *(already approved as `firekaro_welcome_2026_06_03`)*
> Hi {{1}}, your FireKaro account is ready. Your FIRE plan is set up — your current FIRE target is ₹{{2}} and your projected FIRE year is {{3}}. You can review or update your plan anytime in the app.

Samples: `Abhay` · `4.2 Cr` · `2041`

### 2. `firekaro_milestone` — corpus / progress milestone crossed  (vars: name, amount, %)
> Hi {{1}}, an update on your FireKaro plan: your corpus has crossed ₹{{2}}, putting you at {{3}} of your FIRE target. Open the app at firekaro.com to see your plan.

Samples: `Abhay` · `1 Cr` · `25%`

### 3. `firekaro_offtrack` — projection slipped off-track  (vars: name, year, driver)
> Hi {{1}}, a heads-up on your FireKaro plan: your projected FIRE year has moved to {{2}}, mainly due to {{3}}. Review the details at firekaro.com.

Samples: `Abhay` · `2043` · `higher monthly expenses`

### 4. `firekaro_goal_reminder` — a financial goal's target date nears  (vars: name, goal, date, %)
> Hi {{1}}, a reminder about your FireKaro goal "{{2}}": its target date is {{3}} and you're at {{4}} of the target. Review it at firekaro.com.

Samples: `Abhay` · `Myra's Education` · `Mar 2032` · `60%`

### 5. `firekaro_annual_review` — new financial year, figures stale  (vars: name)
> Hi {{1}}, a new financial year has started. Your FireKaro plan still uses last year's income and investment figures. Update them at firekaro.com so your FIRE projection stays accurate.

Samples: `Abhay`
*(Mild reclassification risk — keep the instructional, non-promotional tone above.)*

---

## MARKETING templates (engagement — capped per-user; need `marketingOptIn`)

### 6. `firekaro_monthly_digest` — monthly recap  (vars: name, net worth, savings rate, FIRE date)
> Hi {{1}}, your FireKaro month in numbers — net worth {{2}}, savings rate {{3}}, projected FIRE date {{4}}. See your full snapshot at firekaro.com.

Samples: `Abhay` · `1.8 Cr` · `42%` · `Aug 2041`

### 7. `firekaro_winback` — dormant (no login ~60 days)  (vars: name, FIRE date)
> Hi {{1}}, it's been a while since you checked your FireKaro plan. Your projected FIRE date is now {{2}}. See what's changed at firekaro.com.

Samples: `Abhay` · `Aug 2041`

### 8. `firekaro_salary_update` — income-change / appraisal prompt  (vars: name)
> Hi {{1}}, did your income change recently? Update your salary at firekaro.com to see how it moves your FIRE date.

Samples: `Abhay`

---

## After approval
Send me the exact approved name for each. They get wired via env (no code change):
```
COMMS_TEMPLATE_WELCOME=firekaro_welcome_2026_06_03
COMMS_TEMPLATE_MILESTONE=...
COMMS_TEMPLATE_OFFTRACK=...
COMMS_TEMPLATE_GOAL_REMINDER=...
COMMS_TEMPLATE_ANNUAL_REVIEW=...
COMMS_TEMPLATE_MONTHLY_DIGEST=...
COMMS_TEMPLATE_WINBACK=...
COMMS_TEMPLATE_SALARY_UPDATE=...
```
The default for WELCOME is already the approved `firekaro_welcome_2026_06_03`.
