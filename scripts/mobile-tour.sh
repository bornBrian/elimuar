#!/usr/bin/env bash
# Renders every phone-app screen to apps/mobile/Logs/tour, without a phone.
# Needs the API running on :4000 with the seed data, and Unity closed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UNITY="${UNITY:-C:/Program Files/Unity/Hub/Editor/6000.6.2f1/Editor/Unity.exe}"
setting() { grep -E "^$1=" "$ROOT/apps/api/.env" | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }

export ELIMU_TOUR=1
export ELIMU_TOUR_STUDENT="${ELIMU_TOUR_STUDENT:-S0206/0001/2026}"
export ELIMU_TOUR_STUDENT_SECRET="${ELIMU_TOUR_STUDENT_SECRET:-$(setting SEED_STUDENT_PIN)}"
export ELIMU_TOUR_TEACHER="${ELIMU_TOUR_TEACHER:-$(setting SEED_TEACHER_EMAIL)}"
export ELIMU_TOUR_TEACHER_SECRET="${ELIMU_TOUR_TEACHER_SECRET:-$(setting SEED_STAFF_PASSWORD)}"
export ELIMU_TOUR_ADMIN="${ELIMU_TOUR_ADMIN:-$(setting SEED_ADMIN_EMAIL)}"

"$UNITY" -batchmode -projectPath "$ROOT/apps/mobile" -runTests -testPlatform PlayMode \
  -testFilter ElimuAR.Tests.ElimuTourTest -testResults "$ROOT/apps/mobile/Logs/tour-results.xml" \
  -logFile "$ROOT/apps/mobile/Logs/tour.log"
echo "exit $?"
ls "$ROOT/apps/mobile/Logs/tour"
