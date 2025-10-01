#!/bin/bash

# Handle both styles: `./dev.sh testrunner` and `./dev.sh --env testrunner`
if [ "$1" = "--env" ]; then
  PROFILE=${2:-testrunner}
else
  PROFILE=${1:-testrunner}
fi

REDIS_URL=${REDIS_URL:-redis://localhost:6379} pnpm exec tsx watch --env-file=.env.secret.$PROFILE --env-file=.env.$PROFILE src/index.ts
