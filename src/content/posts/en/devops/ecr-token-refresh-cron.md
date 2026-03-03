---
title: ECR Token Refresh Cron
description: >-
  AWS ECR authentication tokens expire after 12 hours. For long-running Docker
  hosts, implement automatic token refresh.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - aws
  - ecr
  - docker
  - cron
  - work
category: devops
draft: false
lang: en
references:
  - url: 'https://docs.aws.amazon.com/AmazonECR/latest/userguide/registry_auth.html'
    title: Private registry authentication in Amazon ECR
    type: official
---

## The Problem

- ECR tokens expire after 12 hours
- Docker containers typically login only at startup
- If a container runs longer than 12 hours, subsequent `docker pull` commands fail
- Error: `authorization token has expired`

## The Solution

Set up a cron job to refresh ECR tokens every 6 hours (before expiration).

```bash
# Cron entry (runs every 6 hours)
0 */6 * * * HOME=/home/ec2-user /usr/bin/aws ecr get-login-password --region ap-northeast-2 | /usr/bin/docker login --username AWS --password-stdin <ECR_REGISTRY> >> /var/log/ecr-refresh.log 2>&1
```

## Key Points

- Token lifetime: 12 hours (AWS limit)
- Refresh interval: 6 hours (safe margin)
- Must use full paths (`/usr/bin/aws`, `/usr/bin/docker`) in cron
- Set `HOME` for AWS CLI to find credentials
- Log to file for debugging

## Amazon Linux 2023 Setup

```bash
# Install cronie (not included by default)
sudo yum install -y cronie

# Enable and start
sudo systemctl enable crond
sudo systemctl start crond

# Install cron for specific user
sudo -u ec2-user crontab -e
```

## Implementation Locations

1. **CI/CD Pipeline** (`deploy.yml`): Install during DAG sync job
2. **Initial Setup Script** (`setup-git-credentials.sh`): Install during EC2 bootstrap

## Troubleshooting

```bash
# Check cron is running
systemctl status crond

# View cron logs
cat /var/log/ecr-refresh.log

# Test manual refresh
aws ecr get-login-password --region ap-northeast-2 | docker login --username AWS --password-stdin <ECR_REGISTRY>

# Verify current login
cat ~/.docker/config.json
```

## Common Pitfalls

| Issue | Solution |
| ----- | -------- |
| Cron installed for wrong user | Use `sudo -u ec2-user crontab` |
| Shell escaping in SSM | Use temp file instead of inline |
| cronie not installed | `yum install -y cronie` on AL2023 |
