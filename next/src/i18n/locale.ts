/**
 * The single declaration of the site's locale set.
 *
 * It lived in two places — `shell/document.tsx` and `content/posts.ts` — with
 * identical bodies. TypeScript's structural typing hid that: the two were
 * mutually assignable, so nothing failed, and adding a third locale would have
 * needed both edited in step with no check that they were. Both now re-export
 * this declaration, so their existing importers are unaffected.
 */
export type Locale = 'en' | 'ko';
