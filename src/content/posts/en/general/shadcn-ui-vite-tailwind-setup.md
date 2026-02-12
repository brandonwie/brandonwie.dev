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
  - url: "https://ui.shadcn.com/docs/installation/vite"
    title: shadcn/ui Vite Installation Guide
    type: official
  - url: "https://tailwindcss.com/docs/installation"
    title: Tailwind CSS Installation Documentation
    type: official
---

I needed a component library for a React dashboard project. The requirements
were specific: dark theme from the start, full control over styling, and no
bloated dependency tree. I looked at Material UI, Chakra, and Ant Design. They
all came with opinions I did not want and CSS-in-JS overhead I did not need.

Then I found shadcn/ui. It is not a component library in the traditional sense.
You do not install it as a dependency. You copy components into your project and
own them completely. Built on Radix UI primitives for accessibility, styled with
Tailwind CSS for flexibility. I skipped the CLI and set it up manually to
understand every piece.

## Why Manual Setup Over the CLI

The shadcn/ui docs recommend running `npx shadcn-ui init`. It works, but it is
a black box. It generates a `components.json` config file, installs dependencies
you might not need, and creates an opinionated folder structure. For a project
where I wanted full control, manual setup was the better choice.

| Factor       | CLI (`npx shadcn-ui init`)  | Manual                |
| ------------ | --------------------------- | --------------------- |
| Control      | Opinionated structure       | Full control          |
| Dependencies | Installs everything         | Only what you need    |
| Config       | Generates `components.json` | Not needed            |
| Learning     | Black box                   | Understand each piece |

The manual approach installs fewer dependencies and forces you to understand
what each piece does. When something breaks, you know where to look.

## What shadcn/ui Actually Is

shadcn/ui is a collection of copy-paste components built on Radix UI primitives.
Radix handles the hard accessibility work -- keyboard navigation, focus
management, ARIA attributes. shadcn/ui wraps those primitives with Tailwind
styles and provides a consistent API.

The core dependencies are small and composable:

| Package                    | Purpose                                   |
| -------------------------- | ----------------------------------------- |
| `class-variance-authority` | Component variant definitions (cva)       |
| `clsx`                     | Conditional className joining             |
| `tailwind-merge`           | Deduplicates conflicting Tailwind classes |
| `@radix-ui/react-slot`     | Polymorphic `asChild` prop support        |
| `tailwindcss-animate`      | Animation utilities for Tailwind          |

## Step-by-Step Setup

### 1. Install Dependencies

```bash
npm install class-variance-authority clsx tailwind-merge
npm install @radix-ui/react-slot
npm install tailwindcss-animate
```

Three commands, five packages. That is all you need to get started.

### 2. Create the `cn()` Utility

This is the foundation of every shadcn/ui component. It combines `clsx`
(conditional class joining) with `tailwind-merge` (class deduplication):

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Why both libraries? `clsx` handles conditional classes like
`clsx('base', isActive && 'active')`. `tailwind-merge` resolves conflicts like
`p-4 p-2` to just `p-2` (last wins). Together they make className composition
predictable.

### 3. Add the Tailwind Plugin

```javascript
// tailwind.config.js
plugins: [require("tailwindcss-animate")];
```

This adds animation utilities like `animate-in`, `animate-out`, `fade-in`,
`slide-in-from-top` that shadcn/ui components use for transitions.

### 4. Configure Path Alias

Optional but strongly recommended. Without it, imports get verbose fast:

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

Now you can write `import { cn } from '@/lib/utils'` instead of navigating
relative paths.

### 5. Add CSS Variables for Theming

shadcn/ui uses CSS variables for theming. Define them in your global stylesheet:

```css
:root {
  --background: #1a1a1a;
  --foreground: #e5e5e5;
  --border: #404040;
  /* ... your design tokens ... */
}
```

Components reference these variables through Tailwind classes like
`bg-background`, `text-foreground`, and `border-border`.

## Building Components with Variants

Once the setup is complete, you build components using `cva` (class variance
authority) for variant definitions:

```typescript
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        outline: "border border-border bg-transparent",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
```

The `cva` function defines a base set of classes, variant options, and defaults.
When you use the component, you pass variant props and `cva` computes the final
className. The `cn()` utility then merges everything, deduplicating any
conflicts.

## Why This Works

The manual setup works because shadcn/ui is designed to be decomposed. There is
no hidden runtime, no context providers that need to wrap your app, no global CSS
that conflicts with your existing styles. Each component is a self-contained
file that imports `cn()` and Radix primitives. You copy what you need, customize
it, and move on.

The `cn()` + `cva` pattern handles the hard part of Tailwind -- className
composition. Without it, combining conditional classes with Tailwind overrides
leads to unpredictable results. With it, the last class always wins, and
conditionals are clean.

## Practical Takeaway

Use this manual setup when you want full control over your component library.
Start with the three core packages (`class-variance-authority`, `clsx`,
`tailwind-merge`), create the `cn()` utility, and add Radix primitives as
needed per component.

Skip the CLI for learning projects or when you need a non-standard structure.
Use the CLI for rapid prototyping when the default structure works for you.

The key insight: shadcn/ui is not a library you depend on. It is a collection of
patterns you own. The `cn()` utility and `cva` variant system are the real
takeaways -- you can use them even without shadcn/ui's specific components.
