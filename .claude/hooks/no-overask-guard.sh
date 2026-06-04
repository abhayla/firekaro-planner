#!/usr/bin/env bash
# Stop hook — deterministic over-ask guard.
# Flags when the final assistant message asks the user to decide REVERSIBLE work,
# which decision-authority.md bans: DECIDE reversible work, don't ask. Non-blocking
# (warning to the log + stdout; never forces continuation, so a legitimate
# escalate-class question is never wrongly blocked). The point is a deterministic,
# un-ignorable signal — the advisory rule alone kept losing to default behaviour.
#
# Catches THREE patterns (the 2nd+3rd added 2026-06-04 after the persona+process
# grill, where I asked "Q2 of N … which — A, B, or C?" WITH my own recommendation
# each time and the old phrase-only check at the very tail missed all of it):
#   (1) trailing offer phrases ("want me to / should I / say the word")
#   (2) multiple-choice / grill enumerations ("Q3 of N", "which option", "A, B, or C?")
#   (3) THE SHARPEST TELL — my own recommendation + a trailing question. If I have a
#       recommended answer on reversible work, that IS the over-ask: execute it.
exec 2>/dev/null
input=$(cat)
command -v jq >/dev/null || exit 0
tp=$(printf '%s' "$input" | jq -r '.transcript_path // ""')
if [ -z "$tp" ] || [ ! -f "$tp" ]; then exit 0; fi

# Last assistant text block = the just-finished visible response.
last_text=$(jq -r 'select(.type=="assistant") | .message.content[]? | select(.type=="text") | .text' "$tp" 2>/dev/null | tail -1)
[ -z "$last_text" ] && exit 0

full=$(printf '%s' "$last_text" | tr '[:upper:]' '[:lower:]')
tail_part=$(printf '%s' "$full" | tail -c 700)

# Exemption: questions ABOUT genuinely irreversible/outward/strategic actions are LEGITIMATE.
if printf '%s' "$full" | grep -qE "push to prod|deploy|dns|cutover|force[- ]push|--force|spend|publish|destructive|drop (table|column)|delete (the )?(branch|remote)|escalat"; then
  exit 0
fi

flag=""
printf '%s' "$tail_part" | grep -qE "want me to|should i |shall i |would you like me to|do you want me to|let me know if|say the word|which (would|do) you|or (should|do|leave) (i|we|them|it)" && flag="trailing offer"
[ -z "$flag" ] && printf '%s' "$tail_part" | grep -qE "q[0-9]+ of|which (option|default|one|approach|do you want)|,? or [a-d]\?|\b[a-d], [a-d],? (or )?[a-d]\?|which —|which\?" && flag="multiple-choice ask"
ends_q=$(printf '%s' "$tail_part" | grep -qE '\?[[:space:]]*$' && echo 1 || echo 0)
[ -z "$flag" ] && [ "$ends_q" = "1" ] && printf '%s' "$full" | grep -qE "recommend" && flag="recommendation+question"

if [ -n "$flag" ]; then
  log="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/.overask-violations.log"
  printf '%s\tover-ask detected (%s) in final message\n' "$(jq -rn 'now|todate' 2>/dev/null || echo now)" "$flag" >> "$log" 2>/dev/null
  echo "OVER-ASK GUARD (decision-authority.md): your last response is a '$flag' on (likely) reversible work. A question that CARRIES YOUR OWN RECOMMENDED ANSWER on reversible/internal/best-practice-clear work IS the over-ask — next turn, EXECUTE the recommendation, don't ask. grill-me / AskUserQuestion are ONLY for irreversible/outward/strategic forks with no clear best-practice winner (deploy, spend, DNS, destructive git, publishing PII, a true product fork). If it is reversible: just DO it (build it, file the issue, commit, take the next queued item) and report."
fi
exit 0
