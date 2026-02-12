---
title: Linux Fundamentals
description: "Essential Linux concepts for containers: cgroups, snapshotters, permissions, and ACLs."
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - linux
category: devops
draft: false
lang: en
references:
  - url: "https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html"
    title: cgroup v2.html
    type: verified
  - url: >-
      https://github.com/containerd/containerd/blob/main/docs/snapshotters/README.md
    title: README.md
    type: official
  - url: "https://www.kernel.org/doc/html/latest/filesystems/overlayfs.html"
    title: overlayfs.html
    type: verified
  - url: "https://github.com/k3s-io/k3s/issues/5080"
    title: "5080"
    type: official
---

I was debugging k3s failures on a Synology NAS when I realized I did not
actually understand the Linux subsystems that containers depend on. The error
was "pids cgroup controller not found," and I had no idea what that meant.
This post covers the four Linux fundamentals I had to learn to get containers
running on non-standard hardware: cgroups, snapshotters, filesystem
permissions, and ACLs.

## Why This Matters

Containers are not magic. They are Linux kernel features wrapped in convenient
tooling. When the tooling works, you never think about the kernel. When it
breaks -- missing cgroup controllers, unsupported filesystems, permission
issues -- you need to understand the underlying mechanics to debug effectively.

---

## Cgroups (Control Groups)

Cgroups are a Linux kernel feature that allocates, limits, and monitors system
resources (CPU, memory, disk I/O, network) for groups of processes. Think of
them as "resource budgets" for containers.

When you run a container, the container runtime uses cgroups to ensure that
container cannot hog all the system resources. Without cgroups, a misbehaving
container could:

- Use 100% of CPU, starving other containers
- Consume all available memory, causing OOM kills
- Fork-bomb the system with infinite processes
- Saturate disk I/O, making the system unresponsive

### How Cgroups Work

Each cgroup controller manages a specific type of resource:

| Controller | What It Limits | Example                                      |
| ---------- | -------------- | -------------------------------------------- |
| `cpu`      | CPU time       | "This container gets 50% CPU max"            |
| `memory`   | RAM usage      | "This container gets 512MB max"              |
| `pids`     | Process count  | "This container can spawn max 100 processes" |
| `blkio`    | Disk I/O       | "This container gets 10MB/s read max"        |
| `freezer`  | Pause/resume   | "Freeze all processes in this container"     |

The cgroups hierarchy lives in `/sys/fs/cgroup/`. Each controller has its own
directory, and each container gets a subdirectory under its controller:

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

You can check which controllers are available on your system:

```bash
# View all cgroup controllers and their status
cat /proc/cgroups

# Example output:
#subsys_name    hierarchy    num_cgroups    enabled
#cpuset         9            3              1
#cpu            5            240            1
#memory         8            277            1
#pids           0            0              0    <- MISSING on Synology!
```

### Cgroup Versions

| Version       | Features                                    | Compatibility               |
| ------------- | ------------------------------------------- | --------------------------- |
| **cgroup v1** | Original, per-controller hierarchy          | Legacy, being deprecated    |
| **cgroup v2** | Unified hierarchy, all controllers together | Modern, required by new K8s |
| **Hybrid**    | Mix of v1 and v2                            | Transitional, problematic   |

### Common Issue: "pids cgroup controller not found"

This is the error that started my investigation. The Linux kernel on my
Synology NAS did not have `CONFIG_CGROUP_PIDS` enabled, and k3s 1.20+
requires it to prevent fork bombs.

```bash
cat /proc/cgroups | grep pids
# No output = pids controller not available
```

The solutions are: use a different kernel (VM, different distro), use older
k3s (pre-1.20) that does not require it, or use Docker Compose instead of
Kubernetes.

### Key Takeaways

- **Cgroups = resource limits** -- They prevent containers from hogging CPU,
  memory, or spawning too many processes
- **`pids` controller is critical for K8s** -- Modern Kubernetes (1.20+)
  requires it to prevent fork bombs
- **Check with `cat /proc/cgroups`** -- Quick way to see what your kernel
  supports

---

## Snapshotters

Snapshotters are the strategy that container runtimes (like containerd) use to
manage container filesystem layers. Containers share a base image (like
`ubuntu:22.04`) but each needs its own writable layer for changes.

Think of it like a library book with transparent sticky notes. The base image
is the original book -- read-only, shared by everyone. The container layer is
your sticky notes -- writable, unique to you. The merged view is what you see
-- both combined seamlessly.

Without efficient snapshotters, running 100 nginx containers would require 100
copies of nginx (~50MB each = 5GB), and every container start would require
copying the entire base image. With snapshotters, 100 containers share ONE
base image (~50MB), only unique changes are stored per container, and container
startup is nearly instant.

### How Snapshotters Work (overlayfs)

The dominant snapshotter is overlayfs, which uses kernel-level filesystem
layering:

```text
YOUR CHANGES (Upper Layer - writable)
  /app/myconfig.txt (new file)
  /etc/nginx/nginx.conf (modified)
  (stored in: /var/lib/docker/overlay2/abc123/diff/)

  "overlaid" on top using OverlayFS

ORIGINAL IMAGE (Lower Layer - read-only)
  nginx:latest base image
  /usr/share/nginx/html/
  /etc/nginx/nginx.conf (original)
  (stored once, shared by all containers)

  Union mount creates merged view

WHAT CONTAINER SEES (Merged View)
  Looks like a complete filesystem
  Original files + Your changes combined
  Container doesn't know it's layered
```

### Snapshotter Alternatives

| Snapshotter      | How It Works                     | Performance | Use Case                            |
| ---------------- | -------------------------------- | ----------- | ----------------------------------- |
| `overlayfs`      | Kernel-level filesystem layering | Fast        | Default for most Linux              |
| `native`         | Copy entire image on write       | Slow        | Fallback when overlayfs unavailable |
| `fuse-overlayfs` | FUSE-based overlay emulation     | Medium      | Rootless containers                 |
| `zfs`            | ZFS copy-on-write                | Fast        | ZFS systems                         |
| `btrfs`          | Btrfs snapshots                  | Fast        | Btrfs systems                       |

### Common Issue: "overlayfs: cannot mount"

This happens when the kernel does not support overlayfs or you are running
containers nested inside containers.

```bash
grep overlay /proc/filesystems
# No output = overlayfs not available
```

The solution is to use `--snapshotter=native` when running containerd or k3s.
It is slower (copies the entire image) but works everywhere.

### Key Takeaways

- **Snapshotters = efficient storage** -- They let 100 containers share one
  base image
- **overlayfs needs kernel support** -- If missing, fall back to `native`
  (slower but works)

---

## Filesystem Permissions

Unix filesystem permissions control who can read, write, or execute files.
Every file has an owner, a group, and an "others" category. Permissions are
expressed as a 3-digit octal number or symbolic notation.

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

The reason this matters for containers is SSH. SSH is extremely strict about
permissions -- keys must be 600, the `.ssh/` directory must be 700. If
permissions are wrong, SSH silently refuses to authenticate and gives you a
generic "permission denied" error with no hint about the actual cause.

### Key Takeaways

- **SSH is extremely strict about permissions** -- Keys must be 600, .ssh/
  must be 700
- **Directories need execute to enter** -- A directory with 644 can be listed
  but not entered
- **Default permissions come from umask** -- Usually 022, meaning new files
  are 644

---

## ACLs (Access Control Lists)

ACLs provide more granular permission control than traditional Unix
permissions. They allow you to grant different permissions to multiple users or
groups on the same file.

Traditional permissions: "Owner can write, everyone else can read."
ACLs: "Owner can write, user bob can read, group devs can read+write, user
alice has no access."

### Detecting ACLs

```bash
# The + sign indicates ACLs are present
ls -la ~/.ssh/
drwxrwxrwx+  2 user group 4096 Jan 16 10:00 .ssh/
          ^
          └── This + means ACLs override standard permissions!
```

This `+` sign was the key to solving my SSH problem on Synology. I had run
`chmod 700 ~/.ssh` and `chmod 600 ~/.ssh/authorized_keys`, but the
permissions stayed at `rwxrwxrwx`. ACLs were overriding `chmod`.

### Viewing and Removing ACLs

```bash
# Linux
getfacl ~/.ssh/

# Synology (custom tool)
synoacltool -get ~/.ssh/
```

```bash
# Remove ACLs so chmod can take effect
sudo synoacltool -del ~/.ssh
sudo synoacltool -del ~/.ssh/authorized_keys

# Then set permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### Key Takeaways

- **ACLs can override chmod** -- If ACLs are present, chmod may appear to do
  nothing
- **Look for the + sign** -- In `ls -la`, a `+` after permissions indicates
  ACLs
- **Synology uses ACLs extensively** -- May need to remove them for SSH to
  work

---

## Synology-Specific Notes

Synology DSM uses a customized Linux kernel (3.10.x based) that lacks several
modern features. This is why I hit so many issues trying to run k3s on it.

| Feature              | Status  | Impact                             |
| -------------------- | ------- | ---------------------------------- |
| `CONFIG_CGROUP_PIDS` | Missing | k3s 1.20+ won't run                |
| `CONFIG_SECCOMP`     | Limited | Some security features unavailable |
| overlayfs (nested)   | Limited | Can't nest overlays in Docker      |

Available cgroup controllers on Synology:

```text
cpuset, cpu, cpuacct, blkio, memory, devices, freezer
```

Missing:

```text
pids, hugetlb, perf_event, net_cls, net_prio
```

The practical conclusion: Synology NAS works well for Docker Compose but not
for Kubernetes. If you need Kubernetes, use a proper VM or cloud instance with
a full-featured kernel.

---

## Practical Takeaway

These four Linux subsystems -- cgroups, snapshotters, permissions, and ACLs --
are the foundation containers are built on. You do not need to understand them
to run `docker compose up`, but you absolutely need them when debugging
failures on non-standard environments.

The diagnostic commands to remember:

- `cat /proc/cgroups` -- Check available cgroup controllers
- `grep overlay /proc/filesystems` -- Check overlayfs support
- `ls -la` and look for `+` -- Detect ACLs
- `getfacl` or `synoacltool -get` -- View ACL details

---

## References

- [Linux Kernel Cgroups Documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [containerd Snapshotters](https://github.com/containerd/containerd/blob/main/docs/snapshotters/README.md)
- [OverlayFS Documentation](https://www.kernel.org/doc/html/latest/filesystems/overlayfs.html)
- [k3s GitHub Issue #5080](https://github.com/k3s-io/k3s/issues/5080) - Synology cgroup issues
