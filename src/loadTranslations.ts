// The locale is only known at request time, so the module specifier is genuinely
// runtime-selected; a static import per locale would defeat the lazy-loading
// contract withGTConfig builds on.
export default async function loadTranslations(locale: string) {
  const translations = await import(`../public/_gt/${locale}.json`);
  return translations.default;
}
