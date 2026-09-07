import { FolderOpen, Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Track {
  id: string
  title: string
  artist: string
  path: string
}

function formatSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds)) return '00:00'
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function MusicBar(): React.JSX.Element {
  const [tracks, setTracks] = useState<Track[]>([])
  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [duration, setDuration] = useState(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const track = tracks[trackIndex]

  const loadLibrary = (): void => {
    void window.desktop
      .musicList()
      .then((list: Track[]) => setTracks(list))
      .catch(() => {})
  }

  useEffect(() => {
    loadLibrary()
  }, [])

  // 音轨切换：换 src 并自动播放
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !track) return
    audio.src = window.desktop.musicUrl(track.path)
    setElapsed(0)
    setDuration(0)
    if (playing) void audio.play().catch(() => setPlaying(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackIndex, tracks])

  const selectTrack = (nextIndex: number): void => {
    if (tracks.length === 0) return
    setTrackIndex((nextIndex + tracks.length) % tracks.length)
    setPlaying(true)
  }

  const togglePlay = (): void => {
    const audio = audioRef.current
    if (!audio || !track) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      void audio.play().catch(() => {})
      setPlaying(true)
    }
  }

  const chooseFolder = (): void => {
    void window.desktop
      .musicChooseFolder()
      .then(() => {
        loadLibrary()
        setTrackIndex(0)
      })
      .catch(() => {})
  }

  return (
    <article className="glass-card music-card">
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setElapsed(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => selectTrack(trackIndex + 1)}
        onError={() => setPlaying(false)}
      />
      <div className="album-mark">
        <Music2 size={17} aria-hidden="true" />
      </div>
      <div className="music-copy">
        <strong className="music-title">
          {track ? track.title : '本地音乐'}
        </strong>
        <span className="music-meta">
          {track ? track.artist : '选择音乐文件夹'}
        </span>
      </div>
      <div className="music-controls">
        <button className="icon-button" aria-label="选择音乐文件夹" onClick={chooseFolder}>
          <FolderOpen size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="上一首"
          onClick={() => selectTrack(trackIndex - 1)}
        >
          <SkipBack size={15} />
        </button>
        <button
          className="icon-button primary"
          aria-label={playing ? '暂停' : '播放'}
          onClick={togglePlay}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button
          className="icon-button"
          aria-label="下一首"
          onClick={() => selectTrack(trackIndex + 1)}
        >
          <SkipForward size={15} />
        </button>
      </div>
      <div className="music-progress">
        <span>{formatSeconds(elapsed)}</span>
        <input
          className="range"
          type="range"
          min={0}
          max={Math.max(1, Math.floor(duration))}
          value={Math.floor(elapsed)}
          aria-label="播放进度"
          onChange={(event) => {
            const audio = audioRef.current
            if (audio) audio.currentTime = Number(event.target.value)
          }}
        />
        <span>{formatSeconds(duration)}</span>
      </div>
    </article>
  )
}

export default MusicBar
