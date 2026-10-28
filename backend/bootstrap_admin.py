"""
Secure administrator bootstrap utility.

Allows administrators to initialize or elevate an account securely from the command line:
    python bootstrap_admin.py --email admin@neuroscan.ai --name "System Administrator"

Never prints passwords to the console or writes default credentials into source code.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from sqlalchemy import select

from database import AsyncSessionLocal, init_db
from models import User, UserRole
from utils.security import hash_password


async def bootstrap_admin(email: str, full_name: str, password: str | None = None) -> None:
    if not password:
        password = getpass.getpass("Enter secure password for administrator: ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Error: Passwords do not match.", file=sys.stderr)
            sys.exit(1)

    if len(password) < 8 or not any(c.isupper() for c in password) or not any(c.isdigit() for c in password):
        print(
            "Error: Password must be at least 8 characters long with at least one uppercase letter and one digit.",
            file=sys.stderr,
        )
        sys.exit(1)

    await init_db()

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user:
            user.role = UserRole.ADMIN
            user.hashed_password = hash_password(password)
            user.full_name = full_name
            user.is_active = True
            user.is_verified = True
            print(f"Existing user '{email}' successfully promoted to Administrator.")
        else:
            admin_user = User(
                email=email,
                full_name=full_name,
                hashed_password=hash_password(password),
                role=UserRole.ADMIN,
                is_active=True,
                is_verified=True,
            )
            session.add(admin_user)
            print(f"Administrator account '{email}' created successfully.")

        await session.commit()


def main():
    parser = argparse.ArgumentParser(description="Securely bootstrap an initial Administrator account.")
    parser.add_argument("--email", required=True, help="Administrator email address")
    parser.add_argument("--name", default="System Administrator", help="Full name of administrator")
    parser.add_argument("--password", default=None, help="Optional password (prompted securely if omitted)")

    args = parser.parse_args()
    asyncio.run(bootstrap_admin(email=args.email, full_name=args.name, password=args.password))


if __name__ == "__main__":
    main()
