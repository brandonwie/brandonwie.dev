---
title: '꺼 둔 Claude 플러그인을 업데이터가 자꾸 다시 켜는 이유'
description: >-
  플러그인 몇 개를 일부러 꺼 두고 업데이터를 돌렸더니 다시 켜져 있었어요. 스크립트는 아무것도 다시 켠 적이 없다고 증명할 수
  있었는데, 애초에 다시 켜는 건 스크립트가 하는 일이 아니었거든요. 이 반복 작업을 멈춰 준 snapshot-and-reassert
  guard를 정리했어요.
date: 2026-06-06T00:00:00.000Z
updated: "2026-06-14"
tags:
  - devops
  - claude-code
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: claude-plugin-update-reenables-disabled
source_updated: "2026-06-14"
translation_date: "2026-06-14"
---

저는 Claude Code 플러그인과 MCP 서버 몇 개를 일부러 꺼 둬요. `enabledPlugins["x"]: false`로 설정하거나 서버를 `disabledMcpjsonServers`에 추가해 두고 하루를 보내다가, 툴체인 업데이터를 돌리면 그게 다시 켜져 있어요. 또 끄죠. 다음에 업데이트하면 또 켜져 있고요. 세 번째쯤 되니까 우연으로 넘기길 그만두고, 뭐가 자꾸 스위치를 뒤집는지 찾아 나섰어요.

짜증났던 건, 제 업데이터를 들여다보면서 "이건 범인이 아니다"라고 증명할 수 있었다는 거예요. 그 증명이 틀렸는데, 왜 틀렸는지 깨닫기까지 시간이 좀 걸렸어요.

## 거짓말을 한 증명

제 업데이터는 `claude plugin list`를 훑어서 켜져 있는 플러그인만 골라내고, 걔들한테만 `claude plugin update`를 불러요. awk 필터가 `Status: ... disabled` 행은 다 떨궈 버리거든요. 스크립트 어디에도 `claude plugin enable`은 없어요. 위에서 아래까지 grep해 보면 이게 뭔가를 다시 켤 리가 없다고 스스로를 설득하게 돼요. 저도 두 번이나 설득당했고요.

두 가지가 버그를 흐릿하게 가렸어요. 첫째, 아무것도 안 바뀌는 업데이트는 버그를 완전히 숨겨요. 모든 플러그인이 이미 최신이면 `settings.json`을 거의 안 건드리니까, 꺼 둔 목록이 그대로 살아남고 그 실행 로그도 멀쩡해 보여요. 버그는 플러그인이 **실제로** 새 버전을 깔 때만 터져요. 그래서 제 테스트 절반은 업데이터한테 "무죄"를 줬어요. 둘째, 꺼진 걸 켜진 상태로 뒤집으면서 겉보기엔 똑같아 보이는 경로가 여러 개예요.

- `settings.json`의 atomic-rename symlink 함정 — `claude plugin`이 파일을 쓸 때 symlink를 일반 파일로 바꿔치기하는 경우,
- `enableAllProjectMcpServers: true`가 모든 프로젝트의 `.mcp.json` 서버를 슬쩍 켜 버리는 경우,
- 마켓플레이스를 정리하면서 켜짐 기본값을 다시 적용하는 경우.

이 중에 엉뚱한 걸 한참 쫓다가 한 발 물러섰어요.

## 실제로 벌어지던 일

`enabledPlugins["x"]: false`는 완전히 지우는 게 아니에요. `settings.json` 안에 들어 있는, 겉만 가리는 되돌릴 수 있는 값이에요. `claude plugin update <name>`이 진짜 새 버전을 깔거나 `claude plugin marketplace update`가 목록을 정리할 때, Claude CLI가 `settings.json`을 직접 다시 써요. 그러면서 `enabledPlugins`와 `disabledMcpjsonServers`를 켜짐 기본값으로 되돌려 버릴 수 있어요.

이게 전부예요. 다시 켠 건 CLI 자신이 한 쓰기지, 제 스크립트가 고른 명령이 아니에요. 공들여 짠 "켜진 것만 도는" 루프는 아무 상관이 없었어요. 스위치가 뒤집힌 건 CLI가 설정을 정리하면서 딸려 나온 부수 효과였으니까요. 스크립트를 아무리 뒤져도 절대 못 찾아요. 스크립트 안에 없었으니까요.

## 어느 경로가 터졌든 상관없는 해결책

원인이 여러 군데서 올 수 있다는 걸 이해하고 나서는, 특정 동작 하나를 고치려는 걸 그만두고 업데이트 전체를 snapshot-and-reassert guard로 감쌌어요.

1. Claude를 건드리기 **전에**, 꺼 둔 목록을 스냅샷으로 떠 둬요. 각 설정 프로필마다 `false`인 모든 `enabledPlugins` 항목, `disabledMcpjsonServers` 목록, `enableAllProjectMcpServers` 값을 기록하죠. `fs.realpathSync()`로 중복을 걸러서, 같은 원본 `settings.json`을 가리키는 프로필들이 딱 한 번만 기록되게 해요.
2. 업데이트와 검증 단계가 끝난 **뒤에**, 각 프로필의 `settings.json` 경로를 _다시 새로_ 풀어요. 업데이트 도중에 symlink가 깨졌을 수도 있거든요. 그러고 나서 스냅샷대로 되돌려요. 켜진 건 다시 `false`로, 빠진 `disabledMcpjsonServers` 항목은 다시 넣고, 명시적으로 꺼 뒀던 `enableAllProjectMcpServers`는 복구하죠.

여기서 두 가지가 정확성을 좌우해요. 쓰기는 반드시 **symlink를 안전하게 따라가야** 해요. `settings.json`의 `realpath`에 제자리에서 써야, symlink를 따라가 대상 파일 내용만 비우거든요. symlink를 일반 파일로 갈아치우는 `rename(2)`을 쓰면 안 돼요. 그 rename 자체가 다시 켜지는 경로 중 하나니까요. 고치겠다고 만든 코드가 도리어 버그를 부르면 안 되겠죠. 그리고 guard는 **이전에 꺼 둔 것만 되돌려야** 해요. 업데이트가 새로 깐 플러그인은 스냅샷에 없었으니 켜진 채로 둬요. guard는 의도를 복구할 뿐, 플러그인 목록을 통째로 얼려 버리지 않아요.

제 환경에서는 이걸 `--snapshot` / `--restore` 모드를 가진 작은 `preserve-disabled-state.js`에 넣어 두고, 업데이터에서 사전 점검 직후와 검증 직후에 불러요. 중요한 건 파일 이름이 아니라 이 골격이에요.

## 동작을 고치는 대신 guard를 쓴 이유

| 선택지 | 장점 | 단점 |
| --- | --- | --- |
| snapshot → re-assert guard (선택) | 원인을 안 가림; 자동으로 고침; 전후 차이를 남김 | `settings.json`에 직접 씀(symlink 안전 처리 + 백업 필요) |
| 특정 CLI 동작을 직접 쫓기 | 정확히 겨냥 | 깨지기 쉬움 — Claude 내부 동작이 버전마다 바뀌고, 경로가 둘 이상 터질 수 있음 |
| 전후 차이만 보여 주는 진단 모드 | 건드리지 않음; 현상을 증명 | 반복 작업을 못 없앰 — 여전히 손으로 다시 꺼야 함 |

Claude 내부 동작 하나를 콕 집어 쫓는 건 깨지기 쉬워요. 그 동작이 문서에도 없고 CLI 버전마다 바뀌는 데다, 경로가 여럿이라 같은 증상을 여러 군데서 낼 수 있으니까요. guard는 그걸 다 비껴가요. 뭐가 다시 켰든 뒤 단계에서 다시 끄거든요. 건드리지 않고 차이만 보여 주는 모드도 같이 남겨 뒀어요. 전후를 눈으로 보는 게, guard가 엉뚱한 버그를 덮는 게 아니라 제대로 일하고 있다는 확신을 줬거든요.

## 언제 쓰면 좋은가

업데이터가 — `/sync-update-everything`이든, cron 작업이든, 설치 스크립트든 — `claude plugin update`나 `claude plugin marketplace update`를 돌리는데, 특정 플러그인이나 MCP 서버를 일부러 꺼 둔 게 업데이트 뒤에 다시 켜지는 걸 봤다면 이걸 쓰세요.

반대로 아무것도 안 끄거나(지킬 의도가 없으니까), 겉만 가리려는 게 아니라 기능 자체를 빼려고 끈 거라면 건너뛰세요. 후자라면 `false`로 되돌려 봤자 플러그인을 숨기기만 할 뿐 지우지는 못하거든요. 그럴 땐 `installed_plugins.json`에서 항목을 빼고 캐시 디렉터리를 지우는 게 맞아요.

## 정리하며

내가 정해 둔 설정이 자꾸 되돌아간다면, 내가 쓰고 있는 그 파일을 다른 누군가가 자기 것으로 다루고 있는 건 아닌지 의심해 보세요. 여기서는 CLI가 `settings.json`을 자기가 정리할 대상으로 여겼어요. 그래서 오래 가는 해결책은 더 나은 끄기 명령이 아니라, 제 의도를 스냅샷으로 떠 두고 도구가 제 차례를 끝낸 뒤에 다시 되돌려 두는 거였어요.

## References

- [Claude Code plugins](https://docs.anthropic.com/en/docs/claude-code/plugins)
