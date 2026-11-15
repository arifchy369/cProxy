# cProxy

cProxy is a small Node.js HTTP + WebSocket proxy that starts your Python backend on demand. Built for shared hosting (like cPanel) where processes get killed and you can't run a persistent service.

When a request arrives and the backend isn't running, the proxy queues it, launches the backend, waits until the port is open, then forwards the queued requests. If the backend doesn't come up in time, queued requests get a `503`.

## Requirements

- Node.js 14+
- A Python backend listening on a local port

## Install

```bash
npm install
```

## Configuration

All settings are environment variables. See `.env.example` for the full list.

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | Port the proxy listens on |
| `BACKEND_HOST` | `127.0.0.1` | Backend host |
| `BACKEND_PORT` | `8069` | Port your Python app listens on |
| `PYTHON_BIN` | `/home/USERNAME/virtualenv/myapp/3.11/bin/python3` | Python interpreter (use the venv's directly) |
| `APP_FILE` | `/home/USERNAME/myapp/app.py` | Backend entry file |
| `LOG_FILE` | `/home/USERNAME/myapp/app.log` | Backend stdout/stderr log |
| `START_CMD` | built from the three above | Full start command override |
| `CHECK_INTERVAL` | `500` | Readiness poll interval (ms) |
| `START_TIMEOUT` | `30000` | Max wait for backend startup (ms) |

Node doesn't load `.env` files by itself. Set the variables in your hosting panel, or use [`dotenv`](https://www.npmjs.com/package/dotenv).

## Usage

```bash
node app.js
```

On cPanel, point the Node.js app's startup file to `app.js`.

Make sure your backend listens on `BACKEND_HOST:BACKEND_PORT` (for example `127.0.0.1:8069`).

## Troubleshooting

- **503 "Backend failed to start"**: check the file set in `LOG_FILE` for Python errors.
- **502 "Bad gateway"**: the backend accepted the connection but failed while handling the request.
- **Slow first request**: expected, since the backend is being started.

## License

MIT
