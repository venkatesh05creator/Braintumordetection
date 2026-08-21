"""Tests for security utilities."""

import pytest
from jose import JWTError

from utils.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        """Hashed password must not equal plaintext."""
        h = hash_password("MySecretPassword1")
        assert h != "MySecretPassword1"

    def test_verify_correct_password(self):
        """Correct password verifies successfully."""
        h = hash_password("CorrectPassword1")
        assert verify_password("CorrectPassword1", h) is True

    def test_verify_wrong_password(self):
        """Wrong password fails verification."""
        h = hash_password("CorrectPassword1")
        assert verify_password("WrongPassword1", h) is False

    def test_same_password_different_hashes(self):
        """bcrypt salting ensures two hashes of the same password differ."""
        h1 = hash_password("SamePassword1")
        h2 = hash_password("SamePassword1")
        assert h1 != h2  # Different salts each time


class TestJWT:
    def test_access_token_decode(self):
        """Access token encodes and decodes correctly."""
        token = create_access_token(user_id=42, role="doctor")
        payload = decode_token(token, expected_type="access")
        assert payload["sub"] == "42"
        assert payload["role"] == "doctor"
        assert payload["type"] == "access"

    def test_refresh_token_decode(self):
        """Refresh token encodes and decodes correctly."""
        token = create_refresh_token(user_id=99, role="patient")
        payload = decode_token(token, expected_type="refresh")
        assert payload["sub"] == "99"
        assert payload["type"] == "refresh"

    def test_wrong_token_type_rejected(self):
        """Using access token as refresh (or vice versa) raises JWTError."""
        access = create_access_token(user_id=1, role="doctor")
        with pytest.raises(JWTError):
            decode_token(access, expected_type="refresh")

    def test_tampered_token_rejected(self):
        """Tampered token signature is rejected."""
        token = create_access_token(user_id=1, role="doctor")
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(JWTError):
            decode_token(tampered)

    def test_invalid_token_rejected(self):
        """Completely invalid token string raises JWTError."""
        with pytest.raises(JWTError):
            decode_token("not.a.jwt.token")
