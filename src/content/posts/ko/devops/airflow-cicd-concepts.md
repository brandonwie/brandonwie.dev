---
title: Airflow CI/CD 개념
description: 주방 비유를 통해 Airflow 배포와 CI/CD 개념을 이해해 봐요.
date: 2026-01-23T00:00:00.000Z
updated: 2026-01-23T00:00:00.000Z
tags:
  - devops
  - airflow
  - cicd
  - docker
  - work
category: devops
draft: false
lang: ko
source_lang: en
source_slug: airflow-cicd-concepts
source_updated: '2026-03-22'
translation_date: '2026-03-04'
references:
  - url: >-
      https://airflow.apache.org/docs/apache-airflow/stable/administration-and-deployment/production-deployment.html
    title: Production Deployment — Airflow Documentation
    type: official
---

## DAG vs ETL

### DAG = 레시피 카드

DAG(Directed Acyclic Graph)는 레시피 카드와 같아요.

- **무엇을** 요리할지(어떤 task를 실행할지)
- **언제** 요리할지(스케줄: 매일, 매시간 등)
- **어떤 순서로** 할지(task A를 task B 전에)

```python
# DAG는 그저 지시사항이에요. 실제 작업이 아니에요
with DAG('amplitude_pipeline', schedule='@daily'):
    task1 = "Fetch data from Amplitude"      # Step 1
    task2 = "Transform the data"              # Step 2
    task3 = "Save to database"                # Step 3
    task1 >> task2 >> task3   # 이 순서대로 실행
```

### ETL = 실제 요리

ETL(Extract, Transform, Load)은 실제 작업을 수행하는 코드에요.

- **E = Extract**: 데이터 가져오기(API 연결, 이벤트 다운로드)
- **T = Transform**: 데이터 처리(정제, 계산, 조인)
- **L = Load**: 결과 저장(S3, 데이터베이스에)

**핵심 인사이트:** DAG는 데이터를 처리하지 않아요. "이 컨테이너를 지금 실행해"라고 지시할 뿐이에요.

## Hot-Reload vs 재시작

### 재시작이 필요 없는 경우 (90%)

| 변경 사항                   | 동작                              |
| --------------------------- | --------------------------------- |
| `dags/my_dag.py`(신규/수정) | 스케줄러가 ~30초 내 자동 감지     |
| ETL 코드(arch-etl)          | 다음 DAG 실행 시 새 컨테이너 사용 |

### 재시작이 필요한 경우 (10%)

| 변경 사항        | 재시작 이유                             |
| ---------------- | --------------------------------------- |
| Airflow 버전     | 새 이미지 = 재시작 필요                 |
| requirements.txt | 새 Python 패키지가 이미지에 포함돼야 함 |
| Dockerfile       | 이미지 변경 = 리빌드 + 재시작           |
| .env 파일        | 환경 변수는 컨테이너 시작 시 로드됨     |

## 배포 시나리오

| 시나리오           | 조치                   | 재시작? | 다운타임    |
| ------------------ | ---------------------- | ------- | ----------- |
| DAG 변경           | EC2에서 git pull       | 아니오  | 없음(~30초) |
| ETL 코드 변경      | ECR push               | 아니오  | 없음        |
| Airflow 업그레이드 | 이미지 리빌드 + 재시작 | 예      | ~1-2분      |

## 세 저장소 패턴

| 저장소          | 포함 내용      | 배포 방법            | 재시작?                      |
| --------------- | -------------- | -------------------- | ---------------------------- |
| `arch-airflow`  | DAG 파일       | EFS로 git pull       | 아니오                       |
| `arch-airflow`  | Airflow 이미지 | ECR + docker restart | 예(드묾)                     |
| `arch-etl`      | ETL 작업 코드  | ECR push             | 아니오(자동으로 latest pull) |
| `backend-infra` | 인프라         | Terraform(1회)       | 해당 없음                    |

## 핵심 정리

1. **DAG = 레시피**(무엇을/언제/순서), **ETL = 요리**(실제 작업)
2. **DAG는 데이터를 건드리지 않아요** - 워커에게 "이 컨테이너를 지금 실행해"라고 지시할 뿐
3. **대부분의 배포는 재시작이 필요 없어요** - DAG와 ETL은 hot-reload돼요
4. **Airflow 이미지 변경 시에만 재시작** (버전 업그레이드, 새 패키지)
5. **arch-etl 컨테이너는 일회성** - 실행하고, 작업하고, 종료되고, 삭제돼요
