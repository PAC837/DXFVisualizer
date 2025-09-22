# STUCK.md — What to do when you’re stuck

**Definition of “stuck”**  
You’ve tried to fix a bug or make a change multiple times and you’re looping with no progress.

---

## Golden Rules
1. **Stop.** If ≥3 failed attempts, pause.
2. **Switch modes.** Generate multiple hypotheses; don’t retry the same idea.
3. **Test fast.** Design tiny, automated checks or scripts for each hypothesis.
4. **Log attempts.** Track hypotheses, tests, and outcomes in a scratch file.
5. **Use the user when blind.** If only the user can see the outcome, put them in the test loop.
6. **Instrument.** Add minimal debug prints/telemetry to make the invisible visible.
7. **Iterate.** If not solved, expand/replace hypotheses and keep testing.

---

## Quick Flow (at a glance)
1. **State the problem plainly** in one sentence.
2. **List 5–10 hypotheses** (diverse, mutually distinct).
3. **Design a micro-test** for each hypothesis (≤5 minutes to run).
4. **Run tests** (or ask the user to run when you can’t see output).
5. **Log results** (pass/fail + notes).
6. **Narrow or pivot** based on evidence.
7. **Add minimal instrumentation** if results are ambiguous.
8. **Repeat** until the bug is found. Then **remove temporary debug**, **commit fix**, and **delete the scratch log**.

---

## Track A — Self-Debug (you can observe results)

**Checklist**
- [ ] Problem restated clearly.  
- [ ] 5–10 hypotheses drafted.  
- [ ] One tiny test per hypothesis.  
- [ ] Tests executed; results logged.  
- [ ] Add debug prints/flags if tests are inconclusive.  
- [ ] Update hypotheses (drop disproven, add new).  
- [ ] Fix verified by rerunning the original failing scenario.  
- [ ] Remove temporary debug; clean up.  

**Micro-test examples**
- Run function with minimal repro input.
- Toggle feature flag/env var and compare outputs.
- Binary search recent commits/config changes.
- Replace dependency version and rerun.
- Disable suspected module; check behavior delta.

**Minimal instrumentation**
- Add targeted `print/log.debug()` with unique tags.
- Time key steps; log durations.
- Log inputs/outputs (redact secrets).
- Add assertions around suspected invariants.

---

## Track B — User-Reported / Externally Observable Bugs (you can’t see results)

**Mindset:** *You are blind; the user sees the outcome.* Design the test, and have the user execute and report.

**Checklist**
- [ ] Tell the user you can’t see their screen/output; you’ll provide quick steps.  
- [ ] Provide a **single, numbered test** with clear, binary outcomes (A/B).  
- [ ] Ask them to report exactly what they see (A or B + any message text).  
- [ ] Based on their answer, branch to the next test or add instrumentation.  
- [ ] If needed, supply a small script/logging snippet for them to run.  
- [ ] Keep each round short (≤2 steps) and confirm time expectations.  
- [ ] Log their answers in the scratch file.  
- [ ] When fixed, ask the user to re-test the original action to confirm.

**User test template (message to send)**
```
I can’t see your output on my side, so I’ll guide a quick check.

Test 1 (takes ~1 minute):
1) Do X (exact steps).
2) You should see either **A** or **B**.
Please tell me which you see (A or B) and paste any error text if present.

Based on your answer, I’ll send the next 1–2 steps.
```

**User-side debug snippet (example)**
```bash
# Save as check.sh; run: bash check.sh
set -e
echo "[CHECK] starting"
my_command --mode test || echo "[CHECK] exit $?"; exit 0
```

---

## Scratch Log Template (one file per issue)

Create a file like: `logs/ISSUE-<slug>-YYYYMMDD.md`. Delete once solved.

```md
# Issue: <short title>
Date: <YYYY-MM-DD>
Owner: <name/AI>

## Problem Statement
<1-2 sentences>

## Context / Clues
- <symptom/stack trace/environment>
- <what changed recently>

## Hypotheses
1. <H1>
2. <H2>
3. <H3>
...
(aim for 5–10)

## Tests & Results
- H1 test: <how to run> → Result: PASS/FAIL, notes
- H2 test: <how to run> → Result: PASS/FAIL, notes
- H3 test: <how to run> → Result: PASS/FAIL, notes

## Instrumentation Added (if any)
- <file:line> added log: "<tag>"
- <assertion/metric> added

## User In The Loop (if applicable)
- Test 1 prompt sent → User reported: A/B + details
- Next step sent → User reported: ...
- Artifacts received: <logs/screenshots>

## Decision Log
- Dropped H2 (disproven by test)
- Prioritized H4 (highest likelihood given A/B)

## Fix
- <commit/changes>
- <why this resolves the root cause>

## Verification
- Repro steps re-run: PASS
- Regression checks: <list>

## Cleanup
- Removed temp logs/flags.
- Closed ticket; deleted this file.
```

---

## Stop-Thrash Guard (use every loop)
Before generating new hypotheses:
- **Have I restated the problem clearly?**
- **What exactly did the last test prove/disprove?**
- **Am I repeating a previously failed idea?** (Check the log.)
- **Can I make the next test smaller/faster/more binary?**
- **Do I need user eyes or added instrumentation?**

---

## Good Hypotheses Heuristics
- Diverse (config, environment, data, code, timing, permissions, dependencies).
- Falsifiable by a tiny test.
- Avoid “works on my machine” traps: test with the same inputs/runtime as the failing case.

---

## Done Definition
- Root cause identified and fixed (not just masked).
- Original failing scenario now passes.
- No new errors in adjacent areas (quick sanity checks).
- Temporary debugging removed.
- Scratch log deleted.

---

## One-liner Reminders
- **Don’t loop—branch.**
- **Make tests tiny and binary.**
- **If you can’t see it, the user must.**
- **Log what you tried so you don’t retry it.**
- **Instrument reality; don’t guess.**
