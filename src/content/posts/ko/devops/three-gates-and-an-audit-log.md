---
title: '게이트 세 개와 감사 로그: agent harness를 위한 HITL'
description: 'agent workflow의 첫 버전은 보통 안전 규칙이 하나뿐이에요. 위험한 일을 하기 전에 물어봐라.'
date: 2026-06-15T00:00:00.000Z
updated: 2026-06-15T00:00:00.000Z
tags:
  - 3b
  - devops
  - architecture
category: devops
draft: false
lang: ko
source_lang: en
source_slug: three-gates-and-an-audit-log
source_updated: 2026-06-15T00:00:00.000Z
translation_date: '2026-06-17'
references:
  - url: 'https://git-scm.com/docs/githooks'
    title: Git hooks documentation
    type: official
source_content_hash: d11d6acaf6cd044fb36bd255e7504a2fa39c9df106e73d517ddacf12cb38dab3
---

agent workflow를 처음 만들면 보통 안전 규칙이 하나밖에 없어요. 위험한 일을 하기
전에 물어봐라.

없는 것보다는 낫지만, 이 규칙은 확장되지 않아요. "위험하다"는 말부터 모호하거든요.
agent가 위험한 지점을 못 알아챌 수도 있고요. 사람이 한쪽을 승인하는 사이에 정작
staged diff는 다른 내용으로 바뀌어 있을 수도 있어요. 다음 session은 규칙만
물려받고 그 뒤에 깔린 이유는 모를 수도 있고요. 결국 시스템은 감, 기억, 그리고
설정 파일에 적어둔 무서운 주석 몇 줄에 기대게 돼요.

3B는 이 문제를 governance가 아니라 architecture 차원에서 풀어요. 규칙을 적어두는
데서 그치지 않고, 시스템 구조로 강제하는 거죠.

게이트를 세 개 써요. 하나는 동시성, 하나는 변경 전 사람 review, 하나는 주기적인
감사 review를 맡아요. 세 게이트는 서로 다른 종류의 메커니즘인데, 바로 그게
핵심이에요. 각자 다른 실패 모드를 책임지거든요.

## Gate A: 살아있는 handoff 상태를 덮어쓰지 않기

Gate A는 동시성 게이트예요.

어떤 변경이 철학적으로 위험한지를 따지는 게 아니에요. 작업을 조율하는 작은 파일
묶음, 그러니까 `progress.md`, `todos.md`, buffer, 그리고 생성된 상태 파일들에
다른 session이 이미 쓰고 있는지를 따져요.

task가 branch나 worktree 설정 단계로 넘어가기 전에, task 흐름은 더러워진 handoff
경로를 확인하고 해당 task의 `progress.md`에 lock을 걸어요. agent가 같은 종류의
handoff 문서를 고치려면 그에 맞는 lock을 쥐고 있어야 하고요. lock을 이미 누가
쥐고 있으면 그 편집은 멈춰요.

이렇게 하면 좁지만 골치 아픈 문제 하나가 풀려요. 두 session이 동시에 재개 지점을
다시 쓰거나, 둘 다 체크리스트에 표시하거나, 둘 다 task가 다음 단계로 넘어갈
준비가 됐다고 판단하는 일을 막아주거든요.

Gate A는 일부러 기계적으로 만들었어요. 내용이 현명한지는 묻지 않아요. 지금 이
session이 공유 상태를 바꿔도 되는지만 물어요.

## Gate B: 제어 영역을 바꾸기 전에 설명하기

Gate B는 사람이 개입하는 변경 게이트예요.

계층을 바꾸는 곳에서 발동해요. rule, skill, agent persona, prompt, ADR, 일부
JSON 정책 저장소, 그리고 관련된 control plane 파일들이죠. 이건 평범한 문서
페이지가 아니에요. 앞으로 agent가 어떻게 행동할지를 바꾸거든요.

Gate B는 사소하지 않은 변경에는 행동 전에 설명하는 payload를 요구해요. payload는
의도, 영향받는 파일, 검토한 대안, 그리고 risk 항목을 적어요. 멈추는 강도는 변경
종류에 따라 달라져요. 어떤 편집은 AUTO라서 경고만 띄우고 그냥 진행해요. 어떤 건
CONFIRM이 필요하고요. 파급력이 더 큰 편집은 DOUBLE_CONFIRM이 필요한데, 사람이
의도를 먼저 보고 두 번째 승인 전에 diff 미리보기까지 본다는 뜻이에요.

이 구분이 중요해요. 오타 하나 고치는 일이 universal rule 편집과 똑같은 절차를
치를 필요는 없잖아요. 그렇다고 세 agent runtime을 전부 바꾸는 규칙을, 단지
markdown이라는 이유로 오타 수정처럼 다뤄서도 안 되고요.

이 계약에는 문서 전용 예외도 있어요. 산문만 바꾸는 작은 markdown 변경은 전체
게이트를 잠정적으로 건너뛸 수 있지만, staged diff는 commit 직전에 다시 확인해요.
실제 diff가 routing 항목을 건드리거나, 크기 한도를 넘거나, markdown이 아닌 파일을
포함하면 강도가 올라가요.

이렇게 흔한 governance 실패 하나를 막아요. agent가 "그냥 문서예요"라고 해놓고
최종 staged 트리는 다른 얘기를 하는 상황이요.

## sidecar는 승인을 staged 트리에 묶어요

Gate B는 채팅 메시지 하나에만 기대지 않아요.

채택한 ADR-031 설계는 구조화된 sidecar를 써요.

```text
.agents/gate-b/explain-<staged-tree-hash>.yaml
```

여기서 hash로 묶는 게 중요한 부분이에요. 승인 payload는 포매팅과 재staging이 끝난
뒤 실제로 commit될 staged 트리와 연결돼요. pre-commit validator가 lint-staged
다음에 돌아가는 이유가 여기 있어요. 마지막 확인은 이전 버전이 아니라 최종 staged
내용을 검증해야 하거든요.

작지만 진지한 경계예요. 사람의 승인은 그냥 "대화 어딘가에서 사용자가 예라고 했다"가
아니에요. 특정 staged 트리에 대해, 설명된 변경을 승인한 거예요.

## Gate C: 시간이 흐르며 시스템의 행동을 review하기

Gate C는 또 하나의 쓰기 전 차단기가 아니에요.

주기적으로 살펴보는 면이에요. 감사 스트림과 sync 건강 상태를 모아서, 한 session
이라면 놓쳤을 패턴을 시스템이 볼 수 있게 해줘요. 반복해서 발동하는 게이트, 오래
방치된 계층 드리프트, doc-audit 결과, sync-doctor 실패, 아니면 절차만 잔뜩
만들어내는 governance 규칙 같은 것들이요.

여기서 게이트가 유지보수할 만한 것이 돼요. 차단만 하는 게이트는 추가하긴 쉽지만
조율하긴 어려워요. 감사 기록이 남는 게이트는 돌아볼 수 있고요. 실제 문제를 잘
잡으면 그대로 두면 돼요. 해롭지 않은 편집만 자꾸 가로막으면 범위를 좁히고요. 몇
달째 조용하면 그 게이트가 차지하는 context 예산이 아깝지 않은지 따져봐요.

규칙을 다스리는 governance 자체도 누군가 다스려야 하는 거예요.

## ADR은 규칙만이 아니라 이유를 담아요

게이트는 그 밑에 깔린 결정 시스템에 기대요.

3B는 architecture 수준 결정에는 ADR을, 작업 폴더 결정에는 Rule-6 README 파일을
써요. ADR은 한 번 승인되면 변경 불가로 다뤄요. 결정이 바뀌면 시스템은 역사를 다시
쓰는 대신 새 ADR로 기존 결정을 대체해요.

형식적으로 들리지만, 실은 agent의 현실적인 문제를 풀어줘요. 앞으로의 session은
규칙이 뭐라고 말하는지만 알아서는 안 돼요. 그 규칙이 왜 존재하는지, 어떤 선택지가
버려졌는지, rollback 경로는 무엇이었는지, 사람이 어떤 trade-off를 받아들였는지까지
알아야 하거든요.

Gate B는 ADR 수정을 절차가 무거운 작업으로 다뤄서 이걸 뒷받침해요. 승인된 결정
기록을 고치는 일은 또 하나의 markdown patch가 아니에요. 앞으로의 agent가 추론에
쓰는 역사적 근거 자체를 바꾸는 일이거든요.

## 자기 자신을 가리키는 가장자리는 의도된 거예요

Gate B에서 가장 이상한 부분은, Gate B가 자기 자신에 대한 편집까지 다스린다는
점이에요.

철학적인 농담이 아니에요. 운영상 꼭 필요한 일이에요. 승인 절차를 정의하는 규칙을
절차 없이 고칠 수 있다면, 가장 중요한 바로 그 자리에 control plane 구멍이 뚫리는
셈이거든요.

그래서 architecture 전역 HITL 규칙은 자기 자신과 게이트를 정의하는 관련 파일들을
스스로를 강화하는 면으로 표시해요. 이런 편집에는 더 무거운 절차가 붙고, 추가
blast-radius 확인까지 들어가요.

다만 자기 강화는 시끄러워질 수 있어요. 지금 설계는 그 교훈을 얻었어요. telemetry가
너무 많은 편집이 최고 강도 단계에 걸린다는 걸 보여주자, 자기 강화 범위를 좁혔거든요.
이게 건강한 순환이에요. 시스템은 첫 게이트 모양이 완벽한 척하지 않아요. 비용을
재고, 증거를 살피고, 규칙을 좁혀요.

## 내가 가져다 쓸 부분

다시 쓸 만한 패턴은 "사람이 모든 걸 승인하게 만들어라"가 아니에요.

다시 쓸 만한 패턴은 governance를 실패 모드별로 쪼개는 거예요.

1. 동시성 게이트: 지금 이 공유 상태 파일에 써도 되나?
2. 변경 게이트: 이 control plane 변경은 반영되기 전에 사람 승인이 필요한가?
3. review 게이트: 게이트 자체가 시간이 지나면서 쓸모 있는 신호를 내고 있나?

서로 다른 질문이에요. 그러니 서로 다른 메커니즘이 필요하죠.

3B의 게이트 시스템은 아직 가벼워요. markdown 규칙, shell 보조 스크립트, sidecar
YAML, pre-commit 검증, 그리고 추가만 가능한 log가 전부예요. 중요한 건 계약의
모양이에요. 변경 전에 risk를 이름 붙여요. 승인은 staged 트리에 묶이고요. 역사적
근거는 ADR에 담겨요. 게이트 규칙은 스스로를 다스리고요.

이런 점들이 harness를 그저 prompt 더미 이상으로 만들어줘요. harness에는 control
plane이 있고, 그 control plane은 증거를 남기거든요.
