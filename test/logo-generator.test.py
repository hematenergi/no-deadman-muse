"""Argument validation must work before optional graphics imports or file writes."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class LogoArguments(unittest.TestCase):
    def test_configuration_in_clean_copy(self):
        source = Path(__file__).resolve().parents[1] / "assets" / "build-logo.py"
        with tempfile.TemporaryDirectory(prefix="ndm-logo-") as directory:
            root = Path(directory)
            script = root / source.name
            script.write_bytes(source.read_bytes())
            font = root / "example font.ttf"
            font.touch()
            cases = [
                (["--help"], 0, "--serif-font"),
                (["--serif-font", str(root / "missing.ttf"), "--tag-font", str(font)], 2, "font file not found"),
                (["--serif-font", str(font), "--tag-font", str(font), "--resvg", str(root / "missing-resvg")], 2, "resvg executable not found"),
            ]
            for args, code, message in cases:
                with self.subTest(args=args):
                    result = subprocess.run([sys.executable, str(script), *args], capture_output=True, text=True)
                    self.assertEqual(result.returncode, code, result.stderr)
                    self.assertIn(message, result.stdout + result.stderr)
                    self.assertEqual(set(root.iterdir()), {script, font})


if __name__ == "__main__":
    unittest.main()
