#!/usr/bin/env python3
"""
Tests for handoff-resume.py

Run with: python3 -m pytest test_handoff_resume.py -v
"""

import json
import os
import tempfile
import subprocess
import sys
from pathlib import Path

import pytest


# Path to the script under test
SCRIPT_PATH = Path(__file__).parent / "handoff-resume.py"


def setup_git_repo(tmp_path: Path, branch: str = "main") -> Path:
    """Helper to create a proper git repository with specified branch.

    Returns the session_logs directory path.
    """
    # Initialize git repo with the specified branch name
    subprocess.run(
        ["git", "init", f"--initial-branch={branch}"],
        cwd=str(tmp_path),
        capture_output=True,
        check=True
    )
    subprocess.run(
        ["git", "config", "user.email", "test@test.com"],
        cwd=str(tmp_path),
        capture_output=True
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=str(tmp_path),
        capture_output=True
    )

    # Create initial commit (required for branch to show properly)
    readme = tmp_path / "README.md"
    readme.write_text("# Test")
    subprocess.run(["git", "add", "README.md"], cwd=str(tmp_path), capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=str(tmp_path),
        capture_output=True
    )

    # Create session_logs directory
    session_dir = tmp_path / "docs" / "active_tasks" / branch / "session_logs"
    session_dir.mkdir(parents=True)

    return session_dir


class TestHandoffResume:
    """Test the consolidated handoff-resume hook script."""

    def test_no_session_dir_exits_silently(self, tmp_path, monkeypatch):
        """When session_logs directory doesn't exist, exit silently with no output."""
        monkeypatch.chdir(tmp_path)
        # No docs/active_tasks/{branch}/session_logs exists

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        assert result.returncode == 0
        assert result.stdout.strip() == ""

    def test_no_handoff_files_exits_silently(self, tmp_path, monkeypatch):
        """When session_logs exists but has no handoff files, exit silently."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)
        # session_dir exists but is empty (no handoff files)

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        assert result.returncode == 0
        assert result.stdout.strip() == ""

    def test_finds_latest_handoff_by_timestamp(self, tmp_path, monkeypatch):
        """Should find the most recently modified handoff file."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        # Create older handoff
        old_handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "old-task",
            "progress_update": {
                "summary": "Old summary",
                "accomplished": ["old thing"],
                "next_steps": ["old step"],
                "decisions": [],
                "blockers": [],
                "confidence": "low",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {"last_commit": "abc123", "wip_state": "clean"}
        }
        old_file = session_dir / "2024-01-01-120000_handoff.json"
        old_file.write_text(json.dumps(old_handoff))

        # Create newer handoff (touch to ensure it's newer)
        import time
        time.sleep(0.1)

        new_handoff = {
            "version": "1.0",
            "timestamp": "2024-01-02-120000",
            "branch_name": "main",
            "task_name": "new-task",
            "progress_update": {
                "summary": "New summary",
                "accomplished": ["new thing"],
                "next_steps": ["new step"],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {"last_commit": "def456", "wip_state": "uncommitted"}
        }
        new_file = session_dir / "2024-01-02-120000_handoff.json"
        new_file.write_text(json.dumps(new_handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        assert result.returncode == 0
        output = json.loads(result.stdout)

        # Should reference the newer task
        assert "new-task" in output["systemMessage"]
        assert "new-task" in output["hookSpecificOutput"]["additionalContext"]

    def test_outputs_valid_hook_json_structure(self, tmp_path, monkeypatch):
        """Output must match Claude Code hook JSON schema."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path, branch="feature-branch")

        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "feature-branch",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "We did stuff",
                "accomplished": ["thing 1", "thing 2"],
                "next_steps": ["next 1"],
                "decisions": ["decided X"],
                "blockers": [],
                "confidence": "high",
                "risks": ["risk 1"]
            },
            "beads": {
                "workspace_label": "feature-branch",
                "task_count": 0,
                "epic_id": "none",
                "epic_title": "No Epic",
                "tasks": []
            },
            "context": {
                "last_commit": "abc123",
                "wip_state": "clean",
                "key_files": ["file1.py"]
            }
        }
        handoff_file = session_dir / "2024-01-01-120000_handoff.json"
        handoff_file.write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        assert result.returncode == 0
        output = json.loads(result.stdout)

        # Verify required hook structure
        assert "systemMessage" in output
        assert "hookSpecificOutput" in output
        assert "hookEventName" in output["hookSpecificOutput"]
        assert output["hookSpecificOutput"]["hookEventName"] == "SessionStart"
        assert "additionalContext" in output["hookSpecificOutput"]

    def test_system_message_contains_task_and_branch(self, tmp_path, monkeypatch):
        """systemMessage should have task name and branch for user visibility."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path, branch="my-feature")

        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "my-feature",
            "task_name": "Implement Widget",
            "progress_update": {
                "summary": "Working on widget",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "medium",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)

        assert "Implement Widget" in output["systemMessage"]
        assert "my-feature" in output["systemMessage"]

    def test_additional_context_contains_session_context_tag(self, tmp_path, monkeypatch):
        """additionalContext should wrap content in <session-context> tags."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test",
            "progress_update": {
                "summary": "Summary here",
                "accomplished": ["done"],
                "next_steps": ["todo"],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert ctx.startswith("<session-context>")
        assert ctx.endswith("</session-context>")

    def test_includes_progress_update_sections(self, tmp_path, monkeypatch):
        """additionalContext should include all progress update sections."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test",
            "progress_update": {
                "summary": "We made good progress today",
                "accomplished": ["Finished auth", "Added tests"],
                "next_steps": ["Deploy to staging", "Review PR"],
                "decisions": ["Use JWT tokens"],
                "blockers": ["Waiting on API keys"],
                "confidence": "medium",
                "risks": ["Timeline tight"]
            },
            "beads": {"tasks": []},
            "context": {"last_commit": "abc123", "wip_state": "uncommitted"}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        # Check all sections present
        assert "We made good progress today" in ctx
        assert "Finished auth" in ctx
        assert "Added tests" in ctx
        assert "Deploy to staging" in ctx
        assert "Use JWT tokens" in ctx
        assert "Waiting on API keys" in ctx
        assert "medium" in ctx.lower() or "Confidence" in ctx
        assert "Timeline tight" in ctx

    def test_handles_malformed_json_gracefully(self, tmp_path, monkeypatch):
        """Should exit silently if handoff JSON is malformed."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        # Write malformed JSON
        (session_dir / "2024-01-01-120000_handoff.json").write_text("{ invalid json }")

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        assert result.returncode == 0
        assert result.stdout.strip() == ""

    def test_ignores_archived_sessions(self, tmp_path, monkeypatch):
        """Should not load sessions from archive subdirectory."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)
        archive_dir = session_dir / "archive"
        archive_dir.mkdir()

        # Remove any existing handoff files from session_dir (setup_git_repo creates none, but be explicit)
        for f in session_dir.glob("*_handoff.json"):
            f.unlink()

        # Put handoff in archive only
        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Archived Task",
            "progress_update": {"summary": "Old", "accomplished": [], "next_steps": [], "decisions": [], "blockers": [], "confidence": "low", "risks": []},
            "beads": {"tasks": []},
            "context": {}
        }
        (archive_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        # Should exit silently - no active sessions
        assert result.returncode == 0
        assert result.stdout.strip() == ""


class TestV11SchemaFields:
    """Test v1.1 schema field handling."""

    def test_goal_field_appears_in_output(self, tmp_path, monkeypatch):
        """When 'goal' is present in handoff, it should appear in output."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary text",
                "goal": "Ship the authentication feature by EOD",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Goal" in ctx
        assert "Ship the authentication feature by EOD" in ctx

    def test_now_field_creates_active_work_section(self, tmp_path, monkeypatch):
        """When 'now' is present, output should contain 'Active Work (Resume Here)' section with bolded value."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary text",
                "now": "Implementing the login form validation",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "medium",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Active Work (Resume Here)" in ctx
        assert "**Implementing the login form validation**" in ctx

    def test_constraints_field_appears_in_output(self, tmp_path, monkeypatch):
        """When 'constraints' is present, it should appear in output."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary text",
                "constraints": ["Must use existing auth library", "No breaking API changes"],
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Constraints" in ctx
        assert "Must use existing auth library" in ctx
        assert "No breaking API changes" in ctx

    def test_open_questions_field_appears_in_output(self, tmp_path, monkeypatch):
        """When 'open_questions' is present, it should appear in output."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary text",
                "open_questions": ["Should we support OAuth?", "What timeout value to use?"],
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "medium",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Open Questions" in ctx
        assert "Should we support OAuth?" in ctx
        assert "What timeout value to use?" in ctx


class TestWorkingSetExtraction:
    """Test working_set field extraction for v1.1 schema."""

    def test_key_files_from_working_set(self, tmp_path, monkeypatch):
        """Test that key_files from working_set appears in output."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "working_set": {
                "key_files": ["src/auth.py", "tests/test_auth.py"],
                "active_ids": [],
                "recent_commands": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Working Set" in ctx
        assert "Key Files" in ctx
        assert "src/auth.py" in ctx
        assert "tests/test_auth.py" in ctx

    def test_active_ids_from_working_set(self, tmp_path, monkeypatch):
        """Test that active_ids from working_set appears in output."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "working_set": {
                "key_files": [],
                "active_ids": ["TASK-123", "BUG-456"],
                "recent_commands": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Active IDs" in ctx
        assert "TASK-123" in ctx
        assert "BUG-456" in ctx

    def test_recent_commands_from_working_set(self, tmp_path, monkeypatch):
        """Test that recent_commands from working_set appears in output."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "working_set": {
                "key_files": [],
                "active_ids": [],
                "recent_commands": ["npm test", "npm run build"]
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Recent Commands" in ctx
        assert "npm test" in ctx
        assert "npm run build" in ctx


class TestV10FallbackBehavior:
    """Test backward compatibility with v1.0 schema."""

    def test_fallback_to_context_key_files_when_no_working_set(self, tmp_path, monkeypatch):
        """When working_set is absent, should fall back to context.key_files (v1.0 compat)."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {
                "key_files": ["legacy_file.py", "old_test.py"],
                "last_commit": "abc123",
                "wip_state": "clean"
            }
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Key Files" in ctx
        assert "legacy_file.py" in ctx
        assert "old_test.py" in ctx

    def test_v10_handoff_produces_valid_output(self, tmp_path, monkeypatch):
        """v1.0 handoff files without new fields should still produce valid output."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        # Minimal v1.0 schema - no goal, now, constraints, open_questions, or working_set
        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Legacy Task",
            "progress_update": {
                "summary": "Legacy summary",
                "accomplished": ["Did something"],
                "next_steps": ["Do more"],
                "decisions": [],
                "blockers": [],
                "confidence": "medium",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {"last_commit": "abc123", "wip_state": "clean"}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        assert result.returncode == 0
        output = json.loads(result.stdout)

        # Verify structure is valid
        assert "systemMessage" in output
        assert "hookSpecificOutput" in output
        assert "additionalContext" in output["hookSpecificOutput"]

        ctx = output["hookSpecificOutput"]["additionalContext"]

        # Verify v1.0 content is present
        assert "Legacy Task" in output["systemMessage"]
        assert "Legacy summary" in ctx
        assert "Did something" in ctx
        assert "Do more" in ctx

    def test_v10_handoff_does_not_show_empty_v11_sections(self, tmp_path, monkeypatch):
        """v1.0 handoff should not show empty Goal, Active Work, Constraints, or Open Questions sections."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test",
            "progress_update": {
                "summary": "Summary",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {"tasks": []},
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        # These sections should NOT appear when their fields are empty
        assert "Active Work (Resume Here)" not in ctx
        # Goal section appears only when goal is set
        # Check that we don't have an empty "### Goal" section followed by nothing
        assert "### Goal\n\n" not in ctx


class TestBeadsConditionalRendering:
    """Test beads conditional rendering based on availability."""

    def test_beads_tasks_rendered_when_available_true(self, tmp_path, monkeypatch):
        """When beads.available is true (or unset), tasks should be rendered."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {
                "available": True,
                "tasks": [
                    {"id": "task-1", "title": "Implement feature", "completed": False, "status": "open"}
                ]
            },
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Beads Tasks" in ctx
        assert "Implement feature" in ctx
        assert "task-1" in ctx

    def test_beads_tasks_not_rendered_when_available_false(self, tmp_path, monkeypatch):
        """When beads.available is false, tasks section should not appear."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {
                "available": False,
                "tasks": [
                    {"id": "task-1", "title": "Should not appear", "completed": False, "status": "open"}
                ]
            },
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        assert "Beads Tasks" not in ctx
        assert "Should not appear" not in ctx

    def test_beads_available_defaults_true_for_v10_compat(self, tmp_path, monkeypatch):
        """When beads.available is not present (v1.0), should default to true."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path)

        handoff = {
            "version": "1.0",
            "timestamp": "2024-01-01-120000",
            "branch_name": "main",
            "task_name": "Test Task",
            "progress_update": {
                "summary": "Summary",
                "accomplished": [],
                "next_steps": [],
                "decisions": [],
                "blockers": [],
                "confidence": "high",
                "risks": []
            },
            "beads": {
                # No 'available' field - should default to true
                "tasks": [
                    {"id": "v10-task", "title": "V1.0 Task", "completed": False, "status": "open"}
                ]
            },
            "context": {}
        }
        (session_dir / "2024-01-01-120000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        output = json.loads(result.stdout)
        ctx = output["hookSpecificOutput"]["additionalContext"]

        # Tasks should be rendered since available defaults to true
        assert "Beads Tasks" in ctx
        assert "V1.0 Task" in ctx


class TestCompleteV11HandoffScenario:
    """Integration test for complete v1.1 handoff scenario."""

    def test_full_v11_handoff_with_all_fields(self, tmp_path, monkeypatch):
        """Test that a complete v1.1 handoff with all fields renders correctly."""
        monkeypatch.chdir(tmp_path)
        session_dir = setup_git_repo(tmp_path, branch="feature-auth")

        handoff = {
            "version": "1.1",
            "timestamp": "2024-01-15-143000",
            "branch_name": "feature-auth",
            "task_name": "Implement OAuth2 Authentication",
            "progress_update": {
                "summary": "Made good progress on OAuth2 integration with Google provider.",
                "goal": "Complete OAuth2 flow with refresh token handling",
                "constraints": [
                    "Must support existing session middleware",
                    "Cannot change database schema"
                ],
                "accomplished": [
                    "Implemented authorization endpoint",
                    "Added token exchange logic"
                ],
                "now": "Implementing refresh token rotation",
                "next_steps": [
                    "Add token refresh endpoint",
                    "Write integration tests",
                    "Update API documentation"
                ],
                "decisions": [
                    "Use PKCE for public clients",
                    "Store refresh tokens encrypted"
                ],
                "blockers": [
                    "Waiting on security review approval"
                ],
                "open_questions": [
                    "Should we support multiple OAuth providers?",
                    "Token expiry time for mobile vs web?"
                ],
                "confidence": "high",
                "risks": ["Security review might require changes"]
            },
            "working_set": {
                "key_files": [
                    "src/auth/oauth.py",
                    "src/auth/tokens.py",
                    "tests/test_oauth.py"
                ],
                "active_ids": ["AUTH-42", "AUTH-43"],
                "recent_commands": [
                    "pytest tests/test_oauth.py -v",
                    "flask run --debug"
                ]
            },
            "beads": {
                "available": True,
                "workspace_label": "feature-auth",
                "tasks": [
                    {"id": "auth-1", "title": "Setup OAuth config", "completed": True, "status": "closed"},
                    {"id": "auth-2", "title": "Implement token refresh", "completed": False, "status": "in_progress"}
                ]
            },
            "context": {
                "last_commit": "def789abc",
                "wip_state": "uncommitted"
            }
        }
        (session_dir / "2024-01-15-143000_handoff.json").write_text(json.dumps(handoff))

        result = subprocess.run(
            [sys.executable, str(SCRIPT_PATH)],
            capture_output=True,
            text=True,
            cwd=tmp_path
        )

        assert result.returncode == 0
        output = json.loads(result.stdout)

        # Check system message
        assert "Implement OAuth2 Authentication" in output["systemMessage"]
        assert "feature-auth" in output["systemMessage"]

        ctx = output["hookSpecificOutput"]["additionalContext"]

        # v1.1 specific fields
        assert "Goal" in ctx
        assert "Complete OAuth2 flow with refresh token handling" in ctx

        assert "Active Work (Resume Here)" in ctx
        assert "**Implementing refresh token rotation**" in ctx

        assert "Constraints" in ctx
        assert "Must support existing session middleware" in ctx

        assert "Open Questions" in ctx
        assert "Should we support multiple OAuth providers?" in ctx

        # Working set
        assert "Working Set" in ctx
        assert "src/auth/oauth.py" in ctx
        assert "AUTH-42" in ctx
        assert "pytest tests/test_oauth.py -v" in ctx

        # Standard fields still present
        assert "Implemented authorization endpoint" in ctx
        assert "Add token refresh endpoint" in ctx
        assert "Use PKCE for public clients" in ctx
        assert "Waiting on security review approval" in ctx
        assert "high" in ctx.lower()

        # Beads tasks
        assert "Beads Tasks" in ctx
        assert "Setup OAuth config" in ctx
        assert "Implement token refresh" in ctx


class TestCopyPluginReferences:
    """Test copy_plugin_references() function."""

    def test_copies_md_files_from_plugin_references_to_claude_spectre(self, tmp_path, monkeypatch):
        """Happy path: copies .md files from CLAUDE_PLUGIN_ROOT/references/ to .claude/spectre/."""
        # Import the function to test
        sys.path.insert(0, str(SCRIPT_PATH.parent))
        from importlib import import_module
        handoff_resume = import_module("handoff-resume")

        # Setup: create fake plugin root with references
        plugin_root = tmp_path / "plugin"
        references_dir = plugin_root / "references"
        references_dir.mkdir(parents=True)

        # Create test .md files
        (references_dir / "next_steps_guide.md").write_text("# Next Steps Guide\nContent here")
        (references_dir / "other_reference.md").write_text("# Other Reference\nMore content")

        # Setup project directory
        project_dir = tmp_path / "project"
        project_dir.mkdir()
        monkeypatch.chdir(project_dir)

        # Set environment variable
        monkeypatch.setenv("CLAUDE_PLUGIN_ROOT", str(plugin_root))

        # Execute
        handoff_resume.copy_plugin_references()

        # Verify
        spectre_dir = project_dir / ".claude" / "spectre"
        assert spectre_dir.exists()
        assert (spectre_dir / "next_steps_guide.md").exists()
        assert (spectre_dir / "other_reference.md").exists()
        assert (spectre_dir / "next_steps_guide.md").read_text() == "# Next Steps Guide\nContent here"

    def test_returns_early_when_plugin_root_not_set(self, tmp_path, monkeypatch):
        """Failure path: returns early without error when CLAUDE_PLUGIN_ROOT not set."""
        sys.path.insert(0, str(SCRIPT_PATH.parent))
        from importlib import import_module
        handoff_resume = import_module("handoff-resume")

        # Setup project directory
        project_dir = tmp_path / "project"
        project_dir.mkdir()
        monkeypatch.chdir(project_dir)

        # Ensure env var is NOT set
        monkeypatch.delenv("CLAUDE_PLUGIN_ROOT", raising=False)

        # Execute - should not raise
        handoff_resume.copy_plugin_references()

        # Verify - .claude/spectre should NOT be created
        spectre_dir = project_dir / ".claude" / "spectre"
        assert not spectre_dir.exists()

    def test_appends_to_gitignore_when_exists_and_claude_not_ignored(self, tmp_path, monkeypatch):
        """Appends .claude/spectre/ to .gitignore when it exists and .claude/ not already ignored."""
        sys.path.insert(0, str(SCRIPT_PATH.parent))
        from importlib import import_module
        handoff_resume = import_module("handoff-resume")

        # Setup plugin root with references
        plugin_root = tmp_path / "plugin"
        references_dir = plugin_root / "references"
        references_dir.mkdir(parents=True)
        (references_dir / "guide.md").write_text("# Guide")

        # Setup project with existing .gitignore
        project_dir = tmp_path / "project"
        project_dir.mkdir()
        gitignore = project_dir / ".gitignore"
        gitignore.write_text("node_modules/\n*.log\n")
        monkeypatch.chdir(project_dir)
        monkeypatch.setenv("CLAUDE_PLUGIN_ROOT", str(plugin_root))

        # Execute
        handoff_resume.copy_plugin_references()

        # Verify .gitignore was appended
        content = gitignore.read_text()
        assert ".claude/spectre/" in content
        assert "node_modules/" in content  # Original content preserved

    def test_skips_gitignore_when_claude_already_ignored(self, tmp_path, monkeypatch):
        """Does not modify .gitignore when .claude/ is already ignored."""
        sys.path.insert(0, str(SCRIPT_PATH.parent))
        from importlib import import_module
        handoff_resume = import_module("handoff-resume")

        # Setup plugin root with references
        plugin_root = tmp_path / "plugin"
        references_dir = plugin_root / "references"
        references_dir.mkdir(parents=True)
        (references_dir / "guide.md").write_text("# Guide")

        # Setup project with .gitignore that already has .claude/
        project_dir = tmp_path / "project"
        project_dir.mkdir()
        gitignore = project_dir / ".gitignore"
        original_content = "node_modules/\n.claude/\n*.log\n"
        gitignore.write_text(original_content)
        monkeypatch.chdir(project_dir)
        monkeypatch.setenv("CLAUDE_PLUGIN_ROOT", str(plugin_root))

        # Execute
        handoff_resume.copy_plugin_references()

        # Verify .gitignore was NOT modified
        assert gitignore.read_text() == original_content


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
