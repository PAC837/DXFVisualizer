# .clinerules
# Purpose: Maintain a persistent project memory document that always reflects the current state,
# goals, progress, and next actions. This document is the single source of truth for the project.

rules:
  - Always maintain a file called `memory.md` in the `/memory` folder.
  - This file must always be updated whenever something important or interesting happens.
  - Treat it as the project’s working memory: a concise overview that lets you instantly see
    what the project is, where it stands, and what’s next.
  - All changes to `memory.md` must be committed to Git and pushed to GitHub.

structure_of_memory_md:
  - **Project Overview**
    Write a short paragraph describing the project’s purpose and the reason it exists.
    Keep this section stable unless the mission changes.

  - **Big Goals**
    List the ultimate objectives, long-term outcomes, and success criteria.
    These should remain consistent, but update if the definition of success evolves.

  - **Phases and Milestones**
    Maintain a chronological outline of the project phases with dates and times.
    For each phase, note its title, objective, and completion status.
    Mark clearly which phase is active right now.

  - **Current Status**
    Summarize what is happening right now.
    Include what was most recently completed, what is in progress, and anything newly started.

  - **Next Actions**
    List the 3–7 most immediate, concrete tasks that must be done next.
    Rewrite this section frequently so it is always actionable and fresh.

  - **Key Decisions and Changes**
    Maintain a dated log with exact timestamps of major choices, pivots, risks, or lessons learned.
    Always add a new line when a decision is made or when circumstances shift.

  - **Resources and References**
    Keep a running list of the most important links, repositories, documents, and tools
    that are needed for the project.

  - **Glossary and Shortcuts**
    Capture acronyms, shorthand, and naming conventions so they are easy to remember.

  - **Metrics and KPIs**
    If relevant, track measurable indicators of progress.
    Keep this section high-level: one snapshot is enough.

update_principles:
  - Always update the document in real time when something new happens.
  - On every task, check if the document needs updating. Update unless the task is deep within
    a feature where status is not immediately relevant.
  - Summarize major progress in “Current Status” and update “Next Actions” accordingly.
  - Write in clear, concise prose. No placeholders, no filler.
  - This document is always optimized for scanning in under one minute.
  - Always include dates and exact timestamps so you have a chronological sense of whats happening and the development flow
  - After each feature change (parser, bounds, units, export), append a dated entry and refresh “Next Actions.” Keep it under 1 minute to scan.
