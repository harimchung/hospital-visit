# 병원 진료 대본 서비스 DB 설계서

## Supabase 프로젝트
- 프로젝트명: hospital-visit-service
- Region: ap-northeast-2
- 상태: ACTIVE_HEALTHY
- 참고: 민감한 키·URL은 포함하지 않음. 실제 연결 값은 Vercel 환경변수(SUPABASE_URL, SUPABASE_ANON_KEY)로만 관리.

## 적용 순서 (마이그레이션)
1. 001_initial_tables.sql
2. 002_rls_policies.sql
3. 003_updated_at_trigger.sql
4. 004_profile_multi_and_health_records_profile_id.sql

## 개요
- 회원 프로필, 진료 기록(방문 단위), 에이전트 로그 3개 테이블로 구성.
- 모든 민감 데이터는 기기 AES-GCM 대칭키(Web Crypto, 브라우저 생성·localStorage 보관)로 암호화한 JSON을 `encrypted_payload` TEXT 한 칸에 저장.
- 서버는 평문을 읽지 못함. 조회용으로 평문 `date_label`, `body_part_label`만 허용.
- 비회원은 Supabase 테이블에 전혀 접근하지 않음 (`auth.uid()`가 null).
- RLS 정책은 `user_id = auth.uid()` 기반. `service_role` 키는 쓰지 않음.

## 테이블 명세

### profiles
회원 프로필. 계정당 여러 프로필을 둘 수 있도록 user_id는 UNIQUE가 아님(004에서 해제).

| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | — | auth.users(id) 참조, 계정 식별 |
| encrypted_payload | text | NO | '' | 암호문 JSON (호칭·나이·알레르기·만성질환) |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | 트리거로 자동 갱신 |

제약: id PRIMARY KEY. user_id에 별도 UNIQUE 없음(004 이후).

### health_records
진료 기록(방문 단위). 각 기록은 하나의 프로필에 속함.

| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | — | auth.users(id) 참조, RLS 기준 |
| profile_id | uuid | NO | — | profiles(id) 참조, 어느 프로필 기록인지 식별(004에서 추가) |
| date_label | date | NO | — | 방문 날짜(목록·타임라인용 평문) |
| body_part_label | text | YES | — | 부위 라벨(목록·타임라인용 평문) |
| encrypted_payload | text | NO | '' | 암호문 JSON (대본·대화·메모·처방약·증상·질문·진료과·사진 등) |
| created_at | timestamptz | NO | now() | |
| updated_at | timestamptz | NO | now() | 트리거로 자동 갱신 |

외래키: user_id → auth.users(id) ON DELETE CASCADE, profile_id → profiles(id) ON DELETE CASCADE.

### agent_logs
에이전트 실행 로그(선택, 실패·예외 기록용).

| 컬럼 | 타입 | Null | 기본값 | 비고 |
|------|------|------|--------|------|
| id | uuid | NO | gen_random_uuid() | PK |
| user_id | uuid | NO | — | auth.users(id) 참조, RLS 기준 |
| session_id | text | NO | — | 프론트가 매 세션 생성·전달하는 세션 식별자 |
| turn_index | integer | NO | — | 턴 번호 |
| event_type | text | NO | — | tool_call / tool_result / fallback / emergency_stop / error |
| payload | text | YES | — | 도구명·결과·에러 등 요약(JSON 텍스트) |
| created_at | timestamptz | NO | now() | |

외래키: user_id → auth.users(id) ON DELETE CASCADE.

## RLS 정책

모든 테이블 RLS ON. 정책은 테이블마다 `user_id = auth.uid()` 기반.

### profiles (4개)
- profiles_select: SELECT, USING (user_id = auth.uid())
- profiles_insert: INSERT, WITH CHECK (user_id = auth.uid())
- profiles_update: UPDATE, USING (user_id = auth.uid()), WITH CHECK (user_id = auth.uid())
- profiles_delete: DELETE, USING (user_id = auth.uid())

### health_records (4개)
- records_select: SELECT, USING (user_id = auth.uid())
- records_insert: INSERT, WITH CHECK (user_id = auth.uid())
- records_update: UPDATE, USING (user_id = auth.uid()), WITH CHECK (user_id = auth.uid())
- records_delete: DELETE, USING (user_id = auth.uid())

### agent_logs (3개)
- logs_select: SELECT, USING (user_id = auth.uid())
- logs_insert: INSERT, WITH CHECK (user_id = auth.uid())
- logs_delete: DELETE, USING (user_id = auth.uid())
(agent_logs는 UPDATE 정책 없음 — 작성 시간만 필요하면 충분)

## 암호화 모델
- 기기별 AES-GCM 대칭키: Web Crypto로 브라우저에서 생성, localStorage 보관. 서버에 전송·저장하지 않음.
- 암호화 대상: 대본, 대화/답변, 진료 후 메모, 처방약, 증상 상세, 질문 3개, 진료과 추천, 사진(리사이즈+섬네일), 에이전트 추적.
- 서버( `/api`)는 암호문만 저장·반환. 서버는 평문을 읽지 못함.
- 평문 컬럼 허용: date_label(날짜), body_part_label(부위 라벨)만. 목록·타임라인 조회용.
- 기기 간 키 공유 없음: 다른 기기에서 이전 기록 복호화 불가(의도된 제약). 새 기기 로그인 시 프로필·재입력 필요.
- `/api`가 프론트로부터 받는 채팅 요청에는 프론트가 복호화한 프로필 정보(나이·알레르기·만성질환)와 이전 진료 메모를 평문으로 실어 보냄. `/api`는 Supabase에서 평문 나이를 읽지 않음.

## 암호화된 페이로드 JSON 예시

### health_records.encrypted_payload
```json
{
  "script": "...",
  "dialogue_summary": "...",
  "post_visit_note": "...",
  "prescription_meds": [{"name":"", "dose":"", "instructions":""}],
  "symptom_data": {
    "body_part": "...",
    "symptom_desc": "...",
    "since_when": "...",
    "current_meds": ["..."],
    "tried_things": ["..."]
  },
  "questions": ["질문1","질문2","질문3"],
  "department_recommendations": ["1위","2위","3위"],
  "photos": [
    {
      "date": "2026-09-14",
      "resized_base64": "...",
      "thumbnail_base64": "...",
      "note": "..."
    }
  ],
  "agent_trace": {
    "turns": [{"tool":"...", "result":"ok", "error":null}, ...],
    "fallback_applied": false
  }
}

