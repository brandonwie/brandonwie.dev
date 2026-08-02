---
title: "하이브리드 CI: 셀프 호스팅 Jenkins + GitHub Actions"
description: >-
  하나의 CI 시스템만 쓸 이유가 없어요. 컴퓨팅 집약 작업은 셀프 호스팅 Jenkins로,
  OIDC가 필요한 PR 게이트는 GitHub Actions로 나누는 방법이에요.
date: 2026-03-26T00:00:00.000Z
updated: "2026-08-02"
tags:
  - devops
  - ci-cd
  - jenkins
  - github-actions
  - architecture-decision
category: devops
draft: false
lang: ko
source_lang: en
source_slug: hybrid-ci-jenkins-github-actions
source_updated: "2026-08-02"
translation_date: "2026-04-06"
references:
  - url: 'https://www.jenkins.io/doc/book/pipeline/syntax/'
    title: Jenkins Pipeline Syntax
    type: official
  - url: 'https://docs.github.com/en/actions/writing-workflows'
    title: GitHub Actions Workflow Syntax
    type: official
  - url: 'https://docs.github.com/en/actions/reference/limits'
    title: GitHub Actions usage limits
    type: official
  - url: >-
      https://docs.github.com/en/billing/managing-billing-for-your-products/about-billing-for-github-actions
    title: About billing for GitHub Actions
    type: official
  - url: >-
      https://docs.github.com/en/actions/concepts/workflows-and-actions/custom-actions
    title: Custom actions
    type: official
  - url: 'https://www.jenkins.io/doc/book/scaling/hardware-recommendations/'
    title: Jenkins hardware recommendations
    type: official
---

폴리글랏 서비스 — Python, Go, Rust, TypeScript — 를 포함하는 개인 레포에 어떤 CI 시스템을 써야 할까요? 순진한 답은 "하나만 고르세요"예요. 더 나은 답은: 둘 다 쓰되, 각각이 설계된 목적에 맞게 사용하는 거예요.

## 분할 원칙

모든 도구에는 최적의 용도가 있어요. GitHub Actions는 호스팅 환경에서 실행되는 가볍고 빠른 PR 게이트에 뛰어나요. Jenkins는 하드웨어를 직접 제어하는 컴퓨팅 집약적 작업에 뛰어나요. 어느 한쪽에 다른 쪽의 역할을 억지로 시키면 마찰이 생겨요.

분할은 이렇게 동작해요:

**Jenkins (NAS에 셀프 호스팅):** testcontainers를 활용한 통합 테스트, Docker 이미지 빌드, WASM 컴파일, 보안 스캐닝, ML 파이프라인 트리거. 이미 가지고 있는 하드웨어를 쓰기 때문에 분 단위 미터기가 돌지 않아요.

**GitHub Actions (호스팅):** Lint, 타입 체크, lock 파일 검사, Cloud Run 배포. GCP의 Workload Identity Federation과 OIDC는 GitHub Actions의 네이티브 통합이 필요해요. 이런 작업은 2분 이내에 끝나고, 표준 GitHub 호스팅 러너를 쓰는 퍼블릭 레포에서는 Actions 사용이 무료예요.

## 의사결정 매트릭스

| 차원          | Jenkins (셀프 호스팅 NAS)   | GitHub Actions (호스팅)                              |
| ------------- | --------------------------- | ---------------------------------------------------- |
| 작업 길이     | 내 하드웨어가 한계          | 호스팅 러너에서 작업당 6시간                         |
| Docker        | 내가 제어하는 호스트의 데몬 | Linux 러너에 사전 설치됨, 컨테이너 액션은 Linux 전용 |
| 비용          | 이미 지불한 하드웨어        | 퍼블릭 레포는 무료, 프라이빗은 월 분 할당량 차감     |
| 통합 테스트   | testcontainers + Kafka      | 서비스 컨테이너, 같은 분 할당량에서 지출             |
| 클라우드 배포 | 수동 SSH/compose            | GCP 네이티브 WIF/OIDC                                |
| 운영 부담     | 서버를 내가 유지보수        | 운영 비용 제로                                       |

이 표에 대해 두 가지만 덧붙일게요. GitHub Actions 쪽 수치는 공식 문서에서 온 거예요 — 호스팅 러너에서 작업당 6시간, 퍼블릭 레포는 무료 사용, 프라이빗 레포는 월 분 할당량. 반면 Jenkins 열은 Jenkins의 속성이 아니라 제 셋업이에요. "분 단위 제한 없음"은 그 머신이 제 것이고 평소에 놀고 있기 때문에 성립하는 이야기예요.

이 글의 이전 버전에서 한 가지 틀린 내용을 바로잡을게요. Docker 행에 "setup-docker 액션 필요"라고 적었는데, 사실이 아니에요. GitHub 호스팅 Linux 러너에는 Docker가 이미 떠 있고, 그 액션은 주로 Docker가 없는 플랫폼을 위한 거예요. 실제로 걸리는 제약은 더 좁아요 — Docker 컨테이너 액션은 Linux 운영체제 러너에서만 실행돼요.

## 이 분할이 강제하는 결정

핵심은 도구를 두 개 쓴다는 게 아니에요. 모든 작업에 대해 "이게 왜 여기 있어야 하는가"를 말하게 만든다는 점이에요. 컴퓨팅 집약 작업은 분이 무료이고 하드웨어가 내 것인 쪽으로, OIDC가 필요한 배포는 아이덴티티 페더레이션이 네이티브인 쪽으로 가요. 둘 중 어디에도 해당하지 않는 작업이라면 한 번 더 들여다볼 만해요.

Jenkins를 직접 운영하는 것도 공짜는 아니에요 — 분 대신 운영으로 지불할 뿐이에요. 서버 유지보수, 플러그인 업그레이드, 백업, 가끔 멈춰버리는 에이전트가 전부 제 몫이 돼요. 이게 "무료" 컴퓨팅의 실제 비용이고, 분할한 뒤가 아니라 분할하기 전에 결정에 포함되어야 해요.

## 이 아키텍처가 적합한 경우

- 호스팅 러너 분 할당량이 소수의 긴 통합 테스트 작업에 다 소진되고, 그 작업을 이미 보유한 하드웨어에서 돌릴 수 있을 때
- 컴퓨팅 집약 테스트가 월 분 할당량을 소진할 수 있는 폴리글랏 레포
- 단일 작업이 호스팅 러너의 6시간 제한을 넘길 때

## 적합하지 않은 경우

- lint와 배포만 필요한 경우 — GitHub Actions만으로 충분해요
- 호스트 메모리가 빠듯한 경우. Jenkins 공식 하드웨어 가이드는 단일 수치를 제시하지 않고 "작은 설치의 200 MB부터 거대한 단일 컨트롤러의 70+ GB까지"라고만 말해요. 플러그인과 동시 빌드 수에 따라 늘어나니, 최소치가 아니라 실제 빌드에 맞춰 잡으세요.
- 팀이 하나의 도구로 표준화한 프로젝트 — 분할을 위한 분할은 하지 마세요

## 핵심 교훈

CI 도구 선택은 아키텍처 결정이에요. 정답이 "가장 인기 있는 걸 고르세요"인 경우는 거의 없어요. 도구를 워크로드에 맞추세요: 빠르고 가벼운 게이트에는 호스팅 러너, 컴퓨팅 집약적인 장시간 작업에는 셀프 호스팅. 하이브리드는 실제 운영 오버헤드를 지불하고 무료 컴퓨팅을 사는 거라서, 옮기려는 컴퓨팅이 체감될 만큼 클 때만 값어치를 해요.
