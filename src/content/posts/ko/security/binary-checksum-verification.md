---
title: 바이너리 체크섬 검증
description: SHA256 체크섬을 사용해 다운로드한 바이너리가 변조되지 않았는지 검증하는 방법
date: 2026-01-26T00:00:00.000Z
updated: 2026-01-26T00:00:00.000Z
tags:
  - security
  - devops
  - supply-chain
category: security
draft: false
lang: ko
source_lang: en
source_slug: binary-checksum-verification
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: >-
      https://www.gnu.org/software/coreutils/manual/html_node/sha2-utilities.html
    title: GNU sha256sum utility
    type: official
---

Dockerfile에 ECR credential helper를 추가하다가, S3 버킷에서 바이너리를 아무런 검증 없이 그냥 다운로드하고 있다는 걸 발견했어요. 그 버킷이 침해당하면 모든 컨테이너 빌드가 조용히 악성 코드를 설치하게 되는 거예요. SHA256 체크섬으로 이 문제를 어떻게 해결했는지, 그리고 예상보다 어려웠던 부분들을 공유할게요.

## 왜 중요한가

다운로드한 바이너리에 대한 공급망 공격은 이론적인 이야기가 아니에요. 공격자가 다운로드 서버나 CDN을 침해하면 정상 바이너리를 악성 버전으로 교체할 수 있어요. Dockerfile이 이를 다운로드하고 설치하면, 악성 코드가 컨테이너의 권한으로 실행돼요. 체크섬 검증은 가장 간단한 방어 수단이에요. 해시가 일치하지 않으면 바이너리가 실행되기 전에 빌드가 실패해요.

## 해결 방법

패턴은 간단해요. 바이너리를 다운로드하고, SHA256 해시를 알려진 정상 값과 비교한 뒤, 일치할 때만 실행 권한을 부여해요:

```dockerfile
# 바이너리 다운로드
RUN curl -sL "https://example.com/binary" -o /usr/local/bin/binary \
    #
    # 체크섬 검증 (보안 - 공급망 공격 방지)
    # 형식: "<예상_해시>  <파일경로>" (주의: 공백 두 개 필요)
    # sha256sum -c는 해시를 읽고, 실제 해시를 계산하고, 비교함
    # 불일치 시 → 빌드 실패 (파일이 변조됨)
    #
    && echo "abc123...  /usr/local/bin/binary" | sha256sum -c - \
    && chmod +x /usr/local/bin/binary
```

## 예상보다 어려웠던 점들

세 줄짜리 패턴이 시사하는 것보다 네 가지 문제가 일을 더 어렵게 만들었어요.

**보이지 않는 공백 두 개 구분자.** `sha256sum -c`는 해시와 파일 경로 사이에 정확히 공백 두 개를 요구해요. 공백 하나면 "no properly formatted checksum lines found"라는 원인을 알 수 없는 에러가 조용히 발생해요. 처음에 이것 때문에 30분을 잃었어요.

**아키텍처별 체크섬을 놓치기 쉬움.** `amd64`와 `arm64`를 모두 지원할 때는 각각에 대한 별도 체크섬이 필요해요. 처음에 하나의 체크섬만 사용했더니 한 아키텍처에서만 빌드가 실패해서, 체크섬 불일치가 아닌 다운로드 문제처럼 보였어요.

**공식 체크섬을 찾는 것이 일관적이지 않음.** 어떤 프로젝트는 릴리스 페이지에 체크섬을 게시하고, 어떤 프로젝트는 `CHECKSUMS` 파일에 포함시키고, ECR credential helper처럼 아예 게시하지 않는 프로젝트도 있어요. 직접 다운로드해서 수동 검증한 뒤 해시를 하드코딩해야 했어요.

**해시 업데이트가 수작업.** 바이너리 버전을 올릴 때마다 지원하는 모든 아키텍처의 체크섬을 계산해서 교체해야 해요. 버전 업데이트 후 체크섬 업데이트를 잊으면 관련 없어 보이는 빌드 실패가 발생해요.

## 예상 체크섬 구하기

두 가지 방법이 있어요:

1. **공식 릴리스 페이지**: 대부분의 프로젝트가 다운로드와 함께 체크섬을 게시해요
2. **직접 계산**: 신뢰할 수 있는 소스에서 한 번 다운로드한 뒤 해시를 기록해요

```bash
# 파일의 SHA256 계산
sha256sum /path/to/binary
# 출력: abc123def456...  /path/to/binary
```

## 실제 사례: ECR Credential Helper

멀티 아키텍처 지원을 위해 작성한 실제 Dockerfile 코드예요:

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

아키텍처 분기에 주목하세요. 각 플랫폼마다 고유한 예상 해시를 가져요. `sha256sum -c -` 명령은 stdin에서 읽고, 파일의 실제 해시를 계산하고, 비교해요. 일치하지 않으면 전체 `RUN` 레이어가 실패하고 빌드가 중단돼요.

## 이 방식이 동작하는 이유

SHA256은 어떤 파일이든 고유한 256비트 지문을 생성해요. 단 1바이트만 바뀌어도 완전히 다른 해시가 나와요. Dockerfile에 예상 해시를 내장함으로써 빌드 시점의 게이트를 만드는 거예요. 바이너리가 정확히 일치해야 이미지가 빌드돼요. 공격자가 원본과 같은 SHA256 해시를 가진 악성 바이너리를 만들어야 하는데, 이는 계산적으로 불가능해요.

## 언제 검증해야 하는가 (그리고 안 해도 되는 경우)

| 시나리오                 | 검증 필요?                     |
| ------------------------ | ------------------------------ |
| 패키지 매니저 (apt, pip) | 아니오 (내장 검증 있음)        |
| 직접 바이너리 다운로드   | 예                             |
| GitHub의 스크립트        | 고려 (또는 서명된 릴리스 사용) |
| 내부 아티팩트            | 선택 (CI/CD를 신뢰)            |

이미 서명된 매니페스트를 통해 무결성을 검증하는 **패키지 매니저**에는 체크섬을 생략하세요. 프로덕션에 닿지 않는 **임시 개발 컨테이너**에도 생략해요. 프로젝트가 **GPG 서명 릴리스**를 게시한다면 서명 검증을 선호하세요. 서명은 무결성과 진정성을 모두 증명하지만, 체크섬은 무결성만 증명해요.

## 실무 팁

Dockerfile에서 `curl`이나 `wget`으로 바이너리를 받을 때마다 `sha256sum -c` 검사를 추가하세요. 공급망 공격의 한 범주 전체를 방지하는 세 줄짜리 코드예요. 버전 업데이트 시 해시를 갱신해야 하는 유지보수 비용은 실재하지만, 침해된 컨테이너를 배포하는 것에 비하면 작아요.

기억하세요: 해시와 파일 경로 사이에 공백 두 개, 아키텍처마다 다른 해시, 버전 업데이트 시 반드시 해시 갱신.
