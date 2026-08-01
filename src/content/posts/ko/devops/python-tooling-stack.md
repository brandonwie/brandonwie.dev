---
title: Python 툴링 스택
description: >-
  파편화된 Python 툴링을 asdf, uv, ruff, ty, pre-commit 다섯 개로 정리한 과정과
  각각을 선택한 이유
date: 2026-01-27T00:00:00.000Z
updated: '2026-08-02'
tags:
  - devops
  - python
  - tooling
category: devops
draft: false
lang: ko
source_lang: en
source_slug: python-tooling-stack
source_updated: '2026-08-02'
translation_date: '2026-02-12'
references:
  - url: 'https://astral.sh/uv/install.sh'
    title: install.sh
    type: verified
  - url: 'https://github.com/astral-sh/ruff-pre-commit'
    title: ruff pre commit
    type: official
  - url: 'https://github.com/pre-commit/mirrors-mypy'
    title: mirrors mypy
    type: official
  - url: 'https://docs.astral.sh/uv/'
    title: uv
    type: official
  - url: 'https://docs.astral.sh/ruff/'
    title: ruff
    type: official
  - url: 'https://docs.astral.sh/ty/'
    title: ty
    type: official
  - url: 'https://astral.sh/blog/ty'
    title: ty
    type: verified
  - url: 'https://asdf-vm.com/'
    title: asdf-vm.com
    type: verified
---

Python 코드를 작성하는 시간보다 Python 도구를 설정하는 데 더 많은 시간을
쓰고 있었어요. 새 프로젝트를 시작할 때마다 같은 싸움을 반복했죠. pyenv vs asdf,
pip vs Poetry, flake8 vs pylint, black vs autopep8. 여러 Python 레포지토리(ETL,
오케스트레이션, 서비스)에 걸쳐 일관성이 없었고, 새 개발자를 온보딩할 때마다 매번
다른 설정을 안내해야 했어요.

어디서든 동작하는 하나의 통일된 스택이 필요했어요.

## 왜 중요한가

Python의 툴링 생태계는 유명할 정도로 파편화되어 있어요. 일반적인 프로젝트
하나에 버전 관리(pyenv), 패키지 관리(pip/Poetry), 린팅(flake8), 포매팅(black),
import 정렬(isort), 타입 체크(mypy)까지 각각 별도의 도구가 필요해요. 도구마다
설정 형식, 업데이트 주기, 특이사항이 다르죠.

새 프로젝트의 초기 설정 비용이 높았어요. 더 나쁜 건, 레포지토리마다 일관성이
없어서 유지보수가 고통스러웠다는 거예요. 한 레포에서 통과하는 lint 규칙이 다른
레포에서는 실패하고, CI에서 의존성 해결이 한참 걸리고, 모든 개발자가 약간씩
다른 로컬 설정을 갖고 있었어요.

## 겪었던 어려움

이 스택에 정착하기 전에 여러 벽에 부딪혔어요.

**Poetry와 asdf가 잘 맞지 않았어요.** Poetry는 자체적으로 가상 환경을 관리하는데,
asdf가 관리하는 Python 버전과 충돌했어요. 잘못된 venv를 활성화하면 조용히 다른
Python 바이너리를 사용하게 되어, 디버깅이 정말 힘든 import 에러가 발생했어요.

**Ruff 규칙 선택이 압도적이었어요.** Ruff는 수십 개의 플러그인에서 800개 이상의
lint 규칙을 구현하고 있어요. false positive에 파묻히지 않으면서 적절한 `select`
조합을 찾으려면 `--fix`와 억제(suppression)를 여러 차례 반복해야 했어요.

**ty에 베타 수준의 갭이 있었어요.** ty는 베타 소프트웨어라 mypy와 edge case에서
의견이 다를 때가 있어요(예: `structlog` 타이핑 스텁). `type: ignore` 코멘트를
추가할지, 업스트림 수정을 기다릴지 결정해야 했죠.

**Pre-commit hook 순서가 중요해요.** ruff-format을 ruff-check보다 먼저
실행해야 해요. 순서를 뒤집으면 lint 수정이 포매팅 위반을 다시 만들어내는 루프가
생겨요.

## 최종 스택

최종적으로 정착한 툴링 스택이에요:

| 도구           | 용도                  | 대체 대상              |
| -------------- | --------------------- | ---------------------- |
| **asdf**       | Python 버전 관리      | pyenv, 수동 설치       |
| **uv**         | 패키지 관리 (빠름)    | pip, pip-tools, poetry |
| **ruff**       | 린팅 + 포매팅         | Black + Flake8 + isort |
| **ty**         | 정적 타입 체크 (빠름) | mypy, Pyright          |
| **pre-commit** | Git hook 관리         | 수동 hooks             |

asdf를 제외한 모든 도구가 **Astral** 제품이에요(Rust 기반, 빠르고 일관적). 이
일관성이 핵심 장점이에요. 하나의 생태계, 하나의 철학, 이슈 리포트할 곳도
하나죠.

## 왜 이 조합인가

### asdf + uv (Poetry가 아닌 이유)

| 항목      | uv                      | Poetry            |
| --------- | ----------------------- | ----------------- |
| 속도      | 10-100배 빠름 (Rust)    | 느림 (Python)     |
| 제작      | Astral (Ruff와 같은 팀) | Sebastien Eustace |
| 복잡도    | 단순, pip과 유사        | 더 복잡, 올인원   |
| asdf 호환 | 우수                    | venv 충돌 가능    |

uv가 더 단순하고 빨라요. Poetry는 ETL 스크립트와 데이터 파이프라인에는
과한 도구예요. uv가 Ruff와 같은 Astral 생태계에서 나왔기 때문에, 도구 전반의
철학이 일관적이에요.

### Ruff (Black + Flake8 + isort가 아닌 이유)

하나의 도구가 세 개를 대체해요. Rust로 작성되어 10-100배 빠르고,
`pyproject.toml`에서 일관된 설정을 제공하며, auto-fix 기능이 내장되어 있어요.
세 개의 서로 다른 linter 버전을 조율할 필요가 없어요.

### ty (mypy가 아닌 이유)

ty는 mypy보다 10-60배 빠르고(역시 Rust 기반), uv, Ruff와 같은 Astral
생태계에 있어요. 베타이지만 프로덕션에서 사용 가능한 수준이에요. Astral이
내부적으로 사용하고 있죠. LSP를 통한 IDE 통합도 보너스예요.

설치: `uv tool install ty@latest`

## 설정 방법

### 1. 도구 설치

```bash
# asdf (버전 관리자)
brew install asdf

# Python 플러그인 추가
asdf plugin add python

# Python 설치
asdf install python 3.11.7
asdf local python 3.11.7  # .tool-versions 파일 생성

# uv (패키지 관리자)
curl -LsSf https://astral.sh/uv/install.sh | sh

# ty (타입 체커)
uv tool install ty@latest
```

### 2. 프로젝트 설정

```bash
# venv 생성 및 의존성 설치
uv venv
uv pip install -r requirements.txt -r requirements-dev.txt

# 또는 sync 사용 (pyproject.toml 기반)
uv sync

# pre-commit hooks 설치
uv run pre-commit install
```

### 3. 일상 워크플로우

```bash
# venv 내에서 명령 실행
uv run python -m cli daily-export
uv run pre-commit run --all-files
uv run pytest

# 패키지 추가
uv add pandas

# 포맷 + 린트
uv run ruff format .
uv run ruff check --fix .

# 타입 체크
ty check common/ jobs/
```

핵심 패턴은 모든 곳에서 `uv run`을 사용하는 거예요. 수동으로 활성화하지
않아도 항상 올바른 가상 환경에서 실행되는 것을 보장해요.

## 설정 파일

### pyproject.toml

```toml
[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "W", "F", "I", "N", "UP", "B", "C4", "DTZ", "SIM"]

# ty 설정 (필요 시)
[tool.ty]
python-version = "3.11"
```

`select` 목록은 경험을 통해 큐레이션한 거예요. `E`와 `W`는 pycodestyle
에러와 경고, `F`는 pyflakes, `I`는 isort, `N`은 네이밍 규칙, `UP`는 Python
업그레이드 기회를 잡아주고, `B`는 흔한 함정을 잡는 bugbear, `C4`는
comprehension 단순화, `DTZ`는 timezone-aware datetime 강제, `SIM`은 단순화
제안이에요. 이 조합이면 실제 버그를 잡으면서도 노이즈에 파묻히지 않아요.

### .pre-commit-config.yaml

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.14.14
    hooks:
      - id: ruff-format
      - id: ruff
        args: [--fix]

  # 옵션 1: ty (Astral - 권장)
  - repo: local
    hooks:
      - id: ty
        name: ty type check
        entry: ty check
        language: system
        types: [python]
        pass_filenames: false

  # 옵션 2: mypy (ty가 아직 준비되지 않은 프로젝트용)
  # - repo: https://github.com/pre-commit/mirrors-mypy
  #   rev: v1.8.0
  #   hooks:
  #     - id: mypy
```

`ruff-format`이 `ruff` (lint)보다 먼저 실행되는 점에 주목하세요. 이 순서가
중요해요. 순서를 뒤집으면 lint 수정이 포매팅을 깨뜨리고, 다음 커밋에서 같은
사이클이 반복돼요.

### .tool-versions

```text
python 3.11.7
```

이 파일은 프로젝트 루트에 위치해요. 개발자가 디렉토리에 들어가면 asdf가 자동으로
올바른 Python 버전으로 전환해요. 더 이상 "내 컴퓨터에서는 되는데" 문제가
없어요.

## 타입 체킹 패턴

이 패턴들은 ty와 mypy 모두에서 동작하므로, 어떤 체커를 사용하든 안전해요.

### None 체크를 위한 Assertion

```python
def run(self) -> int:
    self.setup()

    # 타입 내로잉을 위한 assert
    assert self.args is not None, "JobArgs not initialized"
    assert self.config is not None, "Config not initialized"

    self.logger.info("Starting", dag_run_id=self.args.dag_run_id)
```

Assertion은 optional 타입을 좁히는 가장 깔끔한 방법이에요. 타입 체커는
`assert x is not None`을 그 시점 이후로 `x`가 `None`이 아니라는 증명으로
이해해요.

### structlog 타입 캐스팅

```python
from typing import cast
from structlog.typing import Processor

def get_logger(name: str, **context: Any) -> structlog.BoundLogger:
    logger = structlog.get_logger(name)
    if context:
        logger = logger.bind(**context)
    return cast(structlog.BoundLogger, logger)
```

structlog의 타이핑 스텁이 불완전해서 `cast`가 필요해요. 런타임에서 타입이
올바른 걸 알지만, 스텁이 그것을 표현하지 못하는 실용적 선택이에요.

### boto3 Client kwargs

```python
from typing import Any

client_kwargs: dict[str, Any] = {"region_name": region}
if endpoint_url:
    client_kwargs["config"] = BotoConfig(s3={"addressing_style": "path"})
```

boto3의 타입은 유명할 정도로 느슨해요. boto3-stubs 패키지가 성숙할 때까지
kwargs에 `dict[str, Any]`를 사용하는 것이 실용적인 선택이에요.

## 마이그레이션: mypy에서 ty로

mypy에서 마이그레이션하는 과정은 간단해요:

1. ty 설치: `uv tool install ty@latest`
2. 실행: `ty check .` (초기에는 설정 불필요)
3. pre-commit hook 업데이트
4. requirements-dev.txt에서 mypy 제거 (선택사항, 폴백으로 유지 가능)

ty와 mypy가 일부 edge case에서 의견이 다를 수 있어요. 그럴 때는 해당 차이가
ty 버그인지 mypy의 false positive인지 확인하세요. 대부분의 경우, ty가 실제
문제를 잡는 방향으로 더 엄격해요.

## 왜 이 방식이 효과적인가

전체 스택이 다섯 개의 도구로 축소되고, 그중 네 개가 같은 Rust 기반
생태계를 공유해요. 설정은 두 개의 파일(`pyproject.toml`과
`.pre-commit-config.yaml`)에 집중돼요. 새 프로젝트 설정이 몇 시간이 아니라
몇 분이면 끝나요.

더 중요한 건, 모든 Python 레포지토리가 이제 같은 툴링을 사용한다는 거예요. 오전에
ETL 파이프라인을 작업하고 오후에 Airflow DAG를 작업하는 개발자가 두 곳 모두에서
같은 명령어, 같은 lint 규칙, 같은 타입 체커를 사용해요.

## 실전 팁

**이 스택을 사용하면 좋은 경우:** 새로운 Python 프로젝트를 시작할 때,
특히 여러 레포지토리를 관리하는 경우예요. Astral 생태계(uv + Ruff + ty)가
Python 툴링의 파편화 고통을 없애줘요.

**넘어가도 되는 경우:** 팀이 이미 Poetry에 깊이 투자했고 마이그레이션 의지가
없을 때, 또는 lint/타입 규율이 필요 없는 일회성 스크립트를 작성할 때예요.
컴플라이언스가 중요한 코드베이스에서는 ty가 1.0에 도달할 때까지 mypy를 유지하세요.

가장 큰 장점은 속도가 아니에요(10-100배 빠른 건 좋지만). 일관성이에요.
하나의 스택, 하나의 설정 패턴, 모든 프로젝트에 걸친 하나의 규칙 세트.

---

## 참고 자료

- [uv Documentation](https://docs.astral.sh/uv/)
- [Ruff Documentation](https://docs.astral.sh/ruff/)
- [ty Documentation](https://docs.astral.sh/ty/)
- [ty Announcement Blog](https://astral.sh/blog/ty)
- [asdf Documentation](https://asdf-vm.com/)
