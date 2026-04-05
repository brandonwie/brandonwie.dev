---
title: "Docker 서브넷 충돌과 Static IP 서비스"
description: >-
  여러 Docker Compose 프로젝트가 커스텀 브리지 네트워크를 정의하면 서브넷이
  조용히 충돌할 수 있어요. 진단하고 해결하는 방법을 알아보세요.
date: 2026-04-02T00:00:00.000Z
updated: "2026-04-06"
tags:
  - devops
  - docker
  - networking
category: devops
draft: false
lang: ko
source_lang: en
source_slug: docker-subnet-collision-static-ip-services
source_updated: "2026-04-06"
translation_date: "2026-04-06"
references:
  - url: 'https://docs.docker.com/network/drivers/bridge/'
    title: Docker Bridge Network Driver
    type: official
  - url: 'https://typesense.org/docs/27.1/api/cluster-operations.html'
    title: Typesense Cluster Operations
    type: official
---

Typesense 클러스터를 `docker compose up`으로 실행했더니 `Pool overlaps with other one on this address space`라는 에러가 나왔어요. 어떤 네트워크가 충돌하는지도, 뭘 바꿔야 하는지도 알려주지 않더라고요. 5분이면 될 셋업이 한 시간짜리 디버깅이 됐어요.

## 왜 이런 일이 발생하는가

커스텀 IPAM 서브넷이 있는 Docker 브리지 네트워크는 같은 호스트의 다른 네트워크와 겹치면 안 돼요. 두 Docker Compose 프로젝트가 독립적으로 같은 서브넷 범위(예: `172.22.0.0/16`)를 정의하면, 두 번째 프로젝트가 시작 시 실패해요.

이 문제는 클러스터 피어링을 위해 static IP가 필요한 서비스에서 특히 고통스러워요. 예를 들어 Typesense는 raft 합의를 위해 각 노드에 하드코딩된 IP 주소가 필요한데, 이 IP가 세 곳에서 모두 일치해야 해요:

1. **docker-compose.yml** — `networks.typesense-net.ipam.config.subnet`과 각 서비스의 `ipv4_address`
2. **nodes.cluster 파일** — 노드당 `{ip}:{peering_port}:{api_port}`, 읽기 전용으로 마운트
3. **nginx.conf** — 로드 밸런싱을 위한 `upstream` 블록에 각 노드의 IP

다른 compose 프로젝트(제 경우에는 Airflow)가 이미 같은 서브넷을 점유하고 있으면, Docker는 컨테이너 시작 전에 실패해요. 에러 메시지는 아무 도움이 안 돼요.

## 충돌 찾기

모든 Docker 브리지 네트워크와 서브넷을 나열하세요:

```bash
docker network ls --filter 'driver=bridge' --format '{{.Name}}' | \
  while read net; do
    echo "--- $net ---"
    docker network inspect "$net" --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'
  done
```

이렇게 하면 전체 현황이 보여요. Docker는 기본적으로 `172.17-31.0.0/16`에서 할당하므로, 아무도 안 쓰는 범위를 골라야 해요.

## 해결 방법

1. 위의 검사 명령을 실행해서 어떤 서브넷이 사용 중인지 확인
2. 비어 있는 `/16` 범위 선택 (예: `172.22.0.0/16`이 사용 중이면 `172.23.0.0/16` 사용)
3. compose 파일의 `ipam.config.subnet`과 모든 서비스의 `ipv4_address` 업데이트
4. 이전 IP를 참조하는 **모든** 파일 업데이트 — `nodes.cluster`, `nginx.conf`, 컨테이너에 마운트되는 다른 설정 파일

### 마운트된 설정 파일의 함정

제 경우에는 원본 `nodes.cluster`와 `nginx.conf`가 외부 레포지토리에서 읽기 전용으로 마운트되어 있어서 직접 수정할 수 없었어요. 우회 방법으로 `.local/docker/typesense/` 디렉토리에 수정된 IP가 담긴 로컬 복사본을 만들고, 그걸 대신 마운트했어요.

에러는 이미지가 풀된 후 `docker compose up` 중에만 나타나요. `docker compose config`로는 서브넷 충돌을 미리 잡을 수 없어요 — 이 명령은 YAML 문법만 검증하지, 네트워크 가용성은 확인하지 않아요.

## 언제 이 문제를 만나게 되는가

같은 머신에서 커스텀 네트워크를 가진 여러 Docker Compose 프로젝트를 실행할 때 이 문제가 발생해요 — 로컬 개발 환경에서 흔한 구성이에요. Docker 브리지 네트워크에서 static IP가 필요한 모든 서비스가 취약해요: Typesense, Elasticsearch, etcd, CockroachDB.

단일 프로젝트 셋업이나 Docker의 DNS 기반 서비스 디스커버리를 사용하는 서비스에서는 서브넷 충돌이 문제가 안 돼요. 프로덕션에서는 보통 호스트 네트워킹이나 오버레이 네트워크를 사용하므로 이 종류의 문제를 피할 수 있어요.

## 핵심 교훈

`Pool overlaps with other one on this address space`가 보이면, `docker network inspect`로 모든 Docker 네트워크를 검사하고, 충돌을 찾고, 비어 있는 서브넷을 선택하세요. 에러 메시지는 어떤 네트워크가 충돌하는지 절대 알려주지 않아요 — 직접 찾아야 해요.
