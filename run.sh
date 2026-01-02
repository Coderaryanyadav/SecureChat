#!/bin/bash
echo "Starting SecureChat Server..."
python3 -m uvicorn server.main:app --host 0.0.0.0 --port 8000 --reload
