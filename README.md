TODO:
    - Refine frontend dashboard
    - Implement additional optional features
    - Implement unit backend unit testing (if needed, works fine right now)
    - Rewrite README.md to clearly present project

Paid subscription services running this application:
    - Anthropic Claude API
    - AWS Micro.t3 EC2 Instance
    - CloudFlare Hosted Domain

# Expense Intelligence

AI-powered SMB expense intelligence platform. Ingests corporate card transactions, classifies merchants via Claude, detects policy violations, and provides an agentic chat interface for finance managers.

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.10+ |
| Node.js | 18+ |
| npm | 9+ |
| Anthropic API key | — |

## Installation

**1. Python dependencies**

```bash
pip install -r requirements.txt
```

**2. Frontend dependencies**

```bash
cd frontend
npm install
```

**3. Build the database**

Must be run from `src/` — the database and LLM cache paths are relative to CWD.

```bash
cd src
python pipeline.py ../data/dummy_data.xlsx
```

This drops and rebuilds `src/expense.db`, calls Claude once to categorize MCC codes (result cached in `src/llm_categories.json`), then writes all violations. Delete `llm_categories.json` to force re-categorization.

**4. Set your API key**

```bash
export ANTHROPIC_API_KEY="sk-ant-..."
```

---

## Running

### Development

Two terminals — Vite proxies `/api` requests to FastAPI automatically.

```bash
# Terminal 1 — backend (from src/)
cd src
python server.py
# → http://localhost:8000
```

```bash
# Terminal 2 — frontend dev server
cd frontend
npm run dev
# → http://localhost:5173
```

Open [http://localhost:5173](http://localhost:5173).

### Production

Build the frontend once; FastAPI serves it alongside the API.

```bash
cd frontend
npm run build
```

```bash
cd src
python server.py
# → http://localhost:8000 (serves both API and built UI)
```

### Agent CLI (no UI)

Interactive REPL for direct agent queries, also run from `src/`:

```bash
cd src
python agent.py
```

---

## AWS Deployment (EC2 + Apache)

Full one-time setup for hosting on a custom domain with SSL.

### Prerequisites

- EC2 instance (Ubuntu, `t3.micro` or larger)
- Security group inbound rules: port 22 (SSH, your IP only), 80 (HTTP), 443 (HTTPS)
- Elastic IP assigned to the instance
- Domain A record pointing at the Elastic IP (proxy off in Cloudflare during cert setup)

### One-time server setup

**1. SSH into the instance**

```bash
chmod 400 ~/path/to/your-key.pem
ssh -i ~/path/to/your-key.pem ubuntu@<elastic-ip>
```

**2. Install system dependencies**

```bash
sudo apt update
sudo apt install apache2 python3 python3-venv nodejs npm certbot python3-certbot-apache git
```

**3. Clone the repository**

```bash
git clone https://github.com/<your-username>/AI-SMB-Expense-Intelligence.git
cd AI-SMB-Expense-Intelligence
```

**4. Create Python virtual environment and install dependencies**

```bash
python3 -m venv ~/AI-SMB-Expense-Intelligence/venv
source ~/AI-SMB-Expense-Intelligence/venv/bin/activate
pip install -r requirements.txt
```

**5. Build the frontend**

```bash
cd ~/AI-SMB-Expense-Intelligence/frontend
npm install
npm run build
```

**6. Build the database**

```bash
cd ~/AI-SMB-Expense-Intelligence/src
source ~/AI-SMB-Expense-Intelligence/venv/bin/activate
python3 pipeline.py ../data/dummy_data.xlsx
```

**7. Configure Apache**

```bash
sudo nano /etc/apache2/sites-available/expense.conf
```

Paste:

```apache
<VirtualHost *:80>
    ServerName yourdomain.com
    ProxyPreserveHost On
    ProxyPass / http://127.0.0.1:8000/
    ProxyPassReverse / http://127.0.0.1:8000/
</VirtualHost>
```

```bash
sudo a2enmod proxy proxy_http
sudo a2ensite expense
sudo systemctl reload apache2
```

**8. Issue SSL certificate**

```bash
sudo certbot --apache -d yourdomain.com
```

**9. Create systemd service**

```bash
sudo nano /etc/systemd/system/expense.service
```

Paste:

```ini
[Unit]
Description=Expense Intelligence API
After=network.target

[Service]
WorkingDirectory=/home/ubuntu/AI-SMB-Expense-Intelligence/src
Environment="ANTHROPIC_API_KEY=sk-ant-..."
ExecStart=/home/ubuntu/AI-SMB-Expense-Intelligence/venv/bin/python server.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable expense
sudo systemctl start expense
sudo systemctl status expense
```

The app is now live at `https://yourdomain.com`.

---

### Deploying updates

```bash
# SSH in
ssh -i ~/path/to/your-key.pem ubuntu@<elastic-ip>

# Pull latest code
cd ~/AI-SMB-Expense-Intelligence
git pull

# Rebuild frontend (if frontend changed)
cd frontend && npm install && npm run build

# Rebuild database (if data or schema changed)
cd ~/AI-SMB-Expense-Intelligence/src
source ~/AI-SMB-Expense-Intelligence/venv/bin/activate
python3 pipeline.py ../data/dummy_data.xlsx

# Install new Python dependencies (if requirements.txt changed)
pip install -r ~/AI-SMB-Expense-Intelligence/requirements.txt

# Restart the service
sudo systemctl restart expense
sudo systemctl status expense
```

---

## Notes

- MCC codes CSV sourced from [greggles/mcc-codes](https://github.com/greggles/mcc-codes)
- `ANTHROPIC_API_KEY` must be set before starting the server or running the agent CLI
- The pipeline is destructive — it drops and rebuilds all tables on every run
- SSL cert auto-renews via Certbot — no manual action needed
