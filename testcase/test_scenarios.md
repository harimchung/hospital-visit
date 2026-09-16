# 병원 진료 대본 서비스 — API 테스트 시나리오

이 문서는 `api/turn`, `api/pill`, `api/health` 엔드포인트를 검증하기 위한 테스트 시나리오를 정의한다.

## 1. 테스트 환경

- Node.js 런타임 (Vercel 함수 호환)
- 환경변수: `UPSTAGE_API_KEY`, `DATA_API_KEY` (로컬에서는 `api/_lib/.env.local`에서 로드)
- 테스트 실행: `node testcase/run_tests.mjs`
- 패키지 설치 없음. 내장 fetch, path, fs만 사용.

## 2. 테스트 시나리오

### 2.1 GET /api/health

| # | 목적 | 입력 | 예상 결과 | 통과 기준 |
|---|------|------|-----------|------------|
| H1 | 키 두 개 모두 있을 때 | GET /api/health | `{"ok":true,"checks":{"solar":"ok","pill_api":"ok"},"note":"준비됨"}` | `ok=true`, `checks.solar="ok"`, `checks.pill_api="ok"` |
| H2 | 둘 다 없을 때 | GET /api/health (키 미설정 상태) | `{"ok":true,"checks":{"solar":"no_key","pill_api":"no_key"},"note":"키 없음/오류"}` | `checks.solar="no_key"` |
| H3 | 하나만 있을 때 | GET /api/health (UPSTAGE_API_KEY만) | `checks.solar="ok"`, `checks.pill_api="no_key"` | `ok=true`, `checks.solar="ok"`, `checks.pill_api="no_key"` |

### 2.2 POST /api/pill

#### 2.2.1 drug_name (e약은요)

| # | 목적 | 입력 | 예상 결과 | 통과 기준 |
|---|------|------|-----------|------------|
| P1 | 정상 조회 | `{"kind":"drug_name","params":{"itemName":"타이레놀"}}` | items에 제품명 포함, `empty=false` | `result.items.length > 0` |
| P2 | 0건 조회 | `{"kind":"drug_name","params":{"itemName":"존재하지않는의약품"}}` | `items=[]`, `empty=true` | `result.empty === true` |
| P3 | 제품명 수준만 들어와도 조회 | `{"kind":"drug_name","params":{"itemName":"타이레놀정500"}}` | items에 관련 결과 | `result.items[0].itemName`에 "타이레놀" 포함 |
| P4 | kind 누락 | `{}` | error | status 400, `"kind"` 관련 메시지 |

#### 2.2.2 drug_dup (DUR 효능군 중복)

| # | 목적 | 입력 | 예상 결과 | 통과 기준 |
|---|------|------|-----------|------------|
| P5 | 중복 없음 조합 | `{"kind":"drug_dup","params":{"med_names":["타이레놀","아스피린"]}}` | `duplicates=[]` | `result.duplicates.length === 0` |
| P6 | 중복 있음 조합 | `{"kind":"drug_dup","params":{"med_names":["아스피린","게보린","타이레놀"]}}` | `duplicates` 배열에 같은 효능군 1개 이상 | `result.duplicates.length >= 1` |
| P7 | 빈 배열 | `{"kind":"drug_dup","params":{"med_names":[]}}` | `duplicates=[]` | `result.duplicates.length === 0` |
| P8 | kind 누락 | `{"params":{"med_names":["타이레놀"]}}` | error | status 400, `"kind"` 관련 메시지 |

#### 2.2.3 drug_contra (DUR 병용금기)

| # | 목적 | 입력 | 예상 결과 | 통과 기준 |
|---|------|------|-----------|------------|
| P9 | 병용금기 없음 조합 | `{"kind":"drug_contra","params":{"med_names":["타이레놀","아스피린"]}}` | `contra_pairs=[]` | `result.contra_pairs.length === 0` |
| P10 | 병용금기 있음 조합 | `{"kind":"drug_contra","params":{"med_names":["심바스타틴","이트라코나졸"]}}` | `contra_pairs` 배열에 조합 1개 이상, `reason` 있음 | `result.contra_pairs.length >= 1` && `result.contra_pairs[0].reason` 정의됨 |
| P11 | 빈 배열 | `{"kind":"drug_contra","params":{"med_names":[]}}` | `contra_pairs=[]` | `result.contra_pairs.length === 0` |
| P12 | kind 누락 | `{"params":{"med_names":["타이레놀"]}}` | error | status 400, `"kind"` 관련 메시지 |

#### 2.2.4 elderly_caution (DUR 노인주의)

| # | 목적 | 입력 | 예상 결과 | 통과 기준 |
|---|------|------|-----------|------------|
| P13 | 65세 미만 (건너뛰기) | `{"kind":"elderly_caution","params":{"med_names":["타이레놀"],"age":64}}` | `cautions=[]` | `result.cautions.length === 0` |
| P14 | 65세 이상 (조회) | `{"kind":"elderly_caution","params":{"med_names":["타이레놀"],"age":65}}` | `cautions` 배열에 노인주의 정보 (없으면 빈 배열) | 호출 성공 && `result.cautions` 배열 |
| P15 | age 누락 시 동작 | `{"kind":"elderly_caution","params":{"med_names":["타이레놀"]}}` | 호출 성공, `cautions` 배열 | 호출 성공 && `result.cautions` 배열 |
| P16 | kind 누락 | `{"params":{"med_names":["타이레놀"],"age":65}}` | error | status 400, `"kind"` 관련 메시지 |

#### 2.2.5 pill_identify (낱알식별)

| # | 목적 | 입력 | 예상 결과 | 통과 기준 |
|---|------|------|-----------|------------|
| P17 | 정상 조회 | `{"kind":"pill_identify","params":{"shape":"원형","color":"흰색","imprint":"TYLENOL"}}` | candidates 배열, `count>=0` | 호출 성공 && `result.candidates` 배열 |
| P18 | 0건 조합 | `{"kind":"pill_identify","params":{"shape":"삼각형","color":"보라","imprint":"없음"}}` | candidates=[], `count=0` | `result.count === 0` && `result.candidates.length === 0` |
| P19 | 일부 파라미터만 | `{"kind":"pill_identify","params":{"shape":"원형"}}` | candidates 배열 (호출 성공) | 호출 성공 && `result.candidates` 배열 |
| P20 | kind 누락 | `{"params":{"shape":"원형"}}` | error | status 400, `"kind"` 관련 메시지 |

### 2.3 POST /api/turn

#### 2.3.1 응급 신호 (safety)

| # | 목적 | 입력(user_text) | 예상 결과 | 통과 기준 |
|---|------|----------------|-----------|------------|
| T1 | 응급 아님 | `"소화가 안돼요, 배가 더부룩해요"` | events[0].event="safety", line="안전 신호 확인, 10개 대조, 해당 없음", done까지 이어짐 | safety.payload.ok===true && done 이벤트 존재 |
| T2 | 의식 저하 | `"의식이 흐리고 깨우기 어려워요"` | safety line에 "의식 저하" 포함, body=응급 문장, done 이후 events 더 없음 | events[0].event=="safety" && events[0].payload.signal=="의식 저하" && events.length===2 |
| T3 | 흉통 20분 이상 | `"가슴을 쥐어짜는 통증이 20분 넘게 계속돼요"` | safety line "흉통 걸렸음" 포함, done, events.length===2 | events[0].event=="safety" && events[0].payload.signal=="흉통 20분 이상" && events.length===2 |
| T4 | 호흡곤란 | `"숨쉬기가 힘들어요, 숨 못 쉬겠어요"` | safety "호흡곤란", done | events[0].event=="safety" && events[0].payload.signal=="호흡곤란" && events.length===2 |
| T5 | 토혈 | `"피를 토했어요, 커피색 토가 나와요"` | safety "토혈", done | events[0].event=="safety" && events[0].payload.signal=="토혈/흑변" && events.length===2 |
| T6 | 고열+목 뻣뻣함 | `"고열이 나고 목이 뻣뻣해요"` | safety "고열+목 뻣뻣함", done | events[0].event=="safety" && events[0].payload.signal=="고열+목 뻣뻣함" && events.length===2 |

#### 2.3.2 일반 턴 (상태/질문/결과/툴)

| # | 목적 | 입력(user_text / context) | 예상 결과 | 통과 기준 |
|---|------|---------------------------|-----------|------------|
| T7 | 첫 질문 턴 (툴 호출 없음) | `user_text:"3일 전부터 배가 쓰려요"`, `selected_part:"abdomen"`, `profile:{age:34}` | events: safety, state, ask, done. ask.payload.chips 배열, 마지막 isEscape:true | ask 이벤트 존재 && ask.payload.chips && ask.payload.chips.slice(-1)[0].isEscape===true |
| T8 | 상태 요약 line | (T7 맥락에서) | state 이벤트 line에 채워진 칸 + 다음 확인 칸 요약 | state.line에 "부위 배" 또는 "배" 포함 |
| T9 | memory 없을 때 | `previous_note:""` | events에 memory 없음 | !events.find(e=>e.event==="memory") |
| T10 | memory 있을 때 | `previous_note:"전에 위염 소견 들음"` | events에 memory 있음, line에 지난 진료 메모 언급 | memory 이벤트 존재 && memory.line에 "참고 기록" 또는 "진료 메모" 포함 |
| T11 | 결과 턴 (대본·진료과·질문) | `user_text:"3일 전부터 배 쓰리고 타이레놀 먹었고 전에 위염 진료 받았어요"`, `selected_part:"abdomen"`, `profile:{age:34}`, 정보 충분히 채워서 | events: safety, state, (memory), review, result, done. result.payload.department_top3 원소 각각 {name, reason}, script는 문장 배열, questions는 3개 배열 | result.payload.department_top3.every(d=>d.name && d.reason) && Array.isArray(result.payload.script) && Array.isArray(result.payload.questions) && result.payload.questions.length===3 |
| T12 | confirm_questions 턴 | (질문 3개 확정 전 패턴, 구현되면) | events: safety 등, confirm_questions, done 등 | confirm_questions.payload.questions.length===3 && confirm_questions.line에 질문 3개 제시 |
| T13 | 툴 e약은요 호출 턴 | `user_text:"타이레놀정500mg 먹고 있어"`, 정보 충분 | events: tool_call(e약은요 부르는 중), tool_result(e약은요: 타이레놀정500mg 확인), review, result, done | tool_call.tool=="e약은요" && tool_result.tool=="e약은요" && tool_result.tool_status=="ok" |
| T14 | 툴 실패 처리 | (공공데이터 호출 실패 시나리오) | tool_result tool_status="failed", tool_error 있음, result는 진행 | tool_result.tool_status=="failed" && result 이벤트 존재 |
| T15 | done 라인 | T7/T11 등에서 | done.line에 "done, N단계 거침, 툴 M회, 응급 없음" 또는 "done, 응급으로 종료" | done.line에 "done" 포함 |
| T16 | 서버 로그 한 줄 | T7 실행 | 실행 stdout에 `[turn] session_id=... turn_index=...` 라인 출력 | stdout에 정규식 `/^\[turn\] session_id=.../` 매칭 라인 존재 |

## 3. 판정 규칙

- 각 시나리오는 위 "통과 기준"을 모두 만족하면 **PASS**.
- 하나라도 위반하면 **FAIL**.
- FAIL 시 콘솔에 사유 출력.
- 마지막에 요약 출력: 총 케이스 수, PASS, FAIL.

## 4. 파일 구성

```
testcase/
  test_scenarios.md   # 이 문서
  run_tests.mjs       # 시나리오 실행 스크립트
```

## 5. 실행 방법

```bash
cd /Users/gwangjin/dev/mabc/hospital-visit
node testcase/run_tests.mjs
```

출력:
- 각 케이스마다 PASS/FAIL
- FAIL 시 상세 사유
- 마지막 요약(총 케이스, PASS, FAIL)
