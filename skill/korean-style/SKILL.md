---
name: korean-style
description: 한국어 검사 규칙을 확인하거나 바꿀 때와 어색한 한국어 표현의 원인을 찾을 때 씁니다.
---

# 한국어 검사 규칙 확인

작성 지침은 `.claude/output-styles/korean-style.md`에 있습니다. 이미 적용된 세션이면 다시 읽지 않습니다.

<!-- register:begin -->
말투: 합니다체. 서술은 `~합니다`로, 요청은 `~해 주십시오`로 끝냅니다. `~해요`, `~하세요` 같은 해요체를 섞지 않습니다. 예: `캐시 무효화 후 재배포 필요` → `캐시를 무효화한 뒤 다시 배포해야 합니다.`
<!-- register:end -->

한국어로 생각하고, 읽는 사람이 한 번에 알아듣는 표현을 고릅니다. 한국어로 굳은 말이 없는 기술 용어는 영어로 써도 됩니다.
검사기 경고는 다시 읽어 볼 곳을 알려 줄 뿐입니다. 경고를 없애려고 자연스러운 표현을 바꾸거나 원문에 없는 사실을 덧붙이지 않습니다.
검사기는 규칙 문서에 적힌 형태만 찾습니다. 그 밖의 영어식 표현은 문장마다 영어로 되옮겨 보아 찾습니다. 낱말과 구조가 영어와 그대로 맞으면 영어 구조를 따른 문장입니다.

```sh
node .korean-style/scripts/check-korean.mjs --stdin
node .korean-style/scripts/check-korean.mjs --explain translationese
node .korean-style/scripts/doctor.mjs
```

이 도구의 저장소에서는 위 경로에서 `.korean-style/`을 뺍니다.
규칙 값은 설치한 프로젝트의 `.korean-style/rules.md`에서 바꾸고, 이 도구의 저장소에서는 `docs/rules.md`에서 바꿉니다.
규칙을 바꾸면 그 규칙이 잡아야 할 문장과 통과시켜야 할 문장을 함께 확인합니다.
