---
title: "PortAudio의 오래된 USB 오디오 디바이스 핸들 문제"
description: >-
  PortAudio를 사용하는 장기 실행 오디오 데몬이 USB 디바이스 핸들이 오래되면
  조용히 제로 버퍼를 생성해요. 진단하고 해결하는 방법을 알아보세요.
date: 2026-03-30T00:00:00.000Z
updated: "2026-04-06"
tags:
  - general
  - devops
category: general
draft: false
lang: ko
source_lang: en
source_slug: portaudio-stale-usb-audio-handle
source_updated: "2026-04-06"
translation_date: "2026-04-06"
references:
  - url: 'https://github.com/spatialaudio/python-sounddevice'
    title: python-sounddevice — Play and Record Sound with Python
    type: official
  - url: 'https://www.portaudio.com/'
    title: PortAudio — Portable Cross-Platform Audio I/O
    type: official
---

오디오 트랜스크립션 데몬이 9일째 실행 중이었어요. 완벽하게 정상으로 보였죠 — 시작/종료 콜백이 정상적으로 실행되고, 비프음이 잘 나오고, 로그에 에러도 없었어요. 그런데 모든 녹음이 디지털 무음으로 돌아왔어요. 데몬이 아무것도 없는 걸 트랜스크립션하고 있었는데, 며칠 동안 조용히 그러고 있었던 거예요.

## 문제: 오래된 USB 디바이스 핸들

PortAudio(그리고 Python 래퍼인 `sounddevice`)는 `stream.start()`가 호출될 때 `InputStream`을 특정 USB 디바이스 엔드포인트에 바인딩해요. 그 바인딩은 스트림의 생명 주기 동안 영구적이에요. USB 오디오 디바이스가 macOS 슬립/웨이크 사이클, 언플러그/리플러그 이벤트, USB 버스 재열거를 거치면 엔드포인트가 변경되는데 — 스트림의 핸들은 여전히 이전 것을 가리키고 있어요.

데몬(claude-stt)이 9일 전의 원래 USB 엔드포인트에 바인딩된 RODE NT-USB 마이크 핸들을 들고 있었어요. 그 사이 macOS 슬립/웨이크 사이클로 디바이스가 재할당됐어요. 핸들이 무효화됐는데 PortAudio가 에러를 표면화하지 않았어요.

### 두 가지 실패 모드

이 오래된 핸들 문제는 두 가지 다른 방식으로 나타나요:

**조용한 제로 (증상 A):** 모든 녹음이 로그에서 -200.0 dB(디지털 무음)을 보여요. `InputStream` 콜백이 정상적으로 실행되면서 모든 `indata`가 제로예요. `status` 파라미터는 깨끗해요 — 오버플로도 없고, 언더플로도 없고, 디바이스 에러도 없어요. 데몬이 완벽하게 정상으로 보이는데 그냥 무음을 녹음하고 있는 거예요.

**하드 에러 (증상 B):** `sd.InputStream()`이 `PortAudioError: Internal PortAudio error [PaErrorCode -9986]`을 발생시키면서 macOS AUHAL 경고(`'!obj'` Unknown Error, `-10851` Invalid Property Value)가 나와요. 스트림이 열리지 않아요. 이 변형은 이전 슬립/웨이크 사이클로 디바이스 상태가 더 심하게 손상됐을 때 나타나요.

두 실패 모드 모두 같은 해결책으로 해결돼요: 스트림을 재시작해서 새로운 디바이스 핸들을 얻으면 돼요.

## 진단이 어려웠던 이유

여러 요인이 합쳐져서 디버깅이 어려웠어요:

- **PortAudio에서 에러 시그널이 없었어요.** 콜백 모델이 오래된 핸들에서 예외를 발생시키는 대신 제로로 채워진 버퍼를 전달했어요. status 파라미터도 깨끗했어요.
- **오해를 불러일으킨 첫 번째 가설.** 처음에는 macOS 마이크 권한을 의심했어요 — iTerm2는 Privacy 목록에 있었지만 tmux/Ghostty는 없었거든요. 같은 venv에서 직접 Python 테스트를 해보니 -56.4 dB로 오디오가 잘 캡처돼서, 권한 문제를 배제했어요.
- **긴 가동 시간이 원인을 가렸어요.** 데몬이 3월 21일부터 실행 중이었어요. 시작할 때는 잘 동작했고 조용히 실패하기만 해서, 디바이스 이벤트와 연관시킬 명확한 실패 타임스탬프가 없었어요.
- **-200 dB가 분명히 "제로"를 뜻하지는 않아요.** 로그 형식 `Transcribing audio (N samples, -200.0 dB)`는 "0.0 peak amplitude"만큼 "오디오 캡처 안 됨"을 외치지 않아요.
- **PaErrorCode -9986이 샘플 레이트로 오해를 유도해요.** AUHAL `-10851`(Invalid Property Value)과 스트림 열기 실패가 디바이스가 요청된 샘플 레이트를 처리할 수 없다고 시사해요. 같은 디바이스에서 같은 레이트로 새 스트림을 테스트하면 성공해요 — 에러가 설정이 아니라 오래된 디바이스 상태에 관한 거예요.

## 해결책

데몬을 재시작해서 유효한 디바이스 핸들로 새 `sd.InputStream`을 만드세요:

```bash
# 오래된 데몬 중지
python3 scripts/exec.py -m claude_stt.daemon stop

# 새로 시작 — 현재 USB 디바이스로 새 PortAudio 스트림 열기
python3 scripts/exec.py -m claude_stt.daemon start --background

# 확인
python3 scripts/exec.py -m claude_stt.daemon status
```

### 진단 테스트

재시작 전에 데몬과 독립적으로 마이크가 동작하는지 확인하세요:

```python
import sounddevice as sd
import numpy as np

audio = sd.rec(int(2 * 16000), samplerate=16000, channels=1, dtype='float32')
sd.wait()
peak = np.max(np.abs(audio))
print(f'Peak: {peak:.6f}, dB: {20 * np.log10(peak + 1e-10):.1f}')
# peak > 0.001이면 → 마이크는 동작, 데몬이 오래된 핸들을 가짐
# peak < 0.0001이면 → 실제 마이크/권한 문제
```

테스트에서 오디오가 나오는데 데몬에서는 안 나오면, 오래된 핸들 문제예요.

## 견고한 데몬 만들기

프로덕션 오디오 데몬은 헬스 체크를 구현해야 해요: N번 연속 녹음이 임계값(예: -180 dB) 미만의 dB를 생성하면 오디오 스트림을 자동 재시작하세요. macOS CoreAudio는 디바이스 건강 모니터링을 위한 `kAudioDevicePropertyDeviceIsAlive`를 노출하지만, `sounddevice`(Python 래퍼)는 이걸 노출하지 않아요 — 출력 분석을 통해 오래됨을 감지해야 해요.

## 적용되는 경우

- `sounddevice`나 PortAudio를 직접 사용하는 **모든 장기 실행 오디오 데몬**
- **USB 오디오 디바이스** — 내장 노트북 마이크는 USB 재열거를 거치지 않아서 덜 영향받아요
- macOS 슬립 사이클을 견디는 **백그라운드/데몬 프로세스**
- 프로세스가 정상으로 보이는 **"녹음은 되는데 오디오가 없는"** 시나리오 진단

짧은 녹음 세션에서는 핸들이 오래되지 않아요. CoreAudio를 직접 사용하는(PortAudio를 거치지 않는) 애플리케이션에서는 디바이스 변경 알림을 구독하고 프레임워크 레벨에서 재연결을 처리할 수 있어요.

## 핵심 교훈

PortAudio는 USB 디바이스 핸들이 오래됐을 때 알려주지 않아요. 에러 없이 계속 제로로 채워진 버퍼를 전달해요. 장기 실행 오디오 데몬이 무음을 생성하기 시작하면, 독립적으로 마이크를 테스트하세요 — 마이크는 되는데 데몬은 안 되면 스트림을 재시작하세요. 더 좋은 건, 누구도 눈치채기 전에 자동 재시작하는 dB 헬스 체크를 만드는 거예요.
