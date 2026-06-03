import { writable } from 'svelte/store';

/**
 * Command palette (fuzzy finder) open state.
 *
 * Lives outside terminal.ts because the palette is now a site-wide surface
 * (blog mode + terminal mode), mounted globally in the root +layout.svelte.
 * See ADR-0001 (terminal -> command-palette migration), Phase 0.
 */
export const paletteOpen = writable<boolean>(false);
