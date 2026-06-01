import { sleep } from './utils';

const CHUNK = 64 * 1024;
const STUN: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

async function compress(data: string): Promise<string> {
  const stream = new Blob([data]).stream()
    .pipeThrough(new CompressionStream('deflate-raw'));
  const buf = await new Response(stream).arrayBuffer();
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

async function decompress(b64: string): Promise<string> {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

export interface FileMeta {
  name: string;
  size: number;
  type: string;
}

export interface TransferProgress {
  sent: number;
  total: number;
  pct: number;
}

function gatherICE(pc: RTCPeerConnection): Promise<void> {
  return new Promise(res => {
    if (pc.iceGatheringState === 'complete') return res();
    const done = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', done);
        res();
      }
    };
    pc.addEventListener('icegatheringstatechange', done);
    setTimeout(res, 5000);
  });
}

export async function createSenderPC(onProgress: (p: TransferProgress) => void, onDone: () => void, onError: (msg: string) => void) {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  const dc = pc.createDataChannel('drop', { ordered: true });

  dc.onerror = e => onError((e as RTCErrorEvent).error?.message ?? 'connection failed');

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await gatherICE(pc);

  const offerCode = await compress(JSON.stringify(pc.localDescription));

  const sendFile = async (file: File) => {
    dc.send(JSON.stringify({ name: file.name, size: file.size, type: file.type }));
    const reader = file.stream().getReader();
    let sent = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      let off = 0;
      while (off < value.byteLength) {
        while (dc.bufferedAmount > 8 * 1024 * 1024) await sleep(20);
        const chunk = value.subarray(off, off + CHUNK);
        dc.send(chunk);
        off += chunk.byteLength;
        sent += chunk.byteLength;
        onProgress({ sent, total: file.size, pct: Math.round(sent / file.size * 100) });
      }
    }

    dc.send('__done__');
    onDone();
  };

  const connect = async (answerCode: string) => {
    dc.onopen = () => sendFile(file!);
    const answer = JSON.parse(await decompress(answerCode)) as RTCSessionDescriptionInit;
    if (answer.type !== 'answer') throw new Error('That looks like an offer code, not an answer code. Make sure you copied the answer code from the receiver tab.');
    await pc.setRemoteDescription(answer);
    if (dc.readyState === 'open') sendFile(file!);
  };

  let file: File | null = null;
  const setFile = (f: File) => { file = f; };

  return { offerCode, connect, setFile, close: () => { try { pc.close(); } catch (_) {} } };
}

export async function createReceiverPC(
  offerCode: string,
  onMeta: (meta: FileMeta) => void,
  onProgress: (p: TransferProgress) => void,
  onDone: (blob: Blob, name: string) => void,
  onError: (msg: string) => void,
) {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  let recvBuffers: ArrayBuffer[] = [];
  let recvSize = 0;
  let recvMeta: FileMeta | null = null;

  pc.ondatachannel = e => {
    const dc = e.channel;
    dc.binaryType = 'arraybuffer';
    dc.onerror = err => onError((err as RTCErrorEvent).error?.message ?? 'connection failed');
    dc.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data === 'string') {
        if (ev.data === '__done__') {
          const blob = new Blob(recvBuffers, { type: recvMeta?.type ?? 'application/octet-stream' });
          onDone(blob, recvMeta?.name ?? 'download');
        } else {
          try {
            recvMeta = JSON.parse(ev.data) as FileMeta;
            onMeta(recvMeta);
          } catch (_) {}
        }
      } else {
        recvBuffers.push(ev.data as ArrayBuffer);
        recvSize += (ev.data as ArrayBuffer).byteLength;
        if (recvMeta?.size) {
          onProgress({ sent: recvSize, total: recvMeta.size, pct: Math.round(recvSize / recvMeta.size * 100) });
        }
      }
    };
  };

  const offer = JSON.parse(await decompress(offerCode)) as RTCSessionDescriptionInit;
  if (offer.type !== 'offer') throw new Error('That looks like an answer code, not an offer code. Make sure you copied the offer code from the sender tab.');
  await pc.setRemoteDescription(offer);
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await gatherICE(pc);

  const answerCode = await compress(JSON.stringify(pc.localDescription));
  return { answerCode, close: () => { try { pc.close(); } catch (_) {} } };
}
