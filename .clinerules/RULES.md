# RULES.md — General AI Development Rules

This file defines the **core guardrails** for how the AI should work inside this project.  
Think of it as the "constitution" of the workspace.

---

## 🔹 Error Handling & Debugging
- Always **log errors with context** (inputs, configs, environment).  
- Never swallow exceptions silently — if you must catch, **re-throw or log clearly**.  
- When adding debugging, use **unique tags** so logs are searchable.  

---

## 🔹 Code Style & Readability
- Keep functions under **50–75 lines**. Break up large ones.  
- Always write **docstrings or comments** at the top of each file and function.  
- Prefer **explicit names** (`parse_invoice_pdf`) over short/generic ones (`parseFile`).  
- When adding new code, **follow the existing style** (imports, casing, indentation).  

---

## 🔹 Testing Rules
- Every new feature gets at least **one small test file**.  
- Tests should be **independent and fast** (run in seconds).  
- Apply modular file rule: avoid monolithic test files.  

---

## 🔹 User-in-the-Loop Reminders
- If the output depends on something only the user can see, **ask them** with clear, binary test instructions.  
- Always explain: *“I can’t see your output; please confirm A or B.”*  
- Keep user test loops short (≤2 steps before re-evaluating).  

---

## 🔹 Commit / Change Discipline
- Before big edits, **summarize the plan** in plain words.  
- After changes, provide a **clear diff summary** (added/removed/refactored).  
- Don’t refactor and add new features in the same commit/file.  

---

## 🔹 Performance / Safety
- Don’t optimize prematurely; fix correctness first.  
- If a loop or query can grow unbounded, add a **safety cap**.  
- Never hardcode secrets; always use env vars or config files.  

---

## 🔹 Meta Rules
- If stuck → follow **STUCK.md**.  
- If file too big → follow **FILES.md**.  
- If unsure → **ask the user instead of guessing**.  
- Always leave the codebase in a **working state** after edits.  

---

## 🔹 One-liner Mantras
- **Don’t loop — branch.**  
- **Small files, clear names.**  
- **Ask the user when blind.**  
- **Log everything you try.**  

---

## Project-Specific Addenda — DXF Visualizer (Electron/JS)
- Logging tags: use searchable tags in console and code: [DXF-PARSE], [DXF-RENDER], [UNITS], [BOUNDS], [EXPORT], [UI], [ERROR].
- Electron runtime: if GPU errors block window creation, add a runtime flag with safe fallback (app.disableHardwareAcceleration()) guarded by an env flag; do not default-disable in production builds.
- Units handling: always detect $INSUNITS; if absent, prompt user to select units (in/mm) and record in export; never guess silently.
- Bounds/dimensions: prefer geometry-derived bounds (true extents of LWPOLYLINE/ARC with bulge) with user override and lock toggle.
- Export discipline: maintain a single schema module (src/export/mozaikSchema.js) and a validator test; any schema change must update validator and memory.md “Key Decisions”.
- Tests: add a lightweight manual smoke test checklist (npm start ➜ loads; import sample.dxf ➜ renders; export ➜ JSON present).
