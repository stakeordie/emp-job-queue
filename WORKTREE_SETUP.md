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