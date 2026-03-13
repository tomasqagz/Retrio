import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n, { LANGUAGES } from '../i18n'
import './Onboarding.css'

const IS_ELECTRON = Boolean(window.retrio)

interface Props {
  onDone: () => void
}

export default function Onboarding({ onDone }: Props) {
  const { t } = useTranslation()
  const [step, setStep] = useState<1 | 2>(1)
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [saving, setSaving] = useState(false)
  const [guideOpen, setGuideOpen] = useState(true)
  const [currentLang, setCurrentLang] = useState(i18n.language)

  function handleLangChange(code: string) {
    void i18n.changeLanguage(code)
    localStorage.setItem('retrio-lang', code)
    setCurrentLang(code)
  }

  function handleSkip() {
    localStorage.setItem('retrio-onboarding-done', '1')
    onDone()
  }

  async function handleSave() {
    if (!IS_ELECTRON || saving) return
    setSaving(true)
    try {
      await window.retrio.setIgdbCredentials(clientId.trim(), clientSecret.trim())
    } catch {
      // proceed anyway
    }
    localStorage.setItem('retrio-onboarding-done', '1')
    setSaving(false)
    onDone()
  }

  return (
    <div className="onb-overlay">
      <div className="onb-card">
        {step === 1 && (
          <div className="onb-step">
            <h1 className="onb-title">
              {t('onboarding.welcome_prefix')}&nbsp;
              <span className="onb-logo-retr">RETR</span>
              <span className="onb-logo-io">IO</span>
            </h1>
            <p className="onb-desc">{t('onboarding.welcome_desc')}</p>

            <div className="onb-lang-picker">
              {LANGUAGES.map((lang) => (
                <button
                  key={lang.code}
                  className={`onb-lang-btn ${currentLang === lang.code ? 'onb-lang-btn--active' : ''}`}
                  onClick={() => handleLangChange(lang.code)}
                >
                  <span className={`fi fi-${lang.flagCode}`} />
                  <span>{lang.label}</span>
                </button>
              ))}
            </div>

            <button className="onb-btn-primary" onClick={() => setStep(2)}>
              {t('onboarding.setup_igdb')}
            </button>
            <button className="onb-btn-skip" onClick={handleSkip}>
              {t('onboarding.skip')}
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="onb-step">
            <h2 className="onb-step-title">{t('onboarding.igdb_title')}</h2>
            <p className="onb-desc">{t('settings.igdb_desc')}</p>

            <div className="onb-guide">
              <button className="onb-guide-header" onClick={() => setGuideOpen((o) => !o)}>
                <p className="onb-guide-title">{t('settings.igdb_guide_title')}</p>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`onb-guide-chevron ${guideOpen ? 'onb-guide-chevron--open' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {guideOpen && <ol className="onb-guide-steps">
                <li>
                  {t('settings.igdb_guide_step1')}{' '}
                  <a className="onb-inline-link" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">
                    dev.twitch.tv/console/apps
                  </a>
                </li>
                <li>{t('settings.igdb_guide_step2')}</li>
                <li>{t('settings.igdb_guide_step3')}</li>
                <li>
                  {t('settings.igdb_guide_step4')}{' '}
                  <code className="onb-guide-code">http://localhost</code>
                </li>
                <li>{t('settings.igdb_guide_step5')}</li>
                <li>
                  {t('settings.igdb_guide_step6')}{' '}
                  <strong>Confidential</strong>
                </li>
                <li>{t('settings.igdb_guide_step7')}</li>
              </ol>}
              <a className="onb-portal-link" href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">
                {t('settings.igdb_link')}
              </a>
            </div>

            <div className="onb-field">
              <label className="onb-label">{t('settings.igdb_client_id')}</label>
              <input
                className="onb-input"
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
              />
            </div>
            <div className="onb-field">
              <label className="onb-label">{t('settings.igdb_client_secret')}</label>
              <input
                className="onb-input"
                type="password"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                placeholder="••••••••••••••••••••••••••••••••"
                autoComplete="new-password"
              />
            </div>

            <button
              className="onb-btn-primary"
              onClick={() => void handleSave()}
              disabled={saving || !clientId.trim() || !clientSecret.trim()}
            >
              {saving ? t('onboarding.saving') : t('onboarding.save_and_continue')}
            </button>
            <div className="onb-footer-row">
              <button className="onb-btn-back" onClick={() => setStep(1)}>
                {t('onboarding.back')}
              </button>
              <button className="onb-btn-skip" onClick={handleSkip}>
                {t('onboarding.skip')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
