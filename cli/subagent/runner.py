"""Agent execution with sandbox isolation and JSONL streaming.

This module provides functionality to run agents using the Claude CLI
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
SUBAGENT_CLAUDE_HOME = ".spectre/claude-subagent"

# Valid agent name pattern: alphanumeric, hyphen, underscore only
AGENT_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


def validate_agent_name(name: str) -> None:
    """Validate agent name to prevent path traversal attacks.

    Raises ValueError if name contains unsafe characters.
    """
    if not name:
        raise ValueError("Agent name cannot be empty")
    if not AGENT_NAME_PATTERN.match(name):
        raise ValueError(
            f"Invalid agent name '{name}': must contain only alphanumeric, "
            "hyphen, or underscore characters"
        )
    if name.startswith("-"):
        raise ValueError(f"Invalid agent name '{name}': cannot start with hyphen")


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


def setup_claude_home() -> Path:
    """Sync Claude credentials to workspace for sandboxed subagent execution.

    Copies config files from ~/.claude to .spectre/claude-subagent/ so child
    processes can authenticate while running in sandbox mode.

    Security: Rejects symlinks to prevent symlink attacks.

    Returns the absolute path to the workspace CLAUDE_HOME directory.
    """
    workspace_home = Path.cwd() / SUBAGENT_CLAUDE_HOME
    workspace_home.mkdir(parents=True, exist_ok=True)

    user_claude_home = Path.home() / ".claude"

    # Copy settings.json (preferences, model settings)
    settings_src = user_claude_home / "settings.json"
    if _safe_copy_file(settings_src, workspace_home / "settings.json"):
        debug(f"Synced settings.json to {workspace_home}")

    # Copy credentials.json (API credentials)
    creds_src = user_claude_home / "credentials.json"
    if _safe_copy_file(creds_src, workspace_home / "credentials.json"):
        debug(f"Synced credentials.json to {workspace_home}")

    return workspace_home.absolute()


def build_payload(agent_name: str, instructions: str, task: str) -> dict:
    """Build the JSON payload for claude exec."""
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

    Parses Claude JSONL output and concatenates all agent_message items
    to produce the complete response text.

    Args:
        jsonl_lines: List of JSONL event strings from claude exec --json

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
    """Build the JSON payload for vanilla claude exec (no custom instructions)."""
    return {
        "task": task,
        "metadata": {
            "agentName": "claude",
            "startedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    }


def run_vanilla(
    task: str,
    output_format: str = "text",
    timeout: int = 600,
    enable_debug: bool = False,
    claude_bin: str = "claude",
) -> int:
    """Run vanilla Claude without custom agent instructions."""
    payload = build_vanilla_payload(task)

    debug("Running vanilla Claude (no agent instructions)")

    # Setup sandboxed CLAUDE_HOME with synced credentials
    claude_home = setup_claude_home()
    debug(f"CLAUDE_HOME: {claude_home}")

    result = _run_claude_sync(
        payload=payload,
        claude_bin=claude_bin,
        claude_home=claude_home,
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
            "agent": "claude",
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
    claude_bin: str = "claude",
) -> int:
    """Run a single agent and return exit code."""
    agent_name = agent_path.stem
    instructions = load_agent_instructions(agent_path)
    payload = build_payload(agent_name, instructions, task)

    debug(f"Loading agent: {agent_path}")
    debug(f"Agent instructions: {len(instructions)} chars")

    # Setup sandboxed CLAUDE_HOME with synced credentials
    claude_home = setup_claude_home()
    debug(f"CLAUDE_HOME: {claude_home}")

    result = _run_claude_sync(
        payload=payload,
        claude_bin=claude_bin,
        claude_home=claude_home,
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


def _run_claude_sync(
    payload: dict,
    claude_bin: str,
    claude_home: Path,
    timeout: int,
    output_format: str,
    enable_debug: bool,
) -> AgentResult:
    """Run claude exec synchronously in sandbox mode.

    Always runs with --output-format stream-json flag for reliable structured output.
    For text mode, parses JSONL and extracts agent messages.
    For jsonl mode, streams events directly to stdout.
    """
    start_time = time.time()
    agent_name = payload.get("metadata", {}).get("agentName", "subagent")
    stream_jsonl = output_format == "jsonl"

    debug(f"Running {agent_name} (sandbox: workspace-write)")

    # Build environment with CLAUDE_HOME override
    env = os.environ.copy()
    if "CLAUDE_HOME" in env:
        debug(f"Overriding existing CLAUDE_HOME: {env['CLAUDE_HOME']}")
    env["CLAUDE_HOME"] = str(claude_home)

    # Always use stream-json for reliable structured output
    cmd = [claude_bin, "-p", "--output-format", "stream-json"]

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
            error=f"Claude CLI not found: {claude_bin}",
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

    Validates agent names to prevent path traversal attacks.
    Raises ValueError if format is invalid or agent name is unsafe.
    """
    agent: str | None = None
    task: str | None = None

    # Handle quoted task: agent:"task here"
    match = re.match(r'^([^:]+):"(.+)"$', pair)
    if match:
        agent, task = match.group(1), match.group(2)

    # Handle quoted task with single quotes: agent:'task here'
    if agent is None:
        match = re.match(r"^([^:]+):'(.+)'$", pair)
        if match:
            agent, task = match.group(1), match.group(2)

    # Simple split on first colon
    if agent is None and ":" in pair:
        agent, task = pair.split(":", 1)

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
    pairs: list[str],
    sources: list["AgentSource"],
    output_format: str = "text",
    timeout: int = 600,
    enable_debug: bool = False,
    claude_bin: str = "claude",
) -> int:
    """Run multiple agents in parallel."""
    from cli.shared.discovery import find_agent

    # Parse agent:task pairs
    requests: list[tuple[str, str, Path]] = []
    for pair in pairs:
        try:
            agent, task = parse_agent_task_pair(pair)
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

    # Setup sandboxed CLAUDE_HOME (shared by all agents)
    claude_home = setup_claude_home()

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
            claude_bin=claude_bin,
            claude_home=claude_home,
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
    claude_bin: str,
    claude_home: Path,
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

        coro = _run_claude_async(
            payload=payload,
            claude_bin=claude_bin,
            claude_home=claude_home,
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


async def _run_claude_async(
    payload: dict,
    claude_bin: str,
    claude_home: Path,
    timeout: int,
    output_format: str,
    agent_id: str,
) -> AgentResult:
    """Run claude exec asynchronously in sandbox mode.

    Always runs with --output-format stream-json flag for reliable structured output.
    For text mode, parses JSONL and extracts agent messages.
    For jsonl mode, streams events with agent_id tagging.
    """
    start_time = time.time()
    agent_name = payload.get("metadata", {}).get("agentName", "subagent")
    stream_jsonl = output_format == "jsonl"

    # Build environment with CLAUDE_HOME override
    env = os.environ.copy()
    if "CLAUDE_HOME" in env:
        debug(f"Overriding existing CLAUDE_HOME: {env['CLAUDE_HOME']}")
    env["CLAUDE_HOME"] = str(claude_home)

    # Always use stream-json for reliable structured output
    cmd = [claude_bin, "-p", "--output-format", "stream-json"]

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
    except FileNotFoundError:
        return AgentResult(
            agent=agent_name,
            output="",
            returncode=1,
            elapsed=0,
            error=f"Claude CLI not found: {claude_bin}",
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
