// Browser voice interview against a self-hosted Dograh, reached through this server's /dograh proxy.
//   1. POST {api}/api/v1/public/embed/init         embed token + interview context -> session token
//   2. RTCPeerConnection with the microphone, through TURN relays when available
//   3. WS {api}/api/v1/ws/public/signaling/{token}  offer/answer, ICE trickle, live transcript, call-ended
// Each session reports exactly one outcome: `end` (the interview happened) or `error` (it never connected).

export type TranscriptEvent = { role: 'agent'; text: string; delta: true } | { role: 'candidate'; text: string; final: boolean };
export interface SessionEvents {
  live?: () => void;
  end?: () => void;
  error?: (e: Error) => void;
  transcript?: (e: TranscriptEvent) => void;
  speaking?: (talking: boolean) => void;
}

export class DograhSession {
  private pc: RTCPeerConnection | null = null;
  private ws: WebSocket | null = null;
  private audio: HTMLAudioElement | null = null;
  private dropTimer: ReturnType<typeof setTimeout> | undefined;
  private isLive = false;
  private finished = false;
  stream: MediaStream | null = null;

  constructor(private opts: { api: string; token: string; context: Record<string, unknown>; iceServers?: RTCIceServer[] }, private on: SessionEvents) {}

  async start() {
    try {
      const api = this.opts.api.replace(/\/+$/, '');
      const r = await fetch(`${api}/api/v1/public/embed/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: this.opts.token, context_variables: this.opts.context }) });
      if (!r.ok) throw new Error(`The interview service refused to start (${r.status})`);
      const session = await r.json();
      if (this.finished) return;

      if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser cannot use a microphone here. Open the page over https.');
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      if (this.finished) { this.stream.getTracks().forEach(t => t.stop()); return; }

      // Dograh in Docker is only reachable through a TURN relay, so collect every relay we can get.
      const iceServers: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302'] }];
      try {
        const tr = await fetch(`${api}/api/v1/public/embed/turn-credentials/${encodeURIComponent(session.session_token)}`);
        if (tr.ok) { const c = await tr.json(); if (c.uris?.length) iceServers.push({ urls: c.uris, username: c.username, credential: c.password }); }
      } catch { /* no TURN on this Dograh */ }
      iceServers.push(...(this.opts.iceServers || []));
      if (this.finished) { this.cleanup(); return; }

      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;
      this.stream.getTracks().forEach(t => pc.addTrack(t, this.stream!));
      this.audio = Object.assign(document.createElement('audio'), { autoplay: true });
      this.audio.style.display = 'none';
      document.body.appendChild(this.audio);
      pc.addEventListener('track', e => { if (e.track.kind === 'audio' && this.audio) { this.audio.srcObject = e.streams[0]; this.audio.play().catch(() => {}); } });
      pc.addEventListener('iceconnectionstatechange', () => {
        const st = pc.iceConnectionState;
        if (st === 'connected' || st === 'completed') { clearTimeout(this.dropTimer); if (!this.isLive) { this.isLive = true; this.on.live?.(); } }
        if (st === 'failed' || st === 'closed') this.isLive ? this.end() : this.fail(new Error('The voice connection failed'));
        // A short network blip shows as disconnected and usually recovers.
        if (st === 'disconnected') { clearTimeout(this.dropTimer); this.dropTimer = setTimeout(() => { if (this.pc === pc && pc.iceConnectionState === 'disconnected') this.isLive ? this.end() : this.fail(new Error('The voice connection dropped')); }, 6000); }
      });

      const ws = new WebSocket(`${api.replace(/^http/, 'ws')}/api/v1/ws/public/signaling/${encodeURIComponent(session.session_token)}`);
      this.ws = ws;
      const pcId = crypto.randomUUID?.() || String(Math.random());
      let offerSent = false;
      pc.addEventListener('icecandidate', e => {
        if (!offerSent || !e.candidate || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'ice-candidate', payload: { pc_id: pcId, candidate: { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex } } }));
      });
      ws.onopen = async () => {
        await pc.setLocalDescription(await pc.createOffer());
        // Give gathering (including the relay candidate) up to 3 s so the offer carries the candidates.
        if (pc.iceGatheringState !== 'complete') await new Promise<void>(res => { const t = setTimeout(res, 3000); pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } }); });
        offerSent = true;
        ws.send(JSON.stringify({ type: 'offer', payload: { sdp: pc.localDescription!.sdp, type: 'offer', pc_id: pcId, workflow_id: session.config?.workflow_id, workflow_run_id: session.workflow_run_id, call_context_vars: this.opts.context } }));
      };
      ws.onmessage = async ev => {
        let m: any; try { m = JSON.parse(ev.data); } catch { return; }
        const p = m.payload || {};
        if (m.type === 'answer' && p.sdp) await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp }).catch(e => this.fail(e));
        else if (m.type === 'ice-candidate' && p.candidate) await pc.addIceCandidate(p.candidate).catch(() => {});
        else if (m.type === 'rtf-bot-text') this.on.transcript?.({ role: 'agent', text: p.text || '', delta: true });
        else if (m.type === 'rtf-user-transcription') this.on.transcript?.({ role: 'candidate', text: p.text || '', final: !!p.final });
        else if (m.type === 'rtf-bot-started-speaking') this.on.speaking?.(true);
        else if (m.type === 'rtf-bot-stopped-speaking') this.on.speaking?.(false);
        else if (m.type === 'call-ended') this.isLive ? this.end() : this.fail(new Error('The interview ended before it connected'));
        else if (m.type === 'error' && !this.isLive) this.fail(new Error(p.message || 'The interview service reported an error'));
      };
      ws.onerror = () => this.fail(new Error('Could not reach the interview service'));
      ws.onclose = () => (this.isLive ? this.end() : this.fail(new Error('The interview service closed the connection')));
    } catch (e) { this.fail(e instanceof Error ? e : new Error(String(e))); }
  }

  setMuted(muted: boolean) { this.stream?.getAudioTracks().forEach(t => { t.enabled = !muted; }); }
  /** Tear down without reporting an outcome (the component that owns the session went away). */
  dispose() { this.finished = true; this.cleanup(); }
  /** Closing signaling makes Dograh end the run, so the result webhook still scores the interview. */
  hangUp() { this.end(); }

  private cleanup() {
    clearTimeout(this.dropTimer);
    if (this.ws) this.ws.onclose = this.ws.onerror = this.ws.onmessage = null;
    try { this.ws?.close(); } catch { /* already closed */ }
    try { this.pc?.close(); } catch { /* already closed */ }
    this.stream?.getTracks().forEach(t => t.stop());
    this.audio?.remove();
    this.pc = this.ws = this.audio = null;
  }
  private fail(e: Error) { if (this.finished) return; this.finished = true; this.cleanup(); this.on.error?.(e); }
  private end() { if (this.finished) return; this.finished = true; this.cleanup(); this.on.end?.(); }
}
