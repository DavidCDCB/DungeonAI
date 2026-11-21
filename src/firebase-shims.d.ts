/**
 * Firebase 11.10.0 publica `firebase/database` sin el archivo de tipos al que
 * apunta su package.json (`database/dist/database/index.d.ts`). La API pública
 * es la de `@firebase/database`, que sí incluye sus declaraciones.
 */
declare module 'firebase/database' {
  export * from '@firebase/database'
}
