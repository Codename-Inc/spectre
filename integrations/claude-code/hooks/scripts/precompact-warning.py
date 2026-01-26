#!/usr/bin/env python3
"""
precompact-warning.py

PreCompact hook that suggests using /sesh:handoff + /clear
instead of auto-compact for better context continuity.
"""

import json
import sys


def main():
    """Show warning when auto-compact triggers."""
    output = {
        "systemMessage": (
            "⚠️ Auto-compact can cause context loss. "
            "For full continuity: /sesh:handoff → /clear → new session. "
            "Consider disabling auto-compact in /config."
        )
    }

    print(json.dumps(output, ensure_ascii=False))
    sys.exit(0)


if __name__ == "__main__":
    main()
