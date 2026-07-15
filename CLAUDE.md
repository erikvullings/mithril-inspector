# Repository guidance

- Use pnpm workspace commands from the repository root.
- Keep every package strict TypeScript and modern ESM.
- Keep \`protocol\`, \`transform\`, \`runtime\`, \`overlay\`, and \`server\` independent of Vite.
- Put package tests beside their source and run them independently with Vitest.
