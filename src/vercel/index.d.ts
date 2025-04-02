// Type definitions for mock WebRTC implementation
declare module 'vercel.js' {
  export const nonstandard: {
    RTCAudioSource: any;
    RTCAudioSink: any;
  };
  
  export class RTCPeerConnection extends EventTarget {
    localDescription: RTCSessionDescription | null;
    remoteDescription: RTCSessionDescription | null;
    signalingState: string;
    iceConnectionState: string;
    iceGatheringState: string;
    connectionState: string;
    
    constructor();
    createOffer(): Promise<RTCSessionDescriptionInit>;
    createAnswer(): Promise<RTCSessionDescriptionInit>;
    setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void>;
    addIceCandidate(candidate?: RTCIceCandidateInit): Promise<void>;
    close(): void;
    addTransceiver(trackOrKind: string, init?: any): { sender: any; receiver: any };
  }
  
  export class MediaStream extends EventTarget {
    id: string;
    active: boolean;
    
    constructor(tracks?: MediaStreamTrack[]);
    addTrack(track: MediaStreamTrack): void;
    removeTrack(track: MediaStreamTrack): void;
    getAudioTracks(): MediaStreamTrack[];
    getVideoTracks(): MediaStreamTrack[];
    getTracks(): MediaStreamTrack[];
  }
  
  export class MediaStreamTrack extends EventTarget {
    id: string;
    kind: string;
    enabled: boolean;
    muted: boolean;
    readyState: string;
    
    constructor(kind?: string);
    stop(): void;
    getSettings(): any;
  }
  
  export const createMockWebRTC: () => {
    nonstandard: {
      RTCAudioSource: any;
      RTCAudioSink: any;
    };
    RTCPeerConnection: typeof RTCPeerConnection;
    MediaStream: typeof MediaStream;
    MediaStreamTrack: typeof MediaStreamTrack;
  };
  
  const mockWrtc: ReturnType<typeof createMockWebRTC>;
  export default mockWrtc;
} 