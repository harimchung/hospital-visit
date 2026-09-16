import './UserBubble.css'
import PhotoBubble from '../PhotoBubble/PhotoBubble'

/**
 * C4 UserBubble
 * design.md 4장 컴포넌트 규격
 *
 *   - 우측 정렬, 최대 폭 80%
 *   - 배경 --c-primary, 글자 #FFF 15 (--fs-body)
 *   - 12px 라운드
 *   - 사진이면 PhotoBubble(C5)
 *
 * children : 말풍선 텍스트 (문자열)
 * photo    : { src, caption } 객체 (없으면 텍스트만)
 */
export default function UserBubble({ children, photo }) {
  return (
    <div className="user-bubble">
      {photo && <PhotoBubble src={photo.src} caption={photo.caption} />}
      {children != null && children !== '' && <p>{children}</p>}
    </div>
  )
}
