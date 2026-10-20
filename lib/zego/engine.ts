import type { ZegoExpressEngine } from "zego-express-engine-webrtc";

/**
 * TelehealthCall — the thin client-side wrapper around the ZEGOcloud core
 * WebRTC engine that replaces the prebuilt UI kit.
 *
 * The prebuilt kit rendered a locked shadow-DOM video stage: no aspect-ratio
 * control, no free drag (and none on mobile), no reliable frame capture.
 * Every interaction now belongs to our own components — video elements are
 * plain `<video>` tags we style and drag ourselves — and this module is the
 * entire SDK surface those components need:
 *
 *   prepare() → engine + local camera stream (the patient pre-join preview
 *               consumes exactly this stream)
 *   join()    → loginRoom + publish          (the doctor calls both at once)
 *   toggles   → microphone / camera / screen share
 *   destroy() → full teardown, no engine instance left behind
 *
 * Remote work is event-driven: the wrapper owns every play/stop subscription
 * and reports only the aggregate state the UI actually renders — peer present
 * or not, the remote MediaStream to display, mic/camera badges. The doctor
 * workspace and the public join page consume it identically.
 *
 * Browser only: never import this from a Server Component — the SDK bundle is
 * client-side by design.
 */

export type TelehealthEvents = {
  /** The SDK is reaching for the signaling server. */
  onRoomConnecting?: () => void;
  /** loginRoom succeeded — the room is live, publishing or not. */
  onRoomConnected?: () => void;
  /** Signal loss or an explicit logout. */
  onRoomDisconnected?: () => void;
  /** A remote user's stream is being played. */
  onPeerJoined?: () => void;
  /** All remote streams are gone — the UI drops back to "waiting". */
  onPeerLeft?: () => void;
  /** The remote picture the stage should render, or null when none. */
  onRemoteStream?: (stream: MediaStream | null) => void;
  /** Remote camera state, for the badge next to their name. */
  onRemoteCamera?: (on: boolean) => void;
  /** Remote microphone state. */
  onRemoteMic?: (on: boolean) => void;
  /** The browser ended a screen share behind the button (Esc, stop sharing). */
  onScreenShareEnded?: () => void;
  /** Anything that makes the call unusable. */
  onError?: (message: string) => void;
};

export type TelehealthCallOptions = {
  /** The ZEGO App ID — public: it also rides inside the Token04 envelope. */
  appId: number;
  roomId: string;
  /** Token04 minted server-side; the server secret never reaches this file. */
  token: string;
  userId: string;
  userName: string;
  events: TelehealthEvents;
};

export class TelehealthCall {
  private zg: ZegoExpressEngine | null = null;
  private localStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private remoteStreams = new Map<string, MediaStream>();
  private publishStreamId = "";
  private destroyed = false;
  private prepared = false;

  constructor(private readonly options: TelehealthCallOptions) {}

  /** Local camera mirror for previews; null until prepare() resolves. */
  get localVideoStream(): MediaStream | null {
    return this.localStream;
  }

  get isScreenSharing(): boolean {
    return this.screenStream !== null;
  }

  /**
   * Init the engine and open the camera. Safe outside the room — the patient
   * pre-join screen previews from exactly this stream, and a doctor joining
   * instantly just awaits join() right after.
   */
  prepare(): Promise<MediaStream> {
    if (this.prepared && this.localStream) return Promise.resolve(this.localStream);
    this.prepared = true;
    return (async () => {
      const { ZegoExpressEngine } = await import("zego-express-engine-webrtc");
      const zg = new ZegoExpressEngine(
        this.options.appId,
        `wss://webliveroom${this.options.appId}-api.zegocloud.com/ws`,
      );
      this.zg = zg;
      this.bindEvents();
      if (this.destroyed) {
        zg.destroyEngine();
        this.zg = null;
        throw new Error("Call was closed before it could start.");
      }
      // HD publish: the SDK default is videoQuality 2 (640×480 @ 15fps,
      // 800 kbps), which reads as visibly soft on a consultation. Level 3 is
      // 720p @ 20fps / 1.5 Mbps; startBitrate 'target' climbs to the target
      // bitrate immediately instead of ramping up from the WebRTC default
      // 300 kbps, so the first seconds of the call are not a preview of a
      // blocky stream.
      const stream = await zg.createStream({
        camera: {
          audio: true,
          video: true,
          videoQuality: 3,
          startBitrate: "target",
        },
      });
      if (this.destroyed) {
        try {
          zg.destroyStream(stream);
          zg.destroyEngine();
        } catch {
          /* teardown is best effort */
        }
        this.zg = null;
        throw new Error("Call was closed before the camera could start.");
      }
      this.localStream = stream;
      return stream;
    })();
  }

  /** loginRoom + start publishing. Hangs up with a usable error on a bad token. */
  async join(): Promise<void> {
    const zg = this.requireZego();
    if (!this.localStream) await this.prepare();
    const ok = await zg.loginRoom(
      this.options.roomId,
      this.options.token,
      { userID: this.options.userId, userName: this.options.userName },
      { userUpdate: true },
    );
    if (!ok) {
      throw new Error(
        "The room rejected this token. The link may have expired — start the call again.",
      );
    }
    this.publishStreamId = `s_${this.options.userId}`;
    zg.startPublishingStream(this.publishStreamId, this.localStream!);
  }

  toggleMic(mute: boolean): void {
    if (this.zg) this.zg.muteMicrophone(mute);
  }

  /**
   * Mute/unmute the published video, keeping the local capture alive so the
   * preview stays live and unmuting is instant.
   */
  toggleCamera(off: boolean): void {
    if (this.zg && this.localStream) {
      this.zg.mutePublishStreamVideo(this.localStream, off, true);
    }
  }

  /**
   * Publish a screen instead of the camera face picture; the microphone keeps
   * flowing through the camera stream, so the patient still hears the
   * clinician. The browser can end the share by itself — `screenSharingEnded`
   * routes that back through stopScreenShare.
   */
  async startScreenShare(): Promise<void> {
    const zg = this.requireZego();
    if (this.screenStream) return;
    const stream = await zg.createStream({
      screen: { audio: false, videoQuality: 3 },
    });
    if (this.destroyed) {
      try {
        zg.destroyStream(stream);
      } catch {
        /* as above */
      }
      return;
    }
    this.screenStream = stream;
    zg.startPublishingStream(`sc_${this.options.userId}`, stream);
    if (this.localStream) {
      zg.mutePublishStreamVideo(this.localStream, true, true);
    }
  }

  async stopScreenShare(): Promise<void> {
    if (!this.zg || !this.screenStream) return;
    const stream = this.screenStream;
    this.screenStream = null;
    try {
      this.zg.stopPublishingStream(`sc_${this.options.userId}`);
      this.zg.destroyStream(stream);
    } catch {
      /* the share is gone either way */
    }
    if (this.localStream && !this.destroyed) {
      this.zg.mutePublishStreamVideo(this.localStream, false, true);
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    const zg = this.zg;
    this.zg = null;
    if (!zg) return;
    if (this.screenStream) {
      try {
        zg.stopPublishingStream(`sc_${this.options.userId}`);
        zg.destroyStream(this.screenStream);
      } catch {
        /* teardown is best effort */
      }
      this.screenStream = null;
    }
    if (this.publishStreamId) {
      try {
        zg.stopPublishingStream(this.publishStreamId);
      } catch {
        /* as above */
      }
      this.publishStreamId = "";
    }
    for (const streamId of this.remoteStreams.keys()) {
      try {
        zg.stopPlayingStream(streamId);
      } catch {
        /* as above */
      }
    }
    this.remoteStreams.clear();
    if (this.localStream) {
      try {
        zg.destroyStream(this.localStream);
      } catch {
        /* as above */
      }
      this.localStream = null;
    }
    try {
      await zg.logoutRoom();
    } catch {
      /* as above */
    }
    zg.destroyEngine();
    this.options.events.onRemoteStream?.(null);
  }

  private emitRemoteStream(): void {
    // One-on-one: the newest remote stream is the live one, but an audio-only
    // fallback keeps the consultation usable when the camera is off.
    let pick: MediaStream | null = null;
    const entries = [...this.remoteStreams.values()];
    pick = entries.find((stream) => stream.getVideoTracks().length > 0) ?? entries[0] ?? null;
    this.options.events.onRemoteStream?.(pick);
  }

  private bindEvents(): void {
    const zg = this.requireZego();
    const events = this.options.events;

    zg.on("roomStateUpdate", (_roomID, state) => {
      if (state === "CONNECTING") events.onRoomConnecting?.();
      else if (state === "CONNECTED") events.onRoomConnected?.();
      else events.onRoomDisconnected?.();
    });

    zg.on("roomUserUpdate", (_roomID, updateType, userList) => {
      if (userList.some((user) => user.userID !== this.options.userId)) {
        events.onPeerJoined?.();
      }
      // A peer delete follows their stream delete; onPeerLeft fires there.
      if (updateType === "DELETE" && this.remoteStreams.size === 0) {
        events.onPeerLeft?.();
      }
    });

    zg.on("roomStreamUpdate", (_roomID, updateType, streamList) => {
      void this.handleRoomStreamUpdate(updateType, streamList).catch(() => {
        /* handled inside; a single stream can fail without killing the call */
      });
    });

    zg.on("remoteCameraStatusUpdate", (_streamID, status) => {
      events.onRemoteCamera?.(status === "OPEN");
    });

    zg.on("remoteMicStatusUpdate", (_streamID, status) => {
      events.onRemoteMic?.(status === "OPEN");
    });

    zg.on("publisherStateUpdate", (result) => {
      if (result.state === 'NO_PUBLISH' && result.errorCode !== 0) {
        events.onError?.(
          `Outgoing stream failed (code ${result.errorCode}). Rejoin the call.`,
        );
      }
    });

    zg.on("playerStateUpdate", (result) => {
      if (result.state === 'NO_PLAY' && result.errorCode !== 0) {
        events.onError?.("The patient's stream interrupted. They may rejoin.");
      }
    });

    zg.on("screenSharingEnded", () => {
      void this.stopScreenShare().then(() => events.onScreenShareEnded?.());
    });

    zg.on("exceptionUpdate", (streamID, exceptionData) => {
      const message =
        typeof exceptionData === "string"
          ? exceptionData
          : typeof exceptionData === "object" &&
              exceptionData &&
              "message" in exceptionData
            ? String((exceptionData as { message?: string }).message)
            : String(streamID ? "" : "");
      if (message) events.onError?.(message);
    });
  }

  private async handleRoomStreamUpdate(
    updateType: "ADD" | "DELETE",
    streamList: Array<{ streamID: string; user: { userID: string } }>,
  ): Promise<void> {
    if (this.destroyed) return;
    const zg = this.zg;
    if (!zg) return;
    for (const item of streamList) {
      if (item.user.userID === this.options.userId) continue;
      if (updateType === "ADD") {
        try {
          const stream = await zg.startPlayingStream(item.streamID);
          if (this.destroyed) {
            zg.stopPlayingStream(item.streamID);
            continue;
          }
          this.remoteStreams.set(item.streamID, stream);
          this.options.events.onPeerJoined?.();
          this.emitRemoteStream();
        } catch {
          zg.stopPlayingStream(item.streamID);
          this.options.events.onError?.(
            "A remote stream failed to start. Try rejoining.",
          );
        }
      } else {
        this.remoteStreams.delete(item.streamID);
        try {
          zg.stopPlayingStream(item.streamID);
        } catch {
          /* the stream may already be gone */
        }
        if (this.remoteStreams.size === 0) {
          this.options.events.onPeerLeft?.();
        }
        this.emitRemoteStream();
      }
    }
  }

  private requireZego(): ZegoExpressEngine {
    if (!this.zg) throw new Error("Call not prepared. Call prepare() first.");
    return this.zg;
  }
}
