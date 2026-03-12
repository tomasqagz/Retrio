import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import es from './es.json'

export const LANGUAGES = [
  { code: 'es', label: 'Español', flagCode: 'es' },
  { code: 'en', label: 'English', flagCode: 'us' },
]

const savedLang = localStorage.getItem('retrio-lang') ?? 'es'

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: savedLang,
  fallbackLng: 'es',
  interpolation: { escapeValue: false },
})

export default i18n
