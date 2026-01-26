import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
	content: ['./src/**/*.{html,js,svelte,ts,md,svx}'],
	theme: {
		extend: {
			colors: {
				// Claude Code Theme Colors
				terminal: {
					bg: {
						primary: '#1a1a1a',
						secondary: '#2d2d2d',
						hover: '#353535'
					},
					text: {
						primary: '#e5e5e5',
						muted: '#888888',
						dim: '#666666'
					},
					accent: {
						orange: '#da7756',
						blue: '#6b9eff',
						green: '#7ec699',
						yellow: '#e5c07b',
						purple: '#bf5af2',  // Neon purple - vibrant and glowing
						cyan: '#56b6c2',
						red: '#e06c75'
					},
					border: '#404040'
				}
			},
			fontFamily: {
				mono: [
					'JetBrains Mono',
					'Fira Code',
					'SF Mono',
					'Monaco',
					'Inconsolata',
					'Roboto Mono',
					'Source Code Pro',
					'monospace'
				]
			},
			typography: {
				terminal: {
					css: {
						'--tw-prose-body': '#e5e5e5',
						'--tw-prose-headings': '#e5e5e5',
						'--tw-prose-lead': '#888888',
						'--tw-prose-links': '#6b9eff',
						'--tw-prose-bold': '#e5e5e5',
						'--tw-prose-counters': '#888888',
						'--tw-prose-bullets': '#888888',
						'--tw-prose-hr': '#404040',
						'--tw-prose-quotes': '#888888',
						'--tw-prose-quote-borders': '#da7756',
						'--tw-prose-captions': '#888888',
						'--tw-prose-code': '#da7756',
						'--tw-prose-pre-code': '#e5e5e5',
						'--tw-prose-pre-bg': '#2d2d2d',
						'--tw-prose-th-borders': '#404040',
						'--tw-prose-td-borders': '#404040',
						maxWidth: 'none',
						code: {
							backgroundColor: '#2d2d2d',
							padding: '0.2em 0.4em',
							borderRadius: '0.25rem',
							fontWeight: '400'
						},
						'code::before': {
							content: '""'
						},
						'code::after': {
							content: '""'
						},
						pre: {
							backgroundColor: '#2d2d2d',
							border: '1px solid #404040'
						}
					}
				}
			}
		}
	},
	plugins: [typography]
} satisfies Config;
