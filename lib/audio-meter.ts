export function createAudioMeter(context: AudioContext) {
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  const samples = new Float32Array(analyser.fftSize);
  let source: MediaStreamAudioSourceNode | undefined;
  let current: MediaStreamTrack | undefined;

  return (track?: MediaStreamTrack) => {
    if (track !== current) {
      source?.disconnect();
      current = track;
      source =
        track && context.createMediaStreamSource(new MediaStream([track]));
      source?.connect(analyser);
    }
    if (!track || track.readyState !== "live" || !track.enabled || track.muted)
      return 0;
    analyser.getFloatTimeDomainData(samples);
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    const db = 10 * Math.log10(energy / samples.length);
    return Math.max(0, Math.min(1, (db + 55) / 37));
  };
}
