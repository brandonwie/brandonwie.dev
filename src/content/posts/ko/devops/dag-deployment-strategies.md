---
title: DAG 배포 전략
description: Airflow DAG를 배포하는 다양한 방법과 트레이드오프 분석
date: 2026-01-23T00:00:00.000Z
updated: '2026-08-12'
tags:
  - devops
  - airflow
  - deployment
  - gitops
category: devops
draft: false
lang: ko
source_lang: en
source_slug: dag-deployment-strategies
source_updated: '2026-08-12'
translation_date: '2026-08-12'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/production-deployment.html
    title: Airflow Production Deployment
    type: official
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/2.10.5/configurations-ref.html
    title: 'Airflow 2.10.5 Configuration Reference (scheduler intervals)'
    type: official
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/configurations-ref.html
    title: 'Airflow Configuration Reference (dag_processor intervals)'
    type: official
---

EC2에서 Docker Compose로 Airflow를 셋업하면서 제일 먼저 막힌 질문은 이거였어요.
Git에 있는 DAG 파일을 실행 중인 컨테이너에 어떻게 전달하지? Airflow 공식 문서는
여러 방법을 설명하면서도 하나를 추천하지 않아요. 초반에 전략을 잘못 고르면 팀이나
인프라가 커졌을 때 마이그레이션이 고통스러워지고요.

흔한 방식 네 가지를 놓고 비교한 다음, EC2에 올린 2명짜리 팀에 맞는 가장 단순한
쪽을 골랐어요. 언제 갈아타야 할지 미래의 제가 알 수 있게 결정 트리도 적어
뒀고요.

## 겪었던 어려움

**단일 추천 방법이 없어요.** Airflow 문서는 여러 전략을 설명하면서도 어떤
환경에서 뭘 쓰라고는 하지 않아요. 트레이드오프는 결국 블로그 글과 GitHub issues,
Helm chart 기본값을 긁어모아 직접 짜 맞춰야 했어요.

**DAG 배포와 코드 배포를 뒤섞어 놔요.** 대부분의 가이드가 DAG Python 파일 배포와
Airflow 애플리케이션(Docker 이미지) 배포를 한 덩어리로 묶어서 설명해요. 실제로는
서로 독립적인 관심사인데도요.

**Git-sync sidecar 문서가 Kubernetes를 가정해요.** 가장 많이 문서화된 방식이
Kubernetes 네이티브예요. Docker Compose + EC2 환경으로 옮기려니 맞지 않는 패턴을
억지로 끼우는 느낌이었어요.

## 네 가지 방식

### 1. EC2에 전체 Git Repo

EC2 인스턴스에 전체 repository를 클론해요. 컨테이너는 `dags/` 폴더를
volume-mount하고요.

```text
EC2 /opt/airflow/          <- 전체 Git repository
├── dags/                  <- DAG 파일
├── master/
│   └── docker-compose.yml
├── worker/
└── .git/
```

변경 사항은 `git pull`로 동기화되고, 스케줄러가 컨테이너 재시작 없이 집어가요.
얼마나 빨리 반영되는지는 하나가 아니라 두 개의 설정에 달려 있어요. 여기서 많이들
놓쳐요.

- `[scheduler] min_file_process_interval`(기본값 `30`)은 Airflow가 이미 알고 있는
  DAG 파일을 얼마나 자주 다시 파싱할지 정해요. 설정 문서에도 "Updates to DAGs are
  reflected after this interval."이라고 분명하게 적혀 있어요.
- `[scheduler] dag_dir_list_interval`(기본값 `300`)은 DAG 디렉토리를 다시 훑어서
  *새 파일*이 있는지 확인하는 주기고요.

그래서 기존 DAG를 수정하면 30초쯤 뒤에 반영되지만, 완전히 새로운 DAG 파일은 기본
설정에서 최대 5분까지 안 보일 수 있어요. 두 기본값은 Airflow 3.x에도 그대로
이어졌어요. 파싱이 별도 dag-processor로 옮겨가면서 같은 30초짜리
`min_file_process_interval`이 `[dag_processor]` 아래로 갔고, 디렉토리 스캔은
`[dag_processor] refresh_interval`(여전히 300초)이 됐어요.

**적합한 경우:** 소규모 팀(2~10명), EC2 기반, 잦은 DAG 변경.

### 2. Docker Image에 DAG 포함 (Bake into Image)

DAG 파일을 Docker 이미지 빌드 시점에 넣어요.

```dockerfile
# Dockerfile
COPY dags/ /opt/airflow/dags/
```

DAG를 고칠 때마다 이미지를 다시 굽고 컨테이너도 재시작해야 해요. 배포는 불변이
되고 버전도 찍히지만, 반복 속도는 눈에 띄게 느려져요.

**적합한 경우:** 불변 인프라, 엄격한 버전 관리 요구사항.

### 3. Git-Sync Sidecar (Kubernetes 표준)

별도의 git-sync 컨테이너가 주기적으로 repository를 pull하고 볼륨으로 DAG를
공유해요.

```yaml
# Kubernetes Pod
containers:
  - name: scheduler
    image: airflow
  - name: git-sync # 별도 컨테이너
    image: git-sync
    args: ["--repo=https://github.com/...", "--branch=main"]
```

Kubernetes 기반 Airflow 배포의 표준 패턴이에요. pull은 sidecar가 맡고, 스케줄러는
재시작 없이 바뀐 내용을 그대로 읽어요.

**적합한 경우:** Kubernetes 환경, 대규모 팀.

### 4. S3/EFS Sync

DAG를 S3 bucket에 올리거나 EFS를 마운트해요.

```text
S3 bucket                    EC2
s3://airflow-dags/   --->  /opt/airflow/dags/
```

AWS 네이티브고 리전을 넘어서도 동작하지만, 인프라(S3 bucket 또는 EFS mount)가
늘어나고 동기화 지연도 생겨요.

**적합한 경우:** AWS 네이티브 워크플로우, 멀티 리전 배포.

## 비교 매트릭스

| 기준                | EC2 Git Repo    | Image에 포함  | Git-Sync   | S3/EFS       |
| ------------------- | --------------- | ------------- | ---------- | ------------ |
| **셋업 복잡도**     | 낮음            | 낮음          | 중간       | 중간         |
| **DAG 변경 속도**   | 빠름 (git pull) | 느림 (리빌드) | 빠름       | 빠름         |
| **컨테이너 재시작** | 불필요          | 필요          | 불필요     | 불필요       |
| **추가 인프라**     | 없음            | 없음          | Sidecar    | S3/EFS       |
| **적합한 환경**     | EC2 소규모 팀   | 불변 인프라   | Kubernetes | AWS 네이티브 |
| **팀 규모**         | 2~10            | 무관          | 대규모     | 중~대규모    |

Airflow가 이런 매트릭스를 공식으로 내놓지는 않아요. 정답표가 아니라 제가 정리한
트레이드오프 해석으로 봐주세요. 셋업 복잡도 등급과 특히 팀 규모 구간은 제
판단이에요. 누가 측정한 임계값이 아니라 각 방식이 과하다고 느껴지기 시작한
지점이고요.

## 제가 고른 방식: EC2에 전체 Git Repo

가장 단순한 선택지를 골랐어요. 이유는 이래요.

- 2명짜리 소규모 팀이고 인프라는 EC2 기반이에요(Kubernetes 아님).
- DAG를 자주 고치고, 분이 아니라 초 단위로 돌려봐야 해요.
- 제로 다운타임이 중요했어요. DAG만 바꾸는데 컨테이너를 재시작할 수는 없잖아요.
- 버전 관리와 즉시 롤백은 Git에 이미 딸려 와요.
- repo 노출과 인증이라는 단점은 deploy key와 `.gitignore`로 덜어낼 수 있고요.

## 결정 트리

```text
인프라가 뭔가요?
├─ Kubernetes
│   └─ Git-Sync Sidecar 사용
│
├─ EC2 + 소규모 팀 (10명 미만)
│   └─ EC2에 전체 Git Repo 사용
│
├─ 엄격한 불변 요구사항
│   └─ Image에 포함 방식 사용
│
└─ AWS 네이티브, 멀티 리전
    └─ S3/EFS Sync 사용
```

## Git Repo 방식 자세히 보기

### 배포 흐름

```text
1. 개발자가 DAG 수정
   └── git push origin main

2. GitHub Actions 트리거
   └── dags/ 변경 감지

3. SSM 명령으로 EC2에 전달
   └── cd /opt/airflow && git pull

4. 스케줄러가 변경된 파일 재파싱 (~30초)
   └── 수정된 DAG 반영 완료

컨테이너 재시작: 불필요
다운타임: 없음
반영 시간: 수정은 ~30초
          새 DAG 파일은 최대 ~5분
```

### 장점

| 장점                  | 설명                                            |
| --------------------- | ----------------------------------------------- |
| **간단함**            | 추가 인프라 불필요 (S3, EFS, git-sync 컨테이너) |
| **빠른 배포**         | `git pull` 한 번으로 DAG 동기화                 |
| **익숙한 워크플로우** | 표준 Git 기반 배포                              |
| **제로 다운타임**     | DAG 변경 시 컨테이너 재시작 불필요              |
| **버전 관리**         | Git 히스토리로 DAG 변경 추적                    |
| **쉬운 롤백**         | `git checkout <commit>`으로 즉시 롤백           |

### 단점과 완화 방법

| 단점           | 설명                          | 완화 방법                       |
| -------------- | ----------------------------- | ------------------------------- |
| Git 의존성     | EC2에 Git 필요                | Amazon Linux에 Git 내장         |
| 전체 repo 노출 | EC2에 불필요한 파일 존재      | `.gitignore`로 민감한 파일 제외 |
| 인증 필요      | Private repo에 자격 증명 필요 | Deploy Key 또는 HTTPS + PAT     |
| 수동 동기화    | 자동 동기화 아님              | CI/CD 자동화 (SSM)              |

### 디렉토리 컨벤션

`/opt`는 서드파티 소프트웨어를 두는 Linux 표준 디렉토리예요. Apache Airflow도
`AIRFLOW_HOME=/opt/airflow`를 기본값으로 쓰고요.

```text
/opt        <- 서드파티 앱 (Airflow, Jenkins 등)
/usr        <- 시스템 설치 소프트웨어
/home       <- 사용자 홈 디렉토리
```

## 마이그레이션 시점

제가 지켜보는 신호는 이런 거예요. 앞의 매트릭스에 달았던 단서를 여기에도 똑같이
붙여둘게요. 측정된 한계치가 아니라 지금 방식이 아껴주는 것보다 더 많은 비용을
물리기 시작하는 지점이에요.

| 상황                          | 추천 변경              |
| ----------------------------- | ---------------------- |
| Kubernetes 도입               | Git-Sync Sidecar       |
| 보안 강화                     | Image에 포함           |
| 멀티 리전 배포                | S3 sync + 리전 간 복제 |
| DAG 10개, 작성자 5명 정도부터 | Git-Sync 또는 S3       |

## 각 전략을 쓰면 안 되는 경우

- **EC2 전체 Git Repo.** `.gitignore`로 걸러낼 수 없는 비밀이 repository에
  있다면 쓰지 마세요. 감사 가능한 이미지 태그를 남기는 불변 배포를 컴플라이언스가
  요구할 때도 마찬가지고요.
- **Image에 포함.** DAG 반복 속도가 중요하면 쓰지 마세요. DAG를 고칠 때마다
  리빌드하고 재시작하면 못 견딜 피드백 루프가 생겨요.
- **Git-Sync Sidecar.** 일반 EC2나 Docker Compose 환경에서는 쓰지 마세요.
  Kubernetes 밖에서 sidecar 패턴은 복잡성만 늘려요.
- **S3/EFS Sync.** 엄격한 버전 관리가 필요하면 쓰지 마세요. S3 sync에는 Git 같은
  원자적 업데이트나 롤백 보장이 없어요.

## 정리

DAG 배포에 보편적으로 옳은 전략은 없어요. 인프라와 팀 규모, 얼마나 빨리 돌려봐야
하는지에 따라 갈려요. EC2 위의 소규모 팀이라면 CI/CD가 `git pull`을 걸어주는 전체
Git repo 방식이 가장 단순하면서 피드백 루프도 제일 빨라요. 결정 트리를 손에 쥐고
있다가 팀이나 인프라가 지금 전략을 넘어설 때 옮겨 갈 경로까지 미리 그려두면
돼요.

## 참고 자료

- [Airflow Production Deployment](https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/production-deployment.html)
- [Airflow 2.10.5 Configuration Reference](https://airflow.apache.org/docs/apache-airflow/2.10.5/configurations-ref.html).
  위에서 인용한 `min_file_process_interval`과 `dag_dir_list_interval`
  기본값이 여기 나와요.
- [Airflow Configuration Reference (stable)](https://airflow.apache.org/docs/apache-airflow/stable/configurations-ref.html).
  Airflow 3.x에서 같은 두 값이 `[dag_processor]` 아래로 옮겨간 내용을 담은
  최신 문서예요.
