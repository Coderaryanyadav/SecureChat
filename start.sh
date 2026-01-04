#!/bin/bash
# SecureChat Startup Script

echo "🚀 Starting SecureChat Server..."
echo ""
echo "Environment: Development Mode"
echo "URL: http://localhost:8000"
echo ""
echo "Press CTRL+C to stop the server"
echo "----------------------------------------"
echo ""

export DEV_MODE=1
cd "$(dirname "$0")"
python3 server/main.py
