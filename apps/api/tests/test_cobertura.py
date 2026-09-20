from pathlib import Path
from xml.etree import ElementTree as ET

from core.cobertura import rewrite_cobertura_paths


def test_rewrite_cobertura_paths_points_sonar_at_repo_root(tmp_path: Path):
    report = tmp_path / "coverage.xml"
    report.write_text(
        """<?xml version="1.0" ?>
<coverage>
  <sources>
    <source>/workspace/apps/api</source>
  </sources>
  <packages>
    <package name=".">
      <classes>
        <class name="espn.py" filename="fetchers/espn.py"/>
        <class name="schedule.py" filename="fetchers/schedule.py"/>
        <class name="endpoints.py" filename="api/v1/endpoints.py"/>
      </classes>
    </package>
  </packages>
</coverage>
""",
        encoding="utf-8",
    )

    rewrite_cobertura_paths(report, repo_root=Path("/workspace"))

    root = ET.parse(report).getroot()
    source = root.find(".//source")
    assert source is not None
    assert source.text == "/workspace"
    filenames = [cls.get("filename") for cls in root.findall(".//class")]
    assert filenames == [
        "apps/api/fetchers/espn.py",
        "apps/api/fetchers/schedule.py",
        "apps/api/api/v1/endpoints.py",
    ]


def test_rewrite_cobertura_paths_does_not_double_prefix(tmp_path: Path):
    report = tmp_path / "coverage.xml"
    report.write_text(
        """<?xml version="1.0" ?>
<coverage>
  <sources>
    <source>/workspace</source>
  </sources>
  <packages>
    <package name=".">
      <classes>
        <class name="espn.py" filename="apps/api/fetchers/espn.py"/>
      </classes>
    </package>
  </packages>
</coverage>
""",
        encoding="utf-8",
    )

    rewrite_cobertura_paths(report, repo_root=Path("/workspace"))

    root = ET.parse(report).getroot()
    filenames = [cls.get("filename") for cls in root.findall(".//class")]
    assert filenames == ["apps/api/fetchers/espn.py"]
