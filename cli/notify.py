"""
macOS native notifications for Spectre CLI.

Sends notifications via osascript (AppleScript) - no dependencies required.
Supports custom sounds placed in ~/Library/Sounds/.
"""

import subprocess
import sys
from pathlib import Path


# Default sound - uses custom "spectre" sound if installed, falls back to system sound
DEFAULT_SOUND = "spectre"
FALLBACK_SOUND = "Glass"

# Where custom sounds live on macOS
SOUNDS_DIR = Path.home() / "Library" / "Sounds"


def is_macos() -> bool:
    """Check if running on macOS."""
    return sys.platform == "darwin"


def sound_exists(sound_name: str) -> bool:
    """Check if a custom sound is installed."""
    if not is_macos():
        return False

    # Check for common audio formats
    for ext in [".aiff", ".wav", ".mp3", ".m4a"]:
        if (SOUNDS_DIR / f"{sound_name}{ext}").exists():
            return True
    return False


def get_sound_name() -> str:
    """Get the best available sound name."""
    if sound_exists(DEFAULT_SOUND):
        return DEFAULT_SOUND
    return FALLBACK_SOUND


def notify(
    message: str,
    title: str = "Spectre Build",
    subtitle: str | None = None,
    sound: str | None = None,
) -> bool:
    """
    Send a macOS notification.

    Args:
        message: The notification body text
        title: The notification title (default: "Spectre Build")
        subtitle: Optional subtitle
        sound: Sound name (default: spectre if installed, else Glass)

    Returns:
        True if notification was sent successfully, False otherwise
    """
    if not is_macos():
        # On non-macOS, just print to console
        print(f"\n🔔 {title}: {message}")
        return True

    # Build AppleScript command
    sound_name = sound or get_sound_name()

    # Escape quotes in strings for AppleScript
    message = message.replace('"', '\\"')
    title = title.replace('"', '\\"')

    script = f'display notification "{message}" with title "{title}"'

    if subtitle:
        subtitle = subtitle.replace('"', '\\"')
        script = f'display notification "{message}" with title "{title}" subtitle "{subtitle}"'

    script += f' sound name "{sound_name}"'

    try:
        subprocess.run(
            ["osascript", "-e", script],
            check=True,
            capture_output=True,
        )
        return True
    except subprocess.CalledProcessError:
        return False
    except FileNotFoundError:
        # osascript not available
        return False


def notify_build_complete(
    tasks_completed: int,
    total_time: str,
    success: bool = True,
) -> bool:
    """
    Send a build completion notification.

    Args:
        tasks_completed: Number of tasks completed
        total_time: Human-readable duration string
        success: Whether the build succeeded

    Returns:
        True if notification was sent successfully
    """
    if success:
        title = "Spectre Build Complete"
        message = f"{tasks_completed} tasks completed in {total_time}"
    else:
        title = "Spectre Build Failed"
        message = f"Build stopped after {tasks_completed} tasks ({total_time})"

    return notify(message=message, title=title)


def notify_build_error(error: str) -> bool:
    """
    Send a build error notification.

    Args:
        error: Error message

    Returns:
        True if notification was sent successfully
    """
    return notify(
        message=error[:100],  # Truncate long errors
        title="Spectre Build Error",
    )
