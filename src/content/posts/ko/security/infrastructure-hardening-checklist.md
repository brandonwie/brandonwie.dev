---
title: "인프라 보안 강화 체크리스트"
description: "AWS 인프라 보안 강화 체크리스트예요. 네트워크 격리, WAF 배포, 그리고 같은 작업에서 따라온 비용 절감을 다뤄요."
date: 2026-01-26T00:00:00.000Z
updated: "2026-08-02"
tags:
  - security
  - aws
  - infrastructure
  - checklist
category: security
draft: false
lang: ko
source_lang: en
source_slug: infrastructure-hardening-checklist
source_updated: "2026-08-02"
translation_date: "2026-03-04"
references:
  - url: "https://www.cisecurity.org/cis-benchmarks"
    title: CIS Benchmarks
    type: authoritative
---

2025년에 AWS 환경 하나를 대상으로 보안 강화 작업을 진행했어요. ALB 뒤에 ECS
서비스가 있고, 그 뒤에 RDS와 ElastiCache가 있는 구성이었어요. 이 글은 그때
나온 체크리스트인데, 제가 작업한 순서가 아니라 영역별로 묶어서 정리했어요.

목록 자체에 새로운 건 없어요. 평범한 AWS 실무이고, 더 완전하고 공식적인
버전은 [CIS Benchmarks](https://www.cisecurity.org/cis-benchmarks)에 있어요.
그중 따로 짚고 싶은 두 가지는 순서에 대한 제약이에요. `0.0.0.0/0`을 제거하기
전에 개발자 IP 규칙을 먼저 추가할 것, 그리고 WAF를 차단 모드로 바꾸기 전에
모든 경로를 테스트할 것. 글 끝의 "구현 순서" 절은 제가 권장하는 순서이지,
제가 실제로 먼저 한 일의 기록은 아니에요.

## 실제로 바뀐 것

아래 숫자는 그 환경 하나에서 나온 값이에요. 체크리스트 자체의 성질이 아니고,
다른 환경에 그대로 옮겨간다고 기대하지도 않아요.

| 변경 사항                | 관찰한 결과                                                        | 월 비용  |
| ------------------------ | ------------------------------------------------------------------ | -------- |
| WAF 차단 모드            | WAF 로그에 하루 1,000건 이상의 차단된 요청                         | +$30     |
| RDS + ElastiCache 격리   | 둘 다 `0.0.0.0/0`을 더 이상 받지 않고, ECS와 개발자 IP 몇 개만 허용 | $0       |
| 사용하지 않는 NAT Gateway 제거 | 측정 구간 동안 트래픽이 전혀 없었음                          | -$90     |
| **합계**                 |                                                                    | **-$60** |

이 글의 초안에는 "위험 95% 감소", "공격 표면 100% 감소" 같은 문장이 있었는데
둘 다 뺐어요. 위험 모델을 정의하지 않으면 그건 측정값이 아니고, 저한테는 그런
모델이 없었어요. 제가 가진 건 인터넷 전체에 응답하기를 멈춘 security group
하나였어요.

비용 열은 따로 볼 만해요. 아무도 쓰지 않던 NAT Gateway를 지운 것만으로 WAF
비용의 세 배가 빠졌고, 결과적으로 이번 강화 작업은 아무것도 안 하는 쪽보다
저렴하게 끝났어요.

## 네트워크 보안 체크리스트

### 데이터베이스 격리

```text
이전: 0.0.0.0/0 접근 (인터넷 전체)
이후: ECS security group + 개발자 IP만
```

- [ ] RDS: security group에서 `0.0.0.0/0` 제거
- [ ] ElastiCache: security group에서 `0.0.0.0/0` 제거
- [ ] ECS security group을 허용 소스로 추가
- [ ] 직접 접근을 위한 개발자 IP(CIDR 블록) 추가
- [ ] 불필요한 포트 제거(예: 데이터베이스 인스턴스의 443)

```hcl
resource "aws_security_group_rule" "rds_from_ecs" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.ecs.id
  security_group_id        = aws_security_group.rds.id
}

resource "aws_security_group_rule" "rds_from_dev" {
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = var.developer_ips  # ["x.x.x.x/32", "y.y.y.y/32"]
  security_group_id = aws_security_group.rds.id
}
```

### Load Balancer 강화

- [ ] TLS 1.2+ 최소 요구
- [ ] HTTP/2 활성화
- [ ] 상태 점검 간격 최적화
- [ ] 적절한 idle timeout 설정

```hcl
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
}
```

### NAT Gateway 검토

사용하지 않는 NAT Gateway를 확인하세요:

```bash
# NAT Gateway 메트릭 확인
aws cloudwatch get-metric-statistics \
  --namespace AWS/NATGateway \
  --metric-name BytesOutToDestination \
  --dimensions Name=NatGatewayId,Value=nat-xxxxx \
  --start-time 2024-01-01T00:00:00Z \
  --end-time 2024-01-31T00:00:00Z \
  --period 86400 \
  --statistics Sum
```

사용량이 0이면 제거를 검토하세요(~$90/월 절약).

## WAF 배포 체크리스트

- [ ] allowlist 방식으로 WAF 배포(기본 차단)
- [ ] 모든 정상 API 경로를 allowlist에 추가
- [ ] 상태 점검 엔드포인트 추가
- [ ] WebSocket/Socket.IO 경로 추가
- [ ] 차단 모드 활성화 전 모든 경로 테스트
- [ ] 차단된 요청에 대한 CloudWatch 로깅 설정

구현 세부사항은 [WAF Allowlist Patterns](/posts/waf-allowlist-patterns)를 참고하세요.

## 데이터베이스 백업 체크리스트

- [ ] 백업 보존 기간 늘리기(7일 이상 권장)
- [ ] 삭제 보호 활성화
- [ ] 자동 스냅샷 설정
- [ ] 복원 절차 테스트

```hcl
resource "aws_db_instance" "main" {
  # ...
  backup_retention_period = 7
  deletion_protection     = true
  skip_final_snapshot     = false
  final_snapshot_identifier = "${var.project}-final-snapshot"
}
```

## 개발자 접근 체크리스트

단기(IP 기반):

- [ ] 개발자 IP 문서화
- [ ] security group 규칙에 추가
- [ ] IP 업데이트 프로세스 수립

장기(권장):

- [ ] VPN 설정(AWS Client VPN 또는 서드파티)
- [ ] SSH 터널링용 Bastion host
- [ ] AWS Systems Manager Session Manager

## 모니터링 체크리스트

- [ ] security group 변경에 대한 CloudWatch 알람
- [ ] WAF 로깅을 CloudWatch Logs로
- [ ] ALB 접근 로깅을 S3로
- [ ] 보안 규정 준수를 위한 AWS Config 규칙

## 구현 순서

위 절들은 순서가 아니라 영역별로 묶여 있어요. 중단을 최소화하려면 이 순서를
권해요:

1. **WAF 배포** - 모니터 모드로 먼저 배포
2. **데이터베이스 격리** - security group 업데이트(다운타임 없음)
3. **개발자 접근** - 0.0.0.0/0 제거 전에 IP 규칙 추가
4. **ALB 강화** - TLS 정책, 상태 점검(영향 최소)
5. **NAT Gateway 제거** - 사용량 없음 확인 후
6. **백업 강화** - 중단 없음

## 후속 개선

초기 강화 후:

- [ ] 모든 리소스를 private subnet으로 마이그레이션
- [ ] 암호화된 remote state backend
- [ ] AWS Secrets Manager로 자격 증명 관리
- [ ] 개발자 접근을 위한 VPN 설정
- [ ] Infrastructure as Code 보안 스캐닝

## 핵심 교훈

1. **보안과 비용은 함께 갈 수 있어요** - 사용하지 않는 리소스를 제거하면 둘 다 개선돼요
2. **점진적 변경** - 각 변경 사이에 모니터링
3. **IP 기반 접근은 임시** - VPN/Bastion 계획을 세우세요
4. **모든 것을 문서화** - 보안 변경에는 감사 추적이 필요해요
5. **프로덕션 전에 테스트** - dev 환경에서 먼저 검증하세요
