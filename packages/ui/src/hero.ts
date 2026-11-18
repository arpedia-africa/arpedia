import { createContext, useContext } from 'react';

/** True inside a `Hero` band, for the prototype's `.hero …` overrides (night theme pill/button). */
export const OnHero = createContext(false);
export const useOnHero = () => useContext(OnHero);

/** `.device[data-theme="night"] .hero .pill.night, … .hero .btn-n` */
export const nightOnHero = { bg: 'rgba(255,246,234,0.16)', fg: '#FFF6EA' };
