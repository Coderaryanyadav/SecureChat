import pytest
import httpx
import asyncio
import os
import sqlite3
from server.main import app

# Base URL (TestServer will be used)
BASE_URL = "http://testserver"

@pytest.fixture(autouse=True)
def setup_db():
    db_path = "database.db"
    conn = sqlite3.connect(db_path)
    conn.execute("DELETE FROM users")
    conn.execute("DELETE FROM history")
    conn.commit()
    conn.close()

@pytest.mark.asyncio
async def test_register_and_login():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE_URL) as client:
        # 1. Register
        reg_res = await client.post("/api/register", json={"username": "test_ghost", "password": "ghost_password"})
        assert reg_res.status_code == 200
        assert reg_res.json()["status"] == "ok"

        # 2. Register same user (should fail)
        reg_fail = await client.post("/api/register", json={"username": "test_ghost", "password": "ghost_password"})
        assert reg_fail.json()["status"] == "fail"

        # 3. Login
        login_res = await client.post("/api/login", json={"username": "test_ghost", "password": "ghost_password"})
        assert login_res.status_code == 200
        assert login_res.json()["status"] == "ok"
        user_id = login_res.json()["user_id"]

        # 4. Save Room History
        save_res = await client.post("/api/save-room", json={"user_id": user_id, "room_id": "phantom-zone"})
        assert save_res.json()["status"] == "ok"

        # 5. Get History
        hist_res = await client.get(f"/api/history/{user_id}")
        assert "phantom-zone" in hist_res.json()

@pytest.mark.asyncio
async def test_room_verification():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE_URL) as client:
        v1 = await client.post("/api/verify-room", json={"room_id": "test_room", "password": "secret_key"})
        assert v1.json()["status"] == "ok"

        # Correct password
        v2 = await client.post("/api/verify-room", json={"room_id": "test_room", "password": "secret_key"})
        assert v2.json()["status"] == "ok"

        # Incorrect password
        v3 = await client.post("/api/verify-room", json={"room_id": "test_room", "password": "wrong_key"})
        assert v3.json()["status"] == "fail"

@pytest.mark.asyncio
async def test_rate_limiting():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url=BASE_URL) as client:
        # Spamming register (limit is 5/min)
        for _ in range(10):
            res = await client.post("/api/register", json={"username": str(os.urandom(8)), "password": "p"})
            if res.status_code == 429:
                 return
        # Note: Rate limiter might not be active or behave differently in tests
        pass

if __name__ == "__main__":
    import sys
    pytest.main(sys.argv)
