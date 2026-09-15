import './PhotoBubble.css'

/**
 * C5 PhotoBubble
 * design.md 4장 컴포넌트 규격
 *
 *   - UserBubble 안에 96×96 썸네일 + 캡션
 *   - 캡션 예: "9/13 밤" (12px)
 *   - 썸네일은 8px 라운드
 *
 * optional `inverted`: 배경이 밝은 맥락(S8 카드)에서 캡션을 --c-text로
 */
export default function PhotoBubble({ src, caption, inverted = false }) {
  const hasImage = src && src.trim().length > 0

  return (
    <div className={`photo-bubble ${inverted ? 'inverted' : ''}`}>
      {hasImage ? (
        <img
          className="photo-thumb"
          src={src}
          alt={caption || '사진'}
          loading="lazy"
        />
      ) : (
        <div className="photo-thumb" aria-hidden="true" />
      )}
      {caption ? (
        <div className="photo-caption">{caption}</div>
      ) : null}
    </div>
  )
}
