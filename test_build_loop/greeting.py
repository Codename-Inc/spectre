"""Greeting utilities."""


def greet(name: str) -> str:
    """Return a greeting for the given name.

    Args:
        name: The name to greet. If empty, defaults to "World".

    Returns:
        A greeting string in the format "Hello, {name}!"
    """
    if not name:
        return "Hello, World!"
    return f"Hello, {name}!"
