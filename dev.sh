#!/bin/bash
# HolidayVote dev server script
# Usage: ./dev.sh [start|stop|restart|status]

NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

# Load nvm if available
if [ -s "$NVM_DIR/nvm.sh" ]; then
  . "$NVM_DIR/nvm.sh"
  nvm use 22 > /dev/null 2>&1
fi

PID_FILE=".claude/dev-server.pid"
LOG_FILE=".claude/dev-server.log"

start() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Server already running (PID: $(cat "$PID_FILE"))"
    return 1
  fi

  mkdir -p .claude
  npm run dev > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"
  echo "Server starting... (PID: $(cat "$PID_FILE"))"
  sleep 2
  if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✓ Server ready at http://localhost:3000"
  fi
}

stop() {
  if [ ! -f "$PID_FILE" ]; then
    echo "No PID file found - server may not be running"
    return 1
  fi

  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    rm -f "$PID_FILE"
    echo "Server stopped (PID: $PID)"
  else
    echo "Server not running (stale PID file removed)"
    rm -f "$PID_FILE"
  fi
}

status() {
  if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
    echo "Server running (PID: $(cat "$PID_FILE"))"
    curl -s http://localhost:3000 > /dev/null && echo "✓ Responding at http://localhost:3000" || echo "✗ Not responding"
  else
    echo "Server not running"
  fi
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; sleep 1; start ;;
  status) status ;;
  *) echo "Usage: $0 [start|stop|restart|status]" ;;
esac