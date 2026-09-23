---
name: korean-rewrite
description: Polish Korean sentences or translate English documents into natural Korean.
---

# Korean rewrite

1. First identify the source's facts, tense, conditions, negation and uncertainty.
2. Fix only the awkward parts, sentence by sentence. Keep natural expressions, quotes, code and paths.
3. When nouns pile up, add particles and predicates to unpack them. Do not invent subjects or actions the source does not have.
4. Use the technical terms readers already know, and use them consistently. There is no limit on English terms.
5. Compare the result with the source. Do not shorten it or clear checker warnings at the cost of meaning.

Example: `데이터베이스 연결의 관리를 담당합니다` → `데이터베이스 연결을 관리합니다`.
Rewriting `배포할 수 있습니다` as `배포했습니다` changes both the modality and the tense.

Check with `node .korean-style/scripts/check-korean.mjs --stdin --target doc` only when needed.
In this tool's source repository, drop the `.korean-style/` prefix. Do not apply automatic string replacement.
