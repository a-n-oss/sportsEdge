import sys
from pathlib import Path
from xml.etree import ElementTree as ET

_PREFIX = "apps/api/"


def rewrite_cobertura_paths(report: Path, repo_root: Path) -> None:
    """Make pytest-cov Cobertura XML resolve against a monorepo-root Sonar scan.

    pytest --cov=. from apps/api emits ``<source>.../apps/api</source>`` and
    filenames like ``fetchers/espn.py``. Sonar indexes ``apps/api/fetchers/espn.py``
    from the repository root, so both the source directory and class filenames
    must be rewritten. A filename-only prefix (the old CI sed) leaves ``<source>``
    pointing at apps/api, so new-code coverage stays at 0%.
    """
    tree = ET.parse(report)
    root = tree.getroot()
    repo_root_str = str(repo_root)
    for source in root.findall(".//source"):
        source.text = repo_root_str
    for cls in root.findall(".//class"):
        filename = cls.get("filename")
        if filename and not filename.startswith(_PREFIX):
            cls.set("filename", f"{_PREFIX}{filename}")
    tree.write(report, encoding="utf-8", xml_declaration=True)


if __name__ == "__main__":
    rewrite_cobertura_paths(Path(sys.argv[1]), Path(sys.argv[2]))
