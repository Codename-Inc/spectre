"""Agent execution with sandbox isolation and JSONL streaming.

This module provides functionality to run agents using the Codex CLI
with proper sandbox isolation and credential management.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from cli.shared.discovery import debug, load_agent_instructions

if TYPE_CHECKING:
    from cli.shared.discovery import AgentSource

# Directory for subagent credential sync (relative to workspace root)
SUBAGENT_CODEX_HOME = ".spectre/codex-subagent"

# Valid agent name pattern: alphanumeric, hyphen, underscore, colon (for namespaced agents)
AGENT_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_:-]+$")


def validate_agent_name(name: str) -> None:
    """Validate agent name to prevent path traversal attacks.

    Supports namespaced agents like 'spectre:dev'.
    Raises ValueError if name contains unsafe characters.
    """
    if not name:
        raise ValueError("Agent name cannot be empty")
    if not AGENT_NAME_PATTERN.match(name):
        raise ValueError(
            f"Invalid agent name '{name}': must contain only alphanumeric, "
            "hyphen, underscore, or colon characters"
        )
    if name.startswith("-") or name.startswith(":"):
        raise ValueError(f"Invalid agent name '{name}': cannot start with hyphen or colon")


# Guidance prepended to prevent recursive subagent calls
SUBAGENT_GUIDANCE = """\
You ARE the {agent_name} agent executing a task. You are NOT a dispatcher.

CRITICAL CONSTRAINTS:
- Do NOT spawn subagents or call run_subagent.py
- Do NOT delegate to other agents
- Execute the task directly using your own capabilities
- If the task is outside your expertise, say so and stop

Your role: Follow the instructions below and complete the user's task directly.
"""


@dataclass
class AgentResult:
    """Result from running a subagent."""

    agent: str
    output: str
    returncode: int
    elapsed: float
    error: str | None = None


def _safe_copy_file(src: Path, dst: Path) -> bool:
    """Safely copy a file, rejecting symlinks to prevent symlink attacks.

    Returns True if file was copied, False if skipped.
    """
    # Security: Reject symlinks to prevent symlink attacks
    if src.is_symlink():
        debug(f"Skipping symlink: {src}")
        return False

    # Only copy regular files that exist
    if not src.is_file():
        return False

    try:
        shutil.copy2(src, dst)
        return True
    except (OSError, shutil.Error) as e:
        debug(f"Failed to copy {src}: {e}")
        return False


def _ensure_gitignore_entry(directory: str) -> bool:
    """Ensure a directory is in .gitignore.

    Adds the entry if .gitignore exists and doesn't already contain it.
    Creates .gitignore if in a git repo but file doesn't exist.

    Returns True if entry was added, False otherwise.
    """
    gitignore_path = Path.cwd() / ".gitignore"
    git_dir = Path.cwd() / ".git"

    # Only modify if we're in a git repo
    if not git_dir.exists():
        return False

    entry = f"{directory}/"

    # Check if .gitignore exists and already has the entry
    if gitignore_path.exists():
        try:
            content = gitignore_path.read_text()
            # Check for exact entry (with or without trailing slash)
            lines = content.splitlines()
            for line in lines:
                line = line.strip()
                if line == directory or line == entry or line == f"/{directory}" or line == f"/{entry}":
                    return False  # Already present
        except OSError:
            return False

        # Append entry
        try:
            with open(gitignore_path, "a") as f:
                # Add newline if file doesn't end with one
                if content and not content.endswith("\n"):
                    f.write("\n")
                f.write(f"{entry}\n")
            debug(f"Added {entry} to .gitignore")
            return True
        except OSError:
            return False
    else:
        # Create .gitignore with the entry
        try:
            gitignore_path.write_text(f"{entry}\n")
            debug(f"Created .gitignore with {entry}")
            return True
        except OSError:
            return False


def setup_codex_home() -> Path:
    """Sync Codex credentials to workspace for sandboxed subagent execution.

    Copies config.toml and auth.json from ~/.codex to .spectre/codex-subagent/
    so child processes can authenticate while running in sandbox mode.

    Also ensures .spectre/ is in .gitignore (auto-adds if missing).

    Security: Rejects symlinks to prevent symlink attacks.

    Returns the absolute path to the workspace CODEX_HOME directory.
    """
    workspace_home = Path.cwd() / SUBAGENT_CODEX_HOME
    workspace_home.mkdir(parents=True, exist_ok=True)

    # Ensure .spectre/ is gitignored
    _ensure_gitignore_entry(".spectre")

    user_codex_home = Path.home() / ".codex"

    # Copy config.toml (model settings, preferences)
    config_src = user_codex_home / "config.toml"
    if _safe_copy_file(config_src, workspace_home / "config.toml"):
        debug(f"Synced config.toml to {workspace_home}")

    # Copy auth.json (API credentials when logged in via `codex auth`)
    auth_src = user_codex_home / "auth.json"
    if _safe_copy_file(auth_src, workspace_home / "auth.json"):
        debug(f"Synced auth.json to {workspace_home}")

    return workspace_home.absolute()


def build_payload(agent_name: str, instructions: str, task: str) -> dict:
    """Build the JSON payload for codex exec."""
    guidance = SUBAGENT_GUIDANCE.format(agent_name=agent_name)
    combined_instructions = f"{guidance}\n---\n\n{instructions}"

    return {
        "instructions": combined_instructions,
        "task": task,
        "metadata": {
            "agentName": agent_name,
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }


def extract_agent_messages(jsonl_lines: list[str]) -> str:
    """Extract all agent_message text from JSONL events.

    Parses Codex JSONL output and concatenates all agent_message items
    to produce the complete response text.

    Args:
        jsonl_lines: List of JSONL event strings from codex exec --json

    Returns:
        Concatenated text from all agent_message items, joined by newlines.
    """
    messages: list[str] = []

    for line in jsonl_lines:
        line = line.strip()
        if not line:
            continue

        try:
            event = json.loads(line)
        except json.JSONDecodeError:
            continue

        # Look for item.completed events with type: agent_message
        if event.get("type") == "item.completed":
            item = event.get("item", {})
            if item.get("type") == "agent_message":
                text = item.get("text", "")
                if text:
                    messages.append(text)

    return "\n\n".join(messages)


def build_vanilla_payload(task: str) -> dict:
    """Build the JSON payload for vanilla codex exec (no custom instructions)."""
    return {
        "task": task,
        "metadata": {
            "agentName": "codex",
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }


def run_vanilla(
    task: str,
    output_format: str = "text",
    timeout: int = 600,
    enable_debug: bool = False,
    codex_bin: str = "codex",
) -> int:
    """Run vanilla Codex without custom agent instructions."""
    payload = build_vanilla_payload(task)

    debug("Running vanilla Codex (no agent instructions)")

    # Setup sandboxed CODEX_HOME with synced credentials
    codex_home = setup_codex_home()
    debug(f"CODEX_HOME: {codex_home}")

    result = _run_codex_sync(
        payload=payload,
        codex_bin=codex_bin,
        codex_home=codex_home,
        timeout=timeout,
        output_format=output_format,
        enable_debug=enable_debug,
    )

    if result.error:
        print(f"Error: {result.error}", file=sys.stderr)
        return 1

    if output_format == "jsonl":
        # Final summary event
        print(json.dumps({
            "type": "complete",
            "agent": "codex",
            "elapsed": result.elapsed,
            "returncode": result.returncode,
        }))
    else:
        if result.output:
            print(result.output)

    return result.returncode


def run_agent(
    agent_path: Path,
    task: str,
    output_format: str = "text",
    timeout: int = 600,
    enable_debug: bool = False,
    codex_bin: str = "codex",
) -> int:
    """Run a single agent and return exit code."""
    agent_name = agent_path.stem
    instructions = load_agent_instructions(agent_path)
    payload = build_payload(agent_name, instructions, task)

    debug(f"Loading agent: {agent_path}")
    debug(f"Agent instructions: {len(instructions)} chars")

    # Setup sandboxed CODEX_HOME with synced credentials
    codex_home = setup_codex_home()
    debug(f"CODEX_HOME: {codex_home}")

    result = _run_codex_sync(
        payload=payload,
        codex_bin=codex_bin,
        codex_home=codex_home,
        timeout=timeout,
        output_format=output_format,
        enable_debug=enable_debug,
    )

    if result.error:
        print(f"Error: {result.error}", file=sys.stderr)
        return 1

    if output_format == "jsonl":
        # Final summary event
        print(json.dumps({
            "type": "complete",
            "agent": result.agent,
            "elapsed": result.elapsed,
            "returncode": result.returncode,
        }))
    else:
        if result.output:
            print(result.output)

    return result.returncode


def _run_codex_sync(
    payload: dict,
    codex_bin: str,
    codex_home: Path,
    timeout: int,
    output_format: str,
    enable_debug: bool,
) -> AgentResult:
    """Run codex exec synchronously in sandbox mode.

    Always runs with --output-format stream-json flag for reliable structured output.
    For text mode, parses JSONL and extracts agent messages.
    For jsonl mode, streams events directly to stdout.
    """
    start_time = time.time()
    agent_name = payload.get("metadata", {}).get("agentName", "subagent")
    stream_jsonl = output_format == "jsonl"

    debug(f"Running {agent_name} (sandbox: workspace-write)")

    # Build environment with CODEX_HOME override
    env = os.environ.copy()
    if "CODEX_HOME" in env:
        debug(f"Overriding existing CODEX_HOME: {env['CODEX_HOME']}")
    env["CODEX_HOME"] = str(codex_home)

    # Always use stream-json for reliable structured output
    cmd = [codex_bin, "exec", "--sandbox", "workspace-write", "--json"]

    debug(f"Command: {' '.join(cmd)}")

    try:
        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            env=env,
        )
    except FileNotFoundError:
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=1,
            elapsed=0,
            error=f"Codex CLI not found: {codex_bin}",
        )
    except OSError as e:
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=1,
            elapsed=0,
            error=f"Failed to start subprocess: {e}",
        )

    if proc.stdin is None or proc.stdout is None or proc.stderr is None:
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=1,
            elapsed=0,
            error="Failed to open subprocess pipes",
        )

    # Build prompt from payload
    prompt = payload.get("task", "")
    if payload.get("instructions"):
        prompt = f"{payload['instructions']}\n\n---\n\nTask: {prompt}"

    debug(f"Prompt size: {len(prompt)} bytes")

    # Send prompt
    proc.stdin.write(prompt)
    proc.stdin.flush()
    proc.stdin.close()

    # Collect JSONL lines (for text extraction) or stream them (for jsonl mode)
    jsonl_lines: list[str] = []

    try:
        for line in proc.stdout:
            line = line.strip()
            if line:
                if stream_jsonl:
                    # Stream directly to stdout
                    print(line, flush=True)
                else:
                    # Collect for text extraction
                    jsonl_lines.append(line)

        proc.wait(timeout=timeout)
        returncode = proc.returncode or 0
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.communicate()
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=-1,
            elapsed=time.time() - start_time,
            error=f"Timeout after {timeout}s",
        )

    elapsed = time.time() - start_time
    debug(f"Completed in {elapsed:.1f}s, exit code: {returncode}")

    if stream_jsonl:
        # Already streamed, no output to return
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=returncode,
            elapsed=elapsed,
        )
    else:
        # Extract agent messages from collected JSONL
        final_output = extract_agent_messages(jsonl_lines)
        return AgentResult(
            agent=agent_name,
            output=final_output,
            returncode=returncode,
            elapsed=elapsed,
        )


def parse_agent_task_pair(pair: str) -> tuple[str, str]:
    """Parse 'agent:task' or 'agent:"task with spaces"' format.

    Supports namespaced agents like 'spectre:dev:"task here"'.
    Validates agent names to prevent path traversal attacks.
    Raises ValueError if format is invalid or agent name is unsafe.
    """
    agent: str | None = None
    task: str | None = None

    # Handle quoted task: agent:"task here" or spectre:dev:"task here"
    # Use greedy match (.+) to capture namespaced agents up to last :"
    match = re.match(r'^(.+):"(.+)"$', pair)
    if match:
        agent, task = match.group(1), match.group(2)

    # Handle quoted task with single quotes: agent:'task here'
    if agent is None:
        match = re.match(r"^(.+):'(.+)'$", pair)
        if match:
            agent, task = match.group(1), match.group(2)

    # Simple split on last colon for unquoted tasks (requires no colons in task)
    if agent is None and ":" in pair:
        # For namespaced agents, split on last colon
        last_colon = pair.rfind(":")
        agent, task = pair[:last_colon], pair[last_colon + 1:]

    if agent is None or task is None:
        raise ValueError(f"Invalid agent:task format: {pair}")

    # Strip whitespace
    agent = agent.strip()
    task = task.strip()

    # Security: Validate agent name
    validate_agent_name(agent)

    if not task:
        raise ValueError(f"Task cannot be empty for agent '{agent}'")

    return agent, task


def run_parallel(
    jobs: list[tuple[str, str]],
    sources: list["AgentSource"],
    output_format: str = "text",
    timeout: int = 600,
    enable_debug: bool = False,
    codex_bin: str = "codex",
) -> int:
    """Run multiple agents in parallel.

    Args:
        jobs: List of (agent_name, task) tuples - no parsing needed.
        sources: Agent discovery sources.
        output_format: 'text' or 'jsonl'.
        timeout: Timeout in seconds per agent.
        enable_debug: Enable debug logging.
        codex_bin: Path to codex executable.
    """
    from cli.shared.discovery import find_agent

    # Validate and resolve agent paths
    requests: list[tuple[str, str, Path]] = []
    for agent, task in jobs:
        # Validate agent name
        try:
            validate_agent_name(agent)
        except ValueError as e:
            print(f"Error: {e}", file=sys.stderr)
            return 1

        result = find_agent(agent, sources)
        if not result:
            print(f"Error: Agent '{agent}' not found", file=sys.stderr)
            return 1

        agent_path, _ = result
        requests.append((agent, task, agent_path))

    if not requests:
        print("Error: No agent:task pairs provided", file=sys.stderr)
        return 1

    debug(f"Running {len(requests)} agents in parallel")

    # Setup sandboxed CODEX_HOME (shared by all agents)
    codex_home = setup_codex_home()

    start_time = time.time()
    all_results: list[AgentResult] = []

    def on_result(result: AgentResult, agent_id: str) -> None:
        """Handle result as soon as agent completes."""
        all_results.append(result)

        if output_format == "jsonl":
            print(json.dumps({
                "agent_id": agent_id,
                "agent_name": result.agent,
                "event": {
                    "type": "complete",
                    "output": result.output,
                    "elapsed": result.elapsed,
                    "returncode": result.returncode,
                    "error": result.error,
                },
            }))
        else:
            print(f"\n{'='*60}")
            print(f"[{result.agent}] (completed in {result.elapsed:.1f}s)")
            print("=" * 60)
            if result.error:
                print(f"Error: {result.error}")
            elif result.output:
                print(result.output)
            sys.stdout.flush()

    asyncio.run(
        _run_parallel_async(
            requests=requests,
            codex_bin=codex_bin,
            codex_home=codex_home,
            timeout=timeout,
            output_format=output_format,
            on_complete=on_result,
        )
    )

    wall_time = time.time() - start_time
    total_agent_time = sum(r.elapsed for r in all_results)

    if output_format == "text":
        print(
            f"\n[spectre] All complete. Wall time: {wall_time:.1f}s, "
            f"Total agent time: {total_agent_time:.1f}s",
            file=sys.stderr,
        )

    return max((r.returncode for r in all_results), default=0)


async def _run_parallel_async(
    requests: list[tuple[str, str, Path]],
    codex_bin: str,
    codex_home: Path,
    timeout: int,
    output_format: str,
    on_complete,
) -> list[AgentResult]:
    """Run multiple agents in parallel using asyncio."""
    # Create tasks and track agent_ids
    task_list: list[asyncio.Task] = []
    agent_ids: list[str] = []

    for idx, (agent_name, task, agent_path) in enumerate(requests):
        instructions = load_agent_instructions(agent_path)
        payload = build_payload(agent_name, instructions, task)
        agent_id = f"{agent_name}-{idx}"

        coro = _run_codex_async(
            payload=payload,
            codex_bin=codex_bin,
            codex_home=codex_home,
            timeout=timeout,
            output_format=output_format,
            agent_id=agent_id,
        )
        task_obj = asyncio.create_task(coro)
        task_list.append(task_obj)
        agent_ids.append(agent_id)

    # Create mapping from task identity to agent_id
    task_to_agent: dict[int, str] = {id(t): aid for t, aid in zip(task_list, agent_ids)}

    results = []
    # Use gather with return_exceptions to get all results
    done_tasks = await asyncio.gather(*task_list, return_exceptions=True)

    for task_obj, result_or_exc in zip(task_list, done_tasks):
        agent_id = task_to_agent[id(task_obj)]

        if isinstance(result_or_exc, Exception):
            # Handle exception case
            result = AgentResult(
                agent=agent_id.rsplit("-", 1)[0],  # Extract agent name
                output="",
                returncode=1,
                elapsed=0,
                error=str(result_or_exc),
            )
        else:
            result = result_or_exc

        results.append(result)
        on_complete(result, agent_id)

    return results


async def _run_codex_async(
    payload: dict,
    codex_bin: str,
    codex_home: Path,
    timeout: int,
    output_format: str,
    agent_id: str,
) -> AgentResult:
    """Run codex exec asynchronously in sandbox mode.

    Always runs with --output-format stream-json flag for reliable structured output.
    For text mode, parses JSONL and extracts agent messages.
    For jsonl mode, streams events with agent_id tagging.
    """
    start_time = time.time()
    agent_name = payload.get("metadata", {}).get("agentName", "subagent")
    stream_jsonl = output_format == "jsonl"

    # Build environment with CODEX_HOME override
    env = os.environ.copy()
    if "CODEX_HOME" in env:
        debug(f"Overriding existing CODEX_HOME: {env['CODEX_HOME']}")
    env["CODEX_HOME"] = str(codex_home)

    # Always use stream-json for reliable structured output
    cmd = [codex_bin, "exec", "--sandbox", "workspace-write", "--json"]

    # Use 1 MiB buffer to handle large JSONL lines (file contents, long responses)
    # Default is 64 KiB which causes LimitOverrunError on large outputs
    buffer_limit = 1024 * 1024  # 1 MiB

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            limit=buffer_limit,
        )
    except FileNotFoundError:
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=1,
            elapsed=0,
            error=f"Codex CLI not found: {codex_bin}",
        )
    except OSError as e:
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=1,
            elapsed=0,
            error=f"Failed to start subprocess: {e}",
        )

    # Build prompt from payload
    prompt = payload.get("task", "")
    if payload.get("instructions"):
        prompt = f"{payload['instructions']}\n\n---\n\nTask: {prompt}"

    # Send prompt
    proc.stdin.write(prompt.encode())
    await proc.stdin.drain()
    proc.stdin.close()

    # Collect JSONL lines (for text extraction) or stream them (for jsonl mode)
    jsonl_lines: list[str] = []

    try:
        while True:
            try:
                line = await asyncio.wait_for(
                    proc.stdout.readline(),
                    timeout=timeout,
                )
                if not line:
                    break
                line_str = line.decode().strip()
                if line_str:
                    if stream_jsonl:
                        # Tag each event with agent_id and stream
                        try:
                            event = json.loads(line_str)
                            tagged = {
                                "agent_id": agent_id,
                                "agent_name": agent_name,
                                "event": event,
                            }
                            print(json.dumps(tagged), flush=True)
                        except json.JSONDecodeError:
                            # Pass through non-JSON lines
                            print(line_str, flush=True)
                    else:
                        # Collect for text extraction
                        jsonl_lines.append(line_str)
            except asyncio.TimeoutError:
                proc.kill()
                return AgentResult(
                    agent=agent_name,
                    output="",
                    returncode=-1,
                    elapsed=time.time() - start_time,
                    error=f"Timeout after {timeout}s",
                )

        await proc.wait()
        returncode = proc.returncode or 0

    except asyncio.TimeoutError:
        proc.kill()
        await proc.communicate()
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=-1,
            elapsed=time.time() - start_time,
            error=f"Timeout after {timeout}s",
        )

    if stream_jsonl:
        # Already streamed, no output to return
        final_output = ""
    else:
        # Extract agent messages from collected JSONL
        final_output = extract_agent_messages(jsonl_lines)

    return AgentResult(
        agent=agent_name,
        output=final_output,
        returncode=returncode,
        elapsed=time.time() - start_time,
    )
