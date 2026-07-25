"""Generate or verify committed high-precision mathematical vectors."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from .vector_cases import build_invalid_document, build_reference_document


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
OUTPUTS = {
    REPOSITORY_ROOT / "test" / "vectors" / "curve_reference_v1.json": build_reference_document,
    REPOSITORY_ROOT / "test" / "vectors" / "invalid_domains_v1.json": build_invalid_document,
}


def _serialize(document: dict[str, Any]) -> str:
    return json.dumps(document, indent=2, sort_keys=True, ensure_ascii=True) + "\n"


def generate(check: bool) -> int:
    stale: list[Path] = []
    for path, builder in OUTPUTS.items():
        expected = _serialize(builder())
        if check:
            if not path.exists() or path.read_text(encoding="utf-8") != expected:
                stale.append(path.relative_to(REPOSITORY_ROOT))
            continue
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(expected, encoding="utf-8", newline="\n")

    if stale:
        print("Reference vectors are missing or stale:", file=sys.stderr)
        for path in stale:
            print(f"  - {path}", file=sys.stderr)
        print(
            "Regenerate with: python3 -m tools.reference.generate_vectors",
            file=sys.stderr,
        )
        return 1
    if check:
        print(f"Verified {len(OUTPUTS)} deterministic reference vector files.")
    else:
        print(f"Generated {len(OUTPUTS)} reference vector files.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="fail instead of writing when committed vector files differ",
    )
    arguments = parser.parse_args()
    return generate(arguments.check)


if __name__ == "__main__":
    raise SystemExit(main())
