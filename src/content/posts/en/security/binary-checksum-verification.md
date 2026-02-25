---
title: Binary Checksum Verification
description: Verify downloaded binaries haven't been tampered with using SHA256 checksums.
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - security
  - devops
  - supply-chain
category: security
draft: false
lang: en
references:
  - url: >-
      https://www.gnu.org/software/coreutils/manual/html_node/sha2-utilities.html
    title: GNU sha256sum utility
    type: official
---

## The Problem

Downloading binaries from the internet without verification is a supply chain
attack vector:

```text
Attack scenario:
┌─────────────────────────────────────────────────────────┐
│ 1. Attacker compromises download server or CDN         │
│ 2. Replaces legitimate binary with malicious version   │
│ 3. Your Dockerfile downloads and installs malware      │
│ 4. Malware runs with your container's permissions      │
└─────────────────────────────────────────────────────────┘
```

---

## Difficulties Encountered

- **Two-space delimiter is invisible**: `sha256sum -c` requires exactly two
  spaces between the hash and filepath (`"abc123  /path/to/file"`). One space
  silently fails with a cryptic "no properly formatted checksum lines found"
  error that does not hint at the spacing issue.
- **Architecture-specific checksums are easy to miss**: When supporting both
  `amd64` and `arm64`, you need separate checksums for each. Initial attempt
  used a single checksum and the build failed only on one architecture, making
  it look like a download issue rather than a checksum mismatch.
- **Finding official checksums is inconsistent**: Some projects publish
  checksums on their release page, some embed them in a `CHECKSUMS` file, and
  some (like the ECR credential helper) publish none at all — requiring you to
  download, verify manually once, then hardcode the hash.
- **Hash updates are a manual chore**: Every binary version bump requires
  computing and replacing checksums for all supported architectures. Forgetting
  to update a checksum after a version bump causes silent build failures.

---

## The Solution

```dockerfile
# Download binary
RUN curl -sL "https://example.com/binary" -o /usr/local/bin/binary \
    #
    # Verify checksum (SECURITY - prevents supply chain attacks)
    # Format: "<expected_hash>  <filepath>" (note: two spaces required)
    # sha256sum -c reads the hash, computes actual hash, compares them
    # If mismatch → build fails (someone tampered with the file)
    #
    && echo "abc123...  /usr/local/bin/binary" | sha256sum -c - \
    && chmod +x /usr/local/bin/binary
```

## How It Works

```mermaid
flowchart LR
    Download["Download Binary"] --> Compute["Compute SHA256"]
    Compute --> Compare{"Match Expected?"}
    Compare -->|Yes| Install["Install Binary"]
    Compare -->|No| Fail["Build Fails ❌"]
```

## Getting the Expected Checksum

1. **Official release page**: Most projects publish checksums
2. **Compute yourself**: Download once, verify manually, then use that hash

```bash
# Compute SHA256 of a file
sha256sum /path/to/binary
# Output: abc123def456...  /path/to/binary
```

## Real Example (ECR Credential Helper)

```dockerfile
RUN ARCH=$(dpkg --print-architecture) \
    && if [ "$ARCH" = "arm64" ]; then \
         ECR_ARCH="arm64"; \
         EXPECTED_SHA="76aa3bb223d4e64dd4456376334273f27830c8d818efe278ab6ea81cb0844420"; \
       else \
         ECR_ARCH="amd64"; \
         EXPECTED_SHA="dd6bd933e439ddb33b9f005ad5575705a243d4e1e3d286b6c82928bcb70e949a"; \
       fi \
    && curl -sL "https://amazon-ecr-credential-helper-releases.s3.us-east-2.amazonaws.com/0.9.0/linux-${ECR_ARCH}/docker-credential-ecr-login" \
       -o /usr/local/bin/docker-credential-ecr-login \
    && echo "${EXPECTED_SHA}  /usr/local/bin/docker-credential-ecr-login" | sha256sum -c - \
    && chmod +x /usr/local/bin/docker-credential-ecr-login
```

## Key Points

- **Two spaces required**: Between hash and filepath in `sha256sum -c`
- **Architecture-specific**: Different binaries have different checksums
- **Version-specific**: Update checksums when updating binary versions
- **Build fails on mismatch**: Prevents installing tampered binaries

## When to Use

| Scenario                   | Verification Needed?              |
| -------------------------- | --------------------------------- |
| Package manager (apt, pip) | No (built-in verification)        |
| Direct binary download     | Yes                               |
| Scripts from GitHub        | Consider (or use signed releases) |
| Internal artifacts         | Optional (trust your CI/CD)       |

---

## When NOT to Use

- **Package managers with built-in verification** (apt, pip, npm): These already
  verify package integrity through signed manifests. Adding manual checksums is
  redundant and creates maintenance burden.
- **Ephemeral development containers**: If the container is only used locally
  for development and never touches production, the supply chain risk is low and
  the overhead of maintaining checksums may not be justified.
- **When GPG signature verification is available**: If the project publishes
  GPG-signed releases, prefer signature verification over checksums — it proves
  both integrity AND authenticity (checksums only prove integrity).
- **Rapidly changing binaries you rebuild from source**: If you compile the
  binary yourself in CI, checksums are meaningless since you control the build.
