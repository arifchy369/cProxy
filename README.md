# cProxy

> Run background servers like Python ASGI apps on shared hosting using a Node.js proxy.

Many shared hosting environments (like cPanel) **only allow Node.js apps** to run persistently.  
If you want to run a **Python ASGI app** (FastAPI, Starlette, Django Channels) or any other server that isn't officially supported,  
you can use **cProxy** to handle incoming HTTP & WebSocket requests and forward them to your backend server.

---

## 🌐 How cProxy Works

1. All requests first reach **cProxy** (Node.js).  
2. **cProxy** forwards the requests to your backend running on a local port.  
3. If the backend is **offline**, cProxy:
   - Queues incoming HTTP & WebSocket requests temporarily.
   - Waits for the backend to become available.
4. Once the backend is running:
   - All queued requests are sent to it.
   - New requests are handled instantly.

---

## 🐍 Example: Python ASGI Backend

1. **Create a simple Python app** (FastAPI example):

```python
# app.py
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def home():
    return {"message": "Hello from FastAPI on shared hosting!"}
````

2. **Run your ASGI server locally** on a free port (e.g., 8069):

```bash
uvicorn app:app --host 127.0.0.1 --port 8069
```

> Your Node.js proxy will forward requests to this local port.

---

## 🟢 Node.js Proxy Setup

1. **Install dependencies**:

```bash
npm install
```

2. **Start the proxy**:

```bash
node app.js
```

* **Default proxy port:** 8080 (or cPanel-assigned port)
* **Default backend port:** 8069

The proxy handles **HTTP and WebSocket** traffic.

---

## 📂 Deploying on cPanel

1. Open **Setup Node.js App** in cPanel.
2. Set **Application Startup File** to `app.js`.
3. Click **Run NPM Install** in the cPanel interface.
4. Open your app via your domain or assigned URL.

> ✅ Your Python backend should always listen on a **local port**;
> cProxy will forward public traffic to it automatically.

---

## ✨ Features

* Supports **HTTP and WebSocket** traffic
* Queues requests until the backend is ready
* Enables **Python ASGI apps** on shared hosting
* Lightweight and easy to deploy

---

## 📄 License

MIT License © 2025 Arif Chowdhury
