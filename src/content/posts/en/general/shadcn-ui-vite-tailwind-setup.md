---
title: shadcn/ui Setup with Vite + Tailwind
description: >-
  Manual setup of shadcn/ui component primitives in a Vite + React + TypeScript
  +
date: 2026-02-04T00:00:00.000Z
updated: 2026-02-04T00:00:00.000Z
tags:
  - general
  - react
  - shadcn-ui
  - tailwind
  - vite
  - frontend
category: general
draft: false
lang: en
references:
  - url: null
    title: Manual shadcn/ui setup in Vite + Tailwind project
    type: experience
  - url: 'https://ui.shadcn.com/docs/installation/vite'
    title: shadcn/ui Vite Installation Guide
    type: official
  - url: 'https://tailwindcss.com/docs/installation'
    title: Tailwind CSS Installation Documentation
    type: official
source_content_hash: c4e3e79e0daa5f25230e203a63275166c268a8813f98b6d814dfc4b6aed364c2
---

Tailwind CSS project without using the shadcn CLI.

## Key Points

- shadcn/ui is not a component library — it's a collection of copy-paste
  components built on Radix UI primitives
- Core dependencies are small and composable
- The `cn()` utility is the foundation — combines `clsx` (conditional classes)
  with `tailwind-merge` (deduplication)
- No need to run `npx shadcn-ui init` — manual setup works fine and gives more
  control

## Required Dependencies

```bash
npm install class-variance-authority clsx tailwind-merge
npm install @radix-ui/react-slot
npm install tailwindcss-animate
```

| Package                    | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `class-variance-authority` | Component variant definitions (cva)       |
| `clsx`                     | Conditional className joining             |
| `tailwind-merge`           | Deduplicates conflicting Tailwind classes |
| `@radix-ui/react-slot`     | Polymorphic `asChild` prop support        |
| `tailwindcss-animate`      | Animation utilities for Tailwind          |

## Setup Steps

### 1. Create `cn()` utility

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

### 2. Add Tailwind plugin

```javascript
// tailwind.config.js
plugins: [require("tailwindcss-animate")];
```

### 3. Configure path alias (optional but recommended)

```typescript
// tsconfig.json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  }
}

// vite.config.ts
import path from 'path';
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  }
});
```

### 4. Add CSS variables for theming

shadcn/ui uses CSS variables for theming. Define them in `globals.css`:

```css
:root {
  --background: #1a1a1a;
  --foreground: #e5e5e5;
  --border: #404040;
  /* ... your design tokens ... */
}
```

## Usage Pattern

```typescript
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border border-border bg-transparent"
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
```

## Why Manual over CLI

| Factor       | CLI (`npx shadcn-ui init`)  | Manual                |
| ------------ | --------------------------- | --------------------- |
| Control      | Opinionated structure       | Full control          |
| Dependencies | Installs everything         | Only what you need    |
| Config       | Generates `components.json` | Not needed            |
| Learning     | Black box                   | Understand each piece |
