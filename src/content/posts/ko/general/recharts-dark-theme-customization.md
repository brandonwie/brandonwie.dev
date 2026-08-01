---
title: Recharts 다크 테마 커스터마이징
description: >-
  Recharts 차트를 다크 터미널 테마에 맞게 스타일링하는 방법을 CSS 변수와
  커스텀 컴포넌트를 통해 설명합니다.
date: 2026-02-04T00:00:00.000Z
updated: "2026-08-02"
tags:
  - general
  - react
  - recharts
  - charts
  - frontend
  - dark-theme
category: general
draft: false
lang: ko
source_lang: en
source_slug: recharts-dark-theme-customization
source_updated: "2026-08-02"
translation_date: "2026-03-10"
references:
  - url: null
    title: Recharts dark theme implementation in Crucio dashboard
    type: experience
  - url: "https://recharts.github.io/en-US/api/Tooltip/"
    title: "Recharts Tooltip API — content prop for custom tooltips"
    type: official
  - url: "https://recharts.github.io/en-US/api/XAxis/"
    title: "Recharts XAxis API — tick, tickLine, and axisLine props"
    type: official
  - url: "https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/linearGradient"
    title: MDN SVG linearGradient Element
    type: authoritative
---

다크 테마 대시보드에 Recharts를 넣었더니 모든 차트가 흰색 격자선, 눈부신 툴팁, 보이지 않는 축 라벨로 렌더링됐어요. 기본값이 밝은 배경을 전제로 하거든요. Recharts는 SVG 엘리먼트에 인라인 스타일을 사용하기 때문에 CSS 클래스가 아니라 글로벌 스타일시트로 고칠 수가 없어요. 모든 색상을 prop으로 직접 넘겨야 합니다.

이 글에서는 Recharts를 다크 UI에 자연스럽게 맞추기 위해 필요한 오버라이드들을 다뤄요 -- 커스텀 툴팁, 그래디언트 채우기, 축 스타일링, 그리고 디버깅에 시간을 잡아먹은 함정들입니다.

## 핵심 문제

Recharts는 하드코딩된 라이트 테마 기본값으로 `<svg>` 엘리먼트를 렌더링해요. 격자선은 밝은 회색이고, 툴팁 배경은 흰색이고, 축 눈금 라벨은 브라우저 기본값을 상속해서 어두운 배경에서 사라져요. `theme="dark"` 같은 prop이 없어요. 각 컴포넌트를 prop으로 개별 오버라이드해야 합니다.

네 가지 영역에 주의가 필요해요:

- **격자선** -- 기본 stroke가 너무 밝음
- **축 라벨** -- 명시적 `fill` 없이는 안 보임
- **툴팁** -- 흰색 배경을 커스텀 컴포넌트로 교체해야 함
- **Area 채우기** -- 단색은 밋밋해 보이고, SVG 그래디언트로 해결

## 다크 테마 색상 맵

중앙 집중식 색상 객체부터 시작하세요. 이렇게 하면 매직 hex 문자열이 컴포넌트 여기저기에 흩어지는 걸 방지하고, 테마 변경을 한 번의 수정으로 끝낼 수 있어요.

```typescript
const COLORS = {
  grid: "#404040", // --border
  axis: "#888888", // --text-muted
  tooltip: {
    bg: "#2d2d2d", // --bg-secondary
    border: "#404040", // --border
    text: "#e5e5e5", // --text-primary
  },
  series: {
    primary: "#6b9eff", // --accent-blue
    secondary: "#da7756", // --accent-orange
    success: "#7ec699", // --accent-green
  },
};
```

이 값들은 터미널 스타일 디자인 시스템(CSS custom properties)에서 가져왔지만, 어떤 다크 팔레트든 괜찮아요. 핵심은 각 Recharts 표면을 디자인 토큰에 매핑하는 거예요.

## 커스텀 툴팁 컴포넌트

기본 툴팁도 `contentStyle`, `labelStyle` prop을 받지만 제한적이에요. 커스텀 컴포넌트를 만들면 레이아웃, 색상, 포맷팅을 완전히 제어할 수 있어요.

```text
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "#2d2d2d",
        border: "1px solid #404040",
        borderRadius: "6px",
        padding: "8px 12px",
        fontSize: "12px"
      }}
    >
      <p style={{ color: "#888888", marginBottom: 4 }}>{label}</p>
      {payload.map((entry, i) => (
        <p key={i} style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}
```

`<Tooltip content={<DarkTooltip />} />`로 전달하면 돼요. `payload` 배열이 시리즈 색상을 자동으로 갖고 있어서, 각 줄이 추가 매핑 없이 해당 차트 시리즈와 색이 맞아요.

## SVG 그래디언트 채우기가 있는 Area 차트

단색 area 채우기는 색칠한 블록처럼 보여요. SVG `<linearGradient>`를 사용해서 상단 30% 투명도에서 하단 0%로 페이드하면 차트를 압도하지 않으면서 깊이감을 줄 수 있어요.

그래디언트는 차트 안의 `<defs>`에서 정의하고, `<Area>` 컴포넌트의 `fill` prop에서 `id`로 참조해요.

```text
<ResponsiveContainer width="100%" height={200}>
  <AreaChart data={data}>
    <defs>
      <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%" stopColor="#6b9eff" stopOpacity={0.3} />
        <stop offset="95%" stopColor="#6b9eff" stopOpacity={0} />
      </linearGradient>
    </defs>

    <CartesianGrid
      strokeDasharray="3 3"
      stroke="#404040" // Dark grid lines
      vertical={false}
    />

    <XAxis
      dataKey="time"
      stroke="#888888" // Muted axis color
      tick={{ fill: "#888888", fontSize: 11 }}
      tickLine={false}
      axisLine={false}
    />

    <YAxis
      stroke="#888888"
      tick={{ fill: "#888888", fontSize: 11 }}
      tickLine={false}
      axisLine={false}
    />

    <Tooltip content={<DarkTooltip />} />

    <Area
      type="monotone"
      dataKey="latency"
      stroke="#6b9eff"
      fill="url(#colorLatency)" // Gradient reference
      strokeWidth={2}
    />
  </AreaChart>
</ResponsiveContainer>
```

기억할 패턴: `<defs>` 안에 `<linearGradient id="X">`, 그리고 컴포넌트에 `fill="url(#X)"`. 그래디언트가 안 나타나면 `id` 문자열이 안 맞는 거예요 -- 이게 가장 흔한 디버깅 삽질이에요.

## 축 없는 수평 바 차트

컴팩트한 대시보드 위젯에서는 축을 완전히 제거하고 바 길이로 값을 전달할 수 있어요. 왼쪽에 카테고리 라벨이 있는 세로 레이아웃이 좁은 사이드바에서 잘 동작해요.

```text
<ResponsiveContainer width="100%" height={160}>
  <BarChart data={data} layout="vertical" barSize={16}>
    <XAxis type="number" hide />
    <YAxis
      type="category"
      dataKey="name"
      width={80}
      tick={{ fill: "#888888", fontSize: 12 }}
      tickLine={false}
      axisLine={false}
    />
    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
      {data.map((entry, i) => (
        <Cell key={i} fill={INTENT_COLORS[entry.name]} />
      ))}
    </Bar>
  </BarChart>
</ResponsiveContainer>
```

`radius` prop이 각 바의 오른쪽 끝을 둥글게 만들어요. `XAxis`에 `hide`를 설정하면 렌더링에서 제거하면서 레이아웃 엔진은 계속 동작해요.

## 번들 사이즈 주의

Recharts는 번들에 약 650KB를 추가해요. 차트가 여러 탭 중 하나인 대시보드에서는 lazy loading으로 초기 페이지 로드 비용을 줄일 수 있어요.

```typescript
// Lazy import for code splitting
const MetricsWidget = lazy(() => import("./MetricsWidget"));

// Or import only what you need (tree-shaking)
import { AreaChart, Area, XAxis, YAxis } from "recharts";
```

named import를 사용하면 지원하는 번들러(Vite, webpack 5+)에서 tree-shaking이 돼요. destructuring 없이 `recharts`에서 import하면 전부 끌어와요.

## 자주 겪는 함정

실제 디버깅 시간을 잡아먹은 문제들이에요. 원인을 알면 각각 빠르게 해결할 수 있어요.

| 문제                           | 해결법                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| 다크 배경에 흰색 격자선        | CartesianGrid에 `stroke="#404040"` 설정                                             |
| 축 텍스트 안 보임              | `tick={{ fill: '#888888' }}` 설정                                                   |
| 툴팁 흰색 배경                 | 커스텀 툴팁 컴포넌트 사용                                                           |
| 그래디언트 안 보임             | `id`와 `fill="url(#id)"` 일치 확인                                                  |
| 차트가 컨테이너 밖으로 넘침    | 항상 `ResponsiveContainer`로 감싸기                                                 |
| v3 Tooltip formatter 타입 에러 | `(value: number) =>`가 아니라 `(value) =>`로 -- v3에서 `number \| undefined`로 변경 |

v3 formatter 문제는 특히 교활해요. `formatter` prop에 `(value: number) =>`로 타입을 지정하면 TypeScript 컴파일은 통과하지만, 특정 tick에서 런타임에 `undefined`가 들어와요. Recharts v3에서 tooltip 값의 타입이 `number | undefined`로 바뀌었기 때문에 콜백 시그니처가 이에 맞아야 해요.

## 정리

Recharts 다크 테마 적용은 어렵지 않아요 -- 귀찮을 뿐이에요. 라이브러리에 테마 시스템이 없기 때문에 모든 표면에 명시적인 색상 prop이 필요해요. 확장성 있는 접근법은 중앙 집중식 색상 맵(또는 CSS custom property 참조), 커스텀 툴팁 컴포넌트, 그리고 area 채우기용 SVG 그래디언트 세 가지예요.

이 세 가지 빌딩 블록이 있으면 새로운 차트 타입을 추가할 때도 같은 패턴을 따르면 돼요: `stroke`, `fill`, `tick` prop을 다크 토큰으로 오버라이드하면 끝이에요. 위의 함정 테이블이 "왜 이게 안 보이지" 하는 순간들을 줄여줄 거예요.
