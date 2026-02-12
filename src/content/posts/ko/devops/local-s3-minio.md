---
title: MinIO로 로컬 S3 구축하기
description: Docker로 실행하는 S3 호환 오브젝트 스토리지 MinIO 설정 가이드
date: 2026-01-27T00:00:00.000Z
updated: 2026-01-27T00:00:00.000Z
tags:
  - devops
  - docker
  - s3
  - minio
  - local-dev
category: devops
draft: false
lang: ko
source_lang: en
source_slug: local-s3-minio
source_updated: "2026-01-27"
translation_date: "2026-02-12"
references:
  - url: "https://min.io/docs/minio/linux/index.html"
    title: MinIO Documentation
    type: official
---

개발 중에 ETL 파이프라인을 실행할 때마다 실제 AWS S3를 호출하고 있었어요.
테스트할 때마다 API 비용이 발생하고, 인터넷 접속이 필수이고, 실수로
프로덕션 데이터를 읽거나 쓸 위험도 있었어요. 실제와 동일하게 동작하면서
비용이 들지 않고 오프라인에서도 작동하는 로컬 S3가 필요했어요.

## 왜 중요한가

S3에 의존하는 코드는 어디에나 있어요 -- ETL 작업, 파일 업로드, 백업, 데이터
레이크 읽기. 개발 중에 실제 S3를 대상으로 테스트하면 느리고, 비싸고,
위험해요. 로컬 S3 대체품이 세 가지 문제를 모두 해결해요: 비용 제로, 네트워크
의존성 없음, 프로덕션 데이터를 건드릴 가능성 제로.

---

## 겪었던 어려움

- **boto3 virtual-hosted 스타일** -- boto3가 기본적으로 virtual-hosted 스타일
  URL(`bucket.s3.amazonaws.com`)을 사용하는데, MinIO는 이를 지원하지 않아요.
  `addressing_style: "path"`가 필요하다는 걸 알아내기까지 알 수 없는
  connection-refused 에러와 시행착오가 있었어요.
- **PySpark S3A vs S3** -- Spark는 `s3://`가 아니라 `s3a://` 프로토콜(Hadoop
  커넥터)을 사용하고, 자체 별도의 설정 키(`spark.hadoop.fs.s3a.*`)가
  필요해요. boto3 설정은 이어지지 않아요.
- **MinIO 시작 race condition** -- 버킷을 생성하는 `minio-init` 컨테이너가
  MinIO가 완전히 시작되기 전에 실패하는 경우가 있었어요. Docker Compose에서
  `condition: service_healthy`를 추가해야 했어요.
- **SSL 불일치** -- MinIO는 로컬에서 일반 HTTP로 실행되지만, S3A는 기본적으로
  SSL을 사용해요. `connection.ssl.enabled=false`를 빼먹으면 네트워크 문제처럼
  보이는 TLS handshake 에러가 나와요.

---

## 검토한 옵션

| 옵션            | 장점                                                 | 단점                                                |
| --------------- | ---------------------------------------------------- | --------------------------------------------------- |
| **MinIO**       | 100% S3 API 호환, 가벼운 Docker 이미지, 웹 콘솔 포함 | Path 스타일만 지원, 다른 AWS 서비스 에뮬레이션 없음 |
| **LocalStack**  | 여러 AWS 서비스 에뮬레이션 (S3, SQS, Lambda 등)      | 더 무거운 리소스 사용, 무료 티어 제한, 느린 시작    |
| **실제 AWS S3** | 에뮬레이션 갭 없음, 프로덕션과 동일                  | 비용 발생, 인터넷 필요, 프로덕션 데이터 접근 위험   |

프로젝트가 S3만 필요하기 때문에(SQS, Lambda 등 불필요) MinIO를 선택했어요.
MinIO가 더 가볍고, 시작이 빠르고, 완벽한 S3 API 호환성을 갖추고 있어요.
다른 AWS 서비스가 필요하다면 LocalStack이 더 나은 선택이에요.

---

## 셋업

### Docker Compose

```yaml
services:
  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000" # S3 API
      - "9001:9001" # 웹 콘솔
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - minio-data:/data

  # 시작 시 자동으로 버킷 생성
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c " mc alias set local http://minio:9000 minioadmin minioadmin;
      mc mb local/my-bucket --ignore-existing; "

volumes:
  minio-data:
```

`service_healthy` 조건이 중요해요. 이게 없으면 `minio-init` 컨테이너가
MinIO의 시작과 경쟁해서 간헐적으로 실패해요.

### boto3 팩토리 함수

```python
import os
import boto3
from botocore.config import Config as BotoConfig

def get_s3_client(region_name: str | None = None):
    endpoint_url = os.getenv("AWS_ENDPOINT_URL")
    use_path_style = os.getenv("AWS_S3_USE_PATH_STYLE", "false").lower() == "true"
    region = region_name or os.getenv("AWS_REGION", "ap-northeast-2")

    client_kwargs = {"region_name": region}

    if endpoint_url:
        client_kwargs["endpoint_url"] = endpoint_url
        if use_path_style:
            client_kwargs["config"] = BotoConfig(s3={"addressing_style": "path"})

    return boto3.client("s3", **client_kwargs)
```

이 팩토리 함수는 로컬(MinIO)과 프로덕션(실제 AWS) 모두에서 작동해요.
`AWS_ENDPOINT_URL`이 설정되어 있지 않으면 실제 S3에 연결하고, 설정되어 있으면
path 스타일 주소 지정으로 MinIO를 가리켜요.

### PySpark S3A 설정

```python
endpoint_url = os.getenv("AWS_ENDPOINT_URL")

if endpoint_url:
    builder = (
        builder
        .config("spark.hadoop.fs.s3a.endpoint", endpoint_url)
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
    )
    if endpoint_url.startswith("http://"):
        builder = builder.config("spark.hadoop.fs.s3a.connection.ssl.enabled", "false")
```

PySpark는 `s3://`가 아니라 `s3a://` 프로토콜(Hadoop 커넥터)을 사용해요.
boto3 설정이 이어지지 않아서 Spark 전용 설정이 별도로 필요해요. SSL 비활성화가
특히 중요해요: MinIO가 로컬에서 일반 HTTP로 실행되는데, S3A는 기본적으로
SSL을 사용해요. 이 라인 없이는 네트워크 장애처럼 보이는 TLS handshake
에러가 발생해요.

---

## 환경 변수

```bash
# 로컬 (MinIO)
AWS_ACCESS_KEY_ID=minioadmin
AWS_SECRET_ACCESS_KEY=minioadmin
AWS_ENDPOINT_URL=http://localhost:9000
AWS_S3_USE_PATH_STYLE=true

# 프로덕션 (실제 AWS)
# AWS_ENDPOINT_URL을 설정하지 않으면 - 기본으로 실제 S3 사용
```

이 방식의 장점은 같은 코드가 양쪽 환경에서 작동한다는 거예요. 유일한
차이점은 `AWS_ENDPOINT_URL`이 설정되어 있는지 여부뿐이에요.

---

## 왜 이 방식이 효과적인가

### Path Style vs Virtual Hosted

| 스타일         | URL 형식                                     | 사용처       |
| -------------- | -------------------------------------------- | ------------ |
| Virtual-hosted | `https://bucket.s3.region.amazonaws.com/key` | AWS (기본값) |
| Path           | `http://host:port/bucket/key`                | MinIO (필수) |

MinIO가 virtual-hosted 스타일을 지원하지 않는 이유는
`bucket.s3.region.amazonaws.com` 서브도메인의 DNS 해석이 필요하기
때문이에요. Path 스타일은 버킷 이름을 URL 경로에 넣어서 어떤 HTTP
엔드포인트에서든 작동해요.

### 접근 방법

| 방법    | URL                                              |
| ------- | ------------------------------------------------ |
| 웹 콘솔 | `http://localhost:9001`                          |
| S3 API  | `http://localhost:9000`                          |
| AWS CLI | `aws s3 ls --endpoint-url http://localhost:9000` |

포트 9001의 웹 콘솔은 개발 중에 특히 유용해요. 코드를 작성하지 않고도
버킷을 탐색하고, 파일을 업로드하고, 오브젝트를 검사할 수 있어요.

---

## 실전 팁

MinIO는 S3 에뮬레이션만 필요할 때 올바른 선택이에요. 다음 경우에
사용하세요:

- S3에 의존하는 코드의 로컬 개발 (ETL, 파일 업로드, 백업)
- AWS 자격 증명 없이 S3가 필요한 CI/CD 파이프라인의 통합 테스트
- 인터넷 접속이 불안정하거나 불가능한 오프라인 개발
- 실제 S3 지연 시간이 피드백 루프를 느리게 하는 빠른 반복 작업

### MinIO를 사용하면 안 되는 경우

- **다중 AWS 서비스 에뮬레이션** -- S3와 함께 SQS, Lambda, DynamoDB 등이
  필요하면 LocalStack을 사용하세요; MinIO는 S3만 에뮬레이트해요
- **S3 Select 또는 Glacier** -- MinIO는 모든 S3 기능을 지원하지 않아요;
  S3 Select, Glacier 티어, S3 Object Lock 같은 고급 기능은 다르게
  동작하거나 없을 수 있어요
- **성능 벤치마킹** -- Docker의 로컬 MinIO는 실제 S3와 다른 지연 시간과
  처리량 특성을 가져요; 성능 테스트에 사용하지 마세요
- **Virtual-hosted 스타일 URL** -- 코드가 virtual-hosted 버킷 URL에
  의존하고 path 스타일로 설정을 변경할 수 없다면, 코드 변경 없이는
  MinIO가 작동하지 않아요

기억해야 할 두 가지 주의사항: MinIO에 연결하는 모든 클라이언트에 항상
`path.style.access=true`를 설정하고, 일반 HTTP 엔드포인트를 사용할 때는
항상 SSL을 비활성화하세요.
