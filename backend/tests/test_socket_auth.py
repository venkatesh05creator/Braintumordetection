"""Tests for socket.io room access control (IDOR prevention)."""

import pytest

from utils.socket_auth import validate_room_access


class TestRoomAccess:
    def test_own_user_room_allowed_for_patient(self):
        assert validate_room_access("user_7", 7, "patient") is True

    def test_own_user_room_allowed_for_doctor(self):
        assert validate_room_access("user_7", 7, "doctor") is True

    def test_own_doctor_room_allowed_for_doctor(self):
        assert validate_room_access("doctor_7", 7, "doctor") is True

    def test_own_doctor_room_allowed_for_admin(self):
        assert validate_room_access("doctor_7", 7, "admin") is True

    @pytest.mark.parametrize("role", ["patient", "doctor", "admin", None])
    def test_other_users_room_denied(self, role):
        assert validate_room_access("user_8", 7, role) is False

    def test_other_doctors_room_denied_for_doctor(self):
        assert validate_room_access("doctor_8", 7, "doctor") is False

    def test_doctor_room_denied_for_patient(self):
        assert validate_room_access("doctor_7", 7, "patient") is False

    def test_arbitrary_room_denied(self):
        assert validate_room_access("admin_panel", 7, "doctor") is False
        assert validate_room_access("room_all", 7, "admin") is False

    @pytest.mark.parametrize("room", [None, "", "user_", "doctor_"])
    def test_malformed_rooms_denied(self, room):
        assert validate_room_access(room, 7, "doctor") is False

    def test_no_user_id_denied(self):
        assert validate_room_access("user_7", None, "patient") is False
