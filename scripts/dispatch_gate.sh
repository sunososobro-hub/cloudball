#!/usr/bin/env bash
# Dispatch gate (#582): a script decides which worker triggers are due; the LLM only fires them.
#
#   bash scripts/dispatch_gate.sh
#
# stdout, one line each (nothing at all when nothing is due):
#   FIRE <trigger_id>   fire that scheduled task (ids come from scripts/dispatch_triggers.json)
#   ALERT <pr>          the PR was rejected 3 times (Opus review: CHANGES / requeue:); a human looks at it
# Uses only `gh api` REST (+ jq). Rules W1/W3/W9; the worker pick query matches routines/worker.md.
#   level 0 -> no output; level 1 -> only P0/P1 issues count; level unreadable -> 2.
#   Workers fired = min(ready issues, 3), in the order C (only when a model:opus issue is ready), A, B.
#   Reviewer fired when some open dev PR has `test` and `gate` green, is `clean`, and was green for > 60 min.
# Test hooks: GH (gh binary, default gh), R (repo), NOW (epoch seconds), TRIGGERS (json path).
set -euo pipefail
GH=${GH:-gh}
R=${R:-sunososobro-hub/cloudball}
NOW=${NOW:-$(date -u +%s)}
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
TRIGGERS=${TRIGGERS:-$HERE/dispatch_triggers.json}
GREEN_MIN=3600
MAX_WORKERS=3

api() { "$GH" api "$@"; }
trig() { jq -r --arg k "$1" '.[$k] // empty' "$TRIGGERS"; }
fire() { local id; id=$(trig "$1"); [ -n "$id" ] && echo "FIRE $id"; return 0; }
count() { api -X GET search/issues -f q="$1" -f per_page=1 | jq -r '.total_count // 0'; }

level=$(api "repos/$R/issues/275" 2>/dev/null | jq -r '.body // "" | split("\n")[0]' || true)
level=$(printf '%s' "$level" | sed -n 's/^level: *\([0-9]\).*/\1/p')
level=${level:-2}
[ "$level" = 0 ] && exit 0

# --- workers ---
base="repo:$R is:issue is:open author:sunososobro-hub label:status:todo -label:needs-owner -label:needs-opus -label:status:frozen -label:status:blocked"
[ "$level" = 1 ] && base="$base label:P0,P1"
nopus=$(count "$base label:model:opus")
nson=$(count "$base -label:model:opus")
total=$((nopus + nson))
n=$((total < MAX_WORKERS ? total : MAX_WORKERS))
slots=(A B C)
[ "$nopus" -gt 0 ] && slots=(C A B)   # C takes model:opus first, then the rest
for ((i = 0; i < n; i++)); do fire "${slots[$i]}"; done

# --- reviewer and alerts ---
prs=$(api "repos/$R/pulls?state=open&base=dev&per_page=100")
reviewer=0
for pr in $(printf '%s' "$prs" | jq -r '.[].number'); do
  head=$(printf '%s' "$prs" | jq -r --argjson n "$pr" '.[]|select(.number==$n)|.head.sha')
  ref=$(printf '%s' "$prs" | jq -r --argjson n "$pr" '.[]|select(.number==$n)|.head.ref')
  runs=$(api "repos/$R/commits/$head/check-runs?per_page=100")
  green_at=$(printf '%s' "$runs" | jq -r '
    [.check_runs[]|select(.name=="test" or .name=="gate")] as $c
    | if ($c|map(.name)|unique|length)==2 and ($c|all(.conclusion=="success"))
      then ($c|map(.completed_at|fromdateiso8601)|max) else empty end')
  if [ -n "$green_at" ] && [ $((NOW - green_at)) -gt $GREEN_MIN ]; then
    st=$(api "repos/$R/pulls/$pr" | jq -r '.mergeable_state')
    [ "$st" = clean ] && reviewer=1
  fi
  rej=$(api "repos/$R/issues/$pr/comments?per_page=100" | jq '[.[]|select(.body|test("^(Opus review: CHANGES|requeue:)";"m"))]|length')
  if [[ "$ref" =~ ^(fix|feat)/([0-9]+) ]]; then
    more=$(api "repos/$R/issues/${BASH_REMATCH[2]}/comments?per_page=100" | jq '[.[]|select(.body|test("^requeue:.*PR #'"$pr"'";"m"))]|length')
    rej=$((rej + more))
  fi
  [ "$rej" -ge 3 ] && echo "ALERT $pr"
done
[ "$reviewer" = 1 ] && fire reviewer
exit 0
