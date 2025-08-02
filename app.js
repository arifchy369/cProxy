/**
 * Auto-starting HTTP + WebSocket proxy
 * for ASGI/Python apps in shared hosting (like cPanel)
 */

const http = require('http');
const httpProxy = require('http-proxy');
const { exec } = require('child_process');
const net = require('net');

// ==================== CONFIG ====================
const HOST = '127.0.0.1';
const PORT = process.env.PORT || 8080;
const BACKEND_PORT = 8069;

// Command to start backend (Python/ASGI app)
const START_CMD = 'nohup python3 app.py &';

// How often to check backend readiness (ms)
const CHECK_INTERVAL = 500;

// ==================== STATE ====================
let backendStarting = false;
let httpQueue = [];   // store { req, res }
let wsQueue = [];     // store { req, socket, head }

// ==================== FUNCTIONS ====================

// Check if backend TCP port is accepting connections
function checkBackend(cb) {
    const sock = net.connect(BACKEND_PORT, HOST, () => {
        sock.end();
        cb(true);
    });
    sock.on('error', () => cb(false));
}

// Start backend only if not already starting
function startBackend() {
    if (backendStarting) return;
    backendStarting = true;

    console.log('[Proxy] Backend offline → Starting...');
    exec(START_CMD, (err) => {
        backendStarting = false;
        if (err) console.error('[Proxy] Failed to start backend:', err);
    });

    waitForBackend(() => {
        console.log('[Proxy] Backend ready → Flushing queued requests...');
        flushQueue();
    });
}

// Poll until backend is ready
function waitForBackend(cb) {
    const poll = () => {
        checkBackend((running) => {
            if (running) cb();
            else setTimeout(poll, CHECK_INTERVAL);
        });
    };
    poll();
}

// Replay queued HTTP & WS requests
function flushQueue() {
    for (const { req, res, proxy } of httpQueue) {
        proxy.web(req, res, { target: `http://${HOST}:${BACKEND_PORT}` });
    }
    httpQueue = [];

    for (const { req, socket, head, proxy } of wsQueue) {
        proxy.ws(req, socket, head, { target: `ws://${HOST}:${BACKEND_PORT}` });
    }
    wsQueue = [];
}

// ==================== PROXY SERVER ====================
const proxy = httpProxy.createProxyServer({});
const server = http.createServer((req, res) => {
    proxy.web(req, res, { target: `http://${HOST}:${BACKEND_PORT}` }, () => {
        console.log('[Proxy] HTTP request failed → Queueing & starting backend');
        httpQueue.push({ req, res, proxy });
        startBackend();
    });
});

// Handle WebSocket upgrade
server.on('upgrade', (req, socket, head) => {
    proxy.ws(req, socket, head, { target: `ws://${HOST}:${BACKEND_PORT}` }, () => {
        console.log('[Proxy] WS request failed → Queueing & starting backend');
        wsQueue.push({ req, socket, head, proxy });
        startBackend();
    });
});

server.listen(PORT, () => {
    console.log(`[Proxy] Running on port ${PORT} → Waiting for requests...`);
});
