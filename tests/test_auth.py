import pytest
from starlette.testclient import TestClient
from server.main import app, init_db
import uuid

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

@pytest.fixture
def client():
    return TestClient(app)

def test_health_check(client):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"

def test_register_and_login(client):
    unique_user = f"user_{uuid.uuid4().hex[:8]}"
    password = "SuperSecurePassword123!"

    # Register
    reg_res = client.post("/api/register", json={"username": unique_user, "password": password})
    assert reg_res.status_code == 200
    reg_data = reg_res.json()
    assert reg_data["status"] == "ok"
    assert "recovery_key" in reg_data

    # Login
    login_res = client.post("/api/login", json={"username": unique_user, "password": password})
    assert login_res.status_code == 200
    login_data = login_res.json()
    assert login_data["status"] == "ok"
    assert login_data["username"] == unique_user

def test_room_messaging(client):
    room_id = f"test-room-{uuid.uuid4().hex[:6]}"
    username = f"user_{uuid.uuid4().hex[:6]}"

    # Send message
    send_res = client.post(
        f"/api/rooms/{room_id}/messages",
        json={
            "sender": username,
            "content": {"iv": "dGVzdA==", "data": "ZW5jcnlwdGVk"},
            "type": "message"
        }
    )
    assert send_res.status_code == 200
    send_data = send_res.json()
    assert send_data["status"] == "ok"
    assert send_data["message"]["sender"] == username

    # Get messages
    get_res = client.get(f"/api/rooms/{room_id}/messages?user={username}")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["status"] == "ok"
    assert len(get_data["messages"]) >= 1
    assert get_data["messages"][0]["sender"] == username
    assert username in get_data["members"]
