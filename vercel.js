// WebRTC Shim for Vercel deployment

// Create a mock version of the WebRTC components
export const createMockWebRTC = () => {
  // Mock RTCPeerConnection
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

    createOffer() {
      return Promise.resolve({
        type: 'offer',
        sdp: 'mock-sdp'
      });
    }

    createAnswer() {
      return Promise.resolve({
        type: 'answer',
        sdp: 'mock-sdp'
      });
    }

    setLocalDescription(desc) {
      this.localDescription = desc;
      return Promise.resolve();
    }

    setRemoteDescription(desc) {
      this.remoteDescription = desc;
      return Promise.resolve();
    }

    addIceCandidate() {
      return Promise.resolve();
    }

    close() {
      this.signalingState = 'closed';
      this.iceConnectionState = 'closed';
      this.connectionState = 'closed';
    }

    // Other methods would go here
    addTransceiver() {
      return {
        sender: {
          track: null
        },
        receiver: {
          track: new MockMediaStreamTrack()
        }
      };
    }
  }

  // Mock MediaStream
  class MockMediaStream extends EventTarget {
    constructor(tracks = []) {
      super();
      this.tracks = [...tracks];
      this.active = true;
      this.id = `mock-stream-${Math.random().toString(36).substring(2, 9)}`;
    }

    addTrack(track) {
      this.tracks.push(track);
    }

    removeTrack(track) {
      const index = this.tracks.indexOf(track);
      if (index !== -1) {
        this.tracks.splice(index, 1);
      }
    }

    getAudioTracks() {
      return this.tracks.filter(track => track.kind === 'audio');
    }

    getVideoTracks() {
      return this.tracks.filter(track => track.kind === 'video');
    }

    getTracks() {
      return [...this.tracks];
    }
  }

  // Mock MediaStreamTrack
  class MockMediaStreamTrack extends EventTarget {
    constructor(kind = 'audio') {
      super();
      this.kind = kind;
      this.id = `mock-track-${Math.random().toString(36).substring(2, 9)}`;
      this.enabled = true;
      this.muted = false;
      this.readyState = 'live';
    }

    stop() {
      this.readyState = 'ended';
    }

    getSettings() {
      return {
        deviceId: 'mock-device',
        groupId: 'mock-group',
        width: 640,
        height: 480,
        frameRate: 30,
        aspectRatio: 1.33,
        sampleRate: 48000,
        sampleSize: 16,
        channelCount: 2
      };
    }
  }

  // Create a mock RTCAudioSource and RTCAudioSink for the nonstandard API
  const nonstandard = {
    RTCAudioSource: class {
      constructor() {
        this.track = new MockMediaStreamTrack('audio');
      }

      createTrack() {
        return this.track;
      }

      onData() {
        // Do nothing
      }
    },
    RTCAudioSink: class {
      constructor() {
        this.active = true;
      }

      stop() {
        this.active = false;
      }
    }
  };

  return {
    nonstandard,
    RTCPeerConnection: MockRTCPeerConnection,
    MediaStream: MockMediaStream,
    MediaStreamTrack: MockMediaStreamTrack
  };
};

// Export a singleton mock instance
const mockWrtc = createMockWebRTC();
export default mockWrtc; 