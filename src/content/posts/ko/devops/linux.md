---
title: Linux 기초
description: "컨테이너를 위한 필수 Linux 개념: cgroups, snapshotters, 권한, ACLs"
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - linux
category: devops
draft: false
lang: ko
source_lang: en
source_slug: linux
source_updated: "2026-01-23"
translation_date: "2026-02-12"
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

Synology NAS에서 k3s 실패를 디버깅하다가 컨테이너가 의존하는 Linux
서브시스템을 실제로 이해하지 못하고 있다는 걸 깨달았어요. 에러는 "pids
cgroup controller not found"였는데, 그게 뭘 의미하는지 전혀 몰랐어요. 이
글은 비표준 하드웨어에서 컨테이너를 돌리기 위해 배워야 했던 네 가지 Linux
기초를 다뤄요: cgroups, snapshotters, 파일시스템 권한, ACLs.

## 왜 중요한가

컨테이너는 마법이 아니에요. 편리한 도구로 감싼 Linux 커널 기능이에요. 도구가
작동할 때는 커널을 생각하지 않아요. 하지만 깨지면 -- cgroup 컨트롤러 누락,
지원되지 않는 파일시스템, 권한 이슈 -- 효과적으로 디버깅하려면 밑단의
메커니즘을 이해해야 해요.

---

## Cgroups (Control Groups)

Cgroups는 프로세스 그룹에 대해 시스템 리소스(CPU, 메모리, 디스크 I/O,
네트워크)를 할당, 제한, 모니터링하는 Linux 커널 기능이에요. 컨테이너를 위한
"리소스 예산"이라고 생각하면 돼요.

컨테이너를 실행하면 컨테이너 런타임이 cgroups를 사용해서 그 컨테이너가
시스템 리소스를 독점하지 못하게 해요. Cgroups 없이는 잘못 동작하는 컨테이너가:

- CPU 100%를 사용해서 다른 컨테이너를 굶길 수 있어요
- 모든 가용 메모리를 소비해서 OOM kill이 발생할 수 있어요
- Fork bomb으로 시스템을 무한 프로세스로 채울 수 있어요
- 디스크 I/O를 포화시켜 시스템이 응답하지 않게 할 수 있어요

### Cgroups 동작 방식

각 cgroup 컨트롤러가 특정 유형의 리소스를 관리해요:

| 컨트롤러  | 제한 대상     | 예시                                   |
| --------- | ------------- | -------------------------------------- |
| `cpu`     | CPU 시간      | "이 컨테이너는 최대 50% CPU"           |
| `memory`  | RAM 사용량    | "이 컨테이너는 최대 512MB"             |
| `pids`    | 프로세스 수   | "이 컨테이너는 최대 100개 프로세스"    |
| `blkio`   | 디스크 I/O    | "이 컨테이너는 최대 10MB/s 읽기"       |
| `freezer` | 일시정지/재개 | "이 컨테이너의 모든 프로세스를 프리즈" |

cgroups 계층 구조는 `/sys/fs/cgroup/`에 있어요. 각 컨트롤러가 자체
디렉토리를 갖고, 각 컨테이너가 컨트롤러 아래에 하위 디렉토리를 가져요:

```text
/sys/fs/cgroup/               (cgroup 파일시스템 마운트)
├── cpu/                       (CPU 컨트롤러)
│   ├── docker/                (모든 Docker 컨테이너)
│   │   ├── container_abc/     (특정 컨테이너)
│   │   │   ├── cpu.max        (CPU 제한: "50000 100000" = 50%)
│   │   │   └── cpu.stat       (CPU 사용 통계)
│   │   └── container_def/
│   └── system.slice/          (시스템 서비스)
├── memory/                    (메모리 컨트롤러)
│   └── docker/
│       ├── container_abc/
│       │   ├── memory.max     (메모리 제한: "536870912" = 512MB)
│       │   └── memory.current (현재 사용량)
│       └── ...
└── pids/                      (프로세스 수 컨트롤러)
    └── docker/
        ├── container_abc/
        │   ├── pids.max       (최대 프로세스: "100")
        │   └── pids.current   (현재 수)
        └── ...
```

시스템에서 어떤 컨트롤러를 사용할 수 있는지 확인할 수 있어요:

```bash
# 모든 cgroup 컨트롤러와 상태 확인
cat /proc/cgroups

# 출력 예시:
#subsys_name    hierarchy    num_cgroups    enabled
#cpuset         9            3              1
#cpu            5            240            1
#memory         8            277            1
#pids           0            0              0    <- Synology에서 누락!
```

### Cgroup 버전

| 버전          | 특징                                      | 호환성                     |
| ------------- | ----------------------------------------- | -------------------------- |
| **cgroup v1** | 원래 버전, 컨트롤러별 계층 구조           | 레거시, 더 이상 사용 안 함 |
| **cgroup v2** | 통합 계층 구조, 모든 컨트롤러를 함께 관리 | 최신, 새 K8s에 필요        |
| **Hybrid**    | v1과 v2 혼합                              | 전환기, 문제 소지 있음     |

### 흔한 문제: "pids cgroup controller not found"

이 에러가 제 조사의 시작이었어요. Synology NAS의 Linux 커널에
`CONFIG_CGROUP_PIDS`가 활성화되어 있지 않았고, k3s 1.20+는 fork bomb
방지를 위해 이게 필요했어요.

```bash
cat /proc/cgroups | grep pids
# 출력 없음 = pids 컨트롤러 사용 불가
```

해결 방법은: 다른 커널 사용(VM, 다른 배포판), pids를 요구하지 않는 구버전
k3s(1.20 이전) 사용, 또는 Kubernetes 대신 Docker Compose 사용이에요.

### 핵심 정리

- **Cgroups = 리소스 제한** -- 컨테이너가 CPU, 메모리를 독점하거나 너무
  많은 프로세스를 만드는 걸 방지해요
- **`pids` 컨트롤러는 K8s에 필수** -- 최신 Kubernetes(1.20+)가 fork bomb
  방지를 위해 요구해요
- **`cat /proc/cgroups`로 확인** -- 커널이 뭘 지원하는지 빠르게 확인하는
  방법이에요

---

## Snapshotters

Snapshotters는 컨테이너 런타임(containerd 같은)이 컨테이너 파일시스템
레이어를 관리하는 전략이에요. 컨테이너들은 베이스 이미지(예:
`ubuntu:22.04`)를 공유하지만 각각 변경사항을 위한 자체 쓰기 가능 레이어가
필요해요.

도서관 책에 투명 스티커 메모를 붙이는 것처럼 생각하면 돼요. 베이스 이미지는
원본 책 -- 읽기 전용, 모든 사람이 공유. 컨테이너 레이어는 스티커 메모 --
쓰기 가능, 각자 고유. 병합된 뷰는 보이는 것 -- 둘이 매끄럽게 결합.

효율적인 snapshotters 없이는 nginx 컨테이너 100개를 실행하면 nginx 복사본
100개(각 ~50MB = 5GB)가 필요하고, 매 컨테이너 시작마다 전체 베이스 이미지를
복사해야 해요. Snapshotters를 사용하면 100개 컨테이너가 하나의 베이스
이미지(~50MB)를 공유하고, 컨테이너별 고유한 변경만 저장되고, 컨테이너
시작이 거의 즉시 이뤄져요.

### Snapshotters 동작 방식 (overlayfs)

지배적인 snapshotter는 커널 수준 파일시스템 레이어링을 사용하는
overlayfs예요:

```text
변경사항 (Upper Layer - 쓰기 가능)
  /app/myconfig.txt (새 파일)
  /etc/nginx/nginx.conf (수정됨)
  (/var/lib/docker/overlay2/abc123/diff/에 저장)

  OverlayFS를 사용해 위에 "오버레이"

원본 이미지 (Lower Layer - 읽기 전용)
  nginx:latest 베이스 이미지
  /usr/share/nginx/html/
  /etc/nginx/nginx.conf (원본)
  (한 번만 저장, 모든 컨테이너가 공유)

  Union mount가 병합된 뷰 생성

컨테이너가 보는 것 (Merged View)
  완전한 파일시스템처럼 보임
  원본 파일 + 변경사항이 결합
  컨테이너는 레이어된 걸 모름
```

### Snapshotter 대안

| Snapshotter      | 동작 방식                     | 성능 | 사용 사례              |
| ---------------- | ----------------------------- | ---- | ---------------------- |
| `overlayfs`      | 커널 수준 파일시스템 레이어링 | 빠름 | 대부분의 Linux 기본값  |
| `native`         | 쓰기 시 전체 이미지 복사      | 느림 | overlayfs 불가 시 폴백 |
| `fuse-overlayfs` | FUSE 기반 오버레이 에뮬레이션 | 중간 | Rootless 컨테이너      |
| `zfs`            | ZFS copy-on-write             | 빠름 | ZFS 시스템             |
| `btrfs`          | Btrfs 스냅샷                  | 빠름 | Btrfs 시스템           |

### 흔한 문제: "overlayfs: cannot mount"

커널이 overlayfs를 지원하지 않거나 컨테이너 안에서 컨테이너를 실행할 때
발생해요.

```bash
grep overlay /proc/filesystems
# 출력 없음 = overlayfs 사용 불가
```

해결 방법은 containerd나 k3s 실행 시 `--snapshotter=native`를 사용하는
거예요. 더 느리지만(전체 이미지를 복사) 어디서든 작동해요.

### 핵심 정리

- **Snapshotters = 효율적인 스토리지** -- 100개 컨테이너가 하나의 베이스
  이미지를 공유할 수 있게 해요
- **overlayfs는 커널 지원이 필요** -- 없으면 `native`로 폴백 (느리지만
  작동)

---

## 파일시스템 권한

Unix 파일시스템 권한은 누가 파일을 읽고, 쓰고, 실행할 수 있는지 제어해요.
모든 파일에는 소유자, 그룹, "기타" 범주가 있어요. 권한은 3자리 8진수 숫자
또는 기호 표기법으로 표현돼요.

```text
-rw-r--r--  1  user  group  1024  Jan 16 10:00  file.txt
│└┬┘└┬┘└┬┘
│ │  │  └── Others: r-- (읽기 전용)
│ │  └───── Group: r-- (읽기 전용)
│ └──────── Owner: rw- (읽기 + 쓰기)
└────────── 파일 유형: - (일반 파일)

8진수 표기:
  r = 4   읽기
  w = 2   쓰기
  x = 1   실행

  Owner: rw- = 4+2 = 6
  Group: r-- = 4   = 4
  Others: r-- = 4  = 4
  결과: 644

흔한 권한:
  644  -rw-r--r--  일반 파일 (소유자 쓰기, 나머지 읽기)
  755  -rwxr-xr-x  실행파일/디렉토리 (소유자 전체, 나머지 읽기+실행)
  700  -rwx------  비공개 (소유자만)
  600  -rw-------  비공개 파일 (소유자 읽기/쓰기만)
```

컨테이너에서 이게 중요한 이유는 SSH 때문이에요. SSH는 권한에 매우
엄격해요 -- 키는 600이어야 하고, `.ssh/` 디렉토리는 700이어야 해요. 권한이
잘못되면 SSH가 조용히 인증을 거부하고 실제 원인에 대한 힌트 없이 일반적인
"permission denied" 에러를 줘요.

### 핵심 정리

- **SSH는 권한에 매우 엄격** -- 키는 600, .ssh/는 700이어야 해요
- **디렉토리는 진입에 실행 권한이 필요** -- 644인 디렉토리는 목록을 볼 수
  있지만 진입할 수 없어요
- **기본 권한은 umask에서 나옴** -- 보통 022, 새 파일은 644가 돼요

---

## ACLs (Access Control Lists)

ACLs는 전통적인 Unix 권한보다 더 세밀한 권한 제어를 제공해요. 같은 파일에
대해 여러 사용자나 그룹에 다른 권한을 부여할 수 있어요.

전통적인 권한: "소유자가 쓸 수 있고, 나머지는 읽기만."
ACLs: "소유자가 쓸 수 있고, 사용자 bob은 읽기, 그룹 devs는 읽기+쓰기,
사용자 alice는 접근 불가."

### ACL 감지

```bash
# + 기호가 ACL이 있음을 나타냄
ls -la ~/.ssh/
drwxrwxrwx+  2 user group 4096 Jan 16 10:00 .ssh/
          ^
          └── 이 +는 ACL이 표준 권한을 오버라이드한다는 뜻!
```

이 `+` 기호가 Synology에서의 SSH 문제를 해결하는 열쇠였어요. `chmod 700
~/.ssh`와 `chmod 600 ~/.ssh/authorized_keys`를 실행했는데도 권한이
`rwxrwxrwx`로 유지됐어요. ACLs가 `chmod`를 오버라이드하고 있었어요.

### ACL 확인 및 제거

```bash
# Linux
getfacl ~/.ssh/

# Synology (전용 도구)
synoacltool -get ~/.ssh/
```

```bash
# ACL을 제거해서 chmod가 작동하게 하기
sudo synoacltool -del ~/.ssh
sudo synoacltool -del ~/.ssh/authorized_keys

# 그런 다음 권한 설정
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 핵심 정리

- **ACLs가 chmod를 오버라이드할 수 있음** -- ACLs가 있으면 chmod가 아무
  효과가 없는 것처럼 보일 수 있어요
- **+ 기호를 확인하세요** -- `ls -la`에서 권한 뒤의 `+`가 ACLs를 나타내요
- **Synology는 ACLs를 광범위하게 사용** -- SSH가 작동하려면 제거해야 할 수
  있어요

---

## Synology 관련 참고사항

Synology DSM은 커스터마이즈된 Linux 커널(3.10.x 기반)을 사용해서 여러 최신
기능이 빠져 있어요. 그래서 k3s를 실행하려다 많은 문제에 부딪혔어요.

| 기능                 | 상태   | 영향                            |
| -------------------- | ------ | ------------------------------- |
| `CONFIG_CGROUP_PIDS` | 누락   | k3s 1.20+ 실행 불가             |
| `CONFIG_SECCOMP`     | 제한적 | 일부 보안 기능 사용 불가        |
| overlayfs (중첩)     | 제한적 | Docker 안에서 overlay 중첩 불가 |

Synology에서 사용 가능한 cgroup 컨트롤러:

```text
cpuset, cpu, cpuacct, blkio, memory, devices, freezer
```

누락된 것:

```text
pids, hugetlb, perf_event, net_cls, net_prio
```

실질적인 결론: Synology NAS는 Docker Compose에는 잘 작동하지만
Kubernetes에는 적합하지 않아요. Kubernetes가 필요하면 완전한 기능의 커널을
갖춘 적절한 VM이나 클라우드 인스턴스를 사용하세요.

---

## 실전 팁

이 네 가지 Linux 서브시스템 -- cgroups, snapshotters, 권한, ACLs -- 은
컨테이너의 기반이에요. `docker compose up`을 실행하는 데는 이해할 필요가
없지만, 비표준 환경에서 실패를 디버깅할 때는 반드시 필요해요.

기억해야 할 진단 명령어:

- `cat /proc/cgroups` -- 사용 가능한 cgroup 컨트롤러 확인
- `grep overlay /proc/filesystems` -- overlayfs 지원 확인
- `ls -la`에서 `+` 확인 -- ACL 감지
- `getfacl` 또는 `synoacltool -get` -- ACL 세부사항 확인

---

## 참고 자료

- [Linux Kernel Cgroups Documentation](https://www.kernel.org/doc/html/latest/admin-guide/cgroup-v2.html)
- [containerd Snapshotters](https://github.com/containerd/containerd/blob/main/docs/snapshotters/README.md)
- [OverlayFS Documentation](https://www.kernel.org/doc/html/latest/filesystems/overlayfs.html)
- [k3s GitHub Issue #5080](https://github.com/k3s-io/k3s/issues/5080) - Synology cgroup issues
