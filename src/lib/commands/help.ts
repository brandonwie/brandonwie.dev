import { registerCommand, getCommands } from "./index";
import type { OutputLine } from "../stores/terminal";

const commandHelp: Record<
  string,
  { usage: string; description: string; examples?: string[] }
> = {
  ls: {
    usage: "ls [path]",
    description: "List directory contents",
    examples: ["ls", "ls posts/", "ls posts/backend"],
  },
  ll: {
    usage: "ll [path]",
    description: "List directory contents with details (long format)",
    examples: ["ll", "ll posts/"],
  },
  cd: {
    usage: "cd [path]",
    description: "Change directory",
    examples: ["cd posts", "cd ..", "cd ~", "cd posts/backend"],
  },
  pwd: {
    usage: "pwd",
    description: "Print current working directory",
  },
  cat: {
    usage: "cat <file>",
    description: "Display file contents (opens post in reader)",
    examples: ["cat redis-caching.md", "cat posts/backend/api-design.md"],
  },
  read: {
    usage: "read <file>",
    description: "Alias for cat - opens a post",
    examples: ["read api-design.md"],
  },
  grep: {
    usage: "grep <pattern>",
    description: "Search posts by content",
    examples: ["grep redis", 'grep "caching patterns"'],
  },
  search: {
    usage: "search [pattern]",
    description: "Search posts (opens fuzzy finder if no pattern)",
    examples: ["search", "search redis"],
  },
  find: {
    usage: "find <pattern>",
    description: "Find posts by filename",
    examples: ["find caching", "find api"],
  },
  whoami: {
    usage: "whoami",
    description: "Display information about me",
  },
  clear: {
    usage: "clear",
    description: "Clear the terminal screen",
  },
  history: {
    usage: "history",
    description: "Show command history",
  },
  help: {
    usage: "help [command]",
    description: "Show help information",
    examples: ["help", "help ls", "help grep"],
  },
  man: {
    usage: "man <command>",
    description: "Show detailed help for a command",
    examples: ["man ls", "man grep"],
  },
  open: {
    usage: "open <link>",
    description: "Open a social link",
    examples: ["open github", "open linkedin", "open portfolio"],
  },
  echo: {
    usage: "echo <text>",
    description: "Display text",
    examples: ["echo hello", 'echo "Hello World"'],
  },
};

registerCommand("help", (args) => {
  if (args.length > 0) {
    const cmd = args[0].toLowerCase();
    const help = commandHelp[cmd];

    if (!help) {
      return {
        output: [
          {
            type: "error",
            content: `help: no help available for '${cmd}'`,
          },
        ],
      };
    }

    const output: OutputLine[] = [
      { type: "text", content: "" },
      { type: "success", content: cmd.toUpperCase() },
      { type: "text", content: "" },
      { type: "text", content: `  ${help.description}` },
      { type: "text", content: "" },
      { type: "text", content: "USAGE:" },
      { type: "text", content: `  ${help.usage}` },
    ];

    if (help.examples && help.examples.length > 0) {
      output.push({ type: "text", content: "" });
      output.push({ type: "text", content: "EXAMPLES:" });
      for (const example of help.examples) {
        output.push({ type: "text", content: `  $ ${example}` });
      }
    }

    output.push({ type: "text", content: "" });
    return { output };
  }

  // Show all commands
  const output: OutputLine[] = [
    { type: "text", content: "" },
    { type: "success", content: "Available Commands" },
    { type: "text", content: "" },
    { type: "text", content: "NAVIGATION:" },
    { type: "text", content: "  ls [path]        List directory contents" },
    { type: "text", content: "  cd <dir>         Change directory" },
    { type: "text", content: "  pwd              Print working directory" },
    { type: "text", content: "" },
    { type: "text", content: "READING:" },
    { type: "text", content: "  cat <file>       View post content" },
    { type: "text", content: "  read <file>      Alias for cat" },
    { type: "text", content: "" },
    { type: "text", content: "SEARCH:" },
    { type: "text", content: "  grep <pattern>   Search post content" },
    { type: "text", content: "  find <name>      Find by filename" },
    { type: "text", content: "  search           Open fuzzy finder" },
    { type: "text", content: "  Ctrl/Cmd+P/K     Quick fuzzy search" },
    { type: "text", content: "" },
    { type: "text", content: "INFO:" },
    { type: "text", content: "  whoami           About me" },
    { type: "text", content: "  open <link>      Open social link" },
    { type: "text", content: "" },
    { type: "text", content: "UTILITY:" },
    { type: "text", content: "  clear            Clear screen" },
    { type: "text", content: "  history          Command history" },
    { type: "text", content: "  help [cmd]       Show help" },
    { type: "text", content: "" },
    { type: "text", content: "Type 'help <command>' for detailed help" },
    { type: "text", content: "" },
  ];

  return { output };
});

registerCommand("man", (args) => {
  if (args.length === 0) {
    return {
      output: [
        {
          type: "error",
          content: "What manual page do you want?",
        },
      ],
    };
  }

  // Delegate to help
  const cmd = args[0].toLowerCase();
  const help = commandHelp[cmd];

  if (!help) {
    return {
      output: [
        {
          type: "error",
          content: `No manual entry for ${cmd}`,
        },
      ],
    };
  }

  const output: OutputLine[] = [
    { type: "text", content: `${cmd.toUpperCase()}(1)` },
    { type: "text", content: "" },
    { type: "text", content: "NAME" },
    { type: "text", content: `       ${cmd} - ${help.description}` },
    { type: "text", content: "" },
    { type: "text", content: "SYNOPSIS" },
    { type: "text", content: `       ${help.usage}` },
    { type: "text", content: "" },
    { type: "text", content: "DESCRIPTION" },
    { type: "text", content: `       ${help.description}` },
  ];

  if (help.examples && help.examples.length > 0) {
    output.push({ type: "text", content: "" });
    output.push({ type: "text", content: "EXAMPLES" });
    for (const example of help.examples) {
      output.push({ type: "text", content: `       $ ${example}` });
    }
  }

  output.push({ type: "text", content: "" });
  return { output };
});
