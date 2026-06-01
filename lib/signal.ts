export async function createSession(offer: string): Promise<string> {
  const res = await fetch('/api/signal', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ offer }),
  });
  if (!res.ok) throw new Error('Failed to create session');
  const { code } = await res.json();
  return code as string;
}

export async function fetchSession(code: string): Promise<{ offer?: string; answer?: string }> {
  const res = await fetch(`/api/signal/${code}`);
  if (!res.ok) throw new Error('Session not found');
  return res.json();
}

export async function submitAnswer(code: string, answer: string): Promise<void> {
  const res = await fetch(`/api/signal/${code}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) throw new Error('Failed to submit answer');
}

export function pollForAnswer(
  code: string,
  onAnswer: (answer: string) => void,
  onError: (msg: string) => void,
): () => void {
  let stopped = false;
  const poll = async () => {
    while (!stopped) {
      try {
        const { answer } = await fetchSession(code);
        if (answer) { onAnswer(answer); return; }
      } catch (e) {
        onError(e instanceof Error ? e.message : String(e));
        return;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  };
  poll();
  return () => { stopped = true; };
}
