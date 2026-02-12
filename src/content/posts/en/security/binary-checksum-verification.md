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

I was adding the ECR credential helper to a Dockerfile when I realized we were downloading a binary straight from an S3 bucket with zero verification. If that bucket got compromised, every container build would silently install malware. Here is how I fixed it with SHA256 checksums -- and the gotchas that made it harder than expected.

## Why This Matters

Supply chain attacks on downloaded binaries are not theoretical. An attacker who compromises a download server or CDN can replace a legitimate binary with a malicious version. Your Dockerfile downloads it, installs it, and the malware runs with your container's permissions. Checksum verification is the simplest defense: if the hash does not match, the build fails before the binary ever runs.

## The Solution

The pattern is straightforward -- download the binary, verify its SHA256 hash against a known-good value, and only then make it executable:

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

## The Gotchas

Four issues made this harder than the three-line pattern suggests.

**The two-space delimiter is invisible.** `sha256sum -c` requires exactly two spaces between the hash and filepath. One space silently fails with a cryptic "no properly formatted checksum lines found" error that gives no hint about the spacing. I lost 30 minutes to this the first time.

**Architecture-specific checksums are easy to miss.** When supporting both `amd64` and `arm64`, you need separate checksums for each. My initial attempt used a single checksum and the build failed only on one architecture, making it look like a download issue rather than a checksum mismatch.

**Finding official checksums is inconsistent.** Some projects publish checksums on their release page. Some embed them in a `CHECKSUMS` file. The ECR credential helper publishes none at all -- I had to download the binary, verify it manually, and then hardcode the hash.

**Hash updates are a manual chore.** Every binary version bump requires computing and replacing checksums for all supported architectures. Forgetting to update a checksum after a version bump causes build failures that look unrelated.

## Getting the Expected Checksum

Two approaches:

1. **Official release page**: Most projects publish checksums alongside downloads
2. **Compute yourself**: Download once from a trusted source, then record the hash

```bash
# Compute SHA256 of a file
sha256sum /path/to/binary
# Output: abc123def456...  /path/to/binary
```

## Real-World Example: ECR Credential Helper

Here is the actual Dockerfile snippet I wrote for multi-architecture support:

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

Notice the architecture branching: each platform gets its own expected hash. The `sha256sum -c -` command reads from stdin, computes the actual hash of the file, and compares them. If they do not match, the entire `RUN` layer fails and the build stops.

## Why This Works

SHA256 produces a unique 256-bit fingerprint for any file. Even a single byte change produces a completely different hash. By embedding the expected hash in the Dockerfile, you create a build-time gate: the binary must match exactly or the image will not build. An attacker would need to produce a malicious binary with the same SHA256 hash as the original, which is computationally infeasible.

## When to Verify (and When Not To)

| Scenario                   | Verification Needed?              |
| -------------------------- | --------------------------------- |
| Package manager (apt, pip) | No (built-in verification)        |
| Direct binary download     | Yes                               |
| Scripts from GitHub        | Consider (or use signed releases) |
| Internal artifacts         | Optional (trust your CI/CD)       |

Skip checksums for **package managers** that already verify integrity through signed manifests -- adding manual checksums is redundant. Skip them for **ephemeral dev containers** that never touch production. And if the project publishes **GPG-signed releases**, prefer signature verification -- it proves both integrity and authenticity, while checksums only prove integrity.

## Practical Takeaway

Any time you `curl` or `wget` a binary in a Dockerfile, add a `sha256sum -c` check. It is three lines of code that prevent an entire class of supply chain attacks. The maintenance cost -- updating hashes on version bumps -- is real but small compared to the alternative of shipping compromised containers.

Remember: two spaces between the hash and the filepath, different hashes for different architectures, and update the hash every time you bump the version.
