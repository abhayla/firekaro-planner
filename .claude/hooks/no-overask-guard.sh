#!/usr/bin/env bash
# Stop hook — deterministic over-ask guard.
# Flags when the final assistant message ends with an offer/question on
# (likely) reversible work, which decision-authority.md bans: DECIDE reversible
# work, don't ask. Non-blocking (surfaces a warning to the log + stdout; never
# forces continuation, so a legitimate escalate-class question is never wrongly
# blocked). The point is a deterministic, un-ignorable signal — the advisory
# rule alone kept losing to default behaviour.
exec 2>/dev/null
input=$(cat)
command -v jq >/dev/null || exit 0
tp=$(printf '%s' "$input" | jq -r '.transcript_path // ""')
if [ -z "$tp" ] || [ ! -f "$tp" ]; then exit 0; fi

# Last assistant text block = the just-finished visible response.
last_text=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' "$tp" 2>/dev/null | tail -1)
[ -z "$last_text" ] && exit 0

tail_part=$(printf '%s' "$last_text" | tr '[:upper:]' '[:lower:]' | tail -c 600)
if printf '%s' "$tail_part" | grep -qE "want me to|should i |shall i |would you like me to|do you want me to|let me know if|say the word|which (would|do) you|or (should|do|leave) (i|we|them|it)"; then
  log="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/.overask-violations.log"
  printf '%s\tover-ask detected in final message\n' "$(jq -rn 'now|todate' 2>/dev/null || echo now)" >> "$log" 2>/dev/null
  echo "OVER-ASK GUARD (decision-authority.md): your last response ended with an offer/question. If that action is reversible/internal (DECIDE-class) — filing an issue, committing, saving a session, taking the next queued task — DO it next turn instead of asking. Only a genuinely irreversible/outward/strategic item (push to prod, spend money, deploy, DNS cutover, destructive git, a true product fork) earns the question."
fi
exit 0
