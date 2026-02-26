#!/bin/bash
set -euo pipefail

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // ""')

# Only intercept gh pr merge commands
if ! echo "$command" | grep -qE 'gh\s+pr\s+merge'; then
  exit 0
fi

# Check if pre-merge gate has already been passed
FLAG_FILE="${CLAUDE_PROJECT_DIR}/.claude/.pre-merge-approved"
if [ -f "$FLAG_FILE" ]; then
  rm -f "$FLAG_FILE"
  exit 0
fi

# Block the merge — stderr with exit 2 feeds back to Claude
cat >&2 <<'MSG'
MERGE BLOCKED: Pre-merge gate not passed.

Before merging, you MUST launch all three agents in parallel and get their sign-off:

1. **c4-architect** — Review C4 architecture docs against the code changes in this PR. Only raise CRITICAL issues (wrong abstraction level, missing components, stale relationships that would mislead a new developer).

2. **test-engineer** — Run the full test suite (unit + browser E2E + type check). Only raise CRITICAL issues (failing tests, untested new components).

3. **qa-engineer** — Open the dev server in Playwright, navigate the changed UI flows, take screenshots. Only raise CRITICAL issues (broken layouts, non-functional interactions, visual regressions).

After ALL three agents report back with no critical blockers, create the file .claude/.pre-merge-approved and retry the merge command.

If any agent raises a critical blocker, fix it before merging.
MSG
exit 2
