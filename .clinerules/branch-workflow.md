# Branch Workflow Management

## Core Rule: NEVER Work on Main Branch

**CRITICAL:** All development work must be done on feature/test branches. Never commit directly to main branch.

## Branch Workflow Requirements

### 1. **Always Create Test Branches**
- Before starting any work, create a descriptive branch: `git checkout -b feature-name` or `git checkout -b bug-fixes`
- Branch names should be descriptive: `feature-drag-selection`, `bug-undo-system`, `refactor-file-size`

### 2. **Main Branch Protection**
- Main branch is for **stable, tested code only**
- All changes must go through pull requests or explicit merge process
- Main branch should always be in a working state

### 3. **Development Workflow**
```bash
# ✅ CORRECT - Always start with a branch
git checkout main
git pull origin main
git checkout -b your-feature-name
# ... make changes ...
git add .
git commit -m "feat: your changes"
git push origin your-feature-name

# ❌ WRONG - Never work directly on main
git checkout main
# ... make changes directly on main ... NO!
```

### 4. **Branch Types**
- `feature-*` - New functionality
- `bug-fixes` - Bug fixes and patches  
- `refactor-*` - Code organization improvements
- `hotfix-*` - Critical production fixes

### 5. **Merge Process**
- Test all functionality on the branch before merging
- Use `git merge --no-ff feature-branch` for explicit merge commits
- Delete feature branches after successful merge
- Always verify main branch remains functional after merge

## Exception Handling
- **Emergency hotfixes:** Only critical production issues may bypass this rule
- **Documentation updates:** Minor README/documentation changes may go direct to main
- **When in doubt:** Create a branch. It's safer.

## Enforcement
- This rule applies to all development work in this workspace
- AI assistants should always remind about branching when making changes
- Never commit to main without explicit user confirmation for emergency cases

## Benefits
- Prevents breaking main branch
- Allows experimental work without risk  
- Enables easy rollback of problematic changes
- Maintains clean, reviewable commit history
- Protects production-ready code

---

**Remember: When in doubt, branch it out!**
