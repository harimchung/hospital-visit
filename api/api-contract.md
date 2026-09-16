// api/api-contract.md (ver03 P0-2/6 기준, Node.js / v2 비회원 우선)

# 병원 진료 대본 서비스 — API 계약서 (ver03 P0-2/6 기준, Node.js / v2 비회원 우선)

## 1. 개요
- 프론트(`App.jsx`)가 `/api` 아래 엔드포인트 3개만 호출한다. 모두 `api/*.js` 파일로 둔다.
  - `POST /api/turn` — 채팅 한 턴 처리(agent loop 진입점). 파일: `api/turn.js`
  - `POST /api/pill` — 약 정보 조회 중계(e약은요·DUR·낱알식별). 파일: `api/pill.js`
  - `GET /api/health` — 서버 살아있나 보는 헬스체크. 파일: `api/health.js`
- 환경변수 2개: `UPSTAGE_API_KEY`, `DATA_API_KEY`.
  - 모두 Vercel 환경변수. `/api`에서만 읽음. 클라이언트 소스·응답 JSON에 값 0.
- 런타임: Vercel Node.js 함수. `api/*.js` 각각이 핸들러/앱을 export하면 Vercel이 띄움. 내장 `fetch`로 공공데이터 호출. 별도 패키지 설치 없이 가능(공공데이터는 JSON이므로 fetch로 충분).
- 로컬 실행: `vercel dev` 하나로 프론트랑 같은 주소에서 돈다.

## 2. 파일 구조
- `api/turn.js` — POST /api/turn 핸들러. agent loop 진입점.
- `api/pill.js` — POST /api/pill 핸들러.
- `api/health.js` — GET /api/health 핸들러.
- `api/_lib/solar.js` — Solar Pro 4 호출 함수(UPSTAGE_API_KEY). function calling 우선, fallback JSON 라우터 포함.
- `api/_lib/emergency.js` — 응급 신호 10개 코드 판정(키워드 표). 매 턴 첫 검사.
- `api/_lib/state.js` — 상태 5칸 관리.
- `api/_lib/departments.js` — 진료과 규칙표(PRD S8 규칙표 v1 + 애매 시 내과/가정의학과).
- `api/_lib/schemas.js` — 요청 검증(가볍게).
- (제외: supabase, encryption, payload, .env 예시는 v2 미포함.)

## 3. 엔드포인트 3개

### 3.1 POST /api/turn (파일: api/turn.js)
- 용도: 채팅 한 턴 처리. agent loop 진입점. **응급 10개 대조를 코드 기반으로 매 턴 제일 먼저 수행**하고, 걸리면 거기서 끝. Solar는 그 뒤에 한 번만 씀(목표 기반 agent 진행).
- 요청
  ```json
  {
    "session_id": "string",
    "turn_index": 1,
    "user_text": "string",
    "selected_part": "head|face_neck|chest|abdomen|back_joint|skin|other|multiple|null",
    "photos": [ { "label": "아침|밤|null", "caption": "string|null" } ],
    "profile": { "nickname": "string|null", "age": "integer|null", "allergies": "string|null", "chronic_diseases": "string|null" },
    "previous_note": "string|null",
    "history": { "filled_fields": ["body_part","symptom_desc","since_when","current_meds","tried_things"], "last_emergency": "boolean" }
  }
  ```
- 응답
  ```json
  {
    "ok": true,
    "turn_index": 2,
    "events": [
      {
        "event": "safety|state|memory|tool_call|tool_result|review|ask|result|confirm_questions|pill_candidates|ui_action|done",
        "line": "string",            // 서버 로그 한 줄 + 프론트 화면에서 사용자 말풍선 밑에 쌓였다가 done에서 접히는 줄
        "body": "string|null",       // 프론트 말풍선용(ask, result, confirm_questions, pill_candidates 등). 그 외 이벤트는 body 없이 line만.
        "hint": "string|null",
        "tool": "string|null",
        "tool_status": "called|skipped|failed|null",
        "tool_error": "string|null",
        "payload": { ... }
      }
    ],
    "state": { "body_part":"string|null", "symptom_desc":"string|null", "since_when":"string|null", "current_meds":["string"], "tried_things":["string"] },
    "source_note": "string|null"
  }
  ```
  - `events`는 그 턴에서 실제로 일어난 단계마다 하나씩. 한 턴에 여러 이벤트가 올 수 있다.
  - 각 이벤트는 `line`을 가진다. **`line`은 서버 로그 한 줄 + 프론트 화면에서 사용자 말풍선 밑에 쌓였다가 `done`에서 접히는 줄.** 한 턴 안에서 발생한 이벤트들의 `line`이 순서대로 말풍선 밑에 쌓이고, `done` 이벤트에서 그 턴의 쌓인 `line`들을 접는다(접는 방식은 프론트 ui 컨벤션에 맡긴다).
  - 툴을 안 쓴 턴도 `safety`, `state`, `ask`, `done` 등 해당 줄이 보인다. 안 일어난 단계(memory, review 등)는 이벤트 자체가 없다(줄도 없음).
  - 툴 이름 그대로: "e약은요", "DUR 효능군 중복", "DUR 병용금기", "DUR 노인주의", "낱알식별", "진료과 규칙표". "분석 중" 같은 문구 없음.
  - 말풍선으로 찍을 내용(사용자한테 보이는 문장)은 `body`(필요 시 `hint`)가 맡고, `line`은 서버 로그 + 화면 둘 다 담당.

- 이벤트 종류와 `line`/말풍선 역할
  | event | `line`(로그 + 화면) | 말풍선 담당(body/hint) | 등장 조건 |
  |-------|-------------------|------------------------|-----------|
  | `safety` | `안전 신호 확인, 10개 대조, 해당 없음` 또는 `안전 신호 확인, 10개 대조, {signal} 걸렸음` | 응급이면 body = 응급 문장, 아니면 body 없음 | 매 턴 첫. 응급이면 여기서 종료. |
  | `state` | `4가지 읽음: 부위 배, 증상 쓰림, 언제부터 3일 전, 약 타이레놀, 해 본 것 없음`처럼 채워진 칸 요약 | body 없음(hint에 요약 가능) | 매 턴. 채워진 칸 바뀔 때. |
  | `memory` | `참고 기록 1건 읽음: 지난 진료 메모 "{...}"` | body 없음 | 이전 진료 메모가 있을 때만. 없으면 이벤트 자체 없음. |
  | `tool_call` | `e약은요 부르는 중` / `DUR 병용금기 부르는 중` 등 | body 없음 | 툴 호출 직전. |
  | `tool_result` | `e약은요: 타이레놀정500mg 확인 (한국얀센)` / `DUR 병용금기: 병용금기 없음` / `낱알식별: 후보 3개 - 타이레놀정500mg, ...` 등. 실패면 `DUR 병용금기: 호출 실패 - {이유}` | body 없음(말풍선은 이후 review/ask/result로) | 툴 호출 후. |
  | `review` | `검수 1회, 단정 표현 1건 고침` / `효능군 중복 1건 확인: 해열진통소염제(타이레놀·아스피린)` 등 | body에 검토 결과 문장 쓸 수 있음 | 대본/정리 만드는 턴에 한 번. |
  | `ask` | (로그 줄 최소화 — 예: `질문: 언제부터 아팠어요?`) | body = 다음 질문 말풍선. hint = 진행 요약 | 다음 질문 묻을 때. |
  | `result` | `대본·질문 3개·진료과 1~3위 정리 완료` 등 요약 한 줄 | body = 프론트가 result 객체로 별도 렌더(진료과 name+reason, 대본 문장 배열 등), line은 로그 요약 | 결과 카드 단계. |
  | `confirm_questions` | `질문 3개 제시: "{Q1}" / "{Q2}" / "{Q3}"` | body = "이 세 가지 물어보면 될까요?" 류 말풍선 | 질문 3개 확정 전 제시. |
  | `pill_candidates` | `낱알식별 후보 3개: 타이레놀정500mg, ...` | body = 후보 제시 말풍선(프론트가 카드 렌더) | 낱알식별 후보 제시 시. |
  | `ui_action` | `모양이랑 색으로 찾기 열기` | body 없음. payload.action=`open_pill_finder` | agent가 `pill_identify`를 골랐을 때. 공공데이터 조회는 프론트 카드에서. |
  | `done` | `done, 5단계 거침, 툴 2회, 응급 없음` / `done, 응급으로 종료` 등 | body 없음 | 턴 종료 시 항상. |

  - `line`은 실제로 일어난 단계만 만든다. 안 일어난 단계는 이벤트 자체가 없다(로그 줄도, 화면 줄도 없음).
  - **툴 미사용 턴도** `safety` → `state` → `ask` → `done` 순서로 각 이벤트 `line`이 서버 로그 + 화면에 찍힌다. memory, review는 일어나지 않았으므로 없다.

- `result` 객체 모양
  - `department_top3`: 배열 원소 각각 `{ "name": "내과", "reason": "배 증상 + 규칙표 기준" }` 형태. 진료과 이름과 이유를 한 줄씩.
  - `script`: 1인칭 읽기 문장을 **문장 배열**로. `[ "3일 전부터 배가 쓰렸습니다.", "타이레놀정500mg을 먹고 있습니다.", ... ]` 형태. 프론트가 이 배열을 그대로 읽는다.
  - `questions`: 질문 3개 배열.
  - `photos`: 프론트가 올린 사진 메타 배열(라벨·캡션).
  - `note_placeholder`: 진료 후 메모 textarea placeholder용 문자열.

- `ask` 이벤트 payload 구조
  ```json
  {
    "next_question": "언제부터 아팠어요?",
    "filled_fields": ["body_part","symptom_desc"],
    "next_field": "since_when",
    "chips": [
      { "id": "3일전", "label": "3일 전" },
      { "id": "1주전", "label": "1주 전" },
      { "id": "한달전", "label": "한 달 전" },
      { "id": "기억안남", "label": "기억 안 남" },
      { "id": "escape", "label": "잘 모르겠어", "isEscape": true }
    ]
  }
  ```
  - `chips` 배열: 각 원소는 `id`, `label`. 마지막 요소는 `isEscape: true`. 프론트는 이 chip을 그대로 칩 트레이로 렌더링.

- 응급 턴 예시
  ```json
  "events": [
    { "event":"safety", "line":"안전 신호 확인, 10개 대조, 의식 저하 걸렸음", "body":"의식 저하가 계속되는 건 바로 병원에 가야 하는 신호예요. 대본은 만들지 않아요.", "hint":null, "tool":null, "tool_status":null, "tool_error":null, "payload":{ "signal":"의식 저하", "cond":"의식 저하가" } },
    { "event":"done", "line":"done, 응급으로 종료", "body":null, "hint":null, "tool":null, "tool_status":null, "tool_error":null, "payload":{} }
  ]
  ```

- 툴 미사용 턴 예시
  ```json
  "events": [
    { "event":"safety", "line":"안전 신호 확인, 10개 대조, 해당 없음", "body":null, "hint":null, "tool":null, "tool_status":null, "tool_error":null, "payload":{ "ok":true } },
    { "event":"state", "line":"4가지 읽음: 부위 배, 증상 쓰림, 약 타이레놀 / 아직 안 읽은 것: 언제부터", "body":null, "hint":"부위·증상·약 확인 / 다음: 언제부터", "tool":null, "tool_status":null, "tool_error":null, "payload":{ "filled_fields":["body_part","symptom_desc","current_meds"], "next_field":"since_when" } },
    { "event":"ask", "line":"질문: 언제부터 아팠어요? 대략이라도요.", "body":"언제부터 아팠어요? 대략이라도요.", "hint":null, "tool":null, "tool_status":null, "tool_error":null, "payload":{ "next_question":"언제부터 아팠어요? 대략이라도요.", "filled_fields":["body_part","symptom_desc","current_meds"], "next_field":"since_when", "chips":[{"id":"3일전","label":"3일 전","isEscape":false},{"id":"1주전","label":"1주 전","isEscape":false},{"id":"한달전","label":"한 달 전","isEscape":false},{"id":"기억안남","label":"기억 안 남","isEscape":false},{"id":"escape","label":"잘 모르겠어","isEscape":true}] } },
    { "event":"done", "line":"done, 3단계 거침, 툴 0회, 응급 없음", "body":null, "hint":null, "tool":null, "tool_status":null, "tool_error":null, "payload":{} }
  ]
  ```
  - 툴 호출 없이 질문만 진행하는 턴. `safety` → `state` → `ask`(chips 포함) → `done`. memory, review 없음.

- 동작 규칙
  - 매 턴 첫 단계: 응급 10개 신호 코드 판정(모델 아님). `safety` 이벤트로 결과 한 줄 내려보냄. 걸리면 `done`까지만 하고 그 턴 종료. 사용자 승인 불필요.
  - 응급 아니면 Solar Pro 4 호출(UPSTAGE_API_KEY). 목표 기반 agent 진행: 현재 `state` 5칸을 보고 비어있는 칸 중 필요한 것부터 묻는다. 첫 발화에 정보가 많으면 재질문하지 않고 빠진 것만 묻는다.
  - 툴 선택은 agent가 6종 허용 목록에서 고른다. 툴 호출 전 `tool_call`(line 한 줄), 호출 후 `tool_result`(line 한 줄) 이벤트를 각각 내려보낸다. 그 사이/후에 `review`(line 한 줄)로 판단 요약을 넣을 수 있다.
  - 툴 호출 세션당 최대 8회. 초과 시 더 확인하지 않고 현재 정보로 `result`를 낸다.
  - human 승인 지점은 2개(질문 3개 확정, 저장 전 동의). 질문 3개는 `confirm_questions`(line 한 줄)로 먼저 제시 → 프론트 승인 → `confirmations` 얹어서 재호출 → `result`.
  - 툴 실패해도 대본은 가능하면 진행. 실패한 툴은 `tool_result`에 `status:"failed"`로 기록하고, `source_note`/대본에 "일부 확인 불가" 표시.
  - 모든 턴은 최소 `safety` + `done`을 포함하고, 그 사이에 `state`, `memory`(참고 기록 있을 때만), `review`(대본 턴에만), 툴 이벤트, `ask`, `result`, `confirm_questions`, `pill_candidates` 등이 필요에 따라 들어간다. 각 이벤트는 `line`을 가진다.

### 3.2 POST /api/pill (파일: api/pill.js)
- 용도: 약 정보 조회 중계. 프론트가 직접 공공데이터 API를 호출하지 않음(키 노출 방지).
- 요청
  ```json
  { "kind": "drug_name|drug_dup|drug_contra|elderly_caution|pill_identify", "params": { ... } }
  ```
- kind별 params
  - `drug_name`: `{ "itemName":"string" }` — e약은요 부분일치. 제품명(브랜드) 수준만.
  - `drug_dup`: `{ "med_names":["string",...] }` — 효능군 중복 조회.
  - `drug_contra`: `{ "med_names":["string",...] }` — 병용금기 조회(성분코드 교차). 적은 쪽만 스캔.
  - `elderly_caution`: `{ "med_names":["string",...], "age":65 }` — 65세 이상일 때만.
  - `pill_identify`: `{ "shape":"circle|oval|oblong|triangle|square|etc|null", "color":"white|yellow|orange|pink|red|blue|green|purple|null", "imprint":"string|null" }` — 낱알식별(텍스트 파라미터만). 후보 최대 5개.
- 응답
  ```json
  { "ok": true, "kind": "...", "result": { ... }, "source_note": "string|null" }
  ```
- kind별 result 예시
  - `drug_name`: `{ "items":[{"itemName":"타이레놀정500mg","entName":"한국얀센"}], "empty":false }` — 0건이면 `empty:true`.
  - `drug_dup`: `{ "duplicates":[{"effect_name":"해열진통소염제","meds":["타이레놀","아스피린"]}] }`
  - `drug_contra`: `{ "contra_pairs":[{"med_a":"심바스타틴","med_b":"이트라코나졸","reason":"횡문근융해증"}] }`
  - `elderly_caution`: `{ "cautions":[{"med":"...","detail":"..."}] }`
  - `pill_identify`: `{ "candidates":[{"name":"...","maker":"...","shape":"...","color":"...","imprint":"...","image":"..."}], "count":5 }`
- 규칙: 인증키는 서버에서만 사용. 결과를 그대로 프론트에 반환. 판단은 프론트/agent 몫. "등록돼 있어요, 의사에게 확인하세요"까지만 말하도록 프론트 복사 규칙이 처리.

### 3.3 GET /api/health (파일: api/health.js)
- 용도: 서버가 살아있고 Solar·공공데이터 호출을 할 수 있는지 가볍게 확인. 기록 CRUD 아님(v2).
- 응답
  ```json
  { "ok": true, "checks": { "solar": "ok|no_key|error", "pill_api": "ok|no_key|error" }, "note": "string|null" }
  ```

## 4. 응급 신호 10개 (코드 판정 기준, PRD/SKILL.md 그대로)
1. 의식 저하 2. 한쪽 마비 3. 흉통 20분 이상 4. 호흡곤란 5. 지혈 안 됨 6. 급성 두통 7. 경련 8. 토혈/흑변 9. 딱딱한 복통 10. 고열+목 뻣뻣함
- 판정은 키워드 표 기반으로 코드 처리. 모델 호출 전에 수행. 걸리면 그 턴은 거기까지만.
- 프론트 `App.jsx`에 정의된 6개 신호와 별개로, 백엔드는 10개 전부 판정. 양쪽 중복 검사는 허용.

## 5. 상태 5칸(state 필드, agent 내부용)
- `body_part`, `symptom_desc`, `since_when`, `current_meds`, `tried_things`.
- 매 턴 모델이 이 5칸을 채움. 채워진 칸을 빼고 빈 칸 하나를 골라 묻는다.
- `state` 이벤트 `line`에 채워진 칸과 다음에 확인할 칸만 요약 노출.

## 6~10. (기존 계약 유지: 결과 카드, 기록 객체 모양, 서버 로그 규칙, 로컬 실행 방법, 계약 전제 등)
- 저장용 기록 객체 모양(브라우저 보유, 서버는 모양만 정의)은 PRD DB 구조 그대로. v2에서는 서버가 저장하지 않음.
- 서버 로그: 매 턴 `/api/turn` 응답 직전, `events` 배열을 한 줄로 콘솔 로그 찍음. 배포 후 Vercel 로그에서 돌았는지 확인 가능.
- 로컬 실행: `vercel dev`로 프론트와 같은 주소에서 돔. 환경변수 2개(UPSTAGE_API_KEY, DATA_API_KEY)를 로컬에 설정. 키 없으면 목업 응답으로 프론트와 연계 테스트 가능하게 함.
- 계약 전제: 프론트가 `vercel.json` rewrites에 `/api/*` 예외를 먼저 추가해야 `/api/*` 요청이 백엔드로 감. 프론트는 3개 엔드포인트만 호출. `api.js`(또는 프론트에서 `/api`를 부르는 모듈)만 새로 만듦. 응급 검사는 매 턴 프론트가 아닌 서버에서 가장 먼저 수행. v2에서는 서버 저장 없이 브라우저 localStorage만 씀.
