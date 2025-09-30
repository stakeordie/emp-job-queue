#!/bin/bash
PROFILE=${1:-testrunner}
REDIS_URL=${REDIS_URL:-redis://localhost:6379} tsx watch --env-file=.env.secret.$PROFILE --env-file=.env.$PROFILE src/index.ts
