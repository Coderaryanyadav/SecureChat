import pytest
from server.main import sanitize_username, sanitize_room_id, validate_password

def test_username_sanitization():
    assert sanitize_username("  User123  ") == "user123"
    assert sanitize_username("GHOST_PHANTOM-99") == "ghost_phantom-99"
    with pytest.raises(ValueError):
        sanitize_username("Bad@User!")
    with pytest.raises(ValueError):
        sanitize_username("ab") # Too short

def test_room_id_sanitization():
    assert sanitize_room_id("Secret-Void_99") == "secret-void_99"
    with pytest.raises(ValueError):
        sanitize_room_id("Room with spaces")

def test_password_validation():
    assert validate_password("StrongPass123") == "StrongPass123"
    with pytest.raises(ValueError):
        validate_password("short")
