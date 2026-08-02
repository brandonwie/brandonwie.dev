---
title: DAG 배포 전략
description: Airflow DAG를 배포하는 다양한 방법과 트레이드오프 분석
date: 2026-01-23T00:00:00.000Z
updated: '2026-08-02'
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
source_updated: '2026-08-02'
translation_date: '2026-02-12'
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

EC2에서 Docker Compose로 Airflow를 셋업하면서 제일 먼저 막힌 질문은
이거였어요: Git에 있는 DAG 파일을 실행 중인 Airflow 컨테이너에 어떻게
전달하지? Airflow 공식 문서는 여러 방법을 설명하면서도 하나를 추천하지
않아서, 블로그와 Helm chart 기본값, GitHub issues를 뒤져야 했어요. 초반에
잘못된 전략을 고르면 나중에 마이그레이션이 고통스러워지고요.

## 왜 중요한가

DAG 배포 전략은 한 번 정하면 몇 달은 같이 가는 결정이에요. 반복 속도(DAG
변경을 얼마나 빨리 테스트할 수 있는지), 운영 안정성(DAG 배포가 스케줄러를
재시작하는지), 보안(EC2 인스턴스에 뭐가 노출되는지) 모두에 영향을 줘요.
대부분의 가이드가 DAG 배포와 애플리케이션 배포를 묶어서 설명하는데, DAG
파일이 바뀔 때마다 Docker 이미지를 새로 빌드하게 되죠. 이 둘은 별개의
관심사이고, 섞으면 불필요한 다운타임이 생겨요.

---

## 겪었던 어려움

- **단일 추천 방법이 없음** -- Airflow 문서는 여러 전략을 설명하면서
  "EC2에는 이걸 쓰세요"라고 하지 않아요. 블로그, GitHub issues, Helm chart
  기본값을 조합해서 트레이드오프를 파악해야 했어요.
- **DAG 배포와 코드 배포를 혼동** -- 초기 리서치에서 DAG Python 파일 배포와
  Airflow 애플리케이션(Docker 이미지) 배포를 혼동했어요. 대부분의 가이드가
  이걸 묶어서 설명하지만, 실제로는 별개의 관심사예요.
- **Git-sync sidecar 문서가 Kubernetes를 가정** -- 가장 많이 문서화된
  git-sync sidecar 방식이 Kubernetes 네이티브예요. Docker Compose + EC2
  환경에 맞추려니 맞지 않는 패턴을 억지로 적용하는 느낌이었어요.
- **EC2에 전체 repo를 두면 보안 이슈** -- EC2에 전체 repository를 클론하면
  DAG가 아닌 파일(자격 증명, CI 설정)도 노출돼요. `.gitignore`와 deploy
  key로 충분한지 평가해야 했어요.

---

## 검토한 옵션

| 옵션                      | 장점                                                         | 단점                                                  |
| ------------------------- | ------------------------------------------------------------ | ----------------------------------------------------- |
| EC2에 전체 Git Repo       | 간단한 셋업, 빠른 배포, 제로 다운타임, 익숙한 Git 워크플로우 | EC2에 전체 repo 노출, Git 인증 필요, 자동 동기화 아님 |
| DAG를 Docker Image에 포함 | 불변, 버전 관리, EC2에 Git 불필요                            | 느림(리빌드 + 재시작), DAG 핫 리로드 불가             |
| Git-Sync Sidecar          | 자동 동기화, K8s 표준, 재시작 불필요                         | Sidecar 컨테이너 필요, Kubernetes용으로 설계          |
| S3/EFS Sync               | AWS 네이티브, 멀티 리전 지원                                 | 추가 인프라(S3 또는 EFS), 동기화 지연                 |

각 방식은 서로 다른 인프라 형태를 목표로 해요. 올바른 선택은 팀 규모,
플랫폼(EC2 vs Kubernetes), DAG 변경 빈도에 따라 달라져요.

---

## 결정: EC2에 전체 Git Repo

제 상황에는 명확한 제약이 있었어요:

- 2명의 소규모 팀, EC2 기반 인프라 (Kubernetes 아님)
- DAG 변경이 잦고 빠른 반복이 필요 (분 단위가 아니라 초 단위)
- 제로 다운타임이 중요 -- DAG만 바꿀 때 컨테이너 재시작 불가
- Git이 내장 버전 관리와 즉시 롤백을 제공
- 단점(repo 노출, 인증)은 deploy key와 `.gitignore`로 쉽게 완화 가능

---

## 네 가지 주요 방식

### 1. EC2에 전체 Git Repo

```text
EC2 /opt/airflow/          <- 전체 Git repository
├── dags/                  <- DAG 파일
├── master/
│   └── docker-compose.yml
├── worker/
└── .git/
```

EC2 인스턴스에 `git clone`으로 전체 repository를 두고, `git pull`로 변경
사항을 동기화해요. 컨테이너가 `dags/` 폴더를 volume-mount하기 때문에
Airflow가 재시작 없이 변경을 감지해요.

얼마나 빨리 감지하는지는 하나가 아니라 두 개의 설정에 달려 있는데, 놓치기
쉬운 부분이에요.

- `[scheduler] min_file_process_interval` (기본값 `30`) -- Airflow가 이미
  알고 있는 DAG 파일을 다시 파싱하는 주기예요. 공식 config 문서도 "updates
  to DAGs are reflected after this interval"이라고 명시해요.
- `[scheduler] dag_dir_list_interval` (기본값 `300`) -- DAG 디렉토리에서
  _새 파일_ 을 찾는 스캔 주기예요.

그래서 기존 DAG를 수정하면 30초쯤 뒤에 반영되지만, 완전히 새로운 DAG
파일은 기본 설정에서 최대 5분까지 안 보일 수 있어요. 두 기본값은 Airflow
3.x에도 그대로 이어졌어요. 파싱이 별도 dag-processor로 옮겨가면서 같은
30초짜리 `min_file_process_interval`이 `[dag_processor]` 아래로 갔고,
디렉토리 스캔은 `[dag_processor] refresh_interval`(여전히 300초)이 됐어요.

소규모 팀(2-10명)이 EC2 기반 인프라에서 잦은 DAG 변경을 할 때 적합해요.

### 2. Docker Image에 DAG 포함 (Bake into Image)

```dockerfile
# Dockerfile
COPY dags/ /opt/airflow/dags/
```

DAG 파일을 Docker 이미지 빌드 시점에 포함해요. DAG 변경 시 이미지 리빌드와
컨테이너 재시작이 필요해요. 엄격한 버전 관리가 필요한 불변 인프라에
적합해요 -- 모든 배포가 감사 가능한 이미지 태그가 돼요.

### 3. Git-Sync Sidecar (Kubernetes 표준)

```yaml
# Kubernetes Pod
containers:
  - name: scheduler
    image: airflow
  - name: git-sync # 별도 컨테이너
    image: git-sync
    args: ["--repo=https://github.com/...", "--branch=main"]
```

별도의 git-sync 컨테이너가 주기적으로 repository에서 공유 볼륨으로
pull해요. Airflow 컨테이너가 그 볼륨을 읽어요. Kubernetes 환경의 표준
패턴이고 대규모 팀에 잘 확장돼요.

### 4. S3/EFS Sync

```text
S3 bucket                    EC2
s3://airflow-dags/   --->  /opt/airflow/dags/
```

DAG 파일을 S3에 업로드하고, EC2가 `aws s3 sync`로 동기화해요. 또는 EFS를
직접 마운트할 수도 있어요. S3 복제로 분배를 처리하는 AWS 네이티브
워크플로우, 특히 멀티 리전 배포에 적합해요.

---

## 비교 매트릭스

| 기준                | EC2 Git Repo    | Image에 포함  | Git-Sync   | S3/EFS       |
| ------------------- | --------------- | ------------- | ---------- | ------------ |
| **셋업 복잡도**     | 낮음            | 낮음          | 중간       | 중간         |
| **DAG 변경 속도**   | 빠름 (git pull) | 느림 (리빌드) | 빠름       | 빠름         |
| **컨테이너 재시작** | 불필요          | 필요          | 불필요     | 불필요       |
| **추가 인프라**     | 없음            | 없음          | Sidecar    | S3/EFS       |
| **적합한 환경**     | EC2 소규모 팀   | 불변 인프라   | Kubernetes | AWS 네이티브 |
| **팀 규모**         | 2-10            | 무관          | 대규모     | 중-대규모    |

Airflow가 이런 매트릭스를 공식으로 제공하지는 않아요. 정답표가 아니라 제가
정리한 트레이드오프 해석으로 봐주세요. 특히 셋업 복잡도 등급과 팀 규모
구간은 누가 측정한 임계값이 아니라, 각 방식이 과하다고 느껴지기 시작한
지점이에요.

---

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

---

## EC2 Git Repo: 상세 워크플로우

### 디렉토리 구조

```text
EC2 /opt/airflow/
├── .git/
├── dags/
│   ├── __init__.py
│   └── my_pipeline.py    # <- 여기 변경하면 자동 동기화
├── master/
│   ├── docker-compose.yml
│   └── docker-compose.prod.yml
└── worker/
    └── docker-compose.yml
```

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

핵심은 Airflow가 설정 가능한 간격으로 DAG 파일을 다시 파싱한다는 거예요.
단순한 `git pull` 하나면 DAG 변경이 배포돼요. 이미지 빌드도, 컨테이너
재시작도, 다운타임도 없어요.

### 장점

| 장점                  | 설명                                            |
| --------------------- | ----------------------------------------------- |
| **간단함**            | 추가 인프라 불필요 (S3, EFS, git-sync 컨테이너) |
| **빠른 배포**         | `git pull` 한 번으로 DAG 동기화                 |
| **익숙한 워크플로우** | 표준 Git 기반 배포                              |
| **제로 다운타임**     | DAG 변경 시 컨테이너 재시작 불필요              |
| **버전 관리**         | Git 히스토리로 DAG 변경 추적                    |
| **쉬운 롤백**         | `git checkout <commit>`으로 즉시 롤백           |

### 단점

| 단점           | 설명                          | 완화 방법                       |
| -------------- | ----------------------------- | ------------------------------- |
| Git 의존성     | EC2에 Git 필요                | Amazon Linux에 Git 내장         |
| 전체 repo 노출 | EC2에 불필요한 파일 존재      | `.gitignore`로 민감한 파일 제외 |
| 인증 필요      | Private repo에 자격 증명 필요 | Deploy Key 또는 HTTPS + PAT     |
| 수동 동기화    | 자동 동기화 아님              | CI/CD 자동화 (SSM)              |

---

## 왜 이 방식이 효과적인가

핵심은 관심사의 분리예요. DAG 파일은 자주 바뀌는 코드지만, Airflow
애플리케이션(Docker 이미지)은 드물게 바뀌어요. Git으로 관리되는 `dags/`
디렉토리를 volume-mount하면 DAG 변경은 Git을 통해 흐르고, 애플리케이션은
안정적으로 유지돼요. 리빌드도, 재시작도, 다운타임도 없어요.

`/opt/airflow` 컨벤션은 Linux 표준에서 나왔어요. `/opt`는 서드파티
소프트웨어를 위한 표준 디렉토리이고, Apache Airflow 공식 문서에서
`AIRFLOW_HOME=/opt/airflow`를 기본값으로 사용해요.

```text
/opt        <- 서드파티 앱 (Airflow, Jenkins 등)
/usr        <- 시스템 설치 소프트웨어
/home       <- 사용자 홈 디렉토리
```

---

## 실전 팁

이 결정 프레임워크를 활용하세요:

- **EC2 또는 Docker Compose에 Airflow 배포** -- 전체 Git repo 방식으로
  시작하세요. 빠른 반복을 지원하는 가장 간단한 경로예요.
- **새 클러스터 셋업** -- 위의 비교 매트릭스로 반복 속도, 보안, 팀 규모
  사이의 트레이드오프를 평가하세요.
- **현재 방식을 넘어서야 할 때** -- 아래 마이그레이션 표를 가이드로
  활용하세요.

### 마이그레이션 시점

매트릭스와 같은 단서를 붙여둘게요. 측정된 한계치가 아니라, 지금 방식이
아껴주는 것보다 더 많은 비용을 물리기 시작하는 지점이에요.

| 상황                 | 추천 변경             |
| -------------------- | --------------------- |
| Kubernetes 도입      | Git-Sync Sidecar      |
| 보안 강화            | Image에 포함          |
| 멀티 리전 배포       | S3 sync + 리전 간 복제 |
| 대략 DAG 10개+, 작성자 5명+ | Git-Sync 또는 S3 |

### 각 전략을 쓰면 안 되는 경우

- **EC2 전체 Git Repo** -- repository에 `.gitignore`로 제외할 수 없는
  비밀이 있거나, 감사 가능한 이미지 태그가 필요한 불변 배포가 필수인 경우
  사용하지 마세요.
- **Image에 포함** -- DAG 반복 속도가 중요한 경우 사용하지 마세요. DAG
  변경마다 리빌드하고 재시작하면 개발 중 허용할 수 없는 피드백 루프가
  생겨요.
- **Git-Sync Sidecar** -- 일반 EC2나 Docker Compose 환경에서 사용하지
  마세요. Kubernetes 밖에서 sidecar 패턴은 불필요한 복잡성만 추가해요.
- **S3/EFS Sync** -- DAG 배포의 엄격한 버전 관리가 필요한 경우 사용하지
  마세요. S3 sync는 Git처럼 원자적 업데이트나 롤백 보장을 제공하지 않아요.
