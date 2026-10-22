import en from './locales/en.json';
import vi from './locales/vi.json';
import ja from './locales/ja.json';
import zhCn from './locales/zh-cn.json';

export type SupportedLocale = 'en' | 'vi' | 'ja' | 'zh-cn';

type Messages = Record<string, string>;

const BUNDLES: Record<SupportedLocale, Messages> = {
  en,
  vi,
  ja,
  'zh-cn': zhCn,
};

let currentLocale: SupportedLocale = 'en';

export function normalizeLocale(locale?: string): SupportedLocale {
  const normalized = (locale ?? '').trim().toLowerCase();
  if (normalized.startsWith('vi')) return 'vi';
  if (normalized.startsWith('ja')) return 'ja';
  if (normalized.startsWith('zh')) return 'zh-cn';
  return 'en';
}

export function setLocale(locale?: string): SupportedLocale {
  currentLocale = normalizeLocale(locale);
  return currentLocale;
}

export function getLocale(): SupportedLocale {
  return currentLocale;
}

export function t(key: string, params?: Record<string, string | number>): string {
  const bundle = BUNDLES[currentLocale] ?? BUNDLES.en;
  let template = bundle[key] ?? BUNDLES.en[key] ?? key;
  if (params) {
    template = template.replace(/\{(\w+)\}/g, (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  }
  return template;
}

export const translate = t;
