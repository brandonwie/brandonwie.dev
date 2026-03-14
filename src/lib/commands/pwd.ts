import { registerCommand } from './index';

registerCommand('pwd', (_, context) => {
	return {
		output: [
			{
				type: 'text',
				content: context.cwd,
			},
		],
	};
});
