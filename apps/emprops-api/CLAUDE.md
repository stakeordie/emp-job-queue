# CRITICAL DATABASE SAFETY RULES

  ## FORBIDDEN COMMANDS - NEVER RUN THESE:
  - `npx prisma migrate reset`
  - `npx prisma migrate reset --force`
  - `npx prisma db push --force-reset`
  - `DROP DATABASE`
  - `TRUNCATE TABLE`
  - Any command with `--force` flag on production databases

  ## REQUIRED CHECKS BEFORE ANY DATABASE OPERATION:
  1. ALWAYS check which database you're connected to first with `echo $DATABASE_URL`
  2. NEVER run destructive operations on production databases
  3. Always use development/staging databases for schema changes
  4. Create backups before any schema modifications

  ## PRODUCTION DATABASE PROTECTION:
  - Production database URL contains: maglev.proxy.rlwy.net:18261
  - If connected to production, STOP and switch to development database
  - Ask user for explicit permission before ANY database modification


 i## Deployment Insights




- Previously, jobs were run locally instead of being submitted as delegated jobs, which impacted the system's workflow and execution process