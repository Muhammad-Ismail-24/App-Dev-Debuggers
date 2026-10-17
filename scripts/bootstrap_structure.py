#!/usr/bin/env python3
"""Create documented repo directories without touching existing implementation files.

Run at the repo root AFTER the competition's permitted sprint start.
Does not scaffold a runnable app; Ismail and Zaheen generate their projects.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = [
    "backend/app/api/routes", "backend/app/core", "backend/app/db",
    "backend/app/schemas", "backend/app/services", "backend/app/security",
    "backend/app/workers", "mobile/src/api", "mobile/src/config",
    "mobile/src/navigation", "mobile/src/screens", "mobile/src/components",
    "mobile/src/storage", "mobile/src/sync", "mobile/src/security",
    "mobile/src/theme", "mobile/src/types", "tests/load", "tests/ui",
]
PACKAGE_DIRS = [
    "backend/app", "backend/app/api", "backend/app/api/routes",
    "backend/app/core", "backend/app/db", "backend/app/schemas",
    "backend/app/services", "backend/app/security", "backend/app/workers",
]


def main() -> None:
    for rel in DIRECTORIES:
        path = ROOT / rel
        path.mkdir(parents=True, exist_ok=True)
    for rel in PACKAGE_DIRS:
        path = ROOT / rel
        path.mkdir(parents=True, exist_ok=True)
        initializer = path / "__init__.py"
        if not initializer.exists():
            initializer.write_text("", encoding="utf-8")
    for rel in DIRECTORIES:
        path = ROOT / rel
        if not any(path.iterdir()):
            (path / ".gitkeep").touch(exist_ok=True)
    print("Directory structure ready; existing files preserved.")
    print("This is not a runnable backend or mobile application.")
    print("IMPORTANT: create and merge the native iOS project into mobile/; do not nest a second .git repo.")


if __name__ == "__main__":
    main()
