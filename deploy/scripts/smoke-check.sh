#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3010}"

echo "Checking ${BASE_URL}/"
curl -fsS -I "${BASE_URL}/" >/dev/null

echo "Checking ${BASE_URL}/api/dashboard"
DASHBOARD_JSON="$(curl -fsS "${BASE_URL}/api/dashboard")"
echo "${DASHBOARD_JSON}" | grep -q '"mode"'
echo "${DASHBOARD_JSON}" | grep -q '"agents"'

echo "Smoke check passed."
