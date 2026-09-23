---
name: korean-style
description: Use when checking Korean style rules or diagnosing awkward Korean expressions.
---

# Korean style check

The generation guide is `.claude/output-styles/korean-style.md`. Do not reread it when it is already active.

<!-- register:begin -->
Register: 합니다체. End statements with `~합니다` and requests with `~해 주십시오`. Do not mix in 해요체. Example: `캐시 무효화 후 재배포 필요` → `캐시를 무효화한 뒤 다시 배포해야 합니다.`
<!-- register:end -->

Prefer Korean that reads clearly. Familiar technical terms may stay in English.
Checker warnings are candidates for review. Do not change natural expressions or add facts just to clear a warning.

```sh
node .korean-style/scripts/check-korean.mjs --stdin
node .korean-style/scripts/check-korean.mjs --explain translationese
node .korean-style/scripts/doctor.mjs
```

In this tool's source repository, drop the `.korean-style/` prefix from these paths.
Change rule values in the installed `.korean-style/rules.md`, or in `docs/rules.md` in the source repository.
When you change a rule, verify both a sentence it must catch and a sentence it must let through.
