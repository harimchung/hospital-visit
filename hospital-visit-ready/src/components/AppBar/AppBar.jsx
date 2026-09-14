import './AppBar.css'

/**
 * C1 AppBar
 * design.md 4장 컴포넌트 규격
 *
 *   - 높이 56
 *   - 좌: 햄버거 24px (드로어 열기)
 *   - 중: 제목 17/600 좌측 정렬
 *   - 우: 둥근 테두리 버튼 "프로필" (6번 화면은 "닫기")
 *   - 배경 --c-surface, 하단 1px --c-border
 *   - 로고: public/visitready-wordmark.svg
 *
 * props
 *   title      : 앱바 중앙에 표시할 문자열 (기본값: "병원 가기 전")
 *   onHamburger: 햄버거 클릭 시 호출 (드로어 열기)
 *   onProfile  : 우측 버튼 클릭 시 호출
 *   rightLabel : 우측 버튼 텍스트 (기본: "프로필")
 *   mode       : 'default' | 'search' — search이면 우측 버튼이 "닫기" 역할
 */
export default function AppBar({
  onHamburger,
  onProfile,
  rightLabel = '프로필',
  mode = 'default',
}) {
  const handleHamburger = (e) => {
    e.stopPropagation()
    onHamburger?.(e)
  }

  const handleProfile = (e) => {
    e.stopPropagation()
    onProfile?.(e)
  }

  return (
    <header className="appbar" role="banner">
      {/* --- 좌측: 햄버거 --- */}
      <button
        type="button"
        className="appbar-hamburger"
        aria-label="진료 기록 열기"
        onClick={handleHamburger}
        tabIndex={0}
      >
        <span className="hamburger-icon" aria-hidden="true" />
      </button>

      {/* --- 중앙: 제목 + 로고 --- */}
      <div className="appbar-center">
        <img
          className="appbar-logo"
          src="/visitready-wordmark.svg"
          alt="VisitReady"
          width="108"
          height="22"
          loading="lazy"
        />
      </div>

      {/* --- 우측: 프로필 / 닫기 --- */}
      <div className="appbar-right">
        <button
          type="button"
          className="appbar-right-btn"
          onClick={handleProfile}
          aria-label={mode === 'search' ? '패널 닫기' : '진료 기록 열기'}
        >
          {mode === 'search' ? '✕' : rightLabel}
        </button>
      </div>
    </header>
  )
}
