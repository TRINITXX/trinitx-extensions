@AGENTS.md

## Claude Code specifics

- The `/add-module` skill lives in `.claude/skills/add-module/`, mirrored in `.agents/skills/add-module/` — keep both copies identical.
- Global rules written for the TypeScript / React Native projects don't apply here: no `npx tsc --noEmit` / eslint / prettier before commit, and the coding-style rules (named exports, kebab-case component files, `useXxx` hooks, path aliases) are irrelevant to plain content scripts.
- The extension runs in Alexis's own Chrome profile: check a module's behavior there with claude-in-chrome (the tab must stay visible, see memory `hidden-tab-rendering-freeze`). The global Playwright visual-proof rule targets web apps.
