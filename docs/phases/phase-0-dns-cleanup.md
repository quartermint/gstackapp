# Phase 0: DNS Cleanup

This phase handles cleanup of existing DNS records and Cloudflare tunnels before setting up the new architecture.

## Prerequisites

- Cloudflare account access
- List of existing DNS records
- List of active Cloudflare tunnels

## Steps

### 1. Audit Existing DNS Records

```bash
# List all DNS records for your domain
curl -X GET "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records" \
  -H "Authorization: Bearer {api_token}" \
  -H "Content-Type: application/json" | jq '.result[] | {name, type, content}'
```

Document all records and their purposes.

### 2. Identify Records to Remove

Records that should be removed:
- [ ] Old tunnel CNAME records pointing to `*.cfargotunnel.com`
- [ ] A/AAAA records for services moving to Tailscale
- [ ] Deprecated subdomain records

Records to keep:
- [ ] MX records for email
- [ ] TXT records for domain verification
- [ ] Root domain records

### 3. Stop Active Tunnels

```bash
# List tunnels
cloudflared tunnel list

# For each tunnel to remove:
cloudflared tunnel delete <tunnel-id>
```

### 4. Remove DNS Records

```bash
# Delete a DNS record
curl -X DELETE "https://api.cloudflare.com/client/v4/zones/{zone_id}/dns_records/{record_id}" \
  -H "Authorization: Bearer {api_token}"
```

### 5. Verify Cleanup

```bash
# Confirm tunnels are removed
cloudflared tunnel list

# Confirm DNS records are removed
dig +short old-subdomain.yourdomain.com
# Should return nothing
```

## New DNS Structure

After cleanup, you'll set up:

| Subdomain | Type | Target | Purpose |
|-----------|------|--------|---------|
| `api` | CNAME | Workers route | API entry point |
| (none needed) | - | - | Internal uses Tailscale |

## Rollback Plan

If issues arise:

1. Re-create tunnel: `cloudflared tunnel create <name>`
2. Re-add DNS records via Cloudflare dashboard
3. Update tunnel config to route traffic

## Verification Checklist

- [ ] All deprecated tunnels deleted
- [ ] All old DNS records removed
- [ ] Email (MX) records still working
- [ ] No broken external links (check logs)

## Next Steps

Proceed to [Phase 1: Network Foundation](phase-1-network.md)
