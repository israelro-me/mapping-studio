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

const SAMPLE_ROW = {
  first_name: 'ada',
  last_name: 'LOVELACE',
  email: '  Ada@Example.COM  '
}

export default function App() {
  const [yaml, setYaml] = React.useState(DEFAULT_YAML)
  const [output, setOutput] = React.useState(null)
  const [err, setErr] = React.useState(null)

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

  const run = () => {
    setErr(null); setOutput(null)
    workerRef.current.postMessage({ type: 'transform', row: SAMPLE_ROW, mappingYaml: yaml })
  }

  return (
    <main style={{ fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif', padding: 24, lineHeight: 1.5 }}>
      <h1 style={{ marginBottom: 8 }}>Mapping Studio</h1>
      <p style={{ marginTop: 0, color: '#555' }}>Hybrid scaffold — TS engine, JS UI, Worker wired.</p>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h3>Mapping YAML</h3>
          <textarea
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            style={{ width: '100%', height: 280, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
          />
          <button onClick={run} style={{ marginTop: 12, padding: '8px 14px' }}>Run</button>
          <p style={{ fontSize: 12, color: '#666' }}>
            Sample row:&nbsp;
            <code>{JSON.stringify(SAMPLE_ROW)}</code>
          </p>
        </div>

        <div>
          <h3>Output</h3>
          {err && <pre style={{ color: 'crimson', background: '#fee', padding: 12, borderRadius: 8 }}>{String(err)}</pre>}
          {output && (
            <pre style={{ background: '#f6f8fa', padding: 12, borderRadius: 8 }}>
              {JSON.stringify(output, null, 2)}
            </pre>
          )}
          {!err && !output && <p>Press <strong>Run</strong> to transform.</p>}
        </div>
      </section>

      <hr style={{ margin: '24px 0' }} />
      <ul>
        <li>Worker module path OK: <code>{String(!!workerRef.current)}</code></li>
        <li>BASE_URL: <code>{import.meta.env.BASE_URL}</code></li>
        <li>Path: <code>{location.pathname}</code></li>
      </ul>
    </main>
  )
}
