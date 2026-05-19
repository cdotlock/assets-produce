# skills/episode-writer/tests/conftest.py
"""Allow `import audit_bg_refs` from the parent skills/episode-writer/ dir."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
