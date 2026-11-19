/** Comandos fuera de personaje del menú del compositor (documentados en el prompt del DM). */
export const OOC_COMMANDS = [
  { label: 'Hoja de personaje', command: '<hoja>' },
  { label: 'Inventario', command: '<inventario>' },
  { label: 'Misiones', command: '<misiones>' },
  { label: 'Resumen de la historia', command: '<resumen>' },
  { label: 'Lanza los dados por mí', command: '<lanza por mí>' },
  { label: 'Cambiar de escena', command: '<cambiemos de escena>' },
] as const
