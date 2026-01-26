import { registerCommand } from './index';

registerCommand('echo', (args) => {
	return {
		output: [
			{
				type: 'text',
				content: args.join(' ')
			}
		]
	};
});
