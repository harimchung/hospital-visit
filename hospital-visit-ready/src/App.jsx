import './App.css'

const logos = [
  {
    key: 'visitready-lockup-h',
    title: '가로 잠금 (Lockup Horizontal)',
    ext: 'png',
    alt: 'VisitReady 가로 잠금 로고',
    style: { width: 'auto', maxWidth: '480px' },
  },
  {
    key: 'visitready-lockup-stacked',
    title: '세로 잠금 (Lockup Stacked)',
    ext: 'png',
    alt: 'VisitReady 세로 잠금 로고',
    style: { width: 'auto', maxWidth: '260px' },
  },
  {
    key: 'visitready-mark-bubble',
    title: '마크 버블 (Mark Bubble)',
    ext: 'svg',
    alt: 'VisitReady 마크 버블',
    style: { width: '120px', height: '120px' },
  },
  {
    key: 'visitready-wordmark',
    title: '워드마크 (Wordmark)',
    ext: 'svg',
    alt: 'VisitReady 워드마크',
    style: { width: '100%', maxWidth: '320px' },
  },
]

function App() {
  return (
    <div className="logo-sample">
      <header className="sample-header">
        <h1>VisitReady 로고 샘플</h1>
        <p>public/에 넣은 로고 파일이 브라우저에서 정상적으로 로드되는지 확인한다.</p>
      </header>

      <main className="logo-grid">
        {logos.map(({ key, title, ext, alt, style }) => (
          <figure key={key} className="logo-card">
            <div className="logo-media" style={style}>
              <img
                src={`/${key}.${ext}`}
                alt={alt}
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.alt = `⚠️ 로드 실패: ${alt}`
                  e.currentTarget.classList.add('failed')
                }}
              />
            </div>
            <figcaption>
              <strong>{title}</strong>
              <br />
              <small>/{key}.</small>{ext}
            </figcaption>
          </figure>
        ))}
      </main>

      <footer className="sample-footer">
        <h2>참고</h2>
        <ul>
          <li>
            <code>public/</code> 아래에 로고 파일을 넣으면 빌드 결과에도 그대로 포함된다.
          </li>
          <li>SVG는 <code>&lt;img&gt;</code>로도 쓸 수 있고, 추후 인라인으로 넣어도 된다.</li>
          <li>실제 앱에서는 <code>src/assets/</code>에 넣고 Vite가 해시한 경로를 쓰는 방법도 있다.</li>
        </ul>
      </footer>
    </div>
  )
}

export default App
