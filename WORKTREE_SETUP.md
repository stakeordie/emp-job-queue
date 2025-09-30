# Worktree Environment Setup Guide

## Quick Setup

   ```bash
   ./setup-worktree-env.sh
   ```

2. **Or manually configure secrets**:
   - Edit `config/environments/secrets/.env.secrets.local`
   - Fill in the required values (see below)

3. **Build environment files**:
   ```bash
   pnpm env:build local-dev
   ```

## Claude Code Context

To copy Claude Code history to a new worktree:
```bash
# Automatically done by setup-worktree.sh, or manually:
cp -r /path/to/parent/worktree/.claude /path/to/new/worktree/.claude
```

This preserves your Claude Code session context in the new worktree.