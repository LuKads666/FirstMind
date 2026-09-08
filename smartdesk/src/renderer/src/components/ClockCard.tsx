import { useEffect, useState } from 'react'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

// 时间组件：填充桌面左上区域，演示开场镜头
export default function ClockCard(): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <article className="glass-card clock-card">
      <div className="clock-time">
        {pad(now.getHours())}
        <span className="clock-colon">:</span>
        {pad(now.getMinutes())}
      </div>
      <div className="clock-date">
        {now.getMonth() + 1} 月 {now.getDate()} 日 · 星期{WEEKDAYS[now.getDay()]}
      </div>
    </article>
  )
}
