// Dograh voice widget for the recruiting system.
// Implements the public embed flow against a self-hosted Dograh:
//   1. POST /api/v1/public/embed/init  (embed token + candidate context) -> session_token, workflow_run_id
//   2. RTCPeerConnection with the candidate's mic (through Dograh's TURN relay when it has one)
//   3. WS  /api/v1/ws/public/signaling/{session_token}  (offer/answer + ICE trickle, live transcript, call-ended)
// The AI screener talks through the returned audio track; the webhook fires to
// the recruiting server when the call ends.
// Script attributes: data-dograh-context (JSON call context), data-dograh-status="off" (no floating status pill).
(function () {
  'use strict';
  const script = document.currentScript;
  const params = new URLSearchParams((script && script.src || '').split('?')[1] || '');
  const API = (params.get('apiEndpoint') || 'http://localhost:8000').replace(/\/+$/, '');
  const TOKEN = params.get('token') || '';
  const SHOW_STATUS = !script || script.getAttribute('data-dograh-status') !== 'off';
  let CONTEXT = {};
  try { CONTEXT = JSON.parse((script && script.getAttribute('data-dograh-context')) || '{}'); } catch (e) { CONTEXT = {}; }

  const handlers = { end: [], error: [], ready: [], live: [], transcript: [], speaking: [] };
  // live: media connected. finished: this session already reported end or error (report only one).
  const state = { pc: null, ws: null, audio: null, stream: null, session: null, started: false, live: false, finished: false, dropTimer: null };

  function fire(kind, arg) { (handlers[kind] || []).forEach(fn => { try { fn(arg); } catch (e) { /* keep other handlers alive */ } }); }

  function status(msg) {
    if (!SHOW_STATUS) return;
    let el = document.getElementById('dograh-widget-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dograh-widget-status';
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:24px;z-index:99999;background:#111;color:#fff;font:14px/1.4 -apple-system,Segoe UI,sans-serif;padding:12px 18px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.35);display:flex;gap:10px;align-items:center;max-width:90vw;';
      document.body.appendChild(el);
    }
    el.innerHTML = '<span style="width:10px;height:10px;border-radius:50%;background:#ff4d4d;display:inline-block;flex:none;animation:dograh-pulse 1.2s infinite"></span><span>' + msg + '</span>';
    if (!document.getElementById('dograh-pulse-style')) {
      const s = document.createElement('style'); s.id = 'dograh-pulse-style';
      s.textContent = '@keyframes dograh-pulse{0%,100%{opacity:1}50%{opacity:.3}}';
      document.head.appendChild(s);
    }
  }

  // opts.iceServers: extra STUN/TURN servers (for example a public relay for candidates outside Dograh's network).
  async function start(opts) {
    if (state.started) return;
    state.started = true; state.live = false; state.finished = false;
    try {
      status('Connecting to the AI screener…');
      // 1. open an embed session on Dograh
      const r = await fetch(API + '/api/v1/public/embed/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: TOKEN, context_variables: CONTEXT }),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        throw new Error('Embed init failed (' + r.status + '): ' + t.slice(0, 200));
      }
      const session = await r.json();
      state.session = session;

      // 2. microphone
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser cannot use a microphone here (open the page over https or on localhost)');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      state.stream = stream;

      // 3. peer connection. Dograh in Docker is only reachable through its TURN relay,
      // so use it when the server has one (503 means TURN is off: STUN only).
      const iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
      try {
        const tr = await fetch(API + '/api/v1/public/embed/turn-credentials/' + encodeURIComponent(session.session_token));
        if (tr.ok) { const c = await tr.json(); if (c.uris && c.uris.length) iceServers.push({ urls: c.uris, username: c.username, credential: c.password }); }
      } catch (e) { /* no TURN, try direct */ }
      if (opts && Array.isArray(opts.iceServers)) iceServers.push(...opts.iceServers);
      const pc = new RTCPeerConnection({ iceServers });
      state.pc = pc;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const audio = document.createElement('audio');
      audio.autoplay = true;
      audio.style.display = 'none';
      document.body.appendChild(audio);
      state.audio = audio;
      pc.addEventListener('track', evt => {
        if (evt.track.kind === 'audio') { audio.srcObject = evt.streams[0]; audio.play().catch(() => {}); }
      });
      pc.addEventListener('iceconnectionstatechange', () => {
        const st = pc.iceConnectionState;
        if (st === 'connected' || st === 'completed') {
          clearTimeout(state.dropTimer);
          if (!state.live) { state.live = true; status('Live. Talk to the AI screener.'); fire('live'); }
        }
        if (st === 'failed') { state.live ? end() : fail(new Error('Voice connection failed')); }
        if (st === 'closed') { state.live ? end() : fail(new Error('Voice connection dropped before it started')); }
        // A short network blip shows as disconnected and usually recovers; give it a few seconds.
        if (st === 'disconnected') {
          clearTimeout(state.dropTimer);
          state.dropTimer = setTimeout(() => { if (state.pc === pc && pc.iceConnectionState === 'disconnected') { state.live ? end() : fail(new Error('Voice connection dropped')); } }, 6000);
        }
      });

      // 4. signaling websocket
      const wsUrl = API.replace(/^http/, 'ws') + '/api/v1/ws/public/signaling/' + encodeURIComponent(session.session_token);
      const ws = new WebSocket(wsUrl);
      state.ws = ws;
      const pcId = (crypto.randomUUID && crypto.randomUUID()) || String(Math.random());
      // Candidates gathered after the offer went out are trickled; earlier ones ride in the offer SDP.
      let offerSent = false;
      pc.addEventListener('icecandidate', evt => {
        if (!offerSent || !evt.candidate || ws.readyState !== WebSocket.OPEN) return;
        ws.send(JSON.stringify({ type: 'ice-candidate', payload: { pc_id: pcId, candidate: { candidate: evt.candidate.candidate, sdpMid: evt.candidate.sdpMid, sdpMLineIndex: evt.candidate.sdpMLineIndex } } }));
      });
      ws.onopen = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        // Give gathering (incl. the TURN relay candidate) up to 3s so the offer carries the candidates.
        if (pc.iceGatheringState !== 'complete') {
          await new Promise(res => {
            const t = setTimeout(res, 3000);
            pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
          });
        }
        offerSent = true;
        ws.send(JSON.stringify({
          type: 'offer',
          payload: {
            sdp: pc.localDescription.sdp,
            type: 'offer',
            pc_id: pcId,
            workflow_id: session.config && session.config.workflow_id,
            workflow_run_id: session.workflow_run_id,
            call_context_vars: CONTEXT,
          },
        }));
      };
      ws.onmessage = async ev => {
        let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
        const p = m.payload || {};
        if (m.type === 'answer' && p.sdp) {
          await pc.setRemoteDescription({ type: 'answer', sdp: p.sdp }).catch(e => fail(e));
        } else if (m.type === 'ice-candidate' && p.candidate) {
          try { await pc.addIceCandidate(p.candidate); } catch (e) { /* stale candidate */ }
        } else if (m.type === 'rtf-bot-text') {
          // Spoken text arrives in pieces, timed to playback.
          fire('transcript', { role: 'agent', text: p.text || '', delta: true });
        } else if (m.type === 'rtf-user-transcription') {
          fire('transcript', { role: 'candidate', text: p.text || '', final: !!p.final });
        } else if (m.type === 'rtf-bot-started-speaking') {
          fire('speaking', true);
        } else if (m.type === 'rtf-bot-stopped-speaking') {
          fire('speaking', false);
        } else if (m.type === 'call-ended') {
          // The agent hung up (end of the interview) or the call was stopped server side.
          state.live ? end() : fail(new Error('The call ended before it connected'));
        } else if (m.type === 'error' && !state.live) {
          fail(new Error(p.message || 'Dograh signaling error'));
        } else if (m.type === 'rtf-pipeline-error') {
          console.warn('Dograh pipeline error', p);
        }
      };
      ws.onerror = () => fail(new Error('Signaling websocket error'));
      // Dograh closes signaling when the call ends.
      ws.onclose = () => { state.live ? end() : fail(new Error('Signaling closed before connect')); };
      fire('ready');
    } catch (e) { fail(e); }
  }

  function cleanup() {
    clearTimeout(state.dropTimer);
    // Detach first so closing the socket or peer does not report a second outcome.
    if (state.ws) state.ws.onclose = state.ws.onerror = state.ws.onmessage = null;
    try { state.ws && state.ws.close(); } catch (e) {}
    try { state.pc && state.pc.close(); } catch (e) {}
    if (state.stream) state.stream.getTracks().forEach(t => t.stop());
    try { state.audio && state.audio.remove(); } catch (e) {}
    const el = document.getElementById('dograh-widget-status'); if (el) el.remove();
    state.pc = state.ws = state.audio = state.stream = null;
    state.started = false;
  }
  function fail(err) { if (state.finished) return; state.finished = true; cleanup(); fire('error', err); }
  function end() { if (state.finished) return; state.finished = true; cleanup(); fire('end'); }

  window.DograhWidget = {
    start,
    onCallEnd: fn => handlers.end.push(fn),
    onError: fn => handlers.error.push(fn),
    onReady: fn => handlers.ready.push(fn),
    onLive: fn => handlers.live.push(fn),
    // { role: 'agent', text, delta: true } pieces of the AI's speech, or { role: 'candidate', text, final } live captions.
    onTranscript: fn => handlers.transcript.push(fn),
    // true while the AI is talking.
    onSpeaking: fn => handlers.speaking.push(fn),
    // The candidate's microphone stream, for a level meter.
    localStream: () => state.stream,
    setMuted: muted => { if (state.stream) state.stream.getAudioTracks().forEach(t => { t.enabled = !muted; }); },
    // Closing signaling makes Dograh end the run, so the webhook still scores the interview.
    hangUp: () => end(),
  };
})();
