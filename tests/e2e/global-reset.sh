#!/usr/bin/env sh
# Reset the E2E database (dev only). Usage: sh tests/e2e/global-reset.sh
psql "${E2E_DATABASE_URL:-postgres://valora:valora@localhost:5432/valora_e2e}" -c 'drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;'
