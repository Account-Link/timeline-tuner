// Mock WebRTC implementation for Vercel deployment

class MockRTCPeerConnection extends EventTarget {
  constructor() {
    super();
    this.localDescription = null;
    this.remoteDescription = null;
    this.signalingState = 'stable';
    this.iceConnectionState = 'new';
    this.iceGatheringState = 'new';
    this.connectionState = 'new';
  }

  async createOffer() {
    return { type: 'offer', sdp: 'mock-sdp' };
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'mock-sdp' };
  }

  async setLocalDescription(desc) {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc) {
    this.remoteDescription = desc;
  }

  async addIceCandidate(candidate) {
    // Mock implementation
  }

  close() {
    // Mock implementation
  }

  addTransceiver(trackOrKind, init) {
    return { sender: {}, receiver: {} };
  }
}

class MockMediaStream extends EventTarget {
  constructor(tracks = []) {
    super();
    this.id = 'mock-stream-' + Math.random().toString(36).substr(2, 9);
    this.active = true;
    this.tracks = tracks;
  }

  addTrack(track) {
    this.tracks.push(track);
  }

  removeTrack(track) {
    this.tracks = this.tracks.filter(t => t !== track);
  }

  getAudioTracks() {
    return this.tracks.filter(track => track.kind === 'audio');
  }

  getVideoTracks() {
    return this.tracks.filter(track => track.kind === 'video');
  }

  getTracks() {
    return this.tracks;
  }
}

class MockMediaStreamTrack extends EventTarget {
  constructor(kind = 'audio') {
    super();
    this.id = 'mock-track-' + Math.random().toString(36).substr(2, 9);
    this.kind = kind;
    this.enabled = true;
    this.muted = false;
    this.readyState = 'live';
  }

  stop() {
    this.readyState = 'ended';
  }

  getSettings() {
    return {};
  }
}

class MockRTCAudioSource {
  constructor() {
    this.ondata = null;
  }

  createTrack() {
    return new MockMediaStreamTrack('audio');
  }
}

class MockRTCAudioSink {
  constructor(track) {
    this.track = track;
    this.ondata = null;
  }
}

export const nonstandard = {
  RTCAudioSource: MockRTCAudioSource,
  RTCAudioSink: MockRTCAudioSink
};

export const RTCPeerConnection = MockRTCPeerConnection;
export const MediaStream = MockMediaStream;
export const MediaStreamTrack = MockMediaStreamTrack;

export default {
  nonstandard,
  RTCPeerConnection,
  MediaStream,
  MediaStreamTrack
}; 