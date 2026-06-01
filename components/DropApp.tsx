'use client';

import { useRef, useState, useCallback } from 'react';
import { createSenderPC, createReceiverPC, type FileMeta, type TransferProgress } from '@/lib/webrtc';
import { fmtBytes, fileIcon, esc } from '@/lib/utils';

type Mode = 'send' | 'receive';

interface SendState {
  offerCode: string | null;
  copied: boolean;
  answerInput: string;
  progress: TransferProgress | null;
  done: boolean;
  status: string;
  error: string | null;
}

interface ReceiveState {
  offerInput: string;
  answerCode: string | null;
  copied: boolean;
  meta: FileMeta | null;
  progress: TransferProgress | null;
  done: boolean;
  status: string;
  error: string | null;
}

export default function DropApp() {
  const [mode, setMode] = useState<Mode>('send');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragover, setDragover] = useState(false);

  const [send, setSend] = useState<SendState>({
    offerCode: null, copied: false, answerInput: '',
    progress: null, done: false, status: '', error: null,
  });
  const [recv, setRecv] = useState<ReceiveState>({
    offerInput: '', answerCode: null, copied: false,
    meta: null, progress: null, done: false, status: 'Connected — waiting for sender…', error: null,
  });

  const senderRef = useRef<Awaited<ReturnType<typeof createSenderPC>> | null>(null);
  const receiverRef = useRef<{ answerCode: string; close: () => void } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetSender = useCallback(() => {
    senderRef.current?.close();
    senderRef.current = null;
    setSelectedFile(null);
    setSend({ offerCode: null, copied: false, answerInput: '', progress: null, done: false, status: '', error: null });
  }, []);

  const resetReceiver = useCallback(() => {
    receiverRef.current?.close();
    receiverRef.current = null;
    setRecv({ offerInput: '', answerCode: null, copied: false, meta: null, progress: null, done: false, status: 'Connected — waiting for sender…', error: null });
  }, []);

  const switchMode = (m: Mode) => {
    setMode(m);
    resetSender();
    resetReceiver();
  };

  // ── file handling ──
  const handleFile = async (file: File) => {
    setSelectedFile(file);
    senderRef.current?.close();

    const sender = await createSenderPC(
      p => setSend(s => ({ ...s, progress: p, status: `${fmtBytes(p.sent)} / ${fmtBytes(p.total)}` })),
      () => setSend(s => ({ ...s, done: true, status: 'Done — file received on the other end.' })),
      msg => setSend(s => ({ ...s, error: msg })),
    );
    sender.setFile(file);
    senderRef.current = sender;
    setSend(s => ({ ...s, offerCode: sender.offerCode }));
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragover(false);
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  // ── sender actions ──
  const copyOffer = async () => {
    if (!send.offerCode) return;
    await navigator.clipboard.writeText(send.offerCode);
    setSend(s => ({ ...s, copied: true }));
    setTimeout(() => setSend(s => ({ ...s, copied: false })), 2000);
  };

  const connectSender = async () => {
    try {
      await senderRef.current?.connect(send.answerInput.trim());
      setSend(s => ({ ...s, status: 'Connecting…' }));
    } catch {
      setSend(s => ({ ...s, error: 'Invalid answer code — make sure you pasted the full code from the receiver.' }));
    }
  };

  // ── receiver actions ──
  const generateAnswer = async () => {
    try {
      const receiver = await createReceiverPC(
        recv.offerInput.trim(),
        meta => setRecv(s => ({ ...s, meta, status: `Receiving: ${esc(meta.name)} (${fmtBytes(meta.size)})` })),
        p => setRecv(s => ({ ...s, progress: p })),
        (blob, name) => {
          const url = URL.createObjectURL(blob);
          const a = Object.assign(document.createElement('a'), { href: url, download: name });
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 2000);
          setRecv(s => ({ ...s, done: true, status: `Saved to your downloads — ${name}` }));
        },
        msg => setRecv(s => ({ ...s, error: msg })),
      );
      receiverRef.current = receiver;
      setRecv(s => ({ ...s, answerCode: receiver.answerCode }));
    } catch {
      setRecv(s => ({ ...s, error: 'Invalid offer code — paste the full code from the sender.' }));
    }
  };

  const copyAnswer = async () => {
    if (!recv.answerCode) return;
    await navigator.clipboard.writeText(recv.answerCode);
    setRecv(s => ({ ...s, copied: true }));
    setTimeout(() => setRecv(s => ({ ...s, copied: false })), 2000);
  };

  // ── render ──
  const transferring = send.progress !== null || send.done;

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
              <div className="step-num">1</div>
              <div className="step-content">
                <div className="step-label">Pick a file</div>
                {selectedFile ? (
                  <div className="file-preview mt2">
                    <i className={`ti ${fileIcon(selectedFile.name)}`} />
                    <div className="file-info">
                      <div className="file-name">{selectedFile.name}</div>
                      <div className="file-size">{fmtBytes(selectedFile.size)}</div>
                    </div>
                    <button className="remove" onClick={resetSender} aria-label="Remove file">
                      <i className="ti ti-x" />
                    </button>
                  </div>
                ) : (
                  <div
                    className={`drop-zone ${dragover ? 'dragover' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragover(true); }}
                    onDragLeave={() => setDragover(false)}
                    onDrop={onDrop}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
                    aria-label="Click to pick a file or drag and drop"
                  >
                    <i className="ti ti-cloud-upload" />
                    <p><strong>Click to browse</strong> or drag &amp; drop</p>
                    <p style={{ fontSize: 11, marginTop: 4, color: 'var(--muted)' }}>any file type · no size limit</p>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                />
              </div>
            </div>

            {/* Step 2: copy offer */}
            <div className={`step ${!send.offerCode ? 'dimmed' : ''}`}>
              <div className="step-num">2</div>
              <div className="step-content">
                <div className="step-label">
                  Copy your offer code
                  <span className="step-sub">Share this with the receiver — paste it in chat, email, anything</span>
                </div>
                <div className="offer-box">{send.offerCode ?? '— pick a file first —'}</div>
                <button className="primary" onClick={copyOffer} disabled={!send.offerCode}>
                  <i className={`ti ${send.copied ? 'ti-check' : 'ti-copy'}`} />
                  {send.copied ? 'Copied!' : 'Copy offer code'}
                </button>
              </div>
            </div>

            {/* Step 3: paste answer */}
            <div className={`step ${!send.copied && !send.answerInput ? 'dimmed' : ''}`}>
              <div className="step-num">3</div>
              <div className="step-content">
                <div className="step-label">Paste the receiver&apos;s answer code</div>
                <textarea
                  rows={3}
                  placeholder="paste answer code here…"
                  value={send.answerInput}
                  onChange={e => setSend(s => ({ ...s, answerInput: e.target.value }))}
                  aria-label="Receiver answer code"
                />
                {send.error && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{send.error}</p>}
                <button
                  className="primary mt"
                  onClick={connectSender}
                  disabled={send.answerInput.trim().length < 20}
                >
                  <i className="ti ti-plug-connected" /> Connect &amp; send
                </button>
              </div>
            </div>

            {/* Step 4: transfer */}
            {transferring && (
              <div className="step">
                <div className="step-num done">
                  {send.done
                    ? <i className="ti ti-check" style={{ fontSize: 12 }} />
                    : <i className="ti ti-refresh pulse" style={{ fontSize: 11 }} />}
                </div>
                <div className="step-content">
                  <div className="step-label">{send.done ? 'Transfer complete' : 'Transferring'}</div>
                  <div className="progress-wrap">
                    <div
                      className={`progress-bar ${send.done ? 'done' : ''}`}
                      style={{ width: `${send.done ? 100 : (send.progress?.pct ?? 0)}%` }}
                      role="progressbar"
                      aria-valuenow={send.progress?.pct ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <div className="info-row">
                    <span style={{ color: send.error ? 'var(--red)' : undefined }}>{send.status}</span>
                    <span>{send.done ? '100%' : `${send.progress?.pct ?? 0}%`}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Step 1: paste offer */}
            <div className="step">
              <div className="step-num done">1</div>
              <div className="step-content">
                <div className="step-label">Paste the sender&apos;s offer code</div>
                <textarea
                  rows={3}
                  placeholder="paste offer code here…"
                  value={recv.offerInput}
                  onChange={e => setRecv(s => ({ ...s, offerInput: e.target.value }))}
                  aria-label="Sender offer code"
                />
                {recv.error && <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 6 }}>{recv.error}</p>}
                <button
                  className="primary mt"
                  onClick={generateAnswer}
                  disabled={recv.offerInput.trim().length < 20}
                >
                  <i className="ti ti-qrcode" /> Generate answer code
                </button>
              </div>
            </div>

            {/* Step 2: copy answer */}
            <div className={`step ${!recv.answerCode ? 'dimmed' : ''}`}>
              <div className="step-num">2</div>
              <div className="step-content">
                <div className="step-label">
                  Copy your answer code
                  <span className="step-sub">Send this back to the sender</span>
                </div>
                <div className="offer-box">{recv.answerCode ?? '— paste the offer first —'}</div>
                <button className="primary" onClick={copyAnswer} disabled={!recv.answerCode}>
                  <i className={`ti ${recv.copied ? 'ti-check' : 'ti-copy'}`} />
                  {recv.copied ? 'Copied!' : 'Copy answer code'}
                </button>
              </div>
            </div>

            {/* Step 3: receive */}
            {recv.answerCode && (
              <div className="step">
                <div className="step-num done">
                  {recv.done
                    ? <i className="ti ti-check" style={{ fontSize: 12 }} />
                    : <i className="ti ti-refresh pulse" style={{ fontSize: 11 }} />}
                </div>
                <div className="step-content">
                  <div className="step-label">{recv.done ? 'File received!' : 'Waiting for file'}</div>
                  <div className="progress-wrap">
                    <div
                      className={`progress-bar ${recv.done ? 'done' : ''}`}
                      style={{ width: `${recv.done ? 100 : (recv.progress?.pct ?? 0)}%` }}
                      role="progressbar"
                      aria-valuenow={recv.progress?.pct ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                    />
                  </div>
                  <div className="info-row">
                    <span>{recv.status}</span>
                    <span>{recv.done ? '100%' : recv.progress ? `${recv.progress.pct}%` : ''}</span>
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
            Files go browser → browser via WebRTC. Nothing touches a server.
          </div>
          <div className="how-item">
            <i className="ti ti-shield-lock" />
            <strong>Encrypted</strong>
            WebRTC uses DTLS-SRTP — encrypted by default, always.
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
