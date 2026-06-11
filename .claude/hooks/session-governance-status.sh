#!/usr/bin/env bash
# SessionStart hook — emits role/handoff GOVERNANCE STATE as variables so every
# session boots with a machine-readable status block. Advisory MUSTs (the
# handoff-register consult, role validation) were silently dropped under
# task-focus; a deterministic session-start surface fixes that class of miss
# (Abhay 2026-06-03 — "output checked/validated/verified by a supervisor").
# Non-blocking: prints to stdout (added to session context), always exit 0.
exec 2>/dev/null
root=$(git rev-parse --show-toplevel 2>/dev/null) || root="."
reg="docs/comms-go-live-handoff.md"

echo "=== GOVERNANCE (session-start variables) ==="
echo "ORCHESTRATOR_SUPERVISOR=on  rule=.claude/rules/orchestrator-output-validation.md"
echo "SUPERVISOR_DUTY=reproduce-gate+inspect-substance-before-accepting-any-worker-output"

if [ -f "$root/$reg" ]; then
  open=$(grep -cE "🚦|[Yy]our decision|[Nn]eeds Abhay|⏳" "$root/$reg" 2>/dev/null)
  [ -z "$open" ] && open=0
  echo "HANDOFF_REGISTER=$reg"
  echo "HANDOFF_CONSULT=MUST-before-assuming-a-task-is-fully-doable"
  echo "HANDOFF_OPEN_MARKERS=$open"
else
  echo "HANDOFF_REGISTER=absent"
fi

echo "GIT_BRANCH=$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
echo "GIT_UNCOMMITTED=$(git -C "$root" status --porcelain 2>/dev/null | grep -c .)"
echo "ROLE_FINTECH_AUTODISPATCH=src/lib/*.ts|src/types/assumptions.ts"
echo "ROLE_CODEQUALITY=required-after-any-build(rule-29-independent-pass)"
echo "ROLE_ROUTER=.claude/rules/engineering-roles.md  (state Role:<name> each turn)"

# Enhance-misses telemetry loop (2026-06-11): the prompt-enhance pipeline logs
# banner/block/role misses + regrade divergences to .enhance-misses.log, but a
# write-only log is governance theater — surface a 7-day summary every session
# so drift is SEEN. ISO timestamps sort lexicographically, so a string compare
# against the 7-day cutoff works.
ml="$root/.claude/.enhance-misses.log"
if [ -f "$ml" ] && command -v jq >/dev/null; then
  cutoff=$(jq -rn 'now-604800|todate')
  recent=$(awk -v c="$cutoff" '$1 >= c' "$ml" | grep -c .)
  newest=$(tail -1 "$ml" | cut -f2)
  echo "ENHANCE_MISSES_7D=$recent  (total: $(grep -c . "$ml"); newest: ${newest:-none})"
  [ "$recent" -gt 5 ] && echo "ENHANCE_MISSES_ALERT=miss-rate-high — review .claude/.enhance-misses.log + tighten the failing class"
fi
exit 0
