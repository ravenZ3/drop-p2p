# drop

Browser-to-browser file transfer. No upload, no login, no server ever sees your file.

**Live:** https://drop-p2p.vercel.app

---

## How it works

```
Sender                    Vercel KV              Receiver
  |                           |                      |
  |-- POST /api/signal ------>|                      |
  |   (compressed SDP offer)  |                      |
  |<-- { code: "fox-green-apple" }                   |
  |                           |                      |
  |   [share code out of band]|                      |
  |                           |<-- GET /api/signal --|
  |                           |    /fox-green-apple  |
  |                           |-- { offer } -------->|
  |                           |                      |-- generate SDP answer
  |                           |<-- PATCH /api/signal-|
  |                           |    /fox-green-apple  |
  |                           |   (answer SDP)       |
  |<-- poll detects answer ---|                      |
  |                           |                      |
  |========= WebRTC DataChannel (direct P2P) ========|
  |                    file bytes                     |
```

The server handles only the WebRTC handshake (SDP offer/answer exchange). File bytes travel directly between browsers over an encrypted WebRTC DataChannel. The signaling session expires after 10 minutes.

---

## Why WebRTC over a relay

A naive file transfer would upload to a server and let the recipient download. That means:
- The file is stored somewhere, creating a privacy surface
- Transfer speed is capped at 2x your upload bandwidth (up to server, server to them)
- Cost scales with bytes transferred

WebRTC DataChannels give you a direct encrypted pipe between two browsers. The server never buffers the file. Transfer speed is limited only by the bottleneck of the two peers' connection, not a server in the middle.

The tradeoff: WebRTC requires a handshake (SDP exchange) and fails on ~15-20% of networks with symmetric NAT or strict firewalls where no TURN fallback is configured (known limitation).

---

## Why KV over a database

The signaling data (SDP offer/answer) is:
- Small (~1-2KB compressed)
- Ephemeral (useless after connection is established)
- Accessed exactly twice per session (write offer, write answer)
- Read at most a few times (polling)

A relational database would be overkill: you'd need schema migrations, connection pooling, and indexes on data that expires in 10 minutes. A KV store with TTL handles this in one line per operation.

---

## Why 3-word codes

The SDP (Session Description Protocol) payload is ~4-5KB of verbose text. Raw base64-encoding it produces an ~800-character string users would have to copy, paste, and pray they didn't truncate. Three words are:
- Human-readable and verbally shareable
- Short enough to type manually if needed
- Enough entropy (~200^3 = 8M combinations) for a 10-minute ephemeral session

The SDP is still compressed with DeflateRaw before being stored, reducing it ~70% from its raw size.

---

## Architecture

```
drop-p2p/
├── app/
│   ├── api/
│   │   └── signal/
│   │       ├── route.ts          POST : create session, store offer, return code
│   │       └── [code]/route.ts   GET  : fetch session | PATCH: submit answer
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   └── DropApp.tsx               "use client": all UI state, polling, WebRTC lifecycle
├── lib/
│   ├── kv.ts                     Upstash Redis in prod, in-memory globalThis store in dev
│   ├── signal.ts                 API client (createSession, fetchSession, submitAnswer, pollForAnswer)
│   ├── webrtc.ts                 RTCPeerConnection setup, SDP compression, chunked send/receive
│   ├── utils.ts                  fmtBytes, fileIcon, esc, sleep
│   └── words.ts                  ~250-word list, randomCode() generates "fox-green-apple"
└── vercel.json                   security headers (CSP, X-Frame-Options, Referrer-Policy)
```

---

## Signaling API

| Method | Path | Body | Response |
|--------|------|------|----------|
| POST | `/api/signal` | `{ offer: string }` | `{ code: string }` |
| GET | `/api/signal/:code` | | `{ offer: string, answer?: string }` |
| PATCH | `/api/signal/:code` | `{ answer: string }` | `{ ok: true }` |

Sessions expire after 600 seconds. The sender polls GET at 1.5s intervals until an answer appears, then calls `RTCPeerConnection.setRemoteDescription()` and the DataChannel opens.

---

## File transfer protocol

Once the WebRTC DataChannel is open:

1. Sender transmits a JSON metadata frame: `{ name, size, type }`
2. Sender streams the file in 64KB chunks, backpressuring when `dc.bufferedAmount > 8MB`
3. Sender sends the string sentinel `__done__`
4. Receiver reconstructs the file from buffers, triggers a browser download

Chunk size (64KB) is a tradeoff between overhead-per-message and memory pressure. Larger chunks reduce framing overhead but increase the backpressure pause window. The 8MB buffer threshold prevents the DataChannel from dropping messages under fast senders.

---

## Known limitations

- **No TURN fallback**: connections fail silently on symmetric NAT (common in corporate networks). A TURN server would fix this at the cost of potentially relaying file data through a server.
- **No resume**: if the connection drops mid-transfer, you start over. Chunk sequence numbers and a handshake protocol would enable resumption.
- **Single file**: no queuing or parallel transfers.
- **No rate limiting**: the signaling API has no IP-based throttling.

---

## Running locally

```bash
npm install
npm run dev
```

No environment variables needed for local dev: the KV store falls back to an in-memory `globalThis` singleton that survives Next.js hot reloads.

For production, the app uses Upstash Redis via Vercel Marketplace. Environment variables (`KV_REST_API_URL`, `KV_REST_API_TOKEN`) are provisioned automatically by the integration.

---

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Upstash Redis** via Vercel Marketplace (signaling KV store)
- **WebRTC DataChannels** (file transfer)
- **DeflateRaw** via CompressionStream API (SDP compression, zero dependencies)
