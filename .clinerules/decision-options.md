## Brief overview
- Always present clear, concise options to the user whenever there is a decision point or when troubleshooting.
- Scope: Global rule for this workspace.
- Goal: Make tradeoffs explicit, enable informed choices, and avoid unilateral hidden decisions.

## When to present options
- Ambiguity in requirements or goals.
- Multiple viable implementations, designs, or libraries.
- Tradeoffs between speed, quality, scope, or complexity.
- Errors with multiple plausible fixes or hypotheses.
- Any action with data loss or backward-incompatible risk.
- Scope or priority adjustments that affect timelines or deliverables.

## Option format and content
- Present 2–5 numbered options (avoid more than 5).
- For each option include:
  - Name: short label for quick reference.
  - What: 1–2 sentences describing the action to take.
  - Pros / Cons: bullet points that make tradeoffs clear.
  - Effort: rough estimate (e.g., minutes, hours).
  - Risk/Impact: stability, data, user-facing changes.
  - Prereqs: approvals, environment setup, access needs.
- End with “My recommendation” and a brief rationale.

## Defaults and next steps
- If the decision gates destructive or high‑risk actions, wait for explicit user selection.
- If non‑destructive and low risk, propose a default and request approval before proceeding.
- If previously authorized to proceed without confirmation, follow the recommended default and note a clear rollback plan.
- Always include “Next steps for each option” so the immediate actions are transparent.

## Troubleshooting protocol
- Start with a concise problem statement and likely root causes.
- Offer option paths such as:
  - Quick diagnostics (logs, repro case, enable debug/trace).
  - Minimal safe fix or temporary workaround.
  - Deeper corrective change or refactor.
  - Revert/feature flag/rollback and investigate offline.
- For each path, specify verification steps and how to revert.

## Communication style
- Be concise and structured; use numbered lists for options.
- Lead with a one‑sentence summary, then present options.
- Use concrete, action‑oriented language; avoid chit‑chat.

## Exceptions
- Trivial choices with one obvious best path may proceed without options; note the rationale briefly.
- Security‑sensitive or data‑destructive actions always require explicit confirmation.

## Brief example
- Decision: Handling parse errors during file import
  1) Fail‑fast with validation (recommended)
     - Pros: clear feedback, safe; Cons: strict; Effort: low; Risk: low
  2) Best‑effort with warnings
     - Pros: continues; Cons: possible silent anomalies; Effort: low; Risk: medium
  3) Auto‑correct heuristics
     - Pros: convenience; Cons: hidden mutations; Effort: medium; Risk: high
- My recommendation: 1) Fail‑fast. Next: add schema validation and surface error messages to the user.

## Upcoming Decisions (DXF Visualizer)
- Units policy: auto from header vs mandatory user confirmation; default: auto with confirm if missing/ambiguous.
- Outer contour detection: layer-based vs geometry heuristic; default: layer “0” or “OUTER” if present, else largest area.
- Tolerances: vertex merge tolerance for noisy polylines; propose default 0.001 in / 0.0254 mm.
- Arcs in LWPOLYLINE: convert bulge to arcs vs linearize; default: preserve arcs for export, linearize only for preview if needed.
- Export schema versioning: versioned JSON with “schemaVersion”; default: v0.1.
