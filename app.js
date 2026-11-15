/**
 * cProxy: auto-starting HTTP + WebSocket proxy
 * for Python backends (Flask/ASGI/etc.) on shared hosting (like cPanel).
 *
 * If the backend is not running, incoming requests are queued, the backend
 * is started, and the queue is flushed once the backend accepts connections.
 *
 * Configuration is done via environment variables (see .env.example).
 */

const http = require('http');
const httpProxy = require('http-proxy');
const { exec } = require('child_process');
const net = require('net');

// ==================== CONFIG ====================
const HOST = process.env.BACKEND_HOST || '127.0.0.1';
const PORT = process.env.PORT || 8080;                          // port this proxy listens on
const BACKEND_PORT = Number(process.env.BACKEND_PORT) || 8069;  // port your Python app listens on

// Paths used to build the start command (examples, replace with your own)
const PYTHON_BIN = process.env.PYTHON_BIN || '/home/USERNAME/virtualenv/myapp/3.11/bin/python3';
const APP_FILE = process.env.APP_FILE || '/home/USERNAME/myapp/app.py';
const LOG_FILE = process.env.LOG_FILE || '/home/USERNAME/myapp/app.log';

// Use the venv's python directly (`source activate` doesn't work in sh).
// Output goes to a log file. Override the whole command with START_CMD if needed.
const START_CMD =
    process.env.START_CMD ||
    `nohup "${PYTHON_BIN}" "${APP_FILE}" > "${LOG_FILE}" 2>&1 &`;

const CHECK_INTERVAL = Number(process.env.CHECK_INTERVAL) || 500;     // ms between readiness checks
const START_TIMEOUT = Number(process.env.START_TIMEOUT) || 30000;     // max wait for backend to come up (ms)

// ==================== STATE ====================
let backendStarting = false;
let httpQueue = [];   // { req, res }
let wsQueue = [];     // { req, socket, head }

// ==================== PROXY ====================
const proxy = httpProxy.createProxyServer({});

// Global error handler (without it, an unhandled proxy error crashes the process)
proxy.on('error', (err, req, res) => {
    console.error('[Proxy] error:', err.code || err.message);
    if (res && typeof res.writeHead === 'function') {
        if (!res.headersSent) {
            res.writeHead(502, { 'Content-Type': 'text/plain' });
        }
        res.end('Bad gateway');
    } else if (res && typeof res.destroy === 'function') {
        res.destroy(); // WebSocket socket
    }
});

// ==================== FUNCTIONS ====================

// Check if the backend TCP port is accepting connections
function checkBackend(cb) {
    const sock = net.connect(BACKEND_PORT, HOST);
    sock.setTimeout(2000);
    sock.once('connect', () => { sock.destroy(); cb(true); });
    sock.once('timeout', () => { sock.destroy(); cb(false); });
    sock.once('error', () => { sock.destroy(); cb(false); });
}

// backendStarting resets only when the backend is actually ready (or on timeout)
function startBackend() {
    if (backendStarting) return;
    backendStarting = true;
    console.log('[Proxy] Backend offline -> Starting...');

    exec(START_CMD, (err) => {
        if (err) console.error('[Proxy] Failed to start backend:', err);
    });

    const startedAt = Date.now();
    const poll = () => {
        checkBackend((running) => {
            if (running) {
                console.log('[Proxy] Backend ready -> Flushing queued requests...');
                backendStarting = false;
                flushQueue();
            } else if (Date.now() - startedAt > START_TIMEOUT) {
                // Timeout -> answer all queued requests with 503
                console.error('[Proxy] Backend start timeout');
                backendStarting = false;
                failQueue();
            } else {
                setTimeout(poll, CHECK_INTERVAL);
            }
        });
    };
    poll();
}

// Replay queued HTTP & WS requests (skipping dead connections)
function flushQueue() {
    const h = httpQueue; httpQueue = [];
    const w = wsQueue; wsQueue = [];

    for (const { req, res } of h) {
        if (res.writableEnded || res.destroyed) continue;
        proxy.web(req, res, { target: `http://${HOST}:${BACKEND_PORT}` });
    }
    for (const { req, socket, head } of w) {
        if (socket.destroyed) continue;
        proxy.ws(req, socket, head, { target: `ws://${HOST}:${BACKEND_PORT}` });
    }
}

// Empty the queue if the backend failed to start
function failQueue() {
    for (const { res } of httpQueue) {
        if (!res.writableEnded && !res.destroyed) {
            res.writeHead(503, { 'Content-Type': 'text/plain' });
            res.end('Backend failed to start');
        }
    }
    for (const { socket } of wsQueue) socket.destroy();
    httpQueue = [];
    wsQueue = [];
}

// ==================== SERVER ====================
// The backend is checked before proxying, so a failed check leaves req untouched
// (POST bodies are safe to replay later).
const server = http.createServer((req, res) => {
    checkBackend((running) => {
        if (running) {
            proxy.web(req, res, { target: `http://${HOST}:${BACKEND_PORT}` });
        } else {
            console.log('[Proxy] HTTP request -> Queueing & starting backend');
            httpQueue.push({ req, res });
            startBackend();
        }
    });
});

// WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {}); // avoid a crash if the client disconnects abruptly
    checkBackend((running) => {
        if (running) {
            proxy.ws(req, socket, head, { target: `ws://${HOST}:${BACKEND_PORT}` });
        } else {
            console.log('[Proxy] WS request -> Queueing & starting backend');
            wsQueue.push({ req, socket, head });
            startBackend();
        }
    });
});

server.listen(PORT, () => {
    console.log(`[Proxy] Running on port ${PORT} -> Waiting for requests...`);
});
