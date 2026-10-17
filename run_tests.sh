#!/usr/bin/env bash
set -eu
cd "$(dirname "$0")"
export PYTHONDONTWRITEBYTECODE=1
PYTHON="${PYTHON:-python3}"
if [ "${1:-}" = "--install-deps" ]; then
  "$PYTHON" -m pip install 'fastapi==0.141.1' 'pydantic==2.13.4' 'PyJWT==2.13.0' \
    'networkx==3.7' 'redis==6.4.0' 'pytest==9.1.1' 'httpx==0.28.1' \
    'coverage==7.16.2' 'pypdf==6.21.0'
  shift
fi
export PYTHONPATH="$("$PYTHON" -c 'import os; print(os.path.join(os.getcwd(), "backend") + os.pathsep + os.environ.get("PYTHONPATH", ""))')"
REPORT_DIR="$(mktemp -d)"
trap 'rm -f -- "$REPORT_DIR/.coverage" "$REPORT_DIR/coverage.json"; rmdir -- "$REPORT_DIR"' EXIT
export COVERAGE_FILE="$REPORT_DIR/.coverage"
status=0
"$PYTHON" -m coverage run --source=backend/app -m pytest -p no:cacheprovider tests "$@" || status=$?
"$PYTHON" -m coverage report -m
"$PYTHON" -m coverage json -o "$REPORT_DIR/coverage.json"
"$PYTHON" - "$REPORT_DIR/coverage.json" <<'PY'
import json, sys
from pathlib import Path
data = json.loads(Path(sys.argv[1]).read_text())["files"]
areas = {"fixtures": [], "scoring": [], "standings": [], "store": [], "roster": [], "rbac": []}
for filename, info in data.items():
    name = filename.replace("\\", "/")
    stem = Path(name).stem
    if stem == "__init__":
        continue
    area = ("rbac" if "/security/" in name or stem in {"rbac", "ping"} else
            "store" if stem in {"checkout", "inventory"} else
            "scoring" if stem in {"scoring", "events", "sports", "signing"} else
            stem if stem in areas else None)
    if area:
        areas[area].append(info["summary"])
report = {}
for area, files in areas.items():
    total = sum(f["num_statements"] for f in files)
    covered = sum(f["covered_lines"] for f in files)
    report[area] = round(100 * covered / total, 2) if total else 0.0
    if not total:
        print(f"{area}: no implementation measured; reporting 0.0, not a passing result")
Path("COVERAGE.json").write_text(json.dumps(report, indent=2)+"\n")
PY
exit "$status"
