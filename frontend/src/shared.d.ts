// Общие UMD-модули из ../webapp импортируются как CommonJS. Типов у них нет —
// объявляем их здесь, чтобы TS не ругался (значения приходят как any).
declare module "@shared/i18n.dict.js" {
  export interface Lang {
    code: string;
    label: string;
    flag: string;
  }
  export type Row = Record<string, string>;
  const dict: {
    LANGS: Lang[];
    CITY_NAMES: Record<string, Row>;
    DICT: Record<string, Row>;
  };
  export default dict;
}

declare module "@shared/icons.js" {
  const icons: {
    svg(name: string): string;
    P: Record<string, string>;
  };
  export default icons;
}
