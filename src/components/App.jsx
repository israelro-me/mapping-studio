import React from 'react'

const DEFAULT_YAML = `# minimal demo
dto: profile
mappings:
  firstName:
    - take: { from: first_name }
    - title: {}
  lastName:
    - take: { from: last_name }
    - title: {}
  email:
    - take: { from: email }
    - trim: {}
    - lower: {}
`

const SAMPLE_ROW = { first_name: 'ada', last_name: 'LOVELACE', email: '  Ada@Example.COM  ' }

function useTheme() {
    const [theme, setTheme] = React.useState(() => localStorage.getItem('theme') || 'system')
    React.useEffect(() => {
        const root = document.documentElement
        if (theme === 'system') root.removeAttribute('data-theme')
        else root.setAttribute('data-theme', theme)
        localStorage.setItem('theme', theme)
    }, [theme])
    return [theme, setTheme]
}

export default function App() {
    const [yaml, setYaml] = React.useState(DEFAULT_YAML)
    const [output, setOutput] = React.useState(null)
    const [err, setErr] = React.useState(null)
    const [theme, setTheme] = useTheme()

    const workerRef = React.useRef(null)
    React.useEffect(() => {
        const w = new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' })
        w.onmessage = (ev) => {
            const msg = ev.data
            if (msg.type === 'transform_result') {
                if (msg.ok) { setOutput(msg.result); setErr(null) } else { setErr(msg.error); setOutput(null) }
            }
        }
        workerRef.current = w
        return () => w.terminate()
    }, [])

    const run = () => {
        setErr(null); setOutput(null)
        workerRef.current.postMessage({ type: 'transform', row: SAMPLE_ROW, mappingYaml: yaml })
    }

    const buildInfo = {
        version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
        sha: typeof __GIT_SHA__ !== 'undefined' && __GIT_SHA__ ? __GIT_SHA__ : 'local',
        time: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString()
    }

    return (
        <main style={{ padding: 24, lineHeight: 1.5 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h1 style={{ marginBottom: 8 }}>Mapping Studio</h1>
                <div className="muted text-mono" title={buildInfo.time}>
                    v{buildInfo.version} · {buildInfo.sha}
                </div>
            </header>
            <p className="muted" style={{ marginTop: 0 }}>Hybrid scaffold — TS engine, JS UI, Worker wired.</p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                    Theme: {theme === 'system' ? 'system' : theme} (click to toggle)
                </button>
                <button className="btn" onClick={() => setTheme('system')}>Use system</button>
            </div>

            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div>
                    <h3>Mapping YAML</h3>
                    <textarea
                        value={yaml}
                        onChange={(e) => setYaml(e.target.value)}
                        className="panel text-mono"
                        style={{ width: '100%', height: 280, padding: 12 }}
                    />
                    <button className="btn" onClick={run} style={{ marginTop: 12 }}>Run</button>
                    <p className="muted text-mono" style={{ fontSize: 12 }}>
                        Sample row: {JSON.stringify(SAMPLE_ROW)}
                    </p>
                </div>

                <div>
                    <h3>Output</h3>
                    {err && <pre className="panel" style={{ padding: 12, borderColor: '#7f1d1d' }}>{String(err)}</pre>}
                    {output && <pre className="panel text-mono" style={{ padding: 12 }}>{JSON.stringify(output, null, 2)}</pre>}
                    {!err && !output && <p className="muted">Press <strong>Run</strong> to transform.</p>}
                </div>
            </section>

            <hr style={{ margin: '24px 0', borderColor: 'var(--border)' }} />
            <ul>
                <li>Worker module path OK: <code>{String(!!workerRef.current)}</code></li>
                <li>BASE_URL: <code>{import.meta.env.BASE_URL}</code></li>
                <li>Path: <code>{location.pathname}</code></li>
            </ul>
        </main>
    )
}
