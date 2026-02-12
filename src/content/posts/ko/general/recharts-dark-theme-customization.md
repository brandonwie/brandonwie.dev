---
title: Recharts 다크 테마 커스터마이징
description: >-
  Recharts 차트를 다크 터미널 테마에 맞게 스타일링하는 방법을 CSS 변수와
  커스텀 컴포넌트를 통해 설명합니다.
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
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
source_updated: 2026-02-04T00:00:00.000Z
translation_date: "2026-02-12"
references:
  - url: null
    title: Recharts dark theme implementation in Crucio dashboard
    type: experience
  - url: "https://recharts.org/en-US/api"
    title: Recharts API Documentation
    type: official
  - url: "https://developer.mozilla.org/en-US/docs/Web/SVG/Element/linearGradient"
    title: MDN SVG linearGradient Element
    type: authoritative
---

다크 테마 대시보드에 Recharts를 넣었더니 모든 차트가 이상하게 보였어요. 어두운
배경에 흰색 격자선, 보이지 않는 축 텍스트, 눈이 부신 흰색 배경의 툴팁.
Recharts는 기본적으로 라이트 테마이고 내장 다크 모드 토글이 없어요. 차트의
모든 요소에 수동으로 색상을 오버라이드해야 합니다.

이 글에서는 Recharts를 터미널 스타일의 다크 테마에 맞추기 위해 사용한 구체적인
기법들을 다뤄요: 커스텀 색상 맵, 툴팁 컴포넌트, SVG 그래디언트 채우기, 그리고
그 과정에서 겪은 함정들입니다.

## Recharts에 수동 다크 테마가 필요한 이유

Recharts는 CSS 클래스가 아닌 인라인 스타일을 사용해요. 부모 엘리먼트에 `dark`
클래스를 토글해서 모든 것이 캐스케이드되게 할 수 없습니다. 격자선, 축 텍스트,
툴팁, 시리즈 색상 모두 명시적인 prop 레벨 오버라이드가 필요해요. 이건 의도된
설계예요 -- Recharts는 SVG 엘리먼트를 생성하고, SVG 스타일링은 HTML/CSS와
다르게 동작합니다.

장점은 완전한 제어권이에요. 오버라이드 포인트를 이해하면 모든 차트 요소를
디자인 시스템에 정확히 맞출 수 있습니다.

## 다크 테마 색상 맵

디자인 토큰을 미러링하는 중앙 집중식 색상 맵을 정의하는 것부터 시작하세요:

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

이렇게 하면 모든 차트에서 색상이 일관되고 한 곳에서 테마를 쉽게 업데이트할
수 있어요.

## 커스텀 툴팁 컴포넌트

기본 Recharts 툴팁은 흰색 배경이라 다크 테마에서 거슬려요. 커스텀 컴포넌트로
교체하세요:

```typescript
function DarkTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "#2d2d2d",
        border: "1px solid #404040",
        borderRadius: "6px",
        padding: "8px 12px",
        fontSize: "12px",
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

`<Tooltip content={<DarkTooltip />} />`로 어떤 차트에든 전달하면 돼요. 툴팁은
Recharts에서 자동으로 `active`, `payload`, `label` prop을 받아요.
`entry.color`는 시리즈 색상을 상속하기 때문에 툴팁의 각 줄이 해당하는 차트
시리즈와 일치해요.

## SVG 그래디언트 채우기가 있는 Area 차트

단색 영역 채우기는 저렴해 보여요. SVG 그래디언트는 위에서 보이다가 아래로
갈수록 투명해지는 세련된 효과를 만들어줘요:

```typescript
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

`<defs>` 블록이 그래디언트를 정의해요. `id` 속성이 `<Area>` 컴포넌트의
`fill` prop에서 참조하는 값이에요. 그래디언트는 상단 30% 투명도에서 하단 0%로
가서 선 아래에 은은한 글로우 효과를 만들어요.

주목할 디테일: `vertical={false}`는 수직 격자선을 제거해서 깔끔한 외관을
줘요. `tickLine={false}`와 `axisLine={false}`는 눈금 표시와 축 선을 제거하고
텍스트 라벨만 남겨요. 미니멀하고 현대적인 외관을 만들어줍니다.

## 축 없는 수평 바 차트

인텐트 분포나 카테고리 분석 같은 컴팩트한 위젯에서는 공간을 절약하기 위해
축을 완전히 제거하세요:

```typescript
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

`layout="vertical"` prop이 차트를 뒤집어서 바가 수평으로 가게 해요. `radius`
prop은 각 바의 오른쪽을 둥글게 만들어요. 개별 `Cell` 컴포넌트로 바마다 다른
색상을 지정할 수 있습니다.

## 번들 사이즈 주의

Recharts는 번들에 약 650KB를 추가해요. 성능에 민감한 애플리케이션에서는 상당한
양이에요. 코드 스플리팅이나 선택적 import로 완화하세요:

```typescript
// Lazy import for code splitting
const MetricsWidget = lazy(() => import("./MetricsWidget"));

// Or import only what you need (tree-shaking)
import { AreaChart, Area, XAxis, YAxis } from "recharts";
```

area 차트만 사용한다면 특정 컴포넌트만 import해서 전체 라이브러리를 끌어오는
걸 피할 수 있어요.

## 자주 겪는 함정

| 문제                        | 해결법                                  |
| --------------------------- | --------------------------------------- |
| 다크 배경에 흰색 격자선     | CartesianGrid에 `stroke="#404040"` 설정 |
| 축 텍스트 안 보임           | `tick={{ fill: '#888888' }}` 설정       |
| 툴팁 흰색 배경              | 커스텀 툴팁 컴포넌트 사용               |
| 그래디언트 안 보임          | `id`와 `fill="url(#id)"` 일치 확인      |
| 차트가 컨테이너 밖으로 넘침 | 항상 `ResponsiveContainer`로 감싸기     |

## 왜 이 방법이 효과적인가

이 접근법이 효과적인 이유는 근본 원인을 해결하기 때문이에요: Recharts는 SVG
엘리먼트에 인라인 스타일을 사용하므로 CSS 클래스 기반 테마가 적용되지 않아요.
중앙 집중식 색상 맵을 정의하고 prop을 통해 적용하면 모든 차트에서 일관된
스타일을 얻을 수 있어요. 커스텀 툴팁은 기본 렌더링을 완전히 대체해요. SVG
그래디언트는 네이티브 브라우저 기능을 사용해 세련된 채우기 효과를 만들어요.
그리고 `ResponsiveContainer`로 모든 걸 감싸면 차트가 부모 레이아웃에 맞게
적응합니다.

## 실전 팁

다크 테마에 Recharts를 추가할 때는 색상 맵부터 시작하세요. 격자, 축, 툴팁,
시리즈 색상을 한 곳에 정의하세요. 커스텀 툴팁 컴포넌트를 일찍 만드세요 --
모든 차트에서 재사용하게 됩니다. Area 차트에는 SVG 그래디언트를 사용하세요.
컴팩트한 위젯에서는 축을 제거하세요. 그리고 항상 차트를
`ResponsiveContainer`로 감싸세요.

번들 사이즈를 주의하세요. 차트 위젯을 lazy-load하거나 필요한 컴포넌트만
import하세요. Recharts는 강력하지만 무겁고, 650KB는 느린 연결에서 체감됩니다.
