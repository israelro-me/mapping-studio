import React from 'react'

// --- Monaco imports (ESM) ---
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api'
import 'monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

// Monaco worker wiring (Vite-friendly)
self.MonacoEnvironment = {
    getWorker() {
        return new EditorWorker()
    }
}

// Fallback YAML used if the preset fails to load (kept minimal)
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

// Flatten object to "$scope.path" → value entries
function* flatten(obj, scope = '', prefix = '') {
    if (obj == null || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) {
        const next = prefix ? `${prefix}.${k}` : k
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            yield* flatten(v, scope, next)
        } else {
            yield [scope ? `${scope}.${next}` : next, v]
        }
    }
}

function copyToClipboard(text) {
    try { navigator.clipboard?.writeText(text) } catch { /* no-op */ }
}

export default function App() {
    const [theme, setTheme] = useTheme()

    // Build metadata (injected via vite.config define)
    const buildInfo = {
        version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
        sha: typeof __GIT_SHA__ !== 'undefined' && __GIT_SHA__ ? __GIT_SHA__ : 'local',
        time: typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toISOString()
    }

    const [yaml, setYaml] = React.useState(DEFAULT_YAML)
    const [presetLoaded, setPresetLoaded] = React.useState(false)
    const [sampleRow, setSampleRow] = React.useState(null)
    const [err, setErr] = React.useState(null)
    const [activeRightTab, setActiveRightTab] = React.useState('output') // 'output' | 'source'
    const [activeDataset, setActiveDataset] = React.useState('$attendees') // $attendees | $tickets | $checkins
    const [showRaw, setShowRaw] = React.useState(false)
    const [output, setOutput] = React.useState(null)

    // Worker
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

    // Fetch sample row
    React.useEffect(() => {
        let cancelled = false
        const url = `${import.meta.env.BASE_URL}samples/attendee.joined.json`
        fetch(url)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
            .then(data => { if (!cancelled) setSampleRow(data) })
            .catch(e => { if (!cancelled) setErr(`Failed to load sample row: ${e.message}`) })
        return () => { cancelled = true }
    }, [])

    // Fetch preset YAML
    React.useEffect(() => {
        let cancelled = false
        const url = `${import.meta.env.BASE_URL}presets/attendee.ticketing.yaml`
        fetch(url)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.text() })
            .then(text => { if (!cancelled) { setYaml(text); setPresetLoaded(true) } })
            .catch(() => { /* keep fallback */ })
        return () => { cancelled = true }
    }, [])

    // --- Monaco Editor setup ---
    const editorRef = React.useRef(null)
    const editorInstRef = React.useRef(null)

    React.useEffect(() => {
        const el = editorRef.current
        if (!el) return

        const inst = monaco.editor.create(el, {
            value: yaml,
            language: 'yaml',
            theme: (theme === 'dark' ? 'vs-dark' : theme === 'light' ? 'vs'
                : (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs')),
            fontSize: 16,
            minimap: { enabled: false },
            automaticLayout: true,
            wordWrap: 'off',
            bracketPairColorization: { enabled: true },
            renderWhitespace: 'selection'
        })
        editorInstRef.current = inst

        // Cmd/Ctrl+Shift+Enter to run
        inst.addAction({
            id: 'run-transform',
            label: 'Run Transform',
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter],
            run: () => run()
        })

        const onKeyDownCapture = (e) => {
            const isCmdOrCtrl = e.metaKey || e.ctrlKey
            if (isCmdOrCtrl && e.shiftKey && e.key === 'Enter') {
                e.preventDefault()
                e.stopPropagation()
                run()
            }
        }

        el.addEventListener('keydown', onKeyDownCapture, true)

        // Mirror content into state
        const sub = inst.onDidChangeModelContent(() => setYaml(inst.getValue()))

        return () => {
            el.removeEventListener('keydown', onKeyDownCapture, true)
            sub.dispose()
            inst.dispose()
            editorInstRef.current = null
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []) // create once

    // Keep theme in sync
    React.useEffect(() => {
        monaco.editor.setTheme(
            theme === 'dark' ? 'vs-dark' :
                theme === 'light' ? 'vs' :
                    (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'vs-dark' : 'vs')
        )
    }, [theme])

    // If YAML state changes due to preset load, push into editor (but avoid loops)
    React.useEffect(() => {
        const inst = editorInstRef.current
        if (!inst) return
        if (inst.getValue() !== yaml) inst.setValue(yaml)
    }, [yaml])

    const run = () => {
        if (!sampleRow) return
        setErr(null); setOutput(null)
        workerRef.current.postMessage({ type: 'transform', row: sampleRow, mappingYaml: yaml })
        setActiveRightTab('output')
    }

    // Helpers for source viewer
    const datasetKeys = ['$attendees', '$tickets', '$checkins']
    const currentDatasetObj =
        sampleRow ? (sampleRow[activeDataset] ?? {}) : {}

    const flattened = React.useMemo(() => {
        if (!sampleRow) return []
        const scope = activeDataset
        const data = sampleRow[scope] ?? {}
        return Array.from(flatten(data, scope))
    }, [sampleRow, activeDataset])

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

            {/* Main grid: Monaco (left) + Right panel (Output/Source tabs) */}
            <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
                {/* Monaco Editor */}
                <div>
                    <h3>Mapping YAML</h3>
                    <div ref={editorRef} className="panel text-mono" style={{ height: 360, padding: 0 }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
                        <button className="btn" onClick={run} disabled={!sampleRow}>
                            {sampleRow ? 'Run' : 'Loading sample…'}
                        </button>
                        <span className="muted text-mono" style={{ fontSize: 12 }}>
                            Sample: <code>{import.meta.env.BASE_URL}samples/attendee.joined.json</code>
                        </span>
                    </div>
                </div>

                {/* Right panel with tabs */}
                <div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                        <button
                            className="btn"
                            onClick={() => setActiveRightTab('output')}
                            style={{ background: activeRightTab === 'output' ? 'var(--panel)' : 'transparent' }}
                        >
                            Output
                        </button>
                        <button
                            className="btn"
                            onClick={() => setActiveRightTab('source')}
                            style={{ background: activeRightTab === 'source' ? 'var(--panel)' : 'transparent' }}
                        >
                            Source
                        </button>
                    </div>

                    {activeRightTab === 'output' ? (
                        <>
                            <h3>Output</h3>
                            {err && <pre className="panel" style={{ padding: 12 }}>{String(err)}</pre>}
                            {output && <pre className="panel text-mono" style={{ padding: 12, maxHeight: 360, overflow: 'auto' }}>
                                {JSON.stringify(output, null, 2)}
                            </pre>}
                            {!err && !output && <p className="muted">Press <strong>Run</strong> to transform.</p>}
                        </>
                    ) : (
                        <>
                            <h3>Source</h3>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                                {datasetKeys.map(k => (
                                    <button
                                        key={k}
                                        className="btn"
                                        onClick={() => setActiveDataset(k)}
                                        style={{ background: activeDataset === k ? 'var(--panel)' : 'transparent' }}
                                    >
                                        {k.replace('$', '')}
                                    </button>
                                ))}
                                <div style={{ marginLeft: 'auto' }}>
                                    <label className="muted" style={{ marginRight: 8 }}>
                                        <input type="checkbox" checked={showRaw} onChange={e => setShowRaw(e.target.checked)} />
                                        {' '}Raw JSON
                                    </label>
                                </div>
                            </div>

                            {!sampleRow && <p className="muted">Loading source…</p>}

                            {sampleRow && !showRaw && (
                                <div className="panel" style={{ padding: 8, maxHeight: 360, overflow: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                                        <thead>
                                            <tr className="muted">
                                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Path</th>
                                                <th style={{ textAlign: 'left', padding: '6px 8px' }}>Value</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {flattened.length === 0 && (
                                                <tr><td className="muted" colSpan={2} style={{ padding: '6px 8px' }}>(empty)</td></tr>
                                            )}
                                            {flattened.map(([path, value]) => (
                                                <tr key={path}>
                                                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                                                        <code
                                                            title="Click to copy"
                                                            style={{ cursor: 'pointer' }}
                                                            onClick={() => copyToClipboard(path)}
                                                        >
                                                            {path}
                                                        </code>
                                                    </td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        <code className="text-mono">{JSON.stringify(value)}</code>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {sampleRow && showRaw && (
                                <pre className="panel text-mono" style={{ padding: 12, maxHeight: 360, overflow: 'auto' }}>
                                    {JSON.stringify(currentDatasetObj, null, 2)}
                                </pre>
                            )}
                        </>
                    )}
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
