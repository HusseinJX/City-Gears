#!/bin/bash
# Double-click launcher for City Walk.
# Chrome blocks ES modules over file:// (CORS), so serve locally and open.

cd "$(dirname "$0")" || exit 1

PORT=8910
URL="http://127.0.0.1:${PORT}/index.html"

# Prefer python3, fall back to python.
if command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  osascript -e 'display alert "City Walk" message "Python is required to run the local server. Install Python 3 or open index.html in Safari/Firefox."'
  exit 1
fi

# Start server in background, capture pid. Disable caching so edits show up
# on reload without having to hard-refresh.
"$PY" - "$PORT" <<'PYEOF' >/dev/null 2>&1 &
import sys, http.server, socketserver
class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
port = int(sys.argv[1])
with socketserver.TCPServer(('127.0.0.1', port), NoCacheHandler) as httpd:
    httpd.serve_forever()
PYEOF
SERVER_PID=$!

# Give server a moment to start.
sleep 1

# Open in default browser.
open "$URL"

echo "City Walk is running at $URL"
echo "Press Ctrl+C or close this window to stop the server."

# Clean up server on exit.
trap 'kill $SERVER_PID 2>/dev/null; exit 0' INT TERM EXIT
wait $SERVER_PID
