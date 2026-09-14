import './Button.css'

/**
 * Button — 3종 (Primary / Secondary / Danger)
 * design.md 4장 버튼 3종 규격
 *
 *   Primary: 배경 --c-primary, 흰 글자 15/600, 높이 44, 999px
 *   Secondary: 배경 투명, 1px --c-primary, 글자 --c-primary
 *   Danger: 배경 --c-danger, 흰 글자
 *
 * size prop: 'default' | 'circle'
 *   circle: 44×44, border-radius 50%, 내부 아이콘 SVG
 */

export default function Button({
  kind = 'primary',
  size = 'default',
  children,
  onClick,
  disabled = false,
  className = '',
  style = {},
  ...rest
}) {
  const baseClass = 'btn'
  const kindClass = `btn-${kind}`
  const sizeClass = size === 'circle' ? 'btn-circle' : ''

  const classes = [
    baseClass,
    kindClass,
    sizeClass,
    className,
  ].filter(Boolean).join(' ')

  const buttonStyle = {
    ...style,
    ...(size === 'circle' ? {
      width: '44px',
      height: '44px',
      padding: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    } : {}),
  }

  return (
    <button
      className={classes}
      onClick={onClick}
      disabled={disabled}
      style={buttonStyle}
      {...rest}
    >
      {children}
    </button>
  )
}
