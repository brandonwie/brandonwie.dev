---
title: 'Prometheus TSDB 메모리 산정: observability 서비스는 왜 예산이 달라야 할까'
description: >-
  LGTM stack의 메모리 제한을 옆 서비스에 맞춰 정하면서 Prometheus에 400m을 줬어요. Prometheus는 head
  block을 RAM에 들고 있거든요. 그 숫자에서는 flapping처럼 보이는 OOM 재시작 루프가 돌았어요.
date: 2026-04-15T00:00:00.000Z
updated: '2026-08-12'
tags:
  - devops
  - observability
  - prometheus
  - memory
  - tsdb
  - oom
  - capacity-planning
category: devops
draft: false
lang: ko
source_lang: en
source_slug: prometheus-tsdb-memory-sizing
source_updated: '2026-08-12'
translation_date: '2026-08-12'
references:
  - url: 'https://prometheus.io/docs/prometheus/latest/storage/#operational-aspects'
    title: 'Storage — Prometheus documentation'
    type: official
  - url: 'https://prometheus.io/docs/practices/instrumentation/#do-not-overuse-labels'
    title: 'Do not overuse labels — Instrumentation | Prometheus'
    type: official
  - url: 'https://docs.docker.com/engine/containers/resource_constraints/'
    title: 'Resource constraints — Docker Docs'
    type: official
  - url: 'https://docs.docker.com/engine/containers/start-containers-automatically/'
    title: 'Start containers automatically — Docker Docs'
    type: official
---

제 사이드 프로젝트인 crucio에 observability stack을 올릴 때, Compose file의 메모리 제한을 그냥 옆 서비스에 맞춰서 정했어요. Grafana는 200m으로도 잘 돌았고 Loki랑 Tempo도 각각 300m이면 충분했어요. Prometheus가 그중에선 무거운 축이겠거니 싶어서 조금 더 얹었죠.

```yaml
grafana:    mem_limit: 200m
loki:       mem_limit: 300m
tempo:      mem_limit: 300m
prometheus: mem_limit: 400m  # ← 여기가 문제
```

마지막 줄이 이 글의 전부예요. Prometheus는 400m으로는 현실적인 scrape 부하에서 반드시 OOM이 나요. 그런데 `restart: unless-stopped`가 걸려 있어서 이 문제는 죽는 모습이 아니라 flapping처럼 보였어요. 떠 있다가 잠깐 안 보이다가 다시 떠 있는 상태. 어느 한 순간도 장애처럼 보이지 않았어요.

## 네 서비스는 메모리 구조가 서로 달라요

400m이라는 숫자가 나온 그림은 "Go binary 네 개가 각각 설정 하나 읽고 하는 일도 얼추 비슷하겠지"였어요. 이 그림대로면 Loki보다 33% 더 준 건 오히려 후한 편이죠. 그런데 그림 자체가 틀렸고 찾아보면서 제일 놀랐던 것도 이 부분이에요.

| 서비스         | 메모리 구조                              | 평상시 사용량       |
| -------------- | ---------------------------------------- | ------------------- |
| Grafana        | 상태를 들고 있지 않은 UI                 | 100-200 MB          |
| Loki           | 로그를 흘려보내는 backend(disk에 기록)   | 200-400 MB          |
| Tempo          | trace를 흘려보내는 backend(disk에 기록)  | 200-400 MB          |
| **Prometheus** | **메모리 위의 TSDB head block + WAL(3시간치)** | **500 MB - 1.5 GB** |

Grafana는 대시보드를 그리고 남의 데이터를 조회하는 쪽이라 자기가 들고 있는 게 거의 없어요. Loki와 Tempo는 쓰기 경로예요. 데이터가 들어오면 잠깐 담아뒀다가 disk로 내려보내죠. 메모리 사용량이 처리량을 따라가는데 작은 stack에서는 처리량 자체가 작아요.

Prometheus는 종류가 달라요. 활성 작업 집합이 RAM에 상주하는 데이터베이스거든요. storage 문서에도 그대로 적혀 있어요. "The current block for incoming samples is kept in memory and is not fully persisted. It is secured against crashes by a write-ahead log (WAL) that can be replayed when the Prometheus server restarts." 들어오는 sample을 담는 현재 block은 메모리에 있고 완전히 저장되지 않으며, 대신 재시작할 때 다시 재생할 수 있는 WAL로 보호한다는 뜻이에요.

여기서 말하는 메모리 위의 block이 head block이에요. TSDB에서 가장 최근이면서 아직 계속 바뀌고 있는 시계열 덩어리죠. 크기가 대략 어느 정도인지는 같은 문서의 backfilling 항목에서 나와요. "it is not safe to backfill data from the last 3 hours (the current head block)". 수집하는 시계열 하나하나마다 3시간치 sample을 그 시간 내내 들고 있는 셈이에요. 여기에 128 MB 단위로 쓰이는 WAL이 얹히고요.

scrape 대상 열 개 정도를 15초 간격으로 긁고 cardinality도 평범한 수준이라면, 지금의 저는 평상시 상주 사용량을 500 MB에서 1.5 GB로 잡아요. 그러니까 400m은 가끔 넘치는 빠듯한 예산이 아니라, 첫 scrape부터 이미 바닥 아래였어요.

## 조용히 지나간 건 재시작 정책 때문이었어요

메모리가 모자란 Prometheus가 그냥 죽어 있었다면 5분이면 진단했을 거예요. 용량 문제를 가시성 문제로 바꿔놓은 게 `restart: unless-stopped`였어요.

```text
1. Prometheus가 상한선 근처에서 동작 (~400 MB)
2. 부하 증가 (scrape 대상 추가, cardinality 상승, query 평가)
3. head block이 400 MB를 넘김
4. Docker cgroup OOM이 Prometheus를 kill
5. Docker가 Prometheus를 재시작 (unless-stopped 정책)
6. Prometheus가 시작하며 WAL 로드 → OOM 직전 메모리로 즉시 복귀
7. Docker가 다시 OOM kill
8. → 무한 루프
```

6번 때문에 이건 자가 교정이 아니라 자가 지속이 돼요. head block이 비어 있는 새 Prometheus라면 한동안은 400m 안에 들어가요. 그런데 재시작한 Prometheus에는 그 유예가 없어요. WAL을 다시 재생하고 방금 죽을 때 들고 있던 head block을 그대로 복원해요. 뜬 지 몇 초 만에 OOM 직전 사용량으로 돌아가고요.

Docker에도 재시작 루프를 막는 장치가 있는데 여기서는 도움이 안 돼요. 정책 문서를 보면 재시작 정책은 한 번 정상적으로 뜬 뒤에야 적용되고 정상 기동의 기준은 10초 이상 살아 있는 거예요. "prevents a container which doesn't start at all from going into a restart loop"라고 설명해요. Prometheus는 시작을 해요. 멀쩡히 올라왔다가 WAL 재생으로 head block이 다시 차고 나서, 그 10초 선 너머에서 죽어요. 그래서 매 사이클이 정상 재시작으로 집계돼요.

그 결과 `docker ps`가 거짓말을 해요. 타이밍을 잘못 잡아 찍으면 멀쩡해 보이는데 대부분의 시간 동안 실제로 돌고 있으니 틀린 것도 아니에요. 진짜를 말해주던 신호는 두 개였어요. 뜰 때마다 `docker logs`에 찍히는 WAL 재생 메시지, 그리고 Grafana에서 보이는 scrape 공백. 두 번째가 좀 얄궂죠. 장애를 알아채는 게 일인 서비스가 정작 자기 장애를 겪고 있었으니까요.

## 한계를 넘긴 건 트래픽이 아니라 cardinality였어요

평상시 사용량이 상한선 아래에 여유 있게 있다면, 뭐가 그걸 넘길까요? 웹 서비스 용량을 잡던 감각으로는 요청량을 보게 되는데 여기서는 그게 틀린 변수예요. 중요한 건 새로운 시계열을 만들어내는 모든 것이에요.

- per-user, per-URL, per-record-id처럼 cardinality 높은 label을 달아 metric을 내보내는 서비스
- scrape 대상이 새로 추가되는 것
- 긴 retention 구간을 훑으면서 많은 시계열을 메모리에 올리는 query
- 소요 시간 histogram이 무더기로 들어오는 것(histogram은 bucket 하나하나가 별도 시계열이에요)

제 경우엔 마지막 게 원인이었어요. crucio worker의 링크 노트 처리가 Celery 작업 소요 시간 histogram을 내보냈는데 histogram 하나는 bucket 개수만큼 시계열을 쓰고 거기에 합계와 개수가 더 붙어요. 새 작업 label이 생기면 histogram이 생기고 그러면 시계열 개수가 계단식으로 뛰어요. 이 실패가 무작위가 아니라 결정적이었던 이유예요. 링크 노트가 들어올 때마다 400m을 넘겼거든요.

Prometheus 자체 instrumentation 가이드는 비용을 이렇게 못 박아요. "Each labelset is an additional time series that has RAM, CPU, disk, and network costs." 같은 페이지에서 metric 하나의 cardinality를 10 아래로 두라고 권하고 100을 넘길 여지가 있으면 튜닝 문제가 아니라 설계 문제로 다루라고 해요. 저는 이 조언을 큰 규모 fleet 이야기라고 읽고 있었어요. NAS에 올린 worker 하나에도 똑같이 적용돼요. 거기서 나가는 자원이 결국 head block에 필요한 그 자원이니까요.

## 돌릴 수 있는 knob들, 그리고 제가 돌린 두 개

여기서 빠져나오는 길은 "숫자를 올린다" 말고도 더 있고, 각각 다른 걸 내줘요.

| 선택지                                  | 내주는 것                                       |
| --------------------------------------- | ----------------------------------------------- |
| `mem_limit` 올리기                      | 같은 장비의 다른 서비스에서 가져오는 호스트 RAM |
| scrape 간격 늘리기                      | 해상도. 15초에서 60초로 가면 짧은 spike를 놓쳐요 |
| scrape 대상 줄이기                      | 커버리지. stack이 존재하는 이유 자체            |
| `--storage.tsdb.retention.time` 줄이기  | 사후에 들여다볼 기록                            |
| `--storage.tsdb.retention.size` 제한    | 별로 없음. 오래된 block을 조용히 지우기 전까지  |
| cardinality 높은 label 제거             | 없음. 어차피 조회하지 않던 label이었다면        |

해상도나 대상을 줄이는 건 저한테는 맞는 교환이 아니었어요. 작은 개인 stack에서 metric을 두는 이유는 드물게 일어나는 사건을 잡으려는 거고 두 선택지는 모두 덜 보는 방식으로 동작하니까요. retention을 줄이는 건 RAM보다 disk 쪽에 도움이 됐을 거예요. head block은 지금 살아 있는 시계열이 몇 개냐로 정해지지, 오래된 block을 얼마나 오래 보관하냐로 정해지지 않거든요.

그래서 가장 덜 내주는 두 개를 돌렸어요. 제한을 올리고 TSDB를 크기로 묶는 것. 정직한 세 번째 선택지는 label을 소스에서 정리하는 거였는데 그 변경에서는 하지 않았어요. histogram이 실제로 쓸모가 있었고 instrumentation을 건드리기 전에 stack부터 안정시키고 싶었거든요. 이 순서는 규칙이 아니라 제 선호예요. RAM 예산이 고정된 사람이라면 반대로 하는 쪽이 합리적이에요.

## 고친 방법

```yaml
prometheus:
  image: prom/prometheus:v2.54.1
  command:
    - --config.file=/etc/prometheus/prometheus.yml
    - --storage.tsdb.path=/prometheus
    - --storage.tsdb.retention.time=7d
    - --storage.tsdb.retention.size=1GB # ← 추가
    # ... 나머지 인자
  mem_limit: 2048m # ← 400m에서 올림
```

`mem_limit: 2048m`은 `docker run --memory`와 같은 knob이고 cgroup OOM killer가 강제하는 값이에요. 이 숫자면 평상시 head block이 쓸 공간이 나오고 무엇보다 재시작할 때 WAL을 다시 재생할 여유가 남아요. 그래서 OOM 한 번이 곧바로 두 번째 OOM으로 이어지지 않고요.

이 2048이라는 숫자에는 솔직히 짚고 갈 게 두 가지 있어요. 첫째, 저는 원래 노트에 "Prometheus 문서의 프로덕션 하한선과 맞춘 값"이라고 적어놨었어요. 이 글을 쓰면서 다시 확인해보니 Prometheus 문서 어디에도 RAM 최소치는 없더라고요. 문서가 주는 건 disk 산정이에요. sample 하나당 평균 1-2바이트, 그리고 `needed_disk_space = retention_time_seconds * ingested_samples_per_second * bytes_per_sample` 공식. 그 페이지에 메모리 쪽 공식은 없어요. 그러니까 2 GB는 문서화된 요구사항이 아니라 관찰한 평상시 사용량을 보고 여유를 잡은 값이었고 저는 그걸 실제보다 더 권위 있는 것으로 기억하고 있었어요.

둘째, `--storage.tsdb.retention.size=1GB`는 제가 원래 생각했던 것보다 하는 일이 적어요. head가 무한정 커지는 걸 막아주는 이중 안전장치로 알고 있었는데 문서는 그게 아니라고 분명히 말해요. "Only the persistent blocks are deleted to honor this retention although WAL and m-mapped chunks are counted in the total size." disk를 묶어주고 cardinality가 터졌을 때 disk에 쌓이는 양을 시간에 걸쳐 묶어줘요. RAM 위의 head block에는 상한을 걸지 않고요. 여전히 걸어두긴 하지만 이제 메모리 안전장치로 보지는 않아요.

Docker의 리소스 제한 문서에는 이 우회로 전체를 없애줬을 조언이 있어요. "Perform tests to understand the memory requirements of your application before placing it into production." 옆에 있는 서비스의 제한을 베끼는 건 그 반대고 제가 정확히 그렇게 했죠.

## 다음에 가져갈 것

observability stack 전체에 균일한 메모리 제한을 거는 건 냄새예요. 200m/300m/300m/400m으로 나란히 서 있으면 diff에서는 정돈돼 보이지만 사실이 아닌 주장을 하나 담고 있어요. 이 프로세스들의 메모리 구조가 서로 비슷하다는 주장이요. 요즘엔 제한을 걸 때 왜 다른 숫자가 아니라 이 숫자인지 주석을 남기려고 해요. 안 그러면 그 파일을 다음에 읽는 사람이 근거가 아니라 유추를 물려받게 되니까요. 보통은 몇 달 뒤의 저고요.

`restart: unless-stopped`는 정말 유용하고, 동시에 용량 문제를 가려요. 이게 없었으면 OOM은 시끄러웠을 거예요. 죽은 서비스, 대시보드의 공백, 알림. 있으면 계속 도는 것처럼 보이고 겉보기 상태는 초록색으로 남아요. 뜰 때 `docker logs`에서 WAL 재생 메시지를 확인하는 건 값싼 습관이에요. 하루에 한 번 넘게 WAL을 재생하는 Prometheus는 뭔가를 말하고 있는 거니까요.

메모리 숫자를 움직이는 건 시계열 개수예요. per-URL이나 per-user label이 붙은 worker metric은 scrape 양으로는 절대 나오지 않는 속도로 시계열을 늘려요. 그리고 시계열 하나하나가 요청당이 아니라 계속해서 head block의 RAM을 써요.

우선순위를 바꿔놓은 건 이거였어요. Prometheus를 잃는 쪽이 Prometheus가 지켜보는 서비스 하나를 잃는 것보다 나빠요. 그 시점 이후의 모든 장애는 눈을 가린 채로 진단하게 되거든요. 그래서 호스트 메모리가 모자라면 이제는 Prometheus보다 Grafana, Loki, Tempo를 먼저 잘라요.

## 어디에 적용되고, 어디엔 안 되는지

이 산정 방식은 upstream Prometheus를 Docker Compose나 Kubernetes로 올린 구성이라면 어디든 맞아요. 특히 LGTM 패턴을 따르는 홈랩이나 NAS stack에서 크게 와닿아요. 메모리가 빠듯해서 누군가 줄이고 싶어지는 환경이 딱 그런 곳이거든요.

VictoriaMetrics나 Mimir에는 그대로 옮겨가지 않아요. 저장 엔진이 다르고 메모리 성격도 달라요. Thanos나 Cortex federated 구성은 shard 단위 성격이 달라서 따로 이야기해야 하고요. 그리고 agent mode나 remote-write만 쓰는 Prometheus는 로컬 head block 자체가 없어서 이 질문이 아예 사라져요.

## 정리

observability stack에서 데이터베이스인 서비스는 Prometheus 하나뿐이고 메모리 제한이 감당해야 하는 건 RAM에 들고 있는 head block이에요. 그러니 Compose file에서 옆에 있는 서비스가 얼마나 쓰는지가 아니라, 살아 있는 시계열이 몇 개인지를 보고 잡으세요.

## 참고 자료

- [Storage — Prometheus documentation](https://prometheus.io/docs/prometheus/latest/storage/#operational-aspects) — 현재 block은 메모리에 있고 WAL로 보호된다는 설명, `--storage.tsdb.retention.time`과 `--storage.tsdb.retention.size`의 의미, disk 산정 공식
- [Do not overuse labels — Instrumentation | Prometheus](https://prometheus.io/docs/practices/instrumentation/#do-not-overuse-labels) — labelset 하나가 곧 시계열 하나이고 RAM 비용이 든다는 점, 권장 cardinality 상한
- [Resource constraints — Docker Docs](https://docs.docker.com/engine/containers/resource_constraints/) — `--memory`(즉 Compose의 `mem_limit`)가 강제하는 것과 OOM 동작
- [Start containers automatically — Docker Docs](https://docs.docker.com/engine/containers/start-containers-automatically/) — `unless-stopped`의 의미, 그리고 정상 기동 후 죽는 경우는 지켜주지 못하는 10초 규칙
