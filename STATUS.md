## Status

Google OAuth and persistence are being stabilized for local and hosted use.
The current investigation found two likely blockers: the server was not loading local env files, and auth cookies were always forced to secure HTTPS mode.

## Next

Verify the auth debug endpoint after the server patch, then confirm the exact Google OAuth origin and redirect URI values to use.

## Archer's Global AI Rules

### Commit Messages
Always use this format:
Line 1: Specific description of what changed (never "update files" or "fix bug")

Line 3: Status: [one sentence on where the project stands right now]
Line 4: Next: [the single most important next step]

### Before Starting Work
- Check the most recent commit message or STATUS.md to understand where things left off
- Never assume — confirm the current state before writing any code
- If the last session left a "Next:" note, start there

### How to Handle Uncertainty
- If unsure what to do next, stop and ask — don't guess and burn tokens
- If a fix requires touching more than 3 files, stop and confirm before proceeding
- If something breaks unexpectedly, stop and explain before trying to fix it

### Code Behavior
- Always make the smallest change that solves the problem
- Never refactor code unless explicitly asked
- Never install new packages without asking first
- Prefer simple solutions over clever ones

### Communication Style
- This is a no-code founder workflow — explain what you're doing in plain English, not just code
- Summarize what was completed at the end of every session
- Flag blockers clearly — don't silently work around them