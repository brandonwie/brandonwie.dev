---
title: 'disable한 Claude 플러그인을 updater가 자꾸 다시 켜는 이유'
description: >-
  플러그인 몇 개를 일부러 꺼 두고, updater를 돌리면, 다시 켜져 있었어요. 스크립트는 무엇도 다시 켠 적이 없다는 걸
  증명할 수 있었는데 — 애초에 다시 켜는 건 스크립트의 일이 아니었거든요. toil을 멈춰 준 snapshot-and-reassert
  guard를 정리했어요.
date: 2026-06-06T00:00:00.000Z
updated: '2026-06-07'
tags:
  - devops
  - claude-code
  - transferable
category: devops
draft: false
lang: ko
source_lang: en
source_slug: claude-plugin-update-reenables-disabled
source_updated: '2026-06-07'
translation_date: '2026-06-07'
---

저는 Claude Code 플러그인이랑 MCP 서버 몇 개를 일부러 꺼 둬요. `enabledPlugins["x"]: false`로 설정하고(또는 서버를 `disabledMcpjsonServers`에 추가하고) 하루를 보내다가, toolchain updater를 돌리면 — 그게 다시 켜져 있어요. 또 끄죠. 다음 update, 또 켜져요. 세 번째쯤 되니까 이걸 우연으로 넘기길 그만두고, 뭐가 자꾸 스위치를 뒤집는지 찾아 나섰어요.

짜증났던 건, 제 updater를 들여다보면서 "이건 범인이 아니다"라고 "증명"할 수 있었다는 거예요. 그 증명이 틀렸는데, 왜 틀렸는지 보이기까지 시간이 좀 걸렸어요.

## 거짓말을 한 증명

제 updater는 `claude plugin list`를 훑고, enable된 플러그인만 필터링해서, 걔들한테만 `claude plugin update`를 불러요 — awk 필터가 `Status: ... disabled` 행은 다 떨궈요. 스크립트 어디에도 `claude plugin enable`은 없어요. 위에서 아래까지 grep해 보면 이게 뭔가를 다시 켤 리가 없다고 스스로를 설득하게 돼요. 저도 두 번이나 설득당했어요.

두 가지가 버그를 흐릿하게 만들었어요. 첫째, no-op update는 이걸 완전히 가려요: 모든 플러그인이 이미 최신이면 update가 `settings.json`을 거의 안 건드리고, disable set이 그대로 살아남고, 그 실행의 로그는 멀쩡해 보여요. 버그는 플러그인이 **실제로** 새 버전을 설치할 때만 발동해요 — 그래서 제 테스트 절반이 updater한테 "무죄"를 줬어요. 둘째, disable→enable을 뒤집으면서 똑같이 보이는 닮은꼴 vector가 여러 개예요:

- `settings.json` atomic-rename symlink trap — `claude plugin` 쓰기가 symlink를 일반 파일로 바꿔치기하는 경우,
- `enableAllProjectMcpServers: true`가 모든 프로젝트 `.mcp.json` 서버를 조용히 켜는 경우,
- marketplace reconciliation이 enable 기본값을 다시 적용하는 경우.

그중 엉뚱한 걸 한참 쫓다가 한 발 물러섰어요.

## 실제로 일어나던 일

`enabledPlugins["x"]: false`는 완전한 uninstall이 아니에요. `settings.json`에 사는 cosmetic하고 되돌릴 수 있는 state예요. `claude plugin update <name>`이 진짜 새 버전을 설치하거나 — `claude plugin marketplace update`가 catalog를 reconcile하면 — Claude CLI가 `settings.json`을 스스로 다시 쓰고, 그 쓰기가 `enabledPlugins`랑 `disabledMcpjsonServers`를 enable 기본값으로 되돌릴 수 있어요.

이게 전부예요. 다시 켜진 건 CLI 자신의 쓰기지, 제 스크립트가 고른 명령이 아니에요. 제 정교한 enable-only 루프는 상관이 없었어요. 뒤집힘이 CLI의 settings reconciliation의 side effect로 일어났으니까요. 스크립트를 아무리 감사해도 절대 못 찾아요 — 스크립트 안에 없었거든요.

## 어느 vector가 발동했든 상관없는 fix

여러 군데서 올 수 있다는 걸 이해하고 나서, 저는 특정 메커니즘을 고치려는 걸 그만두고 update 전체를 snapshot-and-reassert guard로 감쌌어요:

1. Claude를 건드리기 **전에**, disable set을 snapshot해요 — `false`인 모든 `enabledPlugins` 항목, `disabledMcpjsonServers` 목록, `enableAllProjectMcpServers`를 각 config profile에 대해서요. `fs.realpathSync()`로 dedupe해서, 같은 source-of-truth `settings.json`으로 symlink되는 profile들이 한 번만 기록되게 해요.
2. update랑 verify 단계 **후에**, 각 profile의 `settings.json`을 _새로_ 다시 resolve하고(update가 중간에 symlink를 깼을 수 있어요), snapshot을 re-assert해요 — 켜진 걸 다시 `false`로, 빠진 `disabledMcpjsonServers` 항목을 다시 추가, 명시적으로 꺼 뒀던 `enableAllProjectMcpServers`를 복원.

correctness를 위해 두 가지가 중요해요. 쓰기는 **symlink-safe**여야 해요: `settings.json`의 `realpath`에, in-place로 써서, symlink를 따라가 target을 truncate하게 하지 — symlink를 일반 파일로 바꾸는 `rename(2)`를 하면 안 돼요. 그 rename 자체가 re-enable vector 중 하나거든요 — fix가 버그를 유발하면 안 되죠. 그리고 guard는 **이전 disable만 re-assert**해야 해요: update가 새로 설치한 플러그인은 snapshot에 없었으니 enable 상태로 둬요. guard는 의도를 복원하지, 플러그인 set을 얼리지 않아요.

제 셋업에선 이게 `--snapshot` / `--restore` 모드를 가진 작은 `preserve-disabled-state.js`에 들어 있고, updater에서 preflight 직후랑 verify 직후에 불려요. 중요한 건 파일 이름이 아니라 이 모양이에요.

## 메커니즘을 고치는 대신 guard를 쓴 이유

| 옵션 | 장점 | 단점 |
| --- | --- | --- |
| snapshot → re-assert guard (선택) | 메커니즘 불문; 자동 수정; before→after diff 생성 | `settings.json`을 씀(symlink-safety + 백업 필요) |
| 특정 CLI 메커니즘 쫓기 | 타겟형 | 깨지기 쉬움 — Claude 내부 동작이 버전마다 바뀌고, vector가 둘 이상 발동 가능 |
| 진단용 before→after diff만 | 비변경; 동작 증명 | toil을 안 고침 — 여전히 손으로 다시 disable |

특정 Claude 내부 동작 하나를 쫓는 건, 그 동작이 문서화돼 있지 않고 CLI 버전마다 바뀌며 여러 vector가 같은 증상을 낼 수 있어서 깨지기 쉬워요. guard는 그걸 다 우회해요: 뭐가 다시 켰든, after-pass가 다시 꺼요. 비변경 diff 모드도 남겨 뒀어요. before→after를 보는 게, guard가 다른 버그를 덮는 게 아니라 옳은 일을 하고 있다고 확신시켜 줬거든요.

## 언제 적용하나

updater — `/update-all`, cron job, 셋업 스크립트 — 가 `claude plugin update`나 `claude plugin marketplace update`를 돌리고, 특정 플러그인이나 MCP 서버를 일부러 disable해 두는데, update 후에 걔들이 다시 켜지는 걸 봤다면 이걸 쓰세요.

아무것도 disable 안 한다면(보존할 의도가 없음), 또는 cosmetic hide가 아니라 capability 제거를 위해 disable한다면 건너뛰세요 — 후자의 경우 `false`로 re-assert하는 건 플러그인을 숨기기만 하지 uninstall하지 않으니, `installed_plugins.json`에서 항목을 지우고 cache 디렉터리를 삭제하는 게 맞아요.

## takeaway

제어하는 설정이 자꾸 되돌아가면, 쓰고 있는 파일을 다른 뭔가가 소유하고 있는 건 아닌지 확인하세요. 여기선 CLI가 `settings.json`을 자기가 reconcile할 대상으로 취급했어요. 그래서 오래 가는 fix는 더 나은 disable 명령이 아니라 — 제 의도를 snapshot해 두고 tool이 자기 차례를 끝낸 뒤에 다시 re-assert하는 거였어요.

## References

- [Claude Code plugins](https://docs.anthropic.com/en/docs/claude-code/plugins)
