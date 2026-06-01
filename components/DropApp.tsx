'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { createSenderPC, createReceiverPC, type FileMeta, type TransferProgress } from '@/lib/webrtc';
import { createSession, fetchSession, submitAnswer, pollForAnswer } from '@/lib/signal';
import { fmtBytes, fileIcon } from '@/lib/utils';

type Mode = 'send' | 'receive';

type SendPhase = 'idle' | 'connecting' | 'code-ready' | 'waiting' | 'transferring' | 'done' | 'error';
type RecvPhase = 'idle' | 'fetching' | 'ready' | 'receiving' | 'done' | 'error';

async function copyToClipboard(text: string) {
  if (navigator.clipboard) {
    try { await navigator.clipboard.writeText(text); return; } catch (_) {}
  }
  const ta = Object.assign(document.createElement('textarea'), { value: text });
  ta.style.cssText = 'position:fixed;opacity:0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  ta.remove();
}

export default function DropApp() {
  const [mode, setMode] = useState<Mode>('send');

  // send state
  const [file, setFile] = useState<File | null>(null);
  const [dragover, setDragover] = useState(false);
  const [sendPhase, setSendPhase] = useState<SendPhase>('idle');
  const [code, setCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);
  const [sendProgress, setSendProgress] = useState<TransferProgress | null>(null);
  const [sendStatus, setSendStatus] = useState('');
  const [sendError, setSendError] = useState('');

  // receive state
  const [codeInput, setCodeInput] = useState('');
  const [recvPhase, setRecvPhase] = useState<RecvPhase>('idle');
  const [recvMeta, setRecvMeta] = useState<FileMeta | null>(null);
  const [recvProgress, setRecvProgress] = useState<TransferProgress | null>(null);
  const [recvStatus, setRecvStatus] = useState('');
  const [recvError, setRecvError] = useState('');

  const senderRef = useRef<Awaited<ReturnType<typeof createSenderPC>> | null>(null);
  const stopPollRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetSend = useCallback(() => {
    stopPollRef.current?.();
    senderRef.current?.close();
    senderRef.current = null;
    stopPollRef.current = null;
    setFile(null);
    setSendPhase('idle');
    setCode('');
    setCodeCopied(false);
    setSendProgress(null);
    setSendStatus('');
    setSendError('');
  }, []);

  const resetRecv = useCallback(() => {
    setCodeInput('');
    setRecvPhase('idle');
    setRecvMeta(null);
    setRecvProgress(null);
    setRecvStatus('');
    setRecvError('');
  }, []);

  // auto-generate offer + session when file is picked
  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    (async () => {
      setSendPhase('connecting');
      try {
        const sender = await createSenderPC(
          p => { setSendProgress(p); setSendStatus(`${fmtBytes(p.sent)} / ${fmtBytes(p.total)}`); },
          () => setSendPhase('done'),
          msg => { setSendError(msg); setSendPhase('error'); },
        );
        if (cancelled) { sender.close(); return; }
        sender.setFile(file);
        senderRef.current = sender;

        const sessionCode = await createSession(sender.offerCode);
        if (cancelled) return;

        setCode(sessionCode);
        setSendPhase('code-ready');

        const stop = pollForAnswer(
          sessionCode,
          async answer => {
            if (cancelled) return;
            setSendPhase('waiting');
            try {
              await senderRef.current?.connect(answer);
              setSendPhase('transferring');
            } catch (e) {
              setSendError(e instanceof Error ? e.message : String(e));
              setSendPhase('error');
            }
          },
          msg => { setSendError(msg); setSendPhase('error'); },
        );
        stopPollRef.current = stop;
      } catch (e) {
        if (!cancelled) {
          setSendError(e instanceof Error ? e.message : String(e));
          setSendPhase('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [file]);

  const handleFile = (f: File) => {
    resetSend();
    setFile(f);
  };

  const copyCode = async () => {
    await copyToClipboard(code);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  };

  // receive: fetch offer by code and generate answer
  const joinSession = async () => {
    const trimmed = codeInput.trim().toLowerCase();
    setRecvPhase('fetching');
    try {
      const { offer } = await fetchSession(trimmed);
      if (!offer) { setRecvError('Session not found or expired.'); setRecvPhase('error'); return; }

      const receiver = await createReceiverPC(
        offer,
        meta => { setRecvMeta(meta); setRecvStatus(`Receiving: ${meta.name} (${fmtBytes(meta.size)})`); },
        p => setRecvProgress(p),
        (blob, name) => {
          const url = URL.createObjectURL(blob);
          const a = Object.assign(document.createElement('a'), { href: url, download: name });
          document.body.appendChild(a); a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
          setRecvPhase('done');
          setRecvStatus(`Saved — ${name}`);
        },
        msg => { setRecvError(msg); setRecvPhase('error'); },
      );

      await submitAnswer(trimmed, receiver.answerCode);
      setRecvPhase('receiving');
      setRecvStatus('Waiting for sender to connect…');
    } catch (e) {
      setRecvError(e instanceof Error ? e.message : String(e));
      setRecvPhase('error');
    }
  };

  const switchMode = (m: Mode) => setMode(m);

  const sendPct = sendPhase === 'done' ? 100 : sendProgress?.pct ?? 0;
  const recvPct = recvPhase === 'done' ? 100 : recvProgress?.pct ?? 0;

  return (
    <>
      <header>
        <div className="logo">dr<span>op</span></div>
        <div className="tagline">browser · to · browser · no upload · no login</div>
      </header>

      <div className="card">
        <div className="badge">
          <i className="ti ti-shield-lock" style={{ fontSize: 11 }} />
          end-to-end encrypted
        </div>

        <div className="role-tabs">
          <button className={`tab ${mode === 'send' ? 'active' : ''}`} onClick={() => switchMode('send')}>
            <i className="ti ti-upload" style={{ fontSize: 13, marginRight: 4 }} /> Send a file
          </button>
          <button className={`tab ${mode === 'receive' ? 'active' : ''}`} onClick={() => switchMode('receive')}>
            <i className="ti ti-download" style={{ fontSize: 13, marginRight: 4 }} /> Receive a file
          </button>
        </div>

        {mode === 'send' ? (
          <div>
            {/* Step 1: pick file */}
            <div className="step">
              <div className={`step-num ${sendPhase !== 'idle' ? 'done' : ''}`}>
                {sendPhase !== 'idle'
                  ? <i className="ti ti-check" style={{ fontSize: 12 }} />
                  : '1'}
              </div>
              <div className="step-content">
                <div className="step-label">Pick a file</div>
                {file ? (
                  <div className="file-preview mt2">
                    <i className={`ti ${fileIcon(file.name)}`} />
                    <div className="file-info">
                      <div className="file-name">{file.name}</div>
                      <div className="file-size">{fmtBytes(file.size)}</div>
                    </div>
                    <button className="remove" onClick={resetSend} aria-label="Remove file">
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`drop-zone ${dragover ? 'dragover' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragover(true); }}
                    onDragLeave={() => setDragover(false)}
                    onDrop={e => { e.preventDefault(); setDragover(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                    role="button" tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                  >
                    <i className="ti ti-cloud-upload" />
                    <p><strong>Click to browse</strong> or drag &amp; drop</p>
                    <p style={{ fontSize: 11, marginTop: 4, color: 'var(--muted)' }}>any file type · no size limit</p>
                  </div>
                )}
                <input ref={fileInputRef} type="file" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
              </div>
            </div>

            {/* Step 2: share code */}
            <div className={`step ${sendPhase === 'idle' ? 'dimmed' : ''}`}>
              <div className={`step-num ${sendPhase === 'code-ready' || sendPhase === 'waiting' || sendPhase === 'transferring' || sendPhase === 'done' ? 'done' : ''}`}>
                {sendPhase === 'connecting'
                  ? <i className="ti ti-refresh pulse" style={{ fontSize: 11 }} />
                  : sendPhase === 'code-ready' || sendPhase === 'waiting' || sendPhase === 'transferring' || sendPhase === 'done'
                  ? <i className="ti ti-check" style={{ fontSize: 12 }} />
                  : '2'}
              </div>
              <div className="step-content">
                <div className="step-label">
                  Share this code
                  <span className="step-sub">Send it to the receiver — they&apos;ll enter it to connect</span>
                </div>
                {sendPhase === 'connecting' ? (
                  <div className="offer-box" style={{ color: 'var(--muted)' }}>generating…</div>
                ) : (
                  <div className="offer-box" style={{ fontSize: 22, fontFamily: 'var(--mono)', letterSpacing: '0.08em', color: 'var(--text)', textAlign: 'center', padding: '14px 12px' }}>
                    {code || '—'}
                  </div>
                )}
                <button className="primary" onClick={copyCode} disabled={!code}>
                  <i className={`ti ${codeCopied ? 'ti-check' : 'ti-copy'}`} />
                  {codeCopied ? 'Copied!' : 'Copy code'}
                </button>
              </div>
            </div>

            {/* Step 3: status */}
            {(sendPhase === 'waiting' || sendPhase === 'transferring' || sendPhase === 'done' || sendPhase === 'error') && (
              <div className="step">
                <div className="step-num done">
                  {sendPhase === 'done'
                    ? <i className="ti ti-check" style={{ fontSize: 12 }} />
                    : sendPhase === 'error'
                    ? <i className="ti ti-x" style={{ fontSize: 12 }} />
                    : <i className="ti ti-refresh pulse" style={{ fontSize: 11 }} />}
                </div>
                <div className="step-content">
                  <div className="step-label">
                    {sendPhase === 'waiting' ? 'Waiting for receiver…'
                      : sendPhase === 'transferring' ? 'Transferring'
                      : sendPhase === 'done' ? 'Transfer complete'
                      : 'Error'}
                  </div>
                  {(sendPhase === 'transferring' || sendPhase === 'done') && (
                    <>
                      <div className="progress-wrap">
                        <div className={`progress-bar ${sendPhase === 'done' ? 'done' : ''}`}
                          style={{ width: `${sendPct}%` }} role="progressbar"
                          aria-valuenow={sendPct} aria-valuemin={0} aria-valuemax={100} />
                      </div>
                      <div className="info-row">
                        <span>{sendPhase === 'done' ? 'Done — file received on the other end.' : sendStatus}</span>
                        <span>{sendPct}%</span>
                      </div>
                    </>
                  )}
                  {sendPhase === 'error' && (
                    <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>{sendError}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Step 1: enter code */}
            <div className="step">
              <div className={`step-num ${recvPhase !== 'idle' && recvPhase !== 'error' ? 'done' : ''}`}>
                {recvPhase !== 'idle' && recvPhase !== 'error'
                  ? <i className="ti ti-check" style={{ fontSize: 12 }} />
                  : '1'}
              </div>
              <div className="step-content">
                <div className="step-label">Enter the sender&apos;s code</div>
                <input
                  type="text"
                  placeholder="fox-green-apple"
                  value={codeInput}
                  onChange={e => setCodeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && codeInput.trim().length > 3) joinSession(); }}
                  disabled={recvPhase !== 'idle' && recvPhase !== 'error'}
                  style={{
                    width: '100%', background: 'var(--bg)', border: '0.5px solid var(--border-hi)',
                    borderRadius: 10, color: 'var(--text)', fontFamily: 'var(--mono)',
                    fontSize: 18, padding: '10px 12px', outline: 'none', letterSpacing: '0.06em',
                    marginBottom: 10,
                  }}
                />
                {recvError && <p style={{ color: 'var(--red)', fontSize: 12, marginBottom: 8 }}>{recvError}</p>}
                <button className="primary" onClick={joinSession}
                  disabled={codeInput.trim().length < 4 || (recvPhase !== 'idle' && recvPhase !== 'error')}>
                  {recvPhase === 'fetching'
                    ? <><i className="ti ti-refresh pulse" /> Connecting…</>
                    : <><i className="ti ti-plug-connected" /> Connect</>}
                </button>
              </div>
            </div>

            {/* Step 2: receive */}
            {(recvPhase === 'receiving' || recvPhase === 'done') && (
              <div className="step">
                <div className="step-num done">
                  {recvPhase === 'done'
                    ? <i className="ti ti-check" style={{ fontSize: 12 }} />
                    : <i className="ti ti-refresh pulse" style={{ fontSize: 11 }} />}
                </div>
                <div className="step-content">
                  <div className="step-label">{recvPhase === 'done' ? 'File received!' : recvMeta ? `Receiving ${recvMeta.name}` : 'Waiting for file'}</div>
                  <div className="progress-wrap">
                    <div className={`progress-bar ${recvPhase === 'done' ? 'done' : ''}`}
                      style={{ width: `${recvPct}%` }} role="progressbar"
                      aria-valuenow={recvPct} aria-valuemin={0} aria-valuemax={100} />
                  </div>
                  <div className="info-row">
                    <span>{recvStatus}</span>
                    <span>{recvPct ? `${recvPct}%` : ''}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* How it works */}
      <div className="card" style={{ maxWidth: 520 }}>
        <div className="card-title"><i className="ti ti-info-circle" /> how it works</div>
        <div className="how-grid">
          <div className="how-item">
            <i className="ti ti-arrows-left-right" />
            <strong>Direct transfer</strong>
            Files go browser to browser via WebRTC. Nothing touches a server.
          </div>
          <div className="how-item">
            <i className="ti ti-shield-lock" />
            <strong>Encrypted</strong>
            WebRTC uses DTLS-SRTP, encrypted by default, always.
          </div>
          <div className="how-item">
            <i className="ti ti-user-off" />
            <strong>No account</strong>
            No login, no tracking, no upload limits, no expiry.
          </div>
        </div>
      </div>

      <footer>drop · webrtc p2p · no server · open source</footer>
    </>
  );
}
