---
title: macOS Keychain 다중 계정 동작 방식
description: >-
  macOS Keychain은 같은 서비스 이름에 다른 계정 속성을 가진 여러 항목을 허용합니다. 이로 인한 인증 버그를 디버깅하고 해결하는
  방법을 다룹니다.
date: 2026-02-04T00:00:00.000Z
updated: '2026-03-22'
tags:
  - general
  - macos
  - keychain
  - security
  - multi-account
category: general
draft: false
lang: ko
source_lang: en
source_slug: macos-keychain-multi-account
source_updated: '2026-03-22'
translation_date: '2026-02-12'
references:
  - url: 'https://ss64.com/mac/security.html'
    title: macOS security command reference
    type: official
  - url: 'https://developer.apple.com/documentation/security/keychain_services'
    title: Apple Keychain Services Documentation
    type: official
  - url: >-
      https://support.apple.com/guide/keychain-access/what-is-keychain-access-kyca1083/mac
    title: Apple Keychain Access Guide
    type: official
---

Claude Code HUD 플러그인이 엉뚱한 계정의 API 사용량을 보여주는 문제를
디버깅하는 데 몇 시간을 썼어요. 인증 흐름도 정상이고, 토큰도 유효하고, UI
렌더링도 문제없었어요. 원인은 눈에 보이지 않는 곳에 있었는데 -- macOS Keychain
내부에 숨어 있었습니다.

Keychain은 `acct`(계정) 속성이 다르기만 하면 같은 서비스 이름으로 여러 항목을
조용히 허용해요. 애플리케이션이
`security find-generic-password -s "ServiceName"`으로 자격 증명을 읽으면 첫
번째 매칭되는 항목을 돌려줍니다. 경고도 없고, 에러도 없이 Keychain이 알아서
고른 항목을 반환해요. 같은 서비스 이름에 두 개의 계정이 등록되어 있으면 절반의
확률로 잘못된 계정 정보를 읽게 됩니다.

## 왜 중요한가

대부분의 macOS 애플리케이션은 자격 증명을 Keychain에 저장해요. 같은 서비스에
여러 계정을 사용하고 있다면 -- 개인용과 업무용 GitHub 계정, 두 개의 AWS
프로파일, 같은 도구의 병렬 설치 등 -- 중복 항목 하나로 인해 인증이 조용히
실패할 수 있습니다. 가장 나쁜 점은 모든 게 정상으로 보인다는 거예요. 유효한
토큰을 받아오거든요. 다만 그게 다른 계정의 토큰일 뿐입니다.

## 겪었던 어려움들

디버깅 과정이 힘들었던 이유는 모든 도구가 실제 문제를 숨겼기 때문이에요.

**중복 읽기 시 에러 없음.** `security find-generic-password` 명령어는 중복이
있어도 성공해요. 먼저 찾은 항목을 반환할 뿐입니다. 경고도 없고, 에러 코드도
없이 -- 그냥 조용히 잘못된 데이터를 줍니다.

**`delete-generic-password`는 하나만 삭제.** 호출할 때마다 하나의 항목만
삭제하기 때문에 모든 중복을 정리하려면 에러가 날 때까지 반복해야 해요. Apple
문서에 이 부분이 명확하게 나와 있지 않습니다.

**Keychain Access GUI가 문제를 숨김.** Keychain Access 앱은 항목을 보여주지만
중복을 강조하거나 계정/서비스 관계를 한눈에 파악할 수 있게 해주지 않아요.
문제를 발견하려면 각 항목을 수동으로 검사해야 합니다.

**토큰 동기화 스크립트가 상황을 악화시킴.** 처음에는 Keychain 항목 간에
토큰을 복사하는 동기화 스크립트를 작성했어요. 이게 자동 갱신된 유효한 토큰을
오래된 토큰으로 덮어써 버렸습니다. 진짜 해결책은 동기화를 완전히 중단하고 각
설치 인스턴스가 자체적으로 자격 증명을 관리하게 하는 것이었어요.

## Keychain이 항목을 저장하는 방식

핵심은 Keychain이 서비스 이름(`svce`)과 계정 이름(`acct`)의 조합을 복합 키로
사용한다는 점이에요. 두 항목이 계정 속성만 다르면 같은 서비스 이름을 공유할
수 있습니다.

알아야 할 사항:

- `security find-generic-password -s "ServiceName"`은 **첫 번째 매칭** 항목을
  반환 -- 중복이 있으면 동작을 예측할 수 없음
- 애플리케이션이 같은 `-s` 서비스 이름에 다른 `acct` 값으로 항목을 만들 수 있음
- `security delete-generic-password -s "ServiceName"`은 **첫 번째 매칭**만
  삭제 -- 모든 중복을 제거하려면 반복 실행 필요
- Keychain 항목은 시스템 전역 -- `HOME` 디렉토리를 변경해도 보이는 항목에
  영향 없음

## 중복 감지하기

뭔가 고치기 전에 먼저 중복이 실제로 존재하는지 확인하세요. Keychain을 덤프해서
서비스 이름으로 필터링합니다:

```bash
# 특정 서비스의 모든 항목 나열
security dump-keychain 2>/dev/null | \
  grep -E "(svce.*ServiceName|acct)" | head -20

# 중복 개수 확인 (1보다 크면 문제)
security dump-keychain 2>/dev/null | \
  grep "svce.*ServiceName" | sort | uniq -c
```

같은 `svce` 값에 다른 `acct` 값을 가진 여러 항목이 보인다면 그게 원인입니다.

## 중복 정리하기

정리는 한 줄로 가능하지만, `delete-generic-password` 호출마다 하나만 삭제하기
때문에 반복문이 필요해요:

```bash
# 모든 인스턴스 삭제 (에러 날 때까지 반복 -- 호출당 하나씩 삭제)
while security delete-generic-password -s "ServiceName" \
  >/dev/null 2>&1; do :; done
```

정리 후에는 애플리케이션이 자연스럽게 항목을 다시 생성하도록 두세요. 수동으로
항목을 추가하지 마세요.

## 접미사 서비스 이름 패턴

일부 애플리케이션은 서비스 이름에 고유한 접미사를 붙여서 다중 인스턴스
시나리오를 처리해요. Claude Code가 이 방식을 사용합니다:

```text
ServiceName              <- 기본 항목
ServiceName-7195fd18     <- 설치 A
ServiceName-0e3ff1b1     <- 설치 B
```

접미사는 보통 설정이나 설치 경로의 해시값이에요. 이 방식으로 여러 설치가
충돌 없이 공존할 수 있습니다. 주의할 점은 접미사 없이 기본 항목을 읽는 도구는
잘못된 자격 증명을 가져온다는 거예요.

## 왜 이 방법이 효과적인가

복합 키 모델(`svce` + `acct`)을 이해하면 전체 문제가 설명돼요. Keychain이 이걸
충돌하는 항목이 아닌 별도의 항목으로 취급한다는 걸 알면, 해결책은 명확해집니다:
중복을 제거하고, 항목 간 동기화를 중단하고, 각 애플리케이션이 자체적으로 자격
증명을 관리하도록 두면 됩니다.

## 실전 팁

**이 지식이 필요한 경우:**

- Keychain을 사용하는 macOS 애플리케이션의 인증 실패를 디버깅할 때
- 같은 애플리케이션을 여러 인스턴스나 계정으로 실행할 때 (개인용 + 업무용)
- 로그인은 성공했는데 앱이 오래되거나 잘못된 자격 증명을 읽는 이유를 조사할 때
- 앱 제거/재설치 후 Keychain을 정리할 때

**적용하지 말아야 할 경우:**

- Linux나 Windows 환경 -- Keychain은 macOS 전용이에요. 동등한 개념이 존재하지만
  (`libsecret`, Credential Manager) 명령어와 동작이 완전히 달라요.
- 애플리케이션이 자체 자격 증명 관리 UI를 제공하는 경우 -- 앱의 내장 도구를
  사용하세요.
- iCloud Keychain 동기화 문제를 다루는 경우 -- 여기서는 로컬 Keychain 동작만
  다루고 있어요.

가장 큰 교훈: Keychain 항목 간에 복사하는 동기화 스크립트를 작성하지 마세요.
애플리케이션이 자격 증명을 네이티브로 관리한다면 -- 자동 생성하고 자동
갱신한다면 -- 수동 동기화는 정상적인 값을 오래된 데이터나 잘못된 계정
데이터로 덮어쓰게 됩니다. 앱이 알아서 하도록 두세요.
