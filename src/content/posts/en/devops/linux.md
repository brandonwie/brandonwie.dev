---
title: Linux Fundamentals
description: '1. [Cgroups (Control Groups)](#cgroups-control-groups)'
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - linux
category: devops
draft: false
lang: en
references:
  - url: 'https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html'
    title: cgroup v2.html
    type: verified
  - url: >-
      https://github.com/containerd/containerd/blob/main/docs/snapshotters/README.md
    title: README.md
    type: official
  - url: 'https://www.kernel.org/doc/html/latest/filesystems/overlayfs.html'
    title: overlayfs.html
    type: verified
  - url: 'https://github.com/k3s-io/k3s/issues/5080'
    title: '5080'
    type: official
source_content_hash: adf9b8f36b899c2928c33cbd271977341b7bf722468fc1dbec26a20b529e1829
---

2. [Snapshotters](#snapshotters)
3. [Filesystem Permissions](#filesystem-permissions)
4. [ACLs (Access Control Lists)](#acls-access-control-lists)

---

## Cgroups (Control Groups)

### What & Why

Cgroups are a Linux kernel feature that allows you to allocate, limit, and
monitor system resources (CPU, memory, disk I/O, network) for groups of
processes. Think of them as "resource budgets" for containers.

When you run a container, the container runtime uses cgroups to ensure that
container can't hog all the system resources. Without cgroups, a misbehaving
container could:

- Use 100% of CPU, starving other containers
- Consume all available memory, causing OOM kills
- Fork-bomb the system with infinite processes
- Saturate disk I/O, making the system unresponsive

### How It Works

Each cgroup controller manages a specific type of resource:

| Controller | What It Limits | Example                                      |
| ---------- | -------------- | -------------------------------------------- |
| `cpu`      | CPU time       | "This container gets 50% CPU max"            |
| `memory`   | RAM usage      | "This container gets 512MB max"              |
| `pids`     | Process count  | "This container can spawn max 100 processes" |
| `blkio`    | Disk I/O       | "This container gets 10MB/s read max"        |
| `freezer`  | Pause/resume   | "Freeze all processes in this container"     |

#### Cgroups Hierarchy

```text
/sys/fs/cgroup/               (cgroup filesystem mount)
├── cpu/                       (CPU controller)
│   ├── docker/                (all Docker containers)
│   │   ├── container_abc/     (specific container)
│   │   │   ├── cpu.max        (CPU limit: "50000 100000" = 50%)
│   │   │   └── cpu.stat       (CPU usage statistics)
│   │   └── container_def/
│   └── system.slice/          (system services)
├── memory/                    (memory controller)
│   └── docker/
│       ├── container_abc/
│       │   ├── memory.max     (memory limit: "536870912" = 512MB)
│       │   └── memory.current (current usage)
│       └── ...
└── pids/                      (process count controller)
    └── docker/
        ├── container_abc/
        │   ├── pids.max       (max processes: "100")
        │   └── pids.current   (current count)
        └── ...
```

#### Checking Available Controllers

```bash
# View all cgroup controllers and their status
cat /proc/cgroups

# Example output:
#subsys_name    hierarchy    num_cgroups    enabled
#cpuset         9            3              1
#cpu            5            240            1
#memory         8            277            1
#pids           0            0              0    ← MISSING on Synology!
```

### Alternatives

#### Cgroup Versions

| Version       | Features                                    | Compatibility               |
| ------------- | ------------------------------------------- | --------------------------- |
| **cgroup v1** | Original, per-controller hierarchy          | Legacy, being deprecated    |
| **cgroup v2** | Unified hierarchy, all controllers together | Modern, required by new K8s |
| **Hybrid**    | Mix of v1 and v2                            | Transitional, problematic   |

### Key Takeaways

- **Cgroups = resource limits** — They prevent containers from hogging CPU,
  memory, or spawning too many processes
- **`pids` controller is critical for K8s** — Modern Kubernetes (1.20+) requires
  it to prevent fork bombs
- **Check with `cat /proc/cgroups`** — Quick way to see what your kernel
  supports

### Common Issues

#### "pids cgroup controller not found"

**Cause:** The Linux kernel doesn't have `CONFIG_CGROUP_PIDS` enabled.

**Diagnosis:**

```bash
cat /proc/cgroups | grep pids
# No output = pids controller not available
```

**Solutions:**

- Use a different kernel (VM, different distro)
- Use older k3s (pre-1.20) that doesn't require it
- Use Docker Compose instead of Kubernetes

#### Snapshotters

### What & Why

Snapshotters are the strategy that container runtimes (like containerd) use to
manage container filesystem layers. Containers share a base image (like
`ubuntu:22.04`) but each needs its own writable layer for changes.

Think of it like a library book with transparent sticky notes:

- **Base image (lower layer):** The original book - read-only, shared by
  everyone
- **Container layer (upper layer):** Your sticky notes - writable, unique to you
- **Merged view:** What you see - both combined seamlessly

Without efficient snapshotters:

- Running 100 nginx containers would require 100 copies of nginx (~50MB each =
  5GB)
- Every container start would require copying the entire base image
- Disk usage would explode

With snapshotters:

- 100 containers share ONE base image (~50MB)
- Only unique changes are stored per container
- Container startup is nearly instant (no copy needed)

### How It Works

#### Snapshotter Layering (overlayfs)

```text
YOUR CHANGES (Upper Layer - writable)
┌─────────────────────────────────────────┐
│  /app/myconfig.txt (new file)           │
│  /etc/nginx/nginx.conf (modified)       │
│  (stored in: /var/lib/docker/overlay2/  │
│   abc123/diff/)                         │
└─────────────────────────────────────────┘
              │
              │ "overlaid" on top using OverlayFS
              ▼
ORIGINAL IMAGE (Lower Layer - read-only)
┌─────────────────────────────────────────┐
│  nginx:latest base image                │
│  /usr/share/nginx/html/                 │
│  /etc/nginx/nginx.conf (original)       │
│  (stored once, shared by all containers)│
└─────────────────────────────────────────┘
              │
              │ Union mount creates merged view
              ▼
WHAT CONTAINER SEES (Merged View)
┌─────────────────────────────────────────┐
│  Looks like a complete filesystem       │
│  Original files + Your changes combined │
│  Container doesn't know it's layered    │
└─────────────────────────────────────────┘
```

### Alternatives

| Snapshotter      | How It Works                     | Performance | Use Case                            |
| ---------------- | -------------------------------- | ----------- | ----------------------------------- |
| `overlayfs`      | Kernel-level filesystem layering | Fast        | Default for most Linux              |
| `native`         | Copy entire image on write       | Slow        | Fallback when overlayfs unavailable |
| `fuse-overlayfs` | FUSE-based overlay emulation     | Medium      | Rootless containers                 |
| `zfs`            | ZFS copy-on-write                | Fast        | ZFS systems                         |
| `btrfs`          | Btrfs snapshots                  | Fast        | Btrfs systems                       |

### Key Takeaways

- **Snapshotters = efficient storage** — They let 100 containers share one base
  image
- **overlayfs needs kernel support** — If missing, fall back to `native` (slower
  but works)

### Common Issues

#### "overlayfs: cannot mount"

**Cause:** Kernel doesn't support overlayfs, or nested container issue.

**Diagnosis:**

```bash
grep overlay /proc/filesystems
# No output = overlayfs not available
```

**Solution:** Use `--snapshotter=native` flag when running containerd/k3s.

#### Filesystem Permissions

### What & Why

Unix filesystem permissions control who can read, write, or execute files. Every
file has:

- **Owner:** The user who created it
- **Group:** A group of users with shared access
- **Others:** Everyone else

Permissions are expressed as a 3-digit octal number or symbolic notation.

### How It Works

```text
-rw-r--r--  1  user  group  1024  Jan 16 10:00  file.txt
│└┬┘└┬┘└┬┘
│ │  │  └── Others: r-- (read only)
│ │  └───── Group: r-- (read only)
│ └──────── Owner: rw- (read + write)
└────────── File type: - (regular file)

OCTAL NOTATION:
  r = 4   read
  w = 2   write
  x = 1   execute

  Owner: rw- = 4+2 = 6
  Group: r-- = 4   = 4
  Others: r-- = 4  = 4
  Result: 644

COMMON PERMISSIONS:
  644  -rw-r--r--  Regular files (owner writes, others read)
  755  -rwxr-xr-x  Executables/directories (owner full, others read+execute)
  700  -rwx------  Private (owner only)
  600  -rw-------  Private file (owner read/write only)
```

### Key Takeaways

- **SSH is extremely strict about permissions** — Keys must be 600, .ssh/ must
  be 700
- **Directories need execute to enter** — A directory with 644 can be listed but
  not entered
- **Default permissions come from umask** — Usually 022, meaning new files are
  644

#### ACLs (Access Control Lists)

### What & Why

ACLs provide more granular permission control than traditional Unix permissions.
They allow you to grant different permissions to multiple users or groups on the
same file.

Traditional permissions: "Owner can write, everyone else can read" ACLs: "Owner
can write, user bob can read, group devs can read+write, user alice has no
access"

### How It Works

#### Detecting ACLs

```bash
# The + sign indicates ACLs are present
ls -la ~/.ssh/
drwxrwxrwx+  2 user group 4096 Jan 16 10:00 .ssh/
          ^
          └── This + means ACLs override standard permissions!
```

#### Viewing ACLs

```bash
# Linux
getfacl ~/.ssh/

# Synology (custom tool)
synoacltool -get ~/.ssh/
```

#### Removing ACLs (Synology)

```bash
# Remove ACLs so chmod can take effect
sudo synoacltool -del ~/.ssh
sudo synoacltool -del ~/.ssh/authorized_keys

# Then set permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Key Takeaways

- **ACLs can override chmod** — If ACLs are present, chmod may appear to do
  nothing
- **Look for the + sign** — In `ls -la`, a + after permissions indicates ACLs
- **Synology uses ACLs extensively** — May need to remove them for SSH to work

#### Synology-Specific Notes

Synology DSM uses a customized Linux kernel (3.10.x based) that lacks several
modern features:

| Feature              | Status  | Impact                             |
| -------------------- | ------- | ---------------------------------- |
| `CONFIG_CGROUP_PIDS` | Missing | k3s 1.20+ won't run                |
| `CONFIG_SECCOMP`     | Limited | Some security features unavailable |
| overlayfs (nested)   | Limited | Can't nest overlays in Docker      |

**Available on Synology:**

```text
cpuset, cpu, cpuacct, blkio, memory, devices, freezer
```

**Missing:**

```text
pids, hugetlb, perf_event, net_cls, net_prio
```

This is why Synology NAS works well for Docker Compose but not for Kubernetes.

---

## References

- [Linux Kernel Cgroups Documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [containerd Snapshotters](https://github.com/containerd/containerd/blob/main/docs/snapshotters/README.md)
- [OverlayFS Documentation](https://www.kernel.org/doc/html/latest/filesystems/overlayfs.html)
- [k3s GitHub Issue #5080](https://github.com/k3s-io/k3s/issues/5080) - Synology
  cgroup issues
