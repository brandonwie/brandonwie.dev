---
title: 디버깅하다가 `docker exec`로 인증 정보가 새는 두 가지 경로
description: >-
  컨테이너 진단 명령을 실행하기 전에 다시 읽어보다가, 평범해 보이는 명령 두 개가
  broker URL을 password까지 통째로 스크롤백에 찍어낸다는 걸 발견했어요. `env |
  grep`과 `cli -u "$VAR"`가 왜 둘 다 새는지, `sh -c`로 감싸면 왜 위치만
  옮겨지는지, 그리고 대신 쓰게 된 boolean 확인 방식을 정리했어요.
date: 2026-05-13T00:00:00.000Z
updated: '2026-08-12'
tags:
  - security
  - devops
  - docker
  - transferable
category: security
draft: false
lang: ko
source_lang: en
source_slug: docker-exec-credential-leak-vectors
source_updated: '2026-08-12'
translation_date: '2026-08-12'
---

제 개인 프로젝트인 crucio에서 컨테이너로 돌아가는 worker를 점검하려고 SSH 진단 명령을 한 묶음 만들고 있었어요. 특별한 건 없었어요. 호스트에 접속하고, 컨테이너한테 message broker에 아직 닿는지 물어보고, 결과를 원격 셸보다 편한 데서 읽으려고 복사해 오는 정도였죠.

실행하기 전에 묶음을 한 번 더 읽다가 명령 두 개에서 멈췄어요. 둘 다 동작은 했을 거예요. 그리고 둘 다 broker URL을, username과 password까지 포함해서, 곧 다른 데로 붙여넣을 터미널 스크롤백에 찍어놨을 거예요.

```bash
# 경로 1: 패턴으로 걸러낸 env 덤프
docker exec my-worker env | grep -E "CELERY_BROKER|REDIS"

# 경로 2: URL을 CLI 도구에 그대로 넘기기
docker exec my-worker redis-cli -u "$CELERY_BROKER_URL" ping
```

## 접속 문자열이 찍히는 게 왜 최악일까요

Broker와 database URL은 인증 정보를 URL 안에 그대로 담고 있어요. `redis://default:hunter2@host:port/0`처럼 userinfo 자리에 들어가죠. 따로 빼놓은 비밀값이 없으니 깜빡할 것도 없어요. URL을 찍는 순간 password도 같이 찍혀요.

나머지 절반은 디버깅 출력이 어디까지 흘러가느냐예요. 스크롤백은 세션보다 오래 남아요. 붙여넣은 내용은 채팅창, PR 코멘트, 지원 티켓에 그대로 남고요. agent 도구나 telemetry 파이프라인이 셸 출력을 통째로 저장소에 색인해 버리기도 하는데, 살아 있는 인증 정보가 거기 한 번 들어가면 믿을 수 있는 대응은 rotation뿐이에요. 나중에 찾아가서 확실하게 지우는 건 불가능하거든요.

그래서 여기서 한 번 멈출 만했어요. 명령 자체가 틀린 건 아니었어요. 출력이 다른 데로 옮겨지기 직전까지는 멀쩡했죠. 그런데 그 출력을 다른 데로 옮기는 게 이 묶음의 목적 전부였어요.

## 고려한 선택지

선택지는 네 가지였는데, 재밌는 건 그럴듯해 보이던 "해결책" 두 개가 절반만 통했다는 점이에요.

| 방법                                  | 비밀값이 남는 곳                                    | 판정                  |
| ------------------------------------- | --------------------------------------------------- | --------------------- |
| 패턴으로 걸러낸 env 덤프              | stdout, 즉 스크롤백과 붙여넣기 버퍼, 그리고 그 기록 | 샘                    |
| 호스트에서 URL을 CLI 플래그로 전달    | 호스트 셸 history와 프로세스 인자, 거기에 stdout까지 | 새는 곳이 두 군데 늘어남 |
| 같은 명령을 `sh -c '...'`로 감싸기    | 컨테이너 쪽 프로세스 인자                           | 위치만 옮겨짐         |
| 컨테이너에 예/아니오로 답할 질문 던지기 | 없음, true/false와 scheme만 돌아옴                  | 최종 선택             |

### env 덤프가 새는 이유

`env | grep`은 이름과 값을 같이 찍어요. 이름은 거의 항상 무해하지만, 값 쪽에 접속 문자열이나 API key, dotenv로 불러온 비밀값이 들어 있어요. 패턴으로 거르면 절제한 것처럼 보이지만, 그 필터는 어떤 비밀값을 찍을지 고르는 것이지 찍을지 말지를 정하는 게 아니에요.

제가 실제로 알고 싶었던 건 저 명령이 답해주는 것보다 훨씬 작았어요. "변수가 설정되어 있나"였지, "값이 뭔가"가 아니었거든요.

### URL을 CLI 플래그로 넘기면 두 번 새는 이유

여기엔 서로 다른 문제가 두 개 있는데, 명령을 쓸 당시엔 첫 번째만 생각하고 있었어요.

첫 번째는 순서예요. 호스트 셸이 `docker exec`이 실행되기도 전에 `"$CELERY_BROKER_URL"`을 펼쳐버려요. 그래서 값이 컨테이너가 아니라 호스트 환경에서 나와요. 호스트에 그 변수가 없으면 도구는 빈 인자를 받고 진단은 의미가 없어지고요. 호스트에 값이 있으면 이번엔 URL이 호스트의 `docker exec` 명령줄에 통째로 올라가요.

두 번째는 명령줄을 다른 프로세스가 읽을 수 있다는 점이에요. CWE entry 214로 분류된 약점인데, 거기서는 프로세스가 "invoked with sensitive command-line arguments, environment variables, or other elements that can be seen by other processes on the operating system"인 상황으로 설명해요. Linux에서는 아주 구체적이에요. `ps`는 `/proc/pid/cmdline`에서 인자를 읽고, 커널은 프로세스가 실행 중인 동안 이 값을 열어둬요. man page는 이걸 프로세스가 보여주고 싶어 하는 명령줄이라고 설명하고요. 호스트에서 `ps -ef`를 돌릴 수 있는 사람이면 누구나 URL을 읽어요. 대화형 셸은 여기에 더해 history 파일에까지 남기고요.

### `sh -c '...'`가 해결책이 아닌 이유

솔깃한 수정은 작은따옴표로 감싸서 펼치는 시점을 컨테이너 안으로 미루는 거예요.

```bash
docker exec my-worker sh -c 'redis-cli -u "$CELERY_BROKER_URL" ping'
```

순서 문제는 이걸로 실제로 해결돼요. 바깥 셸은 문자열을 건드리지 않고, 안쪽 셸이 컨테이너 환경에 대고 펼치니까, URL이 호스트 명령줄이나 호스트 셸 history에는 전혀 안 나타나요.

두 번째 문제는 그대로예요. `redis-cli`는 여전히 URL을 인자로 받으니까, 이번엔 그 값이 컨테이너 안에서 그 프로세스의 명령줄에 앉아 있어요. 그 컨테이너에서 `/proc`을 읽을 수 있는 프로세스면 다 보이고요. 누출 지점이 한 겹 안으로 들어갔을 뿐인데, 이걸 해결이라고 부르고 싶지는 않네요.

환경 변수 쪽과 비교해 보면 차이가 눈에 띄는데, 이 차이가 대안이 통하는 이유이기도 해요. Linux에서 `/proc/pid/environ`은 `cmdline`처럼 아무나 읽을 수 있는 게 아니라 ptrace 접근 검사를 통과해야 해요. 환경 변수에 머무는 값은 인자가 되어버린 값보다 읽기가 확실히 어려워요.

## 결국 쓰게 된 형태

운영체제한테 URL을 달라고 하는 대신, 답이 비밀값이 아닌 질문을 컨테이너에 던지는 거예요.

```bash
docker exec my-worker python -c "
import os, redis
url = os.environ.get('CELERY_BROKER_URL', '')
print('CELERY_BROKER_URL set:', bool(url))
print('URL scheme:', url.split('://', 1)[0] if url else '(empty)')
try:
  r = redis.from_url(url, socket_timeout=5)
  print('PING:', r.ping())
  print('DBSIZE:', r.dbsize())
except Exception as e:
  print('ERR:', type(e).__name__, str(e)[:200])
"
```

컨테이너가 URL을 읽어서 라이브러리 호출에 넘기고, 출력하지는 않아요. `redis.from_url`은 접속 문자열을 Python 값으로 받으니까, 다른 프로그램의 인자가 되는 대신 프로세스 메모리에 남아요. 밖으로 나오는 건 boolean 하나, scheme 하나(`redis`인지 `rediss`인지로 TLS 여부를 알 수 있어요), 그리고 ping 결과와 key 개수예요.

예외 처리 쪽이 보기보다 중요해요. 에러를 200자로 잘라두면, 드라이버가 "could not connect to `redis://default:hunter2@…`" 같은 메시지에 접속 문자열을 그대로 실어 돌려주는 걸 막을 수 있어요. 에러 텍스트도 출력이고, 제가 제일 놓치기 쉬운 경로가 바로 여기예요.

연결 확인 용도로는 이 정도 출력이면 충분해요. "변수가 없음"과 "변수는 있는데 닿지 않음", "닿고 응답함"을 구분해 주는데, 제가 다음에 갈 만한 갈래는 이걸로 다 덮여요.

## 패턴으로 일반화하기

여기서 얻은 규칙은 고민할 것도 없이 적용할 만큼 좁아요. 진단 명령이 `cli -u "$SECRET_VAR" <verb>` 모양이면, 컨테이너 안에서 true나 false를 돌려주는 작은 프로그램으로 바꾸는 거예요.

언어는 컨테이너에 이미 들어 있는 걸 쓰면 돼요. 뭔가 설치해야 하는 진단은 결국 건너뛰게 되거든요. Python 서비스에는 `python`이 있고, Node 서비스에는 `node`가 있어요. 가벼운 Python image에는 `redis-cli`가 아예 없는 경우도 많은데, 이건 오히려 덤이에요. 언어 안에서 확인하는 쪽이 처음에 쓰려던 CLI 방식보다 안전하면서 이식성도 좋아요.

Postgres client는 깔끔한 권장안 대신 단서를 붙여야 하는 경우예요. `psql -c "SELECT 1"`은 `-u` 플래그가 필요 없어요. libpq가 `PGHOST`, `PGUSER`, `PGPASSWORD` 같은 값을 환경에서 바로 읽으니까 명령줄에는 아무것도 안 남죠. 다만 PostgreSQL 문서는 `PGPASSWORD`를 콕 집어서 경고해요. 일부 운영체제에서는 `ps`로 프로세스 환경 변수를 들여다볼 수 있어서 보안상 권장하지 않는다고요. 위에서 본 ptrace 검사 덕분에 Linux는 거기 해당하지 않지만, "환경 변수는 안전하다"는 건 플랫폼에 따라 달라지는 이야기지 어디서나 통하는 이야기는 아니에요. 프로젝트가 직접 가리키는 답은 password file이에요.

## 이미 받아둔 출력을 위한 방어

규칙보다 출력이 먼저 존재하는 경우도 있어요. 예전 로그, 다른 사람이 돌린 묶음, 넘겨받은 붙여넣기 같은 것들요. 텍스트가 어디론가 옮겨가기 전에 URL의 userinfo를 지워두는 건 비용이 거의 안 들어요.

```bash
sed -E 's#://[^@[:space:]]+@#://REDACTED@#g' < raw.txt > clean.txt
```

`scheme://user:pass@host`와 `scheme://token@host` 둘 다 걸리고, `@`를 기준으로 잡기 때문에 userinfo가 없는 URL은 건드리지 않아요. 돌려둘 만하지만 전략은 아니에요. URL에 박힌 인증 정보만 잡고 그 외에는 못 잡으니까, `API_KEY=` 한 줄은 그냥 통과해요.

## 알고 있는 빈틈

이 패턴이 못 덮는 게 두 가지 있는데, 뭉개고 넘어가기보다 적어두는 쪽이 나을 것 같아요.

우선 제가 직접 실행하는 명령만 다뤄요. 같은 값에 닿는 문이 따로 있는데, 컨테이너 inspect 출력도 그중 하나예요. 컨테이너 안에서 아무것도 실행하지 않고 설정된 환경 변수를 그대로 보여주거든요. boolean 확인은 진단 경로를 지켜줄 뿐 표면 전체를 지켜주지는 않아요.

그리고 예방용일 뿐이에요. 인증 정보가 이미 붙여넣어진 스크롤백이나 bastion 호스트의 세션 녹화, 색인된 지식 저장소까지 갔다면 대응은 rotation이에요. 위에 적은 것들은 전부 그 상황이 오지 않게 하려고 있는 거예요.

## 실무에서 남는 것

규칙은 짧아요. boolean으로 답할 수 있는 질문이면 컨테이너한테 비밀값 자체를 묻지 않는 거예요. `env | grep`은 값을 찍고, 명령줄 플래그는 그 값을 `ps`에 공개하고, `sh -c` 안으로 옮기는 건 노출 위치만 바꿔요. 세 줄짜리 컨테이너 내부 확인 코드가 "set: True"와 URL scheme, ping 결과를 찍어주면 진단에 필요한 신호는 똑같이 얻으면서 출력에는 흘릴 만한 게 남지 않아요.

출력이 어딘가에 붙여넣어질 가능성이 있을 때, 그리고 컨테이너에 진짜 비밀값이 들어 있을 때는 해둘 만해요. 제일 신경 쓰이는 경우는 다른 엔지니어나 agent가 나중에 실행할 진단을 작성할 때예요. 그 시점에는 출력에 무엇이 담기는지만 제 손에 남아 있으니까요. 노트북에서 혼자 잠깐 하는 디버깅에는 사실 필요 없지만, 습관을 들이는 비용이 워낙 작아서 저는 구분하는 걸 그만뒀어요.

## 참고 자료

- [`docker exec` 공식 레퍼런스](https://docs.docker.com/engine/reference/commandline/exec/)
- [CWE entry 214: Invocation of Process Using Visible Sensitive Information](https://cwe.mitre.org/data/definitions/214.html) (두 경로가 공통으로 해당하는 약점 분류)
- [proc_pid_cmdline(5)](https://man7.org/linux/man-pages/man5/proc_pid_cmdline.5.html) (`ps`가 명령줄 인자를 읽어오는 곳)
- [proc_pid_environ(5)](https://man7.org/linux/man-pages/man5/proc_pid_environ.5.html) (환경 변수를 인자보다 읽기 어렵게 만드는 ptrace 접근 검사)
- [ps(1)](https://man7.org/linux/man-pages/man1/ps.1.html)
- [PostgreSQL 환경 변수(libpq)](https://www.postgresql.org/docs/current/libpq-envars.html) (`PGPASSWORD` 경고와 password file 대안)
- [redis-cli](https://redis.io/docs/latest/develop/tools/cli/) (이 패턴이 대체하는 `-u` 플래그)
- [redis-py 연결](https://redis.readthedocs.io/en/stable/connections.html) (컨테이너 내부 확인 코드가 쓰는 `from_url`)
