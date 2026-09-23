#!/usr/bin/env node
/* 한국어 문체 검사기의 명령줄 진입점입니다. */
import { readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { isEntryPoint, projectRoot, rulesDocLabel, rulesDocPath, toolRoot } from './lib/paths.mjs';
import { loadRules, withRegister } from './lib/rules.mjs';
import { checkFile, checkText, formatViolations, listCheckableFiles, blockingViolations } from './lib/check.mjs';
import { targetForPath, TARGETS, toProjectRelative } from './lib/targets.mjs';

/* 프로젝트 루트입니다. */
export const PROJECT_ROOT = projectRoot();

/* 보고에 쓸 규칙 문서 이름입니다. */
export const RULES_DOC = rulesDocLabel(PROJECT_ROOT);

export function rules() {
  return loadRules(rulesDocPath(PROJECT_ROOT));
}

/* 자체 검사 케이스입니다. */
/* 밀도 여유 케이스가 쓰는 채움 문장입니다. */
const FILLER = '상태를 다시 확인했습니다. ';

/* 연결어미 뒤 쉼표가 네 번 나오는 글을 만듭니다. */
const connectiveCommas = (gap) =>
  ['값을 확인했고, 결과를 적었습니다.', '배포를 마쳤고, 보고를 올렸습니다.', '로그를 읽었고, 원인을 찾았습니다.', '문서를 고쳤고, 검사를 돌렸습니다.'].join(
    ` ${FILLER.repeat(gap)}`,
  );

export const SELF_CHECK_CASES = [

  ['깨끗한 한국어 답변', '작업을 마쳤습니다. 결과를 정리해 드리겠습니다.', false, 'chat'],
  ['해요체가 섞였다', '확인했어요. 곧 알려 드릴게요.', true, 'chat'],
  ['요청형 명령', '값을 직접 입력해 주세요.', true, 'chat'],
  ['같은 요청을 옳은 어투로', '값을 직접 입력해 주시기 바랍니다.', false, 'chat'],
  ['굳어진 인사말은 예외', '안녕하세요. 확인해 보겠습니다.', false, 'chat'],
  /* 맨 명령형과 요청형을 가르는 두 케이스입니다. */
  ['맨 명령형은 위반', '결과를 확인하십시오.', true, 'chat'],
  ['주다가 붙은 요청형은 통과', '값을 입력해 주십시오.', false, 'chat'],
  ['제안형은 통과', '스크린샷을 더 찍으실 수 있습니다.', false, 'chat'],
  ['의문형은 통과', '지금 배포해 드릴까요?', false, 'chat'],
  ['조건부 요청은 통과', '알려 주시면 반영하겠습니다.', false, 'chat'],
  ['금지된 호칭', '당신이 요청하신 작업입니다.', true, 'chat'],
  ['칭찬으로 여는 문장', '좋은 질문입니다. 원인은 설정 값입니다.', true, 'chat'],
  ['문서 안의 명령형은 통과', '작업 전 이 절을 먼저 참조하십시오.', false, 'doc'],
  ['문서 안의 해요체는 위반', '값을 직접 입력해 주세요.', true, 'doc'],
  ['답변이 영어로 흘렀다', 'The refactoring finished and every gate passed on the first run today.', true, 'chat'],
  ['짧은 영어 조각은 통과', 'ok', false, 'chat'],

  /* 금지 문자 케이스입니다. */
  ['가운뎃점으로 묶은 나열은 위반', '분류·시크릿 게이트·워커 셋입니다.', true, 'chat'],
  ['조사로 이은 나열은 통과', '분류와 시크릿 게이트, 워커 셋입니다.', false, 'chat'],
  ['줄표', '이것은 — 저것입니다.', true, 'chat'],
  ['emoji', '완료했습니다 ✅', true, 'chat'],
  /* 화살표는 그림 문자가 아니라 수식 기호입니다. */
  ['화살표는 emoji가 아니다', '요청 ↔ 응답 관계를 그렸습니다.', false, 'doc'],
  ['Slack shortcode', '완료했습니다 :white_check_mark: 확인 부탁드립니다.', true, 'chat'],
  ['한자', '改名 처리했습니다.', true, 'chat'],
  ['가나', 'テスト 완료했습니다.', true, 'chat'],
  ['백틱 안의 인용은 통과', '`·` 문자를 지웠습니다. 대신 쉼표를 씁니다.', false, 'chat'],

  ['접속부사 뒤 쉼표', '값을 확인했습니다. 그러나, 원인은 아직 모릅니다.', true, 'doc'],
  ['접속부사 뒤 쉼표 없음', '값을 확인했습니다. 그러나 원인은 아직 모릅니다.', false, 'doc'],
  /* 한도가 2이므로 쉼표가 둘 이하면 통과하고 셋이면 걸립니다. */
  ['절을 잇는 쉼표 하나는 통과', '오늘 배포를 마쳤고, 남은 것은 보고 하나입니다.', false, 'doc'],
  [
    '절을 잇는 쉼표 셋은 위반',
    '오늘 배포를 마쳤고, 남은 것은 보고 하나이며, 확인이 필요하고, 일정은 내일입니다.',
    true,
    'doc',
  ],
  ['나열의 쉼표는 통과', '수집 대상은 audit trail, config recorder, findings hub 셋입니다.', false, 'doc'],
  /* 같은 어미가 되풀이되면 나열입니다. */
  ['같은 어미로 이은 병렬 절 나열은 통과', '상태를 되돌리고, 표시를 찍고, 기록을 남기고, 다음 요청을 기다립니다.', false, 'doc'],
  /* 항목이 네 어절인 나열입니다. */
  [
    '항목이 긴 나열도 통과',
    '잡는 것은 굵기 남용, 같은 용어 반복 설명, 대조 구문 남용, 몰린 영어 낱말입니다.',
    false,
    'doc',
  ],
  /* 항목이 여섯 어절인 나열입니다. */
  [
    '항목이 여섯 어절인 나열도 통과',
    '잡는 것은 굵기를 지나치게 많이 쓴 자리, 같은 용어를 괄호로 두 번 설명한 자리, 대조 구문을 문단마다 켠 자리, 영어 낱말이 몰린 자리 넷입니다.',
    false,
    'doc',
  ],
  [
    '쉼표 앞 구간이 너무 길다',
    '어제 오후에 확인한 배포 기록과 실행 로그와 승인 이력은, 원인을 말해 주지 않았습니다.',
    true,
    'doc',
  ],
  /* 위 케이스와 짝입니다. */
  [
    '절로 끝나는 긴 구간은 밀도 규칙의 몫',
    '어제 오후에 확인한 배포 기록과 로그를 모두 다시 읽었지만, 원인은 아직 확정하지 못했습니다.',
    false,
    'doc',
  ],
  ['짧은 쉼표 구간은 통과', '값을 확인했고, 결과를 적어 두었습니다.', false, 'doc'],
  /* 연결어미와 끝 음절이 같은 명사입니다. */
  ['끝 음절이 연결어미와 같은 명사 나열은 통과', '화면, 측면, 단면, 표면 넷을 비교했습니다.', false, 'doc'],
  /* 백틱 구간을 가리면 접속부사와 쉼표 사이에 공백이 생깁니다. */
  ['백틱 구간을 가려서 생긴 접속부사 뒤 쉼표는 통과', '그래서 `가`, `나` 두 낱말을 지웠습니다.', false, 'doc'],

  /* --- 한국어 산문 문장으로 볼 범위 ---  세 규칙이 먼저 거치는 판단입니다. */
  [
    '영어 문장은 한국어 쉼표 규칙으로 재지 않는다',
    'The scheduler stores the rendered plan document in the durable queue, and then waits for approval.',
    false,
    'doc',
  ],
  [
    '개조식 목록 항목은 문장이 아니다',
    '- 남은 일: 승인 대기 큐를 손으로 정리, 워커 이미지를 최신으로 상향, 예약 적용 시각을 다시 계산',
    false,
    'doc',
  ],
  [
    '장식 줄은 문장이 아니다',
    '============================================================\n3절 요약\n============================================================',
    false,
    'doc',
  ],
  [
    '이어진 문장은 그대로 잡힌다',
    '어제 오후에 확인한 배포 기록과 실행 로그와 승인 이력을 모두 다시 읽었지만 원인을 아직 확정하지 못했고 오늘 다시 같은 자리를 열어 세 가지를 차례로 비교해 보려고 하며 그래도 남는 것이 있으면 어제 손으로 만들어 둔 재현 절차를 처음부터 끝까지 다시 밟아 볼 생각입니다.',
    true,
    'doc',
  ],
  /* 숫자의 자릿점, 괄호 안, 따옴표 안을 다루는 케이스입니다. */
  ['숫자의 자릿점은 쉼표가 아니다', '어제 배포한 워커 이미지 아홉 개가 쓴 token이 모두 1,624개였습니다.', false, 'doc'],
  [
    '괄호 안의 쉼표는 삽입구 안의 나열이다',
    '그 결정을 문서에 적어 두었습니다(삭제를 먼저 차단한 이유, 승인을 두 번 받는 이유, 예약을 다시 세는 이유, 보고를 나중에 내는 이유).',
    false,
    'doc',
  ],
  ['따옴표 안은 인용이고 쓴 말이 아니다', '사용자가 "값을 직접 입력해 주세요"라고 하셨습니다.', false, 'chat'],

  /* --- 밀도 여유 ---  두 케이스 모두 연결어미 뒤 쉼표가 네 번 나옵니다. */
  ['짧은 글에서는 적은 횟수도 잡는다', connectiveCommas(3), true, 'doc'],
  ['긴 글에서는 같은 네 번을 위반으로 보지 않는다', connectiveCommas(12), false, 'doc'],

  ['같은 용어를 괄호로 두 번 설명', '요청(request)을 받았습니다. 요청(request)을 다시 적었습니다.', true, 'doc'],
  ['식별자를 담은 괄호는 설명이 아니다', '판정(bot_outcome)은 진단입니다. 판정(bot_outcome)은 미해결입니다.', false, 'doc'],

  ['이중피동 보여집니다', '결과가 화면에 보여집니다.', true, 'doc'],
  ['이중피동 보여진', '화면에 보여진 값을 확인했습니다.', true, 'doc'],
  ['이중피동 적용되어집니다', '설정이 적용되어집니다.', true, 'doc'],
  ['보여 주십시오는 통과', '결과를 보여 주십시오.', false, 'doc'],
  ['되어 있습니다는 통과', '설정이 이미 되어 있습니다.', false, 'doc'],
  ['쓰여 있습니다는 통과', '문서에 쓰여 있습니다.', false, 'doc'],
  ['표준 피동 밝혀졌습니다는 통과', '원인이 밝혀졌습니다.', false, 'doc'],
  /* 나중에 추가한 어간 셋입니다. */
  ['담겨지다', '요청 본문에 사용자 정보가 담겨집니다.', true, 'doc'],
  ['담겨 있습니다는 통과', '요청 본문에 사용자 정보가 담겨 있습니다.', false, 'doc'],
  ['바뀌어지다', '설정 값이 재시작할 때마다 바뀌어집니다.', true, 'doc'],
  ['바뀌었습니다는 통과', '설정 값이 재시작하면서 바뀌었습니다.', false, 'doc'],
  ['말해지다', '그것은 매우 중요한 문제라고 말해질 수 있습니다.', true, 'doc'],
  ['말해 주십시오는 통과', '어느 자리가 막혔는지 말해 주십시오.', false, 'doc'],
  ['수량 표현 뒤의 들', '여러 파일들을 확인했습니다.', true, 'doc'],
  ['수량 표현만 쓰면 통과', '여러 파일을 확인했습니다.', false, 'doc'],

  ['를 통해', '로그를 통해 원인을 찾았습니다.', true, 'doc'],
  ['함에 있어', '배포를 검토함에 있어 기준이 필요합니다.', true, 'doc'],
  ['에 의하여', '이 값은 스케줄러에 의하여 결정됩니다.', true, 'doc'],
  /* 있다에 어서가 붙은 평범한 한국어입니다. */
  ['있다에 어서가 붙은 것은 통과', '그 파일은 목록에 있어서 검사받지 않습니다.', false, 'doc'],
  /* 목록에서 뺀 항목입니다. */
  ['에 대해는 번역투 목록에 없다', 'iam:CreateRole에 대해 implicitDeny를 돌려줍니다.', false, 'doc'],
  ['진행 표현 중이었습니다는 정상 한국어', '35분째 조사 중이었습니다.', false, 'doc'],
  /* 'have + 명사'를 그대로 옮긴 직역입니다. */
  ['을 가지고 있다', '봇은 stage 환경에 쓰기 권한을 가지고 있습니다.', true, 'doc'],
  ['를 가지고 있다', '그 저장소는 tracked 파일만 보는 검사를 가지고 있습니다.', true, 'doc'],
  /* '가지고' 뒤에 '있다'가 오지 않으면 무엇을 도구로 삼는다는 뜻의 평범한 한국어입니다. */
  ['도구로 쓰는 가지고는 통과', '이 값을 가지고 다음 단계를 계산합니다.', false, 'doc'],
  /* 회귀 케이스입니다. */
  ['에 위치하다의 활용형', '이 값은 서울 리전에 위치합니다.', true, 'doc'],
  ['라고 생각되다의 활용형', '그것이 원인이라고 생각됩니다.', true, 'doc'],
  ['하지 않으면 안 되다의 활용형', '지금 반영하지 않으면 안 됩니다.', true, 'doc'],
  ['같은 뜻을 바로 쓰면 통과', '이 값은 서울 리전에 있습니다.', false, 'doc'],
  /* 가지다의 활용형 케이스입니다. */
  ['회의를 가지다의 활용형', '다음 주에 설계 회의를 가질 예정입니다.', true, 'doc'],
  ['회의를 가지다의 과거형', '어제 설계 회의를 가졌습니다.', true, 'doc'],
  ['회의를 여는 것은 통과', '다음 주에 설계 회의를 열겠습니다.', false, 'doc'],
  /* enable을 직역한 표현입니다. */
  ['가능하게 하다', '이 도구는 대용량 파일의 처리를 가능하게 합니다.', true, 'doc'],
  ['할 수 있다로 쓰면 통과', '이 도구로 대용량 파일을 처리할 수 있습니다.', false, 'doc'],
  /* allow와 ensure를 직역한 표현입니다. */
  ['것을 허용하다', '이 기능은 사용자가 데이터를 내보내는 것을 허용합니다.', true, 'doc'],
  ['것을 보장하다', '해당 설정은 모든 요청이 기록되는 것을 보장합니다.', true, 'doc'],
  ['대명사 그것을 허용합니다는 통과', '예외 요청이 오면 그것을 허용합니다.', false, 'doc'],
  ['cannot be overemphasized', '테스트 커버리지의 중요성은 아무리 강조해도 지나치지 않습니다.', true, 'doc'],
  /* 검토했지만 넣지 않은 후보입니다. */
  ['중요한 역할을 한다는 목록에 없다', '그 사람은 팀에서 중요한 역할을 합니다.', false, 'doc'],
  ['임에 틀림없다는 목록에 없다', '기록을 보면 그가 마지막으로 고친 사람임에 틀림없습니다.', false, 'doc'],
  ['겹조사 에서의', 'apply에서의 잘못된 거절이 더 나쁩니다.', true, 'doc'],
  /* 검토했지만 넣지 않은 후보입니다. */
  ['앞으로의는 통과', '앞으로의 메시지에만 적용됩니다.', false, 'doc'],
  ['영어 목적어에 붙인 직역 동사', 'Agent를 VPC에 세우거나 내부 LB를 앞단에 둡니다.', true, 'doc'],
  ['영어 목적어에 붙인 직역 동사, 활용형', 'Agent를 VPC에 세웁니다.', true, 'doc'],
  ['계획을 세우다는 통과', '다음 배포 계획을 세웠습니다.', false, 'doc'],
  /* make a decision을 직역한 표현입니다. */
  ['결정을 만들다', '우리는 이 문제를 다루기 위한 결정을 만들었습니다.', true, 'doc'],
  ['결정을 내리다는 통과', '우리는 이 문제를 어떻게 다룰지 결정했습니다.', false, 'doc'],
  /* 면제 낱말이 목적어와 동사 사이에 부사어로 낀 경우입니다. */
  ['사이에 낀 면제 낱말도 본다', 'VPN을 plan으로 세웠습니다.', false, 'doc'],
  ['가설을 세우다는 통과', '원인을 설명하는 가설을 세웠습니다.', false, 'doc'],

  ['외래어 표기가 틀렸다', '워크플로우를 다시 확인했습니다.', true, 'doc'],
  ['옳은 외래어 표기는 통과', '워크플로를 다시 확인했습니다.', false, 'doc'],
  ['차별 소지 용어', 'Whitelist에 주소를 넣었습니다.', true, 'doc'],
  ['대체 용어는 통과', 'Allowlist에 주소를 넣었습니다.', false, 'doc'],
  /* 식별자 안은 산문이 아닙니다. */
  ['식별자 안의 낱말은 산문이 아니다', 'REQUESTER_USER_WHITELIST 값을 바꿨습니다.', false, 'doc'],
  /* 인용한 오타는 쓴 오타가 아닙니다. */
  ['낱말이 아닌 철자', '작업이 됬습니다.', true, 'doc'],
  ['따옴표 안에 인용한 오타는 통과', '봇이 "작업이 됬습니다"라고 적었습니다.', false, 'doc'],
  ['한글 부정 접두사에 영어 어간', '이 경로는 비blocking 으로 동작합니다.', true, 'chat'],
  ['접두사 음절로 끝나는 한글 낱말은 통과', '장비 목록을 정리했습니다.', false, 'chat'],

  /* --- 한 문장에 든 영어 낱말 ---  문장을 나누라고 조언하는 규칙이므로 문장에만 적용합니다. */
  [
    '기술 용어의 영어 개수는 제한하지 않는다',
    'plan을 stage에서 apply로 넘기고 worker가 state를 lock으로 잡습니다.',
    false,
    'doc',
  ],
  [
    '같은 낱말이 몰린 개조식 항목은 통과',
    '- 배선: plan을 stage에서 apply로 넘기고 worker가 state를 lock으로 잡는 자리',
    false,
    'doc',
  ],
  /* 같은 낱말을 다섯 번 써도 낱말 하나로 셉니다. */
  [
    '같은 낱말을 되풀이한 문장은 통과',
    'plan을 다시 읽고 plan을 고치고 plan을 올리고 plan을 지운 뒤에 plan을 새로 만들었습니다.',
    false,
    'doc',
  ],

  ['fence 안의 낱말 규칙은 걸린다', '아래를 확인합니다.\n```\n워크플로우 확인\n```', true, 'doc'],
  ['fence 안의 명령어는 통과', '아래를 실행합니다.\n```\nterragrunt force-unlock 1234\n```', false, 'doc'],

  ['빈 텍스트는 통과', '', false, 'chat'],

  /* --- 어투를 바꿔 실행하는 예제 ---  어투마다 걸려야 하는 문장과 걸리면 안 되는 문장을 하나 이상씩 둡니다. */
  ['해요체에서 해요체는 통과', '확인했어요. 곧 알려 드릴게요.', false, 'chat', '해요체'],
  ['해요체에서 다나까체는 위반', '확인했습니다. 곧 알려 드리겠습니다.', true, 'chat', '해요체'],
  ['해요체에서도 아니다는 통과', '그것은 아니에요.', false, 'chat', '해요체'],
  ['혼용은 다나까체를 통과시킨다', '확인했습니다.', false, 'chat', '혼용'],
  ['혼용은 해요체도 통과시킨다', '확인했어요.', false, 'chat', '혼용'],
  ['혼용에서도 맨 명령형은 위반', '값을 직접 입력하십시오.', true, 'chat', '혼용'],
];

function runSelfCheck(r) {
  const tool = toolRoot();
  const reference = loadRules(join(tool, 'docs', basename(tool) === '.korean-style' ? 'defaults.md' : 'rules.md'));
  let failed = 0;
  for (const [label, input, expect, target, register = '다나까체'] of SELF_CHECK_CASES) {
    /* 배포본의 예제를 사용자 규칙으로 채점하지 않습니다. */
    const rules = withRegister(reference, register);
    let got;
    try {
      got = checkText(input, rules, target).length > 0;
    } catch (err) {
      got = `예외 ${err.message}`;
    }
    const ok = got === expect;
    if (!ok) failed += 1;
    process.stdout.write(
      `${ok ? '  ok  ' : '  실패'} [${target}/${register}] ${label} (기대 ${expect ? '위반' : '통과'}, 결과 ${got === true ? '위반' : got === false ? '통과' : got})\n`,
    );
    if (!ok && typeof got === 'boolean') {
      process.stdout.write(`        입력: ${JSON.stringify(input)}\n`);
      const v = checkText(input, rules, target);
      if (v.length > 0) process.stdout.write(`${formatViolations(v, rules)}\n`);
    }
  }
  const where = r.source === null ? `기본값 (${r.reason})` : toProjectRelative(r.source, PROJECT_ROOT);
  process.stdout.write(`검사기 기본 규칙: ${reference.source ?? '읽기 실패'}\n프로젝트 규칙을 읽은 곳: ${where}\n`);
  if (r.source === null) {
    process.stdout.write('규칙 문서를 읽지 못했으므로 이 실행을 실패로 봅니다. 통과라고 보고하면 거짓이 되기 때문입니다.\n');
  }
  process.stdout.write(failed === 0 ? '자체 검사 통과\n' : `자체 검사 실패: ${failed}건\n`);
  return failed === 0 && r.source !== null && reference.source !== null;
}

/* 규칙 이름 하나가 무엇을 잡는지 문서에서 찾아 보여 줍니다. */
function explain(name) {
  let doc;
  try {
    doc = readFileSync(rulesDocPath(PROJECT_ROOT), 'utf-8');
  } catch {
    process.stderr.write(`${RULES_DOC}를 열지 못했습니다.\n`);
    return 2;
  }
  const hits = doc
    .split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => line.includes(`\`${name}\``) || line.includes(`| ${name} |`));
  if (hits.length === 0) {
    process.stdout.write(`${RULES_DOC}에 ${JSON.stringify(name)}에 대한 설명이 없습니다.\n`);
    return 1;
  }
  for (const { line, n } of hits) process.stdout.write(`${RULES_DOC}:${n}: ${line.trim()}\n`);
  return 0;
}

/* 통과로 보고해도 되는지를 종료 코드로 돌려줍니다. */
function exitCodeForPass(r) {
  if (r.source !== null) return 0;
  process.stdout.write(`경고: ${r.reason} 기본 최소 규칙(문자, 호칭, 영어 답변)만 적용했으므로 이 결과는 통과가 아닙니다.\n`);
  return 1;
}

/* 표준 입력을 끝까지 읽습니다. */
function readStdin() {
  try {
    return readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i === -1 ? undefined : argv[i + 1];
  };
  const r = rules();

  if (argv.includes('--self-check')) process.exit(runSelfCheck(r) ? 0 : 1);

  if (argv.includes('--rules')) {
    process.stdout.write(`규칙을 읽은 곳: ${r.source ?? `기본값 (${r.reason})`}\n`);
    process.stdout.write(`어투: ${r.register}\n`);
    process.stdout.write(`금지 어미: ${r.bannedRegisterEndings.join(', ') || '없음'}\n`);
    process.stdout.write(`금지 문자: ${r.bannedChar.join(', ')}\n`);
    process.stdout.write(
      `목록 크기: 외래어 ${r.loanwordSpelling.size}, 음차 ${r.bannedTransliteration.size}, 번역투 ${r.translationesePatterns.size}, 직역 동사 ${r.literalVerbs.size}, 이중피동 ${r.doublePassive.size}\n`,
    );
    process.exit(0);
  }

  if (argv.includes('--explain')) {
    const name = arg('--explain');
    if (name === undefined) {
      process.stderr.write('--explain 다음에 규칙 이름이 필요합니다.\n');
      process.exit(2);
    }
    process.exit(explain(name));
  }

  const forced = arg('--target');
  if (forced !== undefined && !TARGETS.includes(forced)) {
    process.stderr.write(`--target은 ${TARGETS.join(', ')} 가운데 하나여야 합니다.\n`);
    process.exit(2);
  }

  if (argv.includes('--text') || argv.includes('--stdin')) {
    const target = forced ?? 'chat';
    /* `--stdin`이 있으면 `--text`보다 우선합니다. */
    let text;
    if (argv.includes('--stdin')) {
      text = readStdin();
    } else {
      text = arg('--text');
      /* 인자를 빠뜨린 것을 빈 문장으로 읽지 않습니다. */
      if (text === undefined) {
        process.stderr.write('--text 다음에 문장이 필요합니다. 긴 글은 --stdin으로 넣으십시오.\n');
        process.exit(2);
      }
    }
    const v = checkText(text, r, target);
    if (v.length === 0) {
      process.stdout.write(`통과 (${target})\n`);
      process.exit(exitCodeForPass(r));
    }
    process.stdout.write(`${formatViolations(v, r)}\n`);
    process.exit(argv.includes('--strict') || blockingViolations(v).length ? 1 : exitCodeForPass(r));
  }

  if (argv.includes('--file')) {
    const p = arg('--file');
    if (p === undefined) {
      process.stderr.write('--file 다음에 경로가 필요합니다.\n');
      process.exit(2);
    }
    const { rel, target, violations } = checkFile(resolve(p), r, PROJECT_ROOT, forced);
    if (target === null) {
      process.stdout.write(`검사 대상이 아닙니다: ${rel}\n`);
      process.exit(0);
    }
    if (violations.length === 0) {
      process.stdout.write(`통과: ${rel} (${target})\n`);
      process.exit(exitCodeForPass(r));
    }
    process.stdout.write(`${formatViolations(violations, r, `${rel} (${target})`)}\n`);
    process.exit(argv.includes('--strict') || blockingViolations(violations).length ? 1 : exitCodeForPass(r));
  }

  if (argv.includes('--all')) {
    let bad = 0;
    let seen = 0;
    for (const p of listCheckableFiles(PROJECT_ROOT, r)) {
      const rel = toProjectRelative(p, PROJECT_ROOT) ?? p;
      if (targetForPath(rel, r) === null) continue;
      const { target, violations } = checkFile(p, r, PROJECT_ROOT);
      seen += 1;
      if (violations.length === 0) continue;
      if (argv.includes('--strict') || blockingViolations(violations).length) bad += 1;
      process.stdout.write(`${formatViolations(violations, r, `${rel} (${target})`)}\n`);
    }
    process.stdout.write(bad === 0 ? `통과: 파일 ${seen}개\n` : `파일 ${seen}개 가운데 ${bad}개에 위반이 있습니다\n`);
    /* 규칙 문서를 못 읽었으면 통과로 보고하지 않습니다. */
    const guard = exitCodeForPass(r);
    process.exit(bad === 0 ? guard : 1);
  }

  process.stderr.write(
    '사용법: --self-check | --text <문장> | --stdin [--target chat|doc|comment|commit] | --file <경로> | --all | --explain <규칙> | --rules [--strict]\n',
  );
  process.exit(2);
}

const invokedDirectly = isEntryPoint(import.meta.url);
if (invokedDirectly) main();
