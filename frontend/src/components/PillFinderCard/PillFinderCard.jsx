import { useState } from 'react'
import './PillFinderCard.css'

const SHAPES = ['원형', '타원', '장방형', '삼각형', '사각형']
const COLORS = [
  ['하양', '#f5f7f8'],
  ['노랑', '#e7d77d'],
  ['주황', '#dea86f'],
  ['분홍', '#d7a9b6'],
  ['빨강', '#bd777d'],
  ['파랑', '#79acd0'],
  ['초록', '#82bf99'],
  ['보라', '#a68bd1'],
]

function CandidatePhoto({ src, alt }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return <span className="pill-candidate-mark" aria-hidden="true" />
  }
  return (
    <img
      className="pill-candidate-photo"
      src={src}
      alt={alt || ''}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}

export default function PillFinderCard({
  value,
  onChange,
  onSearch,
  onSelect,
}) {
  const {
    shape = '',
    color = '',
    imprint = '',
    status = 'idle',
    candidates = [],
    selected = null,
    error = null,
  } = value || {}
  const isLoading = status === 'loading'
  const isSelected = !!selected
  const canSearch = !isLoading && !isSelected && !!(shape || color || imprint.trim())

  return (
    <section className="pill-finder-card" aria-label="모양과 색으로 약 찾기">
      <header className="pill-finder-header">
        <div>
          <h3>모양이랑 색으로 찾기</h3>
          <p>식약처 낱알식별 정보예요. 색, 모양, 글자만 보내요.</p>
        </div>
      </header>

      <fieldset className="pill-finder-fieldset" disabled={isLoading || isSelected}>
        <legend>1. 모양</legend>
        <div className="pill-shape-list">
          {SHAPES.map((item) => (
            <button
              key={item}
              type="button"
              className={`pill-shape-option ${shape === item ? 'is-selected' : ''}`}
              aria-pressed={shape === item}
              onClick={() => onChange?.({ shape: shape === item ? '' : item })}
            >
              <span className={`pill-shape-icon shape-${item}`} aria-hidden="true" />
              <span>{item}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="pill-finder-fieldset" disabled={isLoading || isSelected}>
        <legend>2. 색</legend>
        <div className="pill-color-list">
          {COLORS.map(([name, hex]) => (
            <button
              key={name}
              type="button"
              className={`pill-color-option ${color === name ? 'is-selected' : ''}`}
              aria-label={name}
              aria-pressed={color === name}
              onClick={() => onChange?.({ color: color === name ? '' : name })}
            >
              <span
                className="pill-color-dot"
                style={{ backgroundColor: hex }}
                aria-hidden="true"
              />
              <span>{name}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <label className="pill-imprint-field">
        <span>3. 새겨진 글자 (없으면 비워 둬요)</span>
        <input
          type="text"
          value={imprint}
          disabled={isLoading || isSelected}
          placeholder="예: T 500"
          maxLength={30}
          onChange={(event) => onChange?.({ imprint: event.target.value })}
        />
      </label>

      {!isSelected && (
        <button
          type="button"
          className="pill-search-button"
          disabled={!canSearch}
          onClick={() => onSearch?.({ shape, color, imprint: imprint.trim() })}
        >
          {isLoading ? '약을 찾고 있어요…' : '이 조건으로 찾기'}
        </button>
      )}

      {error && <p className="pill-finder-error">{error}</p>}

      {status === 'success' && candidates.length === 0 && (
        <p className="pill-finder-empty">
          조건에 맞는 약을 찾지 못했어요. 각인이나 다른 특징을 확인해 주세요.
        </p>
      )}

      {candidates.length > 0 && (
        <div className="pill-candidates">
          <h4>후보 {candidates.length}개</h4>
          {candidates.map((candidate, index) => {
            const key = `${candidate.name}-${candidate.maker}-${index}`
            const chosen =
              selected?.name === candidate.name && selected?.maker === candidate.maker
            return (
              <article
                key={key}
                className={`pill-candidate ${chosen ? 'is-selected' : ''}`}
              >
                <CandidatePhoto src={candidate.image} alt={candidate.name || ''} />
                <div className="pill-candidate-info">
                  <strong>{candidate.name || '제품명 미상'}</strong>
                  <span>{candidate.maker || '제조사 정보 없음'}</span>
                  <small>
                    {[candidate.shape, candidate.color, candidate.imprint]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={isSelected}
                  onClick={() => onSelect?.(candidate)}
                >
                  {chosen ? '선택됨' : '이 약'}
                </button>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
