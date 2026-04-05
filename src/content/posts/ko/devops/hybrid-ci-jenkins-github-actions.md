---
title: "하이브리드 CI: 셀프 호스팅 Jenkins + GitHub Actions"
description: >-
  하나의 CI 시스템만 쓸 이유가 없어요. 폴리글랏 포트폴리오 프로젝트를 위해
  각 도구의 강점을 살리는 분할 아키텍처를 소개해요.
date: 2026-03-26T00:00:00.000Z
updated: "2026-04-06"
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
source_updated: "2026-04-06"
translation_date: "2026-04-06"
references:
  - url: 'https://www.jenkins.io/doc/book/pipeline/syntax/'
    title: Jenkins Pipeline Syntax
    type: official
  - url: 'https://docs.github.com/en/actions/writing-workflows'
    title: GitHub Actions Workflow Syntax
    type: official
---

폴리글랏 서비스 — Python, Go, Rust, TypeScript — 를 포함하는 포트폴리오 프로젝트에 어떤 CI 시스템을 써야 할까요? 순진한 답은 "하나만 고르세요"예요. 더 나은 답은: 둘 다 쓰되, 각각이 설계된 목적에 맞게 사용하는 거예요.

## 분할 원칙

모든 도구에는 최적의 용도가 있어요. GitHub Actions는 호스팅 환경에서 실행되는 가볍고 빠른 PR 게이트에 뛰어나요. Jenkins는 하드웨어를 직접 제어하는 컴퓨팅 집약적 작업에 뛰어나요. 어느 한쪽에 다른 쪽의 역할을 억지로 시키면 마찰이 생겨요.

분할은 이렇게 동작해요:

**Jenkins (NAS에 셀프 호스팅):** testcontainers를 활용한 통합 테스트, Docker 이미지 빌드, WASM 컴파일, 보안 스캐닝, ML 파이프라인 트리거. 무료 컴퓨팅, 분 단위 제한 없음, 하드웨어 풀 액세스.

**GitHub Actions (호스팅):** Lint, 타입 체크, lock 파일 검사, Cloud Run 배포. GCP의 Workload Identity Federation과 OIDC는 GitHub Actions의 네이티브 통합이 필요해요. 이런 작업은 2분 이내에 끝나고 퍼블릭 레포에서는 무료예요.

## 의사결정 매트릭스

| 차원               | Jenkins (NAS)              | GitHub Actions                     |
| ------------------ | -------------------------- | ---------------------------------- |
| 컴퓨팅             | 무제한 (NAS CPU)           | 6시간 작업 제한, 분 단위 할당량    |
| Docker             | 네이티브 DinD              | setup-docker 액션 필요             |
| 비용               | $0 (NAS 하드웨어)          | 퍼블릭은 무료, 프라이빗은 분 과금  |
| 통합 테스트        | testcontainers, 실제 Kafka | 느린 서비스 컨테이너               |
| 클라우드 배포      | 수동 SSH/compose           | GCP 네이티브 WIF/OIDC              |
| 운영 부담          | 서버 유지보수 필요         | 운영 비용 제로                     |

## 포트폴리오 프로젝트에서 왜 중요한가

하이브리드 접근 방식은 엔지니어링 면접에서 중요한 것을 보여줘요: 도구 숙련도가 아닌 **도구 선택 판단력**이에요. "무료 컴퓨팅이라 NAS의 Jenkins를 컴퓨팅 집약 작업에 사용하고, GCP와의 OIDC 통합이 네이티브인 GitHub Actions를 PR 게이트에 사용했어요"라고 말하는 건 Staff+ 엔지니어링 시그널이에요.

NAS의 Jenkins는 또한 셀프 호스팅 CI 운영 — 서버 유지보수, 플러그인 관리, pipeline-as-code — 을 보여주는데, 이건 GitHub Actions만으로는 보여줄 수 없는 경험이에요. 포트폴리오 프로젝트에서는 이런 폭넓은 경험이 핵심이에요.

## 이 아키텍처가 적합한 경우

- 매니지드와 셀프 호스팅 CI 경험을 모두 보여주고 싶은 포트폴리오 프로젝트
- 업무에서 이미 한 가지 CI 도구(GitHub Actions)를 매일 사용하고 있고, 경험 갭(Jenkins)을 채우고 싶을 때
- 컴퓨팅 집약 테스트가 GitHub Actions 분 할당량을 소진할 수 있는 폴리글랏 레포

## 적합하지 않은 경우

- lint와 배포만 필요한 경우 — GitHub Actions만으로 충분해요
- NAS RAM이 제한적인 경우 (Jenkins 컨트롤러에 200-512MB 필요)
- 팀이 하나의 도구로 표준화한 업무 프로젝트 — 분할을 위한 분할은 하지 마세요

## 핵심 교훈

CI 도구 선택은 아키텍처 결정이에요. 정답이 "가장 인기 있는 걸 고르세요"인 경우는 거의 없어요. 도구를 워크로드에 맞추세요: 빠르고 가벼운 게이트에는 호스팅 러너, 컴퓨팅 집약적인 장시간 작업에는 셀프 호스팅. 하이브리드 셋업은 운영 오버헤드가 더 들지만, 더 넓은 엔지니어링 판단력을 보여줘요.
