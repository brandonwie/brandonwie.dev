import { registerCommand } from './index';
import type { OutputLine } from '../stores/terminal';

registerCommand('whoami', () => {
	const output: OutputLine[] = [
		{ type: 'text', content: '' },
		{
			type: 'purple',
			content: '  ██████╗ ██████╗  █████╗ ███╗   ██╗██████╗  ██████╗ ███╗   ██╗'
		},
		{
			type: 'purple',
			content: '  ██╔══██╗██╔══██╗██╔══██╗████╗  ██║██╔══██╗██╔═══██╗████╗  ██║'
		},
		{
			type: 'purple',
			content: '  ██████╔╝██████╔╝███████║██╔██╗ ██║██║  ██║██║   ██║██╔██╗ ██║'
		},
		{
			type: 'purple',
			content: '  ██╔══██╗██╔══██╗██╔══██║██║╚██╗██║██║  ██║██║   ██║██║╚██╗██║'
		},
		{
			type: 'purple',
			content: '  ██████╔╝██║  ██║██║  ██║██║ ╚████║██████╔╝╚██████╔╝██║ ╚████║'
		},
		{
			type: 'purple',
			content: '  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═════╝  ╚═════╝ ╚═╝  ╚═══╝'
		},
		{ type: 'text', content: '' },
		{ type: 'text', content: '  Brandon Wie' },
		{ type: 'text', content: '  Software Engineer' },
		{ type: 'text', content: '' },
		{ type: 'text', content: '  Building software that matters.' },
		{ type: 'text', content: '  From backend systems to infrastructure,' },
		{ type: 'text', content: '  I enjoy solving complex problems with elegant solutions.' },
		{ type: 'text', content: '' },
		{ type: 'text', content: '  Currently:' },
		{ type: 'text', content: '    • Working on backend systems with NestJS & TypeScript' },
		{ type: 'text', content: '    • Managing infrastructure with Terraform & Kubernetes' },
		{ type: 'text', content: '    • Building data pipelines with Airflow' },
		{ type: 'text', content: '    • Learning OMSCS @ Georgia Tech' },
		{ type: 'text', content: '' },
		{ type: 'text', content: '  Tech Stack:' },
		{ type: 'text', content: '    Languages: TypeScript, Python, Go' },
		{ type: 'text', content: '    Backend: NestJS, FastAPI, Express' },
		{ type: 'text', content: '    Infra: AWS, Terraform, Kubernetes, Docker' },
		{ type: 'text', content: '    Data: PostgreSQL, Redis, Airflow' },
		{ type: 'text', content: '' },
		{ type: 'text', content: "  Type 'open <link>' to connect:" },
		{ type: 'link', content: '    github     → github.com/brandonwie', link: 'https://github.com/brandonwie' },
		{
			type: 'link',
			content: '    linkedin   → linkedin.com/in/brandonwie',
			link: 'https://linkedin.com/in/brandonwie'
		},
		{
			type: 'link',
			content: '    twitter    → twitter.com/brandonwie',
			link: 'https://twitter.com/brandonwie'
		},
		{ type: 'link', content: '    email      → brandon@brandonwie.dev', link: 'mailto:brandon@brandonwie.dev' },
		{ type: 'text', content: '' }
	];

	return { output };
});

// Alias: about
registerCommand('about', () => {
	// Reuse whoami
	const output: OutputLine[] = [
		{ type: 'text', content: '' },
		{ type: 'text', content: '  About Brandon Wie' },
		{ type: 'text', content: '  ─────────────────' },
		{ type: 'text', content: '' },
		{ type: 'text', content: '  Software Engineer passionate about building' },
		{ type: 'text', content: '  scalable systems and sharing knowledge.' },
		{ type: 'text', content: '' },
		{ type: 'text', content: '  This blog is a collection of my learnings,' },
		{ type: 'text', content: '  from deep-dives into technical problems to' },
		{ type: 'text', content: '  practical guides for everyday development.' },
		{ type: 'text', content: '' },
		{ type: 'text', content: "  Run 'whoami' for full profile." },
		{ type: 'text', content: '' }
	];

	return { output };
});
