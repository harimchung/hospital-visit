import './Drawer.css'
import Button from './Button'
import { t } from '../copy'

/**
 * C9 Drawer
 * design.md 4장 컴포넌트 규격
 *
 *   - 좌측 슬라이드, 폭 72% (최대 400px)
 *   - 배경 --c-surface
 *   - 나머지 28%는 rgba(23,35,43,.45) 스크림 (탭하면 닫힘)
 *   - 내부:
 *     - 제목 "진료 기록", 캡션
 *     - 프로필 리스트 (선택 항목은 --c-primary 배경 흰 글자, 999px)
 *     - 지난 진료 리스트 (날짜 12 + 제목 14/600 + 요약 12)
 *     - 보조 버튼 "+ 새 진료 준비" (1px --c-primary 테두리)
 *     - 위험 텍스트 버튼 "기록 전부 지우기" (--c-text-3, 누르면 확인 시트)
 *
 * 접근성 (체크리스트 9번):
 *   - 애니메이션 200ms (prefers-reduced-motion 시 0ms)
 *   - 닫힌 상태/열린 상태 구분 명확
 *   - 드로어 바깥 탭 시 닫힘
 */

/**
 * Drawer
 * @param {boolean}    open             - 표시 여부
 * @param {() => void} onClose          - 닫힘 콜백 (오버레이 클릭, X 버튼)
 * @param {string[]}   profiles         - [{ id, name, age }]
 * @param {string}     selectedProfileId
 * @param {(id) => void} onSelectProfile
 * @param {string[]}   visits           - [{ id, createdAt, title, summary }]
 * @param {(id) => void} onOpenVisit    - 진료 항목 탭 시
 * @param {() => void} onNewVisit       - "+ 새 진료 준비"
 * @param {() => void} onClearAll       - "기록 전부 지우기"
 * @param {boolean}    hasActiveVisit   - 진행 중 대화가 있으면 true
 */
export default function Drawer({
  open = false,
  onClose,
  profiles = [],
  selectedProfileId,
  onSelectProfile,
  visits = [],
  onOpenVisit,
  onNewVisit,
  onClearAll,
  hasActiveVisit = false,
}) {
  if (!open) return null

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose?.()
    }
  }

  const handleNewVisitClick = () => {
    if (hasActiveVisit) {
      // 확인 시트에서 처리 (상위 컴포넌트에서 관리)
      onNewVisit?.(true)
    } else {
      onClose?.()
      onNewVisit?.(false)
    }
  }

  return (
    <>
      {/* 스크림 — 탭하면 닫힘 */}
      <div
        className="drawer-overlay"
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* 드로어 패널 */}
      <aside className="drawer" role="dialog" aria-label="진료 기록" aria-modal="true">
        {/* 헤더 */}
        <header className="drawer-header">
          <div className="drawer-header-text">
            <h2 className="drawer-title">{t('drawer.title')}</h2>
            <p className="drawer-caption">{t('drawer.caption')}</p>
          </div>
          <button
            type="button"
            className="drawer-close-btn"
            onClick={onClose}
            aria-label="진료 기록 닫기"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6 l12 12" />
            </svg>
          </button>
        </header>

        {/* 본문 */}
        <div className="drawer-content">
          {/* 프로필 */}
          <ul className="profile-list">
            {profiles.length === 0 ? (
              <li style={{ padding: '12px 0', textAlign: 'center', color: 'var(--c-text-3)' }}>
                {t('drawer.profile.empty')}
              </li>
            ) : (
              profiles.map((profile) => (
                <li
                  key={profile.id}
                  className={`profile-item ${selectedProfileId === profile.id ? 'selected' : ''}`}
                  onClick={() => onSelectProfile?.(profile.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectProfile?.(profile.id)
                    }
                  }}
                >
                  <span>
                    <span className="profile-name">{profile.name}</span>
                    <span className="profile-age">({profile.age})</span>
                  </span>
                </li>
              ))
            )}
          </ul>

          <button
            type="button"
            className="profile-add-btn"
            onClick={() => {
              // TODO: 프로필 추가 모달
            }}
          >
            + 프로필 추가
          </button>

          {/* 지난 진료 */}
          {visits.length > 0 ? (
            <>
              <h3 className="drawer-section-title">{t('drawer.section.visits')}</h3>
              <ul className="visit-list">
                {visits.map((visit) => (
                  <li
                    key={visit.id}
                    className="visit-item"
                    onClick={() => onOpenVisit?.(visit.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onOpenVisit?.(visit.id)
                      }
                    }}
                  >
                    <span className="visit-item-date">
                      {formatVisitDate(visit.createdAt)}
                    </span>
                    <span className="visit-item-title">{visit.title}</span>
                    <span className="visit-item-summary">{visit.summary}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p style={{ padding: '12px 0', textAlign: 'center', color: 'var(--c-text-3)' }}>
              {t('drawer.visits.empty')}
            </p>
          )}
        </div>

        {/* 푸터 */}
        <footer className="drawer-footer">
          <button
            type="button"
            className="drawer-secondary-btn"
            onClick={handleNewVisitClick}
          >
            {t('drawer.new')}
          </button>
          <button
            type="button"
            className="drawer-danger-btn"
            onClick={onClearAll}
          >
            {t('drawer.clear')}
          </button>
        </footer>
      </aside>
    </>
  )
}

function formatVisitDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()}`
}
