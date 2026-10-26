# AWS Production Deployment Guide for CCMS Street-Light Controller

This guide gives you exact, step-by-step instructions to deploy the CCMS Server & React Dashboard to **Amazon Web Services (AWS)** using the **AWS Free Tier**.

---

## Architecture Overview

```
                      +-------------------+
                      |   GPS (UART1)     |
                      +---------+---------+
                                |
                      +---------v---------+
                      | Single / 3-Phase  |
                      | Energy Meter(RS485)|
                      +---------+---------+
                                |
                      +---------v---------+
                      |   ESP32 (CCMS)    |
                      |   WiFi & Modbus   |
                      +---------+---------+
                                |
             HTTP POST /api/v1/save (x-api-key)
                                |
                                v
               +---------------------------------+
               |       AWS EC2 (Ubuntu)          |
               |  - Nginx (Port 80 -> 8000)      |
               |  - Node.js Express Server:8000  |
               |  - React Dashboard (Static)     |
               +----------------+----------------+
                                |
                  Port 5432 (Internal Network)
                                |
                                v
               +---------------------------------+
               |     AWS RDS PostgreSQL          |
               |   (Database: ccms, db.t3.micro) |
               +---------------------------------+
```

---

## 1. Prerequisites (On Windows)

1. **AWS Account**: Log in to [AWS Management Console](https://aws.amazon.com/console/).
2. **SSH Client**: Open **PowerShell** on Windows (Windows 10/11 comes with OpenSSH built-in). Verify by typing:
   ```powershell
   ssh -V
   ```
3. **Key Pair (Pem Key)**: In AWS Console:
   - Navigate to **EC2** -> **Key Pairs** (under Network & Security in left sidebar).
   - Click **Create key pair**.
   - Name: `ccms-key`
   - Key pair type: `RSA`
   - Private key format: `.pem` (for OpenSSH)
   - Click **Create key pair**. A file named `ccms-key.pem` will be downloaded to your computer (save it in `C:\Users\dell\.ssh` or `C:\Users\dell\Downloads`).

---

## 2. Launching AWS EC2 Instance (Free Tier)

1. Open **EC2 Console** -> Click **Launch Instance**.
2. **Name**: `ccms-server`
3. **Application and OS Images (AMI)**:
   - Select **Ubuntu** (Ubuntu Server 24.04 LTS or 22.04 LTS, 64-bit x86). *Make sure it has the "Free tier eligible" badge.*
4. **Instance Type**:
   - Select `t2.micro` or `t3.micro` (depending on region free tier eligibility; `t2.micro` is standard free tier in `us-east-1`, `ap-south-1`, etc.).
5. **Key pair**:
   - Select the `ccms-key` you created.
6. **Network settings (Firewall / Security Group)**:
   - Create security group `ccms-ec2-sg`.
   - Check the boxes:
     - [x] **Allow SSH traffic from**: Anywhere (`0.0.0.0/0`) or My IP.
     - [x] **Allow HTTP traffic from the internet** (Port 80).
     - [x] **Allow HTTPS traffic from the internet** (Port 443).
   - Click **Add security group rule**:
     - Type: **Custom TCP**
     - Port range: `8000`
     - Source: `Anywhere` (`0.0.0.0/0`)
7. **Configure Storage**:
   - `20 GiB` gp3 root volume (Free tier provides up to 30 GB EBS).
8. Click **Launch Instance**.

### Allocate an Elastic IP (Static Public IP)
By default, EC2 public IP changes when you stop and restart the instance. To prevent breaking ESP32 communication:
1. In EC2 sidebar, go to **Network & Security** -> **Elastic IPs**.
2. Click **Allocate Elastic IP address** -> Click **Allocate**.
3. Select the allocated IP, click **Actions** -> **Associate Elastic IP address**.
4. Resource type: **Instance** -> select your `ccms-server` instance.
5. Note this IP: **`<YOUR_ELASTIC_IP>`** (e.g., `13.233.x.x`).

---

## 3. Launching AWS RDS PostgreSQL (Free Tier)

1. In AWS Console search bar, type **RDS** and open the RDS console.
2. Click **Create database**.
3. **Engine options**:
   - Choose **PostgreSQL**.
   - Engine Version: `PostgreSQL 16.x`
4. **Templates**:
   - Choose **Free tier** (Crucial! This automatically restricts sizes to avoid charges).
5. **Settings**:
   - DB instance identifier: `ccms-postgres`
   - Master username: `postgres`
   - Master password: `YourStrongPassword123!` (remember this!)
6. **Instance configuration**:
   - `db.t3.micro` or `db.t4g.micro` (Free tier eligible).
7. **Storage**:
   - Storage type: `General Purpose SSD (gp2)`
   - Allocated storage: `20 GiB`
   - **Disable storage autoscaling** (uncheck box to prevent unintentional expansion).
8. **Connectivity**:
   - Virtual Private Cloud (VPC): Default VPC (same as EC2).
   - Public access: **No** (safer: only your EC2 needs to reach it).
   - Existing VPC security groups: Create new security group `ccms-rds-sg`.
9. **Additional configuration**:
   - Initial database name: `ccms`
10. Click **Create database**. (Takes ~5-7 minutes to create).

### Allow EC2 to talk to RDS (Security Group rule)
1. In RDS console, click on `ccms-postgres`.
2. Under **Connectivity & security**, note the **Endpoint** (e.g. `ccms-postgres.c123.ap-south-1.rds.amazonaws.com`).
3. Click on the Security Group link (`ccms-rds-sg`).
4. Click **Inbound rules** -> **Edit inbound rules**.
5. Add rule:
   - Type: **PostgreSQL** (Port 5432)
   - Source: Select `ccms-ec2-sg` (your EC2 security group) or the private IP of your EC2 instance.
   - Click **Save rules**.

---

## 4. Connect to EC2 & Set Up Linux Environment

Open **PowerShell** on your local Windows PC and navigate to where you saved `ccms-key.pem`:

```powershell
# Set permissions on Windows for pem file (if ssh complains)
icacls ccms-key.pem /inheritance:r
icacls ccms-key.pem /grant:r "$($env:USERNAME):(R)"

# Connect to EC2
ssh -i ccms-key.pem ubuntu@<YOUR_ELASTIC_IP>
```

Once connected to Ubuntu, run these commands:

```bash
# 1. Update packages
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node -v
npm -v

# 3. Install PM2 (Process Manager to keep Node running 24/7)
sudo npm install -g pm2

# 4. Install PostgreSQL client tools
sudo apt install -y postgresql-client nginx

# 5. Test RDS connection
psql -h <RDS_ENDPOINT> -U postgres -d ccms -W
# Type your password: YourStrongPassword123!
# If connected, type '\q' to exit.
```

---

## 5. Upload Code & Deploy

### Option A: Direct SCP from Windows PowerShell
From your local Windows PowerShell (inside `c:\Users\dell\Downloads\ccms_server`):

```powershell
# Build frontend locally first:
cd frontend
npm run build
cd ..

# Upload files to EC2 (replace IP and key path)
scp -i path\to\ccms-key.pem -r server.js db.js package.json routes middleware public ubuntu@<YOUR_ELASTIC_IP>:~/ccms_server/
```

### Option B: Clone via Git
If you push `ccms_server` to GitHub/GitLab:
```bash
git clone <YOUR_REPO_URL> ~/ccms_server
cd ~/ccms_server
```

### Configure the Environment on EC2:
Inside the EC2 SSH session:
```bash
cd ~/ccms_server

# Install backend dependencies
npm install

# Create production .env file
nano .env
```
Paste this configuration:
```env
PORT=8000
DATABASE_URL=postgresql://postgres:YourStrongPassword123!@<RDS_ENDPOINT>:5432/ccms
ADMIN_KEY=admin123
```
*(Press `Ctrl+O`, `Enter` to save, `Ctrl+X` to exit)*.

### Test Database Initialization & Start PM2:
```bash
# Verify DB connection & table creation
node -e "require('./db').initDb().then(() => console.log('DB SUCCESS!')).catch(console.error)"

# Start server using PM2
pm2 start server.js --name "ccms-server"

# Make PM2 restart automatically if EC2 reboots:
pm2 startup
# (Run the sudo env PATH... command output by the above command)
pm2 save
```

---

## 6. Configure Nginx (Reverse Proxy to Port 80)

To allow opening the dashboard directly in your browser with just `http://<YOUR_ELASTIC_IP>` (no `:8000` required):

```bash
sudo nano /etc/nginx/sites-available/default
```

Replace the contents of the `server { ... }` block with:

```nginx
server {
    listen 80 default_server;
    listen [::]:80 default_server;

    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Save and restart Nginx:
```bash
sudo nginx -t
sudo systemctl restart nginx
```

Now open `http://<YOUR_ELASTIC_IP>` in your browser! You will see the **CCMS Dashboard**.

---

## 7. Connecting ESP32 Controller

In your ESP-IDF firmware (`main.c` / `ccms.c`):

1. **Target URL**:
   Change the HTTP POST destination to:
   ```c
   #define SERVER_URL "http://<YOUR_ELASTIC_IP>/api/v1/save"
   ```
2. **HTTP Headers**:
   ```c
   // Content-Type: application/json
   // x-api-key: secret123
   ```
3. **Payload Test from Windows PowerShell**:
   Test that your AWS server accepts telemetry:
   ```powershell
   curl -X POST http://<YOUR_ELASTIC_IP>/api/v1/save `
     -H "Content-Type: application/json" `
     -H "x-api-key: secret123" `
     -d '{
       "device_id": "123456789012345",
       "kwh": 125.8,
       "kvah": 129.4,
       "voltage_v": 231.5,
       "current_a": 4.82,
       "kw": 1.11,
       "on_off": 1,
       "no_lights_on": 12,
       "power_source": "grid",
       "latt": 28.6139,
       "long": 77.2090
     }'
   ```
   **Expected Response**: `{"ok":true}`
   Refresh your dashboard at `http://<YOUR_ELASTIC_IP>` to see the data appear in real time!

---

## 8. AWS Free Tier Limits & Cost Management

| Service | Free Tier Allowance | Tip to Keep it Free |
|---|---|---|
| **EC2** | 750 hours/month of `t2.micro` or `t3.micro` | Run only 1 instance continuously |
| **RDS** | 750 hours/month of `db.t3.micro` PostgreSQL | Run only 1 database instance |
| **Storage** | 30 GB EBS (EC2) + 20 GB RDS Storage | Stay under 20 GB per disk |
| **Data Transfer** | 100 GB outbound / month | Telemetry JSON is ~500 bytes; millions of requests fit easily |

You are 100% within the free tier for 12 months!
