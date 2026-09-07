import { Music2, Pause, Play, SkipBack, SkipForward } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { mockPlaylist } from '../data/mock'

function formatSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function MusicBar(): React.JSX.Element {
  const [trackIndex, setTrackIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [elapsed, setElapsed] = useState(192)
  const intervalRef = useRef<number | null>(null)
  const track = mockPlaylist[trackIndex]

  useEffect(() => {
    if (!playing) return

    intervalRef.current = window.setInterval(() => {
      setElapsed((current) => current + 1)
    }, 1000)

    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current)
      }
    }
  }, [playing])

  useEffect(() => {
    if (playing && elapsed >= track.durationSeconds) {
      selectTrack(trackIndex + 1)
    }
  }, [elapsed, playing, track.durationSeconds, trackIndex])

  const selectTrack = (nextIndex: number): void => {
    setTrackIndex((nextIndex + mockPlaylist.length) % mockPlaylist.length)
    setElapsed(0)
    setPlaying(true)
  }

  const goToNext = (): void => selectTrack(trackIndex + 1)
  const goToPrevious = (): void => selectTrack(trackIndex - 1)

  const togglePlay = (): void => setPlaying((current) => !current)
  const changeProgress = (event: React.ChangeEvent<HTMLInputElement>): void => {
    setElapsed(Number(event.target.value))
  }

  return (
    <article className="glass-card music-card">
      <div className="album-mark">
        <Music2 size={17} aria-hidden="true" />
      </div>
      <div className="music-copy">
        <strong className="music-title">{track.title}</strong>
        <span className="music-meta">{track.artist}</span>
      </div>
      <div className="music-controls">
        <button
          className="icon-button"
          aria-label="上一首"
          onClick={goToPrevious}
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
          onClick={goToNext}
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
          max={track.durationSeconds}
          value={elapsed}
          aria-label="播放进度"
          onChange={changeProgress}
        />
        <span>{track.duration}</span>
      </div>
    </article>
  )
}

export default MusicBar
