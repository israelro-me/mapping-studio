import React from 'react'

// Fallback YAML used if the preset fails to load.
// Keep it compatible with the ticketing joined-row shape.
const DEFAULT_YAML = `# Fallback preset (minimal)
dto: AttendeeDto
mappings:
  email:
    - take:   { from: $attendees.email }
    - trim: {}
    - lower: {}
  firstName:
    - take:   { from: $attendees.first_name }
    - title: {}
  lastName:
    - take:   { from: $attendees.last_name }
    - title: {}
readiness:
  blocked:
    - when: { missing: [ email ] }
      reason: MISSING_EMAIL
  review:
    - when: { invalidEmail: { ref: email } }
      reason: INVALID_EMAIL
  ready:
    - otherwise: true
`

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
    const [presetLoaded, setPresetLoaded] = React.useState(false)
    const [sampleRow, setSampleRow] = React.useState(null)
    const [output, setOutput] = React.useState(null)
    const [err, setErr] = React.useState(null)
    const [theme, setTheme] = useTheme()

    // Build metadata (injected via vite.config define)
    const buildInfo = {
        version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
        sha: typeof __GIT_SHA__ !== 'undefined' && __GIT_SHA__ ? __GIT_SHA__ : 'local',
        time: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString()
    }

    // Worker setup
    const workerRef = React.useRef(null)
    React.useEffect(() => {
        const w = new Worker(new URL('../worker/index.ts', import.meta.url), { type: 'module' })
        w.onmessage = (ev) => {
            const msg = ev.data
            if (msg.type === 'transform_result') {
                if (msg.ok) { setOutput(msg.result); setErr(null) }
                else { setErr(msg.error); setOutput(null) }
            }
        }
        workerRef.current = w
        return () => w.terminate()
    }, [])

    // Load the synthetic joined row from /public/samples/...
    React.useEffect(() => {
        let cancelled = false
        const url = `${import.meta.env.BASE_URL}samples/attendee.joined.json`
        fetch(url)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
            .then(data => { if (!cancelled) setSampleRow(data) })
            .catch(e => { if (!cancelled) setErr(`Failed to load sample row: ${e.message}`) })
        return () => { cancelled = true }
    }, [])

    // Load the ticketing preset YAML from /public/presets/...
    React.useEffect(() => {
        let cancelled = false
        const url = `${import.meta.env.BASE_URL}presets/attendee.ticketing.yaml`
        fetch(url)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
            .then(text => { if (!cancelled) { setYaml(text); setPresetLoaded(true) } })
            .catch(() => { /* keep DEFAULT_YAML as fallback, stay quiet */ })
        return () => { cancelled = true }
    }, [])

    const run = () => {
        if (!sampleRow) return
        setErr(null); setOutput(null)
        workerRef.current.postMessage({ type: 'transform', row: sampleRow, mappingYaml: yaml })
    }

    return (
        <main style={{ padding: 24, lineHeight: 1.5 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h1 style={{ marginBottom: 8 }}>Mapping Studio</h1>
                <div className="muted text-mono" title={buildInfo.time}>
                    v{buildInfo.version} · {buildInfo.sha}
                </div>
            </header>
            <p className="muted" style={{ marginTop: 0 }}>
                Hybrid scaffold — TS engine, JS UI, Worker wired. Preset: {presetLoaded ? 'ticketing' : 'fallback'}
            </p>

            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
                <button className="btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
                    Theme: {theme === 'system' ? 'system' : theme} (toggle)
                </button>
                <button className="btn" onClick={() => setTheme('system')}>Use system</button>
            </div>

            <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
                <div>
                    <h3>Mapping YAML</h3>
                    <textarea
                        value={yaml}
                        onChange={(e) => setYaml(e.target.value)}
                        className="panel text-mono"
                        spellCheck={false}
                        wrap="off"
                        style={{ width: '100%', height: 300, padding: 12 }}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                        <button className="btn" onClick={run} disabled={!sampleRow}>
                            {sampleRow ? 'Run' : 'Loading sample…'}
                        </button>
                        <span className="muted text-mono" style={{ fontSize: 12 }}>
                            Sample: <code>{import.meta.env.BASE_URL}samples/attendee.joined.json</code>
                        </span>
                    </div>
                </div>

                <div>
                    <h3>Output</h3>
                    {err && <pre className="panel" style={{ padding: 12 }}>{String(err)}</pre>}
                    {output && <pre className="panel text-mono" style={{ padding: 12 }}>{JSON.stringify(output, null, 2)}</pre>}
                    {!err && !output && <p className="muted">Press <strong>Run</strong> to transform.</p>}
                </div>
            </section>

            <hr style={{ margin: '24px 0', borderColor: 'var(--border)' }} />

            <ul>
                <li>Worker module path OK: <code>{String(!!workerRef.current)}</code></li>
                <li>Preset: <code>{presetLoaded ? 'attendee.ticketing.yaml' : 'DEFAULT_YAML (fallback)'}</code></li>
                <li>BASE_URL: <code>{import.meta.env.BASE_URL}</code></li>
                <li>Path: <code>{location.pathname}</code></li>
            </ul>
        </main>
    )
}
