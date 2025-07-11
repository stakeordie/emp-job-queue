#!/bin/bash
# Added: 2025-04-14T18:40:00-04:00 - Clone script for Automatic1111 repositories

set -Eeuox pipefail

mkdir -p /repositories/"$1"
cd /repositories/"$1"
git init
git remote add origin "$2"
git fetch origin "$3" --depth=1
git reset --hard "$3"
rm -rf .git
