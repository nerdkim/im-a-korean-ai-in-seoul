---
name: korean-rewrite
description: Polish Korean sentences or translate English documents into natural Korean.
---

# Korean rewrite

1. First identify the source's facts, tense, conditions, negation and uncertainty.
2. Fix only the awkward parts, sentence by sentence. Keep natural expressions, quotes, code and paths.
3. When translating, write the meaning in Korean order instead of mapping English words and clauses one by one. Restate English "as X", "allow", "make sure", passives and inanimate subjects as who does what. If a sentence maps word for word back onto the English, rewrite it.
4. When nouns pile up, add particles and predicates to unpack them. Do not invent subjects or actions the source does not have.
5. Use the technical terms readers already know, and use them consistently. There is no limit on English terms.
6. Compare the result with the source. Do not shorten it or clear checker warnings at the cost of meaning.

Example: `데이터베이스 연결의 관리를 담당합니다` → `데이터베이스 연결을 관리합니다`.
Example: "This feature allows users to export data" → `이 기능을 사용하면 데이터를 내보낼 수 있습니다`, not `이 기능은 사용자가 데이터를 내보내는 것을 허용합니다`.
Rewriting `배포할 수 있습니다` as `배포했습니다` changes both the modality and the tense.

Check with `node .korean-style/scripts/check-korean.mjs --stdin --target doc` only when needed.
In this tool's source repository, drop the `.korean-style/` prefix. Do not apply automatic string replacement.
