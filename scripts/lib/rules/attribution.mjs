/* Claude Code가 커밋 메시지와 PR 설명 끝에 붙이는 생성 표시를 찾습니다. */

/*
 * 규칙 문서의 `banned-attribution`에 적은 문구가 든 줄을 찾습니다. 대소문자는 가리지 않습니다.
 * 이메일 주소처럼 `@`가 든 문구는 줄 어디에 있어도 잡습니다. 나머지 문구는 같은 줄에서 그 앞에 글자나 숫자가 없을 때만 잡습니다.
 * 그래서 `커밋 메시지에서 Generated with Claude Code 줄을 지웠습니다`처럼 생성 표시를 언급하기만 한 문장은 잡지 않습니다.
 */
export function attributionViolations(text, rules) {
  const phrases = (rules.bannedAttribution ?? []).map((phrase) => phrase.toLowerCase());
  if (phrases.length === 0) return [];
  const out = [];
  text.split('\n').forEach((line, i) => {
    const lower = line.toLowerCase();
    const hit = phrases.some((phrase) => {
      const at = lower.indexOf(phrase);
      if (at === -1) return false;
      return phrase.includes('@') || !/[\p{L}\p{N}]/u.test(line.slice(0, at));
    });
    if (!hit) return;
    out.push({
      rule: 'ai-attribution',
      detail: `Claude Code가 붙이는 생성 표시입니다: ${JSON.stringify(line.trim())}. 이 줄을 지우십시오. 공동 작성자를 밝혀야 하면 사용자가 정한 이름과 이메일 주소를 쓰십시오.`,
      line: i + 1,
    });
  });
  return out;
}
