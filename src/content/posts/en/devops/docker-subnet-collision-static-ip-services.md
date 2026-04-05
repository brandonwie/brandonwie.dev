---
title: Docker Subnet Collision with Static-IP Services
description: >-
  When multiple Docker Compose projects define custom bridge networks, their
  subnets can collide silently. Here is how to diagnose and fix it.
date: 2026-04-02T00:00:00.000Z
updated: "2026-04-06"
tags:
  - devops
  - docker
  - networking
category: devops
draft: false
lang: en
expanded: true
references:
  - url: 'https://docs.docker.com/network/drivers/bridge/'
    title: Docker Bridge Network Driver
    type: official
  - url: 'https://typesense.org/docs/27.1/api/cluster-operations.html'
    title: Typesense Cluster Operations
    type: official
source_content_hash: 6af7dc8b20e8291ebf27a8e5b5091c04ff4b4b31e942cdf50e9bf0f327ceb461
---

I ran `docker compose up` on a Typesense cluster and got `Pool overlaps with other one on this address space`. No indication of which network was conflicting, no hint about what to change. This turned a 5-minute setup into an hour of debugging.

## Why This Happens

Docker bridge networks with custom IPAM subnets must not overlap with any other network on the same host. When two Docker Compose projects independently define the same subnet range — say, `172.22.0.0/16` — the second project fails at startup.

This is especially painful with services that require static IPs for cluster peering. Typesense, for example, needs each node to have a hardcoded IP address for raft consensus. Those IPs appear in three places that must all agree:

1. **docker-compose.yml** — `networks.typesense-net.ipam.config.subnet` and each service's `ipv4_address`
2. **nodes.cluster file** — `{ip}:{peering_port}:{api_port}` per node, mounted read-only
3. **nginx.conf** — `upstream` block listing each node's IP for load balancing

When another compose project (in my case, Airflow) already occupies the same subnet, Docker fails before any container starts. The error message gives you nothing to work with.

## Finding the Collision

List every Docker bridge network and its subnet:

```bash
docker network ls --filter 'driver=bridge' --format '{{.Name}}' | \
  while read net; do
    echo "--- $net ---"
    docker network inspect "$net" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
  done
```

This shows you the full landscape. Docker allocates from `172.17-31.0.0/16` by default, so you need to pick a range that nothing else uses.

## The Fix

1. Run the inspection command above to find which subnet is taken
2. Pick a free `/16` range (e.g., if `172.22.0.0/16` is taken, use `172.23.0.0/16`)
3. Update the compose file's `ipam.config.subnet` and every service's `ipv4_address`
4. Update **all** files that reference the old IPs — `nodes.cluster`, `nginx.conf`, and any other config mounted into containers

### The Gotcha With Mounted Configs

In my case, the original `nodes.cluster` and `nginx.conf` were mounted from an external repository as read-only. I could not modify them in place. The workaround was creating local copies in a `.local/docker/typesense/` directory with the corrected IPs, and mounting those instead.

The error only appears during `docker compose up`, after images are already pulled. There is no way to catch subnet collisions earlier with `docker compose config` — that command validates YAML syntax, not network availability.

## When You Will Hit This

This problem surfaces whenever you run multiple Docker Compose projects with custom networks on the same machine — a common local development setup. Any service requiring static IPs in a Docker bridge network is vulnerable: Typesense, Elasticsearch, etcd, CockroachDB.

For single-project setups or services that use Docker's DNS-based service discovery instead of static IPs, subnet collisions are not a concern. In production, you would typically use host networking or overlay networks, which avoid this class of problem entirely.

## Key Takeaway

When you see `Pool overlaps with other one on this address space`, inspect all Docker networks with `docker network inspect`, find the collision, and pick a free subnet. The error message will never tell you which network is conflicting — you have to find it yourself.
