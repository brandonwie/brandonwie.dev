---
title: Recharts Dark Theme Customization
description: Techniques for styling Recharts charts to match a dark terminal theme with CSS
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
lang: en
references:
  - url: null
    title: Recharts dark theme implementation in Crucio dashboard
    type: experience
  - url: 'https://recharts.org/en-US/api'
    title: Recharts API Documentation
    type: official
  - url: 'https://developer.mozilla.org/en-US/docs/Web/SVG/Element/linearGradient'
    title: MDN SVG linearGradient Element
    type: authoritative
---

variables and custom components.

## Key Points

- Recharts uses inline styles, not CSS classes — theme colors must be passed as
  props
- Custom tooltips give full control over dark styling
- SVG gradients (`<defs>` + `<linearGradient>`) create polished area fills
- Grid and axis colors need explicit overrides (defaults are light theme)

## Dark Theme Color Map

```typescript
const COLORS = {
  grid: "#404040", // --border
  axis: "#888888", // --text-muted
  tooltip: {
    bg: "#2d2d2d", // --bg-secondary
    border: "#404040", // --border
    text: "#e5e5e5" // --text-primary
  },
  series: {
    primary: "#6b9eff", // --accent-blue
    secondary: "#da7756", // --accent-orange
    success: "#7ec699" // --accent-green
  }
};
```

## Custom Tooltip Component

```tsx
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

## Area Chart with Gradient Fill

```tsx
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

## Horizontal Bar Chart (No Axis)

For compact widgets, remove axes entirely:

```tsx
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

## Bundle Size Warning

Recharts adds ~650KB to the bundle. Mitigate with:

```typescript
// Lazy import for code splitting
const MetricsWidget = lazy(() => import("./MetricsWidget"));

// Or import only what you need (tree-shaking)
import { AreaChart, Area, XAxis, YAxis } from "recharts";
```

## Common Gotchas

| Issue                       | Solution                                |
| --------------------------- | --------------------------------------- |
| White grid lines on dark bg | Set `stroke="#404040"` on CartesianGrid |
| Axis text invisible         | Set `tick={{ fill: '#888888' }}`        |
| Tooltip has white bg        | Use custom tooltip component            |
| Gradient not showing        | Ensure `id` matches `fill="url(#id)"`   |
| Chart overflows container   | Always wrap in `ResponsiveContainer`    |
