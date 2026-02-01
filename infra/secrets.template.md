# Secrets Management Guide

This document describes all secrets required by Mission Control and how to generate and store them.

## Overview

Mission Control requires several secrets for authentication, database access, and deployment. These secrets should NEVER be committed to the repository.

## Required Secrets

### 1. JWT_SECRET

**Purpose:** Signs and verifies JWT tokens for authentication between components.

**Generate:**
```bash
openssl rand -base64 32
```

**Store in:**
- GitHub Secrets: `JWT_SECRET`
- Cloudflare Worker: `wrangler secret put JWT_SECRET`
- Hetzner Hub: `/home/mission/mission-control/.env`
- Compute Nodes: `~/.env` or launchd environment

**Rotation:** Rotate quarterly or immediately if compromised.

---

### 2. CONVEX_URL

**Purpose:** URL for the Convex deployment.

**Obtain:**
1. Go to [Convex Dashboard](https://dashboard.convex.dev)
2. Select your project
3. Copy the deployment URL (format: `https://xxx-xxx-xxx.convex.cloud`)

**Store in:**
- GitHub Secrets: `CONVEX_URL`
- Hetzner Hub: `/home/mission/mission-control/.env`
- Compute Nodes: `~/.env`

---

### 3. CONVEX_DEPLOY_KEY

**Purpose:** Deploy key for Convex deployments.

**Obtain:**
1. Go to [Convex Dashboard](https://dashboard.convex.dev)
2. Select your project
3. Go to Settings > Deploy Keys
4. Create a new deploy key

**Store in:**
- GitHub Secrets: `CONVEX_DEPLOY_KEY`
- Hetzner Hub: `/home/mission/mission-control/.env`

**Rotation:** Rotate annually or when team members leave.

---

### 4. CLOUDFLARE_API_TOKEN

**Purpose:** Deploy workers to Cloudflare.

**Obtain:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. My Profile > API Tokens
3. Create Token with "Edit Cloudflare Workers" permissions

**Store in:**
- GitHub Secrets: `CLOUDFLARE_API_TOKEN`
- Local: `wrangler login` (stores in `~/.wrangler/`)

**Required Permissions:**
- Account: Workers Scripts (Edit)
- Zone: Workers Routes (Edit)

**Rotation:** Rotate annually or when team members leave.

---

### 5. CLOUDFLARE_ACCOUNT_ID

**Purpose:** Identifies your Cloudflare account for deployments.

**Obtain:**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select any zone
3. Find Account ID in the right sidebar

**Store in:**
- GitHub Secrets: `CLOUDFLARE_ACCOUNT_ID`
- `wrangler.toml`: `account_id` (can be committed, not sensitive)

---

### 6. SSH Keys

**Purpose:** Secure access to Hetzner servers.

**Generate:**
```bash
ssh-keygen -t ed25519 -C "mission-control-deploy" -f ~/.ssh/mission_control_deploy
```

**Store in:**
- GitHub Secrets: `SSH_PRIVATE_KEY` (private key content)
- Hetzner Server: Add public key to `/home/mission/.ssh/authorized_keys`

**Rotation:** Rotate when team members leave or annually.

---

### 7. HUB_URL

**Purpose:** Tailscale IP address of the hub server.

**Obtain:**
1. On the hub server, run: `tailscale ip -4`
2. Format as: `http://<IP>:3000`

**Store in:**
- Cloudflare Worker: `wrangler secret put HUB_URL`
- Compute Nodes: `~/.env`

---

## GitHub Secrets Configuration

Add these secrets to your GitHub repository:

1. Go to Repository > Settings > Secrets and variables > Actions
2. Add the following secrets:

| Secret Name | Description |
|-------------|-------------|
| `JWT_SECRET` | JWT signing key |
| `CONVEX_URL` | Convex deployment URL |
| `CONVEX_DEPLOY_KEY` | Convex deploy key |
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
| `SSH_PRIVATE_KEY` | SSH key for Hetzner deployment |
| `STAGING_SERVER_IP` | Staging server Tailscale IP |
| `PRODUCTION_SERVER_IP` | Production server Tailscale IP |
| `CODECOV_TOKEN` | (Optional) Codecov upload token |

---

## Cloudflare Worker Secrets

Set secrets using wrangler:

```bash
# Login to Cloudflare
wrangler login

# Set secrets for production
wrangler secret put JWT_SECRET
wrangler secret put HUB_URL

# Set secrets for staging
wrangler secret put JWT_SECRET --env staging
wrangler secret put HUB_URL --env staging
```

---

## Hetzner Hub Environment

Create `/home/mission/mission-control/.env`:

```bash
# Generate template
cat << 'EOF' > /home/mission/mission-control/.env
NODE_ENV=production
PORT=3000
LOG_LEVEL=info

JWT_SECRET=<your-jwt-secret>
CONVEX_URL=<your-convex-url>
CONVEX_DEPLOY_KEY=<your-convex-deploy-key>

CLAUDE_MAX_TOKENS=4096
CLAUDE_TIMEOUT=60000
EOF

# Set permissions
chmod 600 /home/mission/mission-control/.env
chown mission:mission /home/mission/mission-control/.env
```

---

## Compute Node Environment

Create `~/mission-control/.env` on each compute node:

```bash
NODE_ENV=production
PORT=3001
HOSTNAME=<node-hostname>

JWT_SECRET=<your-jwt-secret>
HUB_URL=<hub-tailscale-url>
CONVEX_URL=<your-convex-url>

SANDBOX_ENABLED=true
SANDBOX_WORKDIR=/tmp/sandbox
```

---

## Security Best Practices

1. **Never commit secrets** - All `.env` files are in `.gitignore`
2. **Use environment-specific secrets** - Different values for staging/production
3. **Rotate regularly** - At least annually, immediately if compromised
4. **Limit access** - Only team members who need access should have it
5. **Audit usage** - Review secret access logs periodically
6. **Use short-lived tokens** - Where possible, use tokens with expiration

---

## Secret Rotation Checklist

When rotating secrets:

1. [ ] Generate new secret value
2. [ ] Update in all locations (GitHub, Cloudflare, servers)
3. [ ] Deploy all affected components
4. [ ] Verify all components are working
5. [ ] Revoke old secret value
6. [ ] Update documentation if format changed
7. [ ] Notify team of rotation

---

## Emergency: Compromised Secret

If a secret is compromised:

1. **Immediately rotate the secret** - Generate new value
2. **Deploy all components** - Push new secret to all locations
3. **Review logs** - Check for unauthorized access
4. **Revoke old value** - Ensure old secret cannot be used
5. **Notify team** - Inform relevant stakeholders
6. **Post-mortem** - Document how compromise occurred

---

## Verification Commands

Verify secrets are properly configured:

```bash
# Check GitHub secrets (requires gh CLI)
gh secret list

# Check Cloudflare secrets
wrangler secret list

# Verify JWT_SECRET is set on hub
ssh hub 'grep -q JWT_SECRET /home/mission/mission-control/.env && echo "JWT_SECRET is set"'

# Test Convex connection
npx convex dev --once
```
