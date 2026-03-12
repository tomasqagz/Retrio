import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './SplashScreen.css'

interface Props {
  onDone: () => void
  minDuration?: number
}

export default function SplashScreen({ onDone, minDuration = 1600 }: Props) {
  const { t } = useTranslation()
  const [fading, setFading] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setFading(true)
      setTimeout(onDone, 350)
    }, minDuration)
    return () => clearTimeout(timer)
  }, [onDone, minDuration])

  return (
    <div className={`splash ${fading ? 'splash--fading' : ''}`}>
      <div className="splash-content">
        <div className="splash-logo">
          <span className="splash-logo-retr">RETR</span>
          <span className="splash-logo-io">IO</span>
        </div>
        <div className="splash-divider" />
        <p className="splash-tagline">{t('home.hero_subtitle')}</p>
      </div>
    </div>
  )
}
