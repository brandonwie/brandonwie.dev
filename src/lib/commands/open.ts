import { registerCommand } from './index';

const socialLinks: Record<string, { url: string; name: string }> = {
	github: { url: 'https://github.com/brandonwie', name: 'GitHub' },
	gh: { url: 'https://github.com/brandonwie', name: 'GitHub' },
	linkedin: { url: 'https://linkedin.com/in/brandonwie', name: 'LinkedIn' },
	li: { url: 'https://linkedin.com/in/brandonwie', name: 'LinkedIn' },
	twitter: { url: 'https://twitter.com/brandonwie', name: 'Twitter/X' },
	x: { url: 'https://twitter.com/brandonwie', name: 'Twitter/X' },
	email: { url: 'mailto:brandon@brandonwie.dev', name: 'Email' },
	mail: { url: 'mailto:brandon@brandonwie.dev', name: 'Email' },
	archcalendar: { url: 'https://www.archcalendar.com', name: 'Arch Calendar' },
	arch: { url: 'https://www.archcalendar.com', name: 'Arch Calendar' },
	moba: { url: 'https://www.archcalendar.com', name: 'Arch Calendar (Moba)' },
	system: { url: '/system/3b', name: '3B System' },
	'3b': { url: '/system/3b', name: '3B System' },
	'system-3b': { url: '/system/3b', name: '3B System' },
	portfolio: {
		url: 'https://crucio.brandonwie.dev',
		name: 'Portfolio (Crucio)',
	},
	crucio: { url: 'https://crucio.brandonwie.dev', name: 'Portfolio (Crucio)' },
};

registerCommand('open', (args) => {
	if (args.length === 0) {
		return {
			output: [
				{ type: 'text', content: 'Usage: open <link>' },
				{ type: 'text', content: '' },
				{ type: 'text', content: 'Available links:' },
				{ type: 'text', content: '  github, gh       - GitHub profile' },
				{ type: 'text', content: '  linkedin, li     - LinkedIn profile' },
				{ type: 'text', content: '  twitter, x       - Twitter/X profile' },
				{ type: 'text', content: '  email, mail      - Email me' },
				{
					type: 'text',
					content: '  archcalendar, arch - Arch Calendar (Moba)',
				},
				{ type: 'text', content: '  3b, system      - 3B system hub' },
				{ type: 'text', content: '  portfolio, crucio - AISecOps portfolio' },
			],
		};
	}

	const linkKey = args[0].toLowerCase();
	const link = socialLinks[linkKey];

	if (!link) {
		return {
			output: [
				{
					type: 'error',
					content: `Unknown link: ${args[0]}`,
				},
				{
					type: 'text',
					content:
						"Available: github, linkedin, twitter, email, archcalendar, 3b, portfolio (or run 'open' for help)",
				},
			],
		};
	}

	// Open the link in a new tab
	if (typeof window !== 'undefined') {
		if (link.url.startsWith('/')) {
			window.location.href = link.url;
		} else {
			window.open(link.url, '_blank', 'noopener,noreferrer');
		}
	}

	return {
		output: [
			{
				type: 'success',
				content: `Opening ${link.name}...`,
			},
		],
	};
});
