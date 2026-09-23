# Working guide

This repository installs a Korean generation guide and a style checker into other projects.
Claude Code, Codex and Gemini CLI share this file: `AGENTS.md` and `GEMINI.md` are symlinks to `CLAUDE.md`. Edit `CLAUDE.md` only and keep the symlinks.

- The goal is natural Korean that preserves meaning. Do not treat style preferences as grammar errors.
- The generation guide lives only in `output-styles/korean-style.md`. Claude Code loads it as the output style, so do not reread it there. Other agents read it before writing Korean.
- The Claude Code hooks check writes and answers automatically. Other agents do not run them, so check Korean text with `node scripts/check-korean.mjs --file <path>` or `--stdin` before finishing. The commit-msg Git hook runs for every agent once installed with `npm run doctor -- --install-commit-hook`.
- `docs/rules.md` defines the checker rules and which of them block. Do not hide policy values in code.
- Report ambiguous expressions as warnings. Hooks block only errors and ask for a rewrite at most once.
- Technical terms may stay in English. Cut repetition to save length, but keep particles and meaning.
- Never use middle dots or em dashes in answers or in the prose of any document.
- Write model-facing prompts (the output style, skills, register fragments and this file) in English. Keep human-facing docs, messages and commit messages in Korean.
- In Korean prose, write on-screen terms whose Korean spelling is unstable in English, such as shell, hook and skill. Established loanwords such as 파일, 디렉터리 and 커밋 are fine.
- Before committing a change that adds or edits Korean prose (docs, messages, comments, test titles, release notes), run the `korean-reviewer` agent on the diff and resolve its findings. Agents without `.claude/agents` review the diff against the checklist in `.claude/agents/korean-reviewer.md`.
- When you change behavior, add regression tests that include false positives, and pass `npm run gate`.
- Real-model checks run with `npm run eval -- --run`. They make paid API calls, so keep them out of the regular tests.
- Review the source and the response together.
- Trim unnecessary files and explanations, but keep tests, rationale and runnable usage.
- Keep run results, reports, personal notes and local settings out of Git. Share eval inputs and regression tests.
- This is a public repository. Keep personal settings, private project names and local paths out of tracked files.

The installer is `scripts/install.mjs`, the engine is in `scripts/lib/`, and the hooks are in `scripts/hooks/`.
Usage is in `README.md` and limits are in `docs/limits.md`. Eval inputs live in `test/fixtures/eval/`; keep results only in `.eval/`.
