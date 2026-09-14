import './Card.css'
import { t } from '../copy'

/**
 * C8 Card
 * design.md 4장 컴포넌트 규격
 *
 *   - 배경 --c-surface, 1px --c-border, 12px 라운드, 패딩 16, --shadow-card
 *   - 섹션 제목 15/600
 *   - 위험 변형: 2px --c-danger-border, 배경 --c-danger-bg
 *
 * variants
 *   variant  : 'default' | 'danger'
 *   children : 카드 내용
 */
export default function Card({ variant = 'default', children }) {
  const className = variant === 'danger' ? 'c-card c-card--danger' : 'c-card'
  return <div className={className}>{children}</div>
}

/* --- Card.Danger 전용 (S9 응급) --- */
Card.Danger = function DangerCard({
  title,
  body,
  note = '',
  cta,
  onCta,
  children,
}) {
  return (
    <Card variant="danger">
      <h2 className="c-card__danger-title">{title}</h2>
      <p className="c-card__body">{body}</p>
      {note && <p className="c-card__hint">{note}</p>}
      {cta && onCta ? (
        <button
          type="button"
          className="c-btn c-btn--primary c-btn--danger"
          onClick={onCta}
        >
          {cta}
        </button>
      ) : null}
      {children}
    </Card>
  )
}

/* --- Card.Section --- */
Card.Section = function Section({ title, children, marginTop }) {
  const style = marginTop ? { marginTop } : undefined
  return (
    <div style={style}>
      {title && <h3 className="c-card__section-title">{title}</h3>}
      {children}
    </div>
  )
}

/* --- Card.Textarea --- */
Card.Textarea = function Textarea({
  placeholder,
  value,
  onChange,
  onBlur,
}) {
  return (
    <textarea
      className="c-card__textarea"
      placeholder={placeholder}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
    />
  )
}

/* --- Card.PhotoList (S8에서 사용하는 가로 나열) --- */
Card.PhotoList = function PhotoList({ photos }) {
  if (!photos || photos.length === 0) return null

  return (
    <div>
      <h3 className="c-card__section-title">{t('card.photos.title')}</h3>
      <div className="c-card__photo-list">
        {photos.map((photo) => (
          <div key={photo.id} className="c-card__photo-item">
            <img src={photo.src} alt={photo.caption || '사진'} />
          </div>
        ))}
      </div>
      {photos.map((photo) => (
        <p key={`${photo.id}-cap`} className="c-card__photo-caption">
          {photo.caption}
        </p>
      ))}
    </div>
  )
}

/* --- Card.DeptRank (S8 진료과 순위) --- */
Card.DeptRank = function DeptRank({ rank, dept, reason }) {
  const rankClass = rank === 1 ? '' : rank === 2 ? 'c-card__dept-rank--2' : 'c-card__dept-rank--3'
  return (
    <div className={`c-card__dept-rank ${rankClass}`}>
      <span className="c-card__dept-num">{rank}</span>
      <div className="c-card__dept-info">
        <div className="c-card__dept-name">{dept}</div>
        <div className="c-card__dept-reason">{reason}</div>
      </div>
    </div>
  )
}

/* --- Card.ScriptList (S8 대본) --- */
Card.ScriptList = function ScriptList({ items }) {
  if (!items || items.length === 0) return null
  return (
    <ul className="c-card__script-list">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  )
}

/* --- Card.Questions (S8 질문 3개) --- */
Card.Questions = function Questions({ items }) {
  if (!items || items.length === 0) return null
  return (
    <ul className="c-card__questions-list">
      {items.map((item, i) => (
        <li key={i}>
          <span className="c-card__question-num">{i + 1}</span>
          <span className="c-card__question-text">{item}</span>
        </li>
      ))}
    </ul>
  )
}

/* --- Card.Actions (S8 버튼 행) --- */
Card.Actions = function Actions({ children }) {
  return <div className="c-card__actions">{children}</div>
}
