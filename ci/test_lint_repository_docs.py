#!/usr/bin/env python3

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from lint_repository_docs import Record, RepositoryDocsLinter


class RepositoryDocsLinterTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = TemporaryDirectory()
        self.repository = Path(self.temporary_directory.name).resolve()
        self.action_path = (
            self.repository / ".agents" / "v-model" / "verification" / "actions.md"
        )
        self.action_path.parent.mkdir(parents=True)
        self.action_path.write_text("# Actions\n", encoding="utf-8")

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def _linter(self) -> RepositoryDocsLinter:
        return RepositoryDocsLinter(self.repository, [])

    def _record(self, status: str, evidence: str) -> Record:
        return Record(
            "UNITV-001",
            "Fixture",
            self.action_path,
            1,
            {"status": status, "evidence": evidence},
            {"status": 2, "evidence": 3},
        )

    @staticmethod
    def _codes(linter: RepositoryDocsLinter) -> set[str]:
        return {finding.code for finding in linter.errors}

    def test_implemented_requires_existing_repository_file(self) -> None:
        linter = self._linter()
        linter._validate_action_evidence(
            self._record("implemented", "`definitely-not-an-artifact`"),
            "implemented",
        )
        self.assertIn(
            "implemented_without_repository_evidence",
            self._codes(linter),
        )

    def test_implemented_accepts_existing_repository_file(self) -> None:
        evidence = self.repository / "reports" / "inspection.md"
        evidence.parent.mkdir()
        evidence.write_text("# Inspection\n", encoding="utf-8")
        linter = self._linter()
        linter._validate_action_evidence(
            self._record("implemented", "`reports/inspection.md`"),
            "implemented",
        )
        self.assertEqual([], linter.errors)

    def test_passing_rejects_nonexecutable_repository_file(self) -> None:
        evidence = self.repository / "reports" / "run.md"
        evidence.parent.mkdir()
        evidence.write_text("# Run\n", encoding="utf-8")
        linter = self._linter()
        linter._validate_action_evidence(
            self._record("passing", "`reports/run.md`"),
            "passing",
        )
        self.assertIn(
            "passing_without_executable_evidence",
            self._codes(linter),
        )

    def test_passing_rejects_arbitrary_backticked_text(self) -> None:
        linter = self._linter()
        linter._validate_action_evidence(
            self._record("passing", "`definitely-not-an-artifact`"),
            "passing",
        )
        self.assertIn(
            "passing_without_executable_evidence",
            self._codes(linter),
        )

    def test_passing_accepts_runner_executable_test_source(self) -> None:
        evidence = self.repository / "gui" / "tests" / "unit" / "codec.test.js"
        evidence.parent.mkdir(parents=True)
        evidence.write_text("test('codec', () => {})\n", encoding="utf-8")
        linter = self._linter()
        linter._validate_action_evidence(
            self._record(
                "passing",
                "[codec](../../../gui/tests/unit/codec.test.js)",
            ),
            "passing",
        )
        self.assertEqual([], linter.errors)

    def test_missing_target_fragment_is_an_error(self) -> None:
        target = self.repository / "target.md"
        target.write_text("# Existing heading\n", encoding="utf-8")
        source = self.repository / "source.md"
        source.write_text("[missing](target.md#missing-heading)\n", encoding="utf-8")
        linter = self._linter()
        linter._check_links([source])
        self.assertIn("broken_link_fragment", self._codes(linter))

    def test_missing_same_document_fragment_is_an_error(self) -> None:
        source = self.repository / "source.md"
        source.write_text(
            "# Existing heading\n\n[missing](#missing-heading)\n",
            encoding="utf-8",
        )
        linter = self._linter()
        linter._check_links([source])
        self.assertIn("broken_link_fragment", self._codes(linter))

    def test_github_heading_and_duplicate_fragments_are_accepted(self) -> None:
        target = self.repository / "target.md"
        target.write_text(
            "# GUI/API & MCP\n\n## Repeated\n\n## Repeated\n",
            encoding="utf-8",
        )
        source = self.repository / "source.md"
        source.write_text(
            "[punctuation](target.md#guiapi--mcp)\n"
            "[first](target.md#repeated)\n"
            "[second](target.md#repeated-1)\n",
            encoding="utf-8",
        )
        linter = self._linter()
        linter._check_links([source])
        self.assertEqual([], linter.errors)


if __name__ == "__main__":
    unittest.main()
