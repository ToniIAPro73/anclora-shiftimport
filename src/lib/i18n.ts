export type Locale = 'es' | 'en';

const LOCALE_STORAGE_KEY = 'anclora_shiftimport_locale_v1';
export const DEFAULT_LOCALE: Locale = 'es';

const hasLocalStorage = (): boolean => typeof localStorage !== 'undefined';

export const loadLocale = (): Locale => {
  if (!hasLocalStorage()) {
    return DEFAULT_LOCALE;
  }
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === 'es' || stored === 'en' ? stored : DEFAULT_LOCALE;
};

export const saveLocale = (locale: Locale): void => {
  if (!hasLocalStorage()) {
    return;
  }
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
};

/**
 * Calendar week-start policy, derived from locale — never from the UI
 * language string, timezone, or any other proxy. The current `en` locale
 * is British English (en-GB), which — like es-ES — starts the week on
 * Monday. A future en-US locale would be keyed here with 0 (Sunday);
 * nothing else in the calendar rendering path would need to change.
 */
const WEEK_STARTS_ON: Record<Locale, 0 | 1> = {
  es: 1,
  en: 1, // en-GB
};

export const getWeekStartsOn = (locale: Locale): 0 | 1 => WEEK_STARTS_ON[locale];

type TranslationTree = { [key: string]: string | string[] | TranslationTree };

/**
 * Centralized translation source of truth. Keys are dot-namespaced by UI
 * surface (header, importModal, settings, errors, ...) so every
 * user-visible string lives here instead of bilingual ternaries scattered
 * through components. Proper names, filenames, and format names (PDF, CSV,
 * XLSX) are intentionally left untranslated per the no-mixed-language rule.
 */
const translations: Record<Locale, TranslationTree> = {
  es: {
    common: {
      close: 'Cerrar',
      cancel: 'Cancelar',
      save: 'Guardar',
      delete: 'Eliminar',
      add: 'Añadir',
      edit: 'Editar',
      loading: 'Cargando…',
      yes: 'Sí',
      no: 'No',
    },
    header: {
      subtitle: 'by Anclora Group',
      themeLabel: 'Tema: {{mode}}',
      themeToggleAria: 'Cambiar tema. Actual: {{mode}}',
      themeDark: 'oscuro',
      themeLight: 'claro',
      themeSystem: 'sistema',
      languageToggleAria: 'Cambiar idioma. Actual: {{locale}}',
      settingsAria: 'Abrir ajustes',
      import: 'Importar',
      add: 'Añadir',
    },
    stats: {
      own: 'Propios',
      company: 'Empresa',
      totalMonth: 'Tot. M.',
      totalYear: 'Tot. A.',
      month: 'Mes',
      year: 'Año',
    },
    calendar: {
      // Sunday-first canonical order (index 0 = Sunday, matches
      // Date.getDay()) — reordered for display via orderWeekdayLabels()
      // using the locale's week-start policy (see getWeekStartsOn).
      weekdays: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
      addShiftAria: 'Añadir turno el {{date}}',
      addShiftBlockedAria: 'No se pueden añadir turnos el {{date}} porque hay vacaciones',
      addShiftTitle: 'Añadir turno',
      addShiftBlockedTitle: 'No se pueden añadir más turnos si hay Vacaciones',
      months: [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
      ],
    },
    shiftModal: {
      titleNew: 'Programar Turno',
      titleEdit: 'Actualizar Turno',
      dateLabel: 'Fecha de Servicio',
      startLabel: 'Hora Inicio',
      endLabel: 'Hora Fin',
      typeLabel: 'Tipo',
      confirm: 'Confirmar',
    },
    importConflict: {
      title: 'Conflicto de importación',
      description: 'Ya existe un turno en este día. Elige qué hacer con el turno importado.',
      existing: 'Turno existente',
      incoming: 'Turno importado',
      skip: 'Omitir turno',
      abort: 'Abortar proceso',
      replace: 'Actualizar con el archivo importado',
      describeImported: '(I)',
      describeManual: '(M)',
      on: 'en',
      saveShiftFailed: 'No se pudo guardar el turno en la base de datos. Inténtalo de nuevo.',
      deleteShiftFailed: 'No se pudo eliminar el turno de la base de datos. Inténtalo de nuevo.',
      importSaveFailed: 'No se pudieron guardar los turnos importados en la base de datos. Inténtalo de nuevo.',
    },
    importModal: {
      title: 'Importar cuadrante',
      newImport: 'Nueva Importación',
      closeAria: 'Cerrar importación',
      nameLabel: 'Nombre',
      namePlaceholder: 'Nombre del empleado',
      idLabel: 'ID',
      idPlaceholder: 'ID de empleado',
      monthLabel: 'Mes del calendario',
      yearLabel: 'Año del calendario',
      uploadTitle: 'Subir archivo',
      fileSummary: 'Se extraerán los turnos del empleado',
      formatSuffix: ' · Formato: {{format}}',
      processing: 'Procesando archivo…',
      processingFormat: 'Procesando archivo ({{format}})…',
      process: 'Procesar archivo',
      detected: 'Turnos Detectados',
      found: '{{count}} encontrados',
      foundWithTime: '{{count}} encontrados ({{seconds}}s)',
      colDate: 'Fecha',
      colOrigin: 'Origen',
      colType: 'Tipo',
      colStart: 'Inicio',
      colEnd: 'Fin',
      emptyStateHint: 'Pulsa "Procesar archivo" para detectar turnos',
      confirmImport: 'Confirmar Importación ({{ready}}/{{total}} listos)',
      diffNew: '{{count}} nuevos',
      diffChanged: '{{count}} modificados',
      diffUnchanged: '{{count}} sin cambios',
      noShiftsFound: 'No se detectaron turnos para el empleado indicado en el archivo.',
      unknownError: 'Error desconocido',
      errorPrefix: 'Error: {{message}}',
    },
    settings: {
      title: 'Ajustes',
      tabProfile: 'Perfil',
      tabShiftTypes: 'Tipos de turno',
      closeAria: 'Cerrar ajustes',
      displayName: 'Nombre para mostrar',
      displayNamePlaceholder: 'Tu nombre',
      identifiers: 'Identificadores de empleado',
      identifiersPlaceholder: 'EMP-101, 101',
      identifiersHint: 'Separados por comas. Se usan para seleccionar tu fila al importar un documento.',
      employer: 'Empresa (opcional)',
      timezone: 'Zona horaria',
      saveProfile: 'Guardar perfil',
      saved: 'Guardado ✓',
      shiftTypesHint: 'JT es solo un ejemplo de preset opcional — no es un tipo especial del producto. Crea, edita o archiva los tipos que necesites; el selector de turnos y las estadísticas usan siempre esta configuración.',
      colorAria: 'Color de {{label}}',
      newColorAria: 'Color del nuevo tipo',
      countsAsWork: 'Cuenta como trabajo',
      archive: 'Archivar',
      restore: 'Restaurar',
      newType: 'Nuevo tipo de turno',
      identifierPlaceholder: 'Identificador',
      labelPlaceholder: 'Etiqueta',
      shortLabelPlaceholder: 'Etiqueta corta',
      errorIdRequired: 'El identificador es obligatorio.',
      errorIdDuplicate: 'Ya existe un tipo de turno con ese identificador.',
      deleteConfirm: 'Eliminar el tipo de turno "{{label}}"? Los turnos ya guardados con este tipo conservarán su color/etiqueta.',
    },
    privacy: {
      resetTitle: 'Borrar mis datos locales',
      resetDescription: 'Elimina de este dispositivo tus turnos, tipos de turno personalizados, perfil y preferencias. Esta acción no se puede deshacer.',
      resetButton: 'Borrar todos mis datos locales',
      resetConfirm: 'Esto eliminará permanentemente tus turnos, tipos de turno personalizados, perfil y preferencias guardadas en este dispositivo. ¿Continuar?',
      resetDone: 'Datos locales eliminados. Recarga la aplicación para empezar de nuevo.',
    },
    legalFooter: {
      copy: '© {{year}} Anclora Group — Todos los derechos reservados.',
      brand: 'Anclora ShiftImport es un producto del ecosistema Anclora Group.',
      terms: 'Términos',
      privacy: 'Privacidad',
      legal: 'Aviso legal',
      cookies: 'Cookies',
    },
    legalPage: {
      titlePrivacy: 'Política de privacidad',
      titleTerms: 'Términos del servicio',
      titleLegal: 'Aviso legal',
      backHome: 'Volver al inicio',
      contactTitle: 'Contacto legal',
      contactDescription: 'Para ejercer tus derechos o resolver cualquier consulta legal, escríbenos y te responderemos en el menor tiempo posible.',
    },
    cookies: {
      titleSettings: 'Gestionar cookies',
      titleBanner: 'Preferencias de cookies',
      description: 'Esta app utiliza cookies necesarias para operación local y puede guardar preferencias opcionales de análisis o marketing si las autorizas.',
      necessaryTitle: 'Cookies necesarias',
      necessaryDescription: 'Operación básica y preferencias. No se pueden desactivar.',
      analyticsTitle: 'Cookies de análisis',
      analyticsDescription: 'Medición funcional de uso interno.',
      marketingTitle: 'Cookies de marketing',
      marketingDescription: 'Reservadas para comunicaciones relevantes. No activan scripts inexistentes.',
      acceptAll: 'Aceptar todas',
      save: 'Guardar preferencias',
      configure: 'Configuración',
      rejectOptional: 'Rechazar opcionales',
    },
    errors: {
      UNKNOWN_EMPLOYEE: 'No se ha encontrado a este empleado en el documento.',
      AMBIGUOUS_EMPLOYEE: 'Hay varias coincidencias para este empleado. Indica un identificador para desambiguar.',
      EMPTY_DOCUMENT: 'El documento no contiene texto extraíble.',
      MALFORMED_INPUT: 'El archivo tiene un formato interno no válido o dañado.',
      UNSUPPORTED_FORMAT: 'Formato de archivo no soportado.',
      NO_SHIFTS_FOUND: 'No se detectaron turnos para el empleado indicado en el archivo.',
      UNSUPPORTED_LAYOUT: 'No se ha podido reconocer la estructura de este documento.',
      UNKNOWN_ERROR: 'Ha ocurrido un error inesperado.',
    },
    conflicts: {
      vacationExists: 'No puedes añadir un turno {{type}} en {{date}} porque ya existe un turno de Vacaciones.',
      duplicateType: 'Ya existe un turno de tipo {{type}} en {{date}}. Puedes modificar manualmente el turno existente.',
      libreConflict: 'No puedes añadir Libre si ya existe un turno {{type}} en {{date}}.',
      workConflictsWithLibre: 'No puedes combinar {{type}} con Libre en {{date}}.',
      extrasOverlap: 'El turno Extras se solapa con el turno {{type}} de {{date}}. Corrígelo antes de añadirlo.',
    },
    quality: {
      stateCorrect: 'Correcto',
      stateReview: 'Revisar',
      stateUnrecognized: 'No reconocido',
      warnings: {
        unknownShiftToken: 'Token de turno desconocido: {{token}}',
        employeeMatchWeak: 'La coincidencia con tu nombre es débil; comprueba que la fila seleccionada es la tuya.',
        multipleEmployeeMatches: 'Varias filas coinciden con tu perfil; confirma cuál eres tú.',
        dateMappingUncertain: 'No se pudo determinar con seguridad el período del documento; revisa las fechas asignadas.',
        profileDrift: 'El formato del documento ha cambiado desde la última importación',
        partialExtraction: 'Extracción parcial: se asignaron {{mapped}} de {{expected}} días.',
        unknownCell: 'Hay celdas con valores no reconocidos ({{count}}).',
        unsupportedSection: 'Hay secciones del documento que no se pudieron interpretar.',
      },
      profileRecognized: 'Formato reconocido: {{label}}',
      confidenceHint: 'Revisar significa comprobar las filas resaltadas antes de confirmar la importación.',
      moreWarnings: '+{{count}} avisos más',
    },
    onboarding: {
      title: 'Bienvenido a Anclora ShiftImport',
      subtitle: 'Importa tu primer cuadrante en menos de dos minutos',
      stepSource: '¿Cómo recibes tu cuadrante?',
      sourceOptions: {
        pdf: 'PDF',
        excel: 'Excel',
        csv: 'CSV',
        image: 'Imagen',
        other: 'Otro',
      },
      stepUpload: 'Selecciona tu cuadrante',
      analyzing: 'Analizando documento…',
      identityTitle: 'Solo necesitamos saber qué fila eres',
      nameLabel: 'Tu nombre',
      idLabel: 'Tu identificador de empleado',
      skip: 'Omitir',
      next: 'Siguiente',
      back: 'Atrás',
      finish: 'Finalizar',
      restart: 'Repetir la guía de inicio',
      useExisting: 'Usaremos tu perfil guardado ({{name}})',
      closeAria: 'Cerrar la guía de inicio',
    },
    assistant: {
      title: 'Asistente de formato',
      rowQuestion: '¿Cuál de estas filas eres tú?',
      dayColumnQuestion: '¿Esta columna corresponde al día {{day}}?',
      dayColumnCorrect: 'Indica a qué día corresponde esta columna',
      tokenMeaningQuestion: '¿Qué significa {{token}}?',
      workOrRestQuestion: '¿Es trabajo o descanso?',
      shiftCodeQuestion: '¿Qué turno representa {{code}}?',
      saveProfile: 'Guardar este formato para próximos meses',
      profileSaved: 'Formato guardado. Lo reconoceremos la próxima vez.',
      driftWarning: 'El formato ha cambiado: {{fields}}',
      workOption: 'Trabajo',
      restOption: 'Descanso',
      shiftTypeLabel: 'Tipo de turno (opcional)',
      confirm: 'Aplicar y continuar',
    },
  },
  en: {
    common: {
      close: 'Close',
      cancel: 'Cancel',
      save: 'Save',
      delete: 'Delete',
      add: 'Add',
      edit: 'Edit',
      loading: 'Loading…',
      yes: 'Yes',
      no: 'No',
    },
    header: {
      subtitle: 'by Anclora Group',
      themeLabel: 'Theme: {{mode}}',
      themeToggleAria: 'Change theme. Current: {{mode}}',
      themeDark: 'dark',
      themeLight: 'light',
      themeSystem: 'system',
      languageToggleAria: 'Change language. Current: {{locale}}',
      settingsAria: 'Open settings',
      import: 'Import',
      add: 'Add',
    },
    stats: {
      own: 'Own',
      company: 'Company',
      totalMonth: 'Total M.',
      totalYear: 'Total Y.',
      month: 'Month',
      year: 'Year',
    },
    calendar: {
      // Sunday-first canonical order — see the es block for why.
      // en is British English (en-GB): week still starts on Monday.
      weekdays: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
      addShiftAria: 'Add shift on {{date}}',
      addShiftBlockedAria: 'Shifts cannot be added on {{date}} because there is vacation',
      addShiftTitle: 'Add shift',
      addShiftBlockedTitle: 'No more shifts can be added while there is Vacation',
      months: [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December',
      ],
    },
    shiftModal: {
      titleNew: 'Schedule Shift',
      titleEdit: 'Update Shift',
      dateLabel: 'Service Date',
      startLabel: 'Start Time',
      endLabel: 'End Time',
      typeLabel: 'Type',
      confirm: 'Confirm',
    },
    importConflict: {
      title: 'Import conflict',
      description: 'A shift already exists on this day. Choose what to do with the imported shift.',
      existing: 'Existing shift',
      incoming: 'Imported shift',
      skip: 'Skip shift',
      abort: 'Abort process',
      replace: 'Update with imported file',
      describeImported: '(I)',
      describeManual: '(M)',
      on: 'on',
      saveShiftFailed: 'Could not save the shift to the database. Please try again.',
      deleteShiftFailed: 'Could not delete the shift from the database. Please try again.',
      importSaveFailed: 'Could not save the imported shifts to the database. Please try again.',
    },
    importModal: {
      title: 'Import schedule',
      newImport: 'New Import',
      closeAria: 'Close import',
      nameLabel: 'Name',
      namePlaceholder: 'Employee name',
      idLabel: 'ID',
      idPlaceholder: 'Employee ID',
      monthLabel: 'Calendar month',
      yearLabel: 'Calendar year',
      uploadTitle: 'Upload file',
      fileSummary: "The employee's shifts will be extracted",
      formatSuffix: ' · Format: {{format}}',
      processing: 'Processing file…',
      processingFormat: 'Processing file ({{format}})…',
      process: 'Process file',
      detected: 'Detected Shifts',
      found: '{{count}} found',
      foundWithTime: '{{count}} found ({{seconds}}s)',
      colDate: 'Date',
      colOrigin: 'Origin',
      colType: 'Type',
      colStart: 'Start',
      colEnd: 'End',
      emptyStateHint: 'Click "Process file" to detect shifts',
      confirmImport: 'Confirm Import ({{ready}}/{{total}} ready)',
      diffNew: '{{count}} new',
      diffChanged: '{{count}} changed',
      diffUnchanged: '{{count}} unchanged',
      noShiftsFound: 'No shifts were detected for the given employee in the file.',
      unknownError: 'Unknown error',
      errorPrefix: 'Error: {{message}}',
    },
    settings: {
      title: 'Settings',
      tabProfile: 'Profile',
      tabShiftTypes: 'Shift types',
      closeAria: 'Close settings',
      displayName: 'Display name',
      displayNamePlaceholder: 'Your name',
      identifiers: 'Employee identifiers',
      identifiersPlaceholder: 'EMP-101, 101',
      identifiersHint: 'Comma-separated. Used to pick your row when importing a document.',
      employer: 'Employer (optional)',
      timezone: 'Timezone',
      saveProfile: 'Save profile',
      saved: 'Saved ✓',
      shiftTypesHint: 'JT is just an example of an optional preset — it is not a special product feature. Create, edit, or archive the types you need; the shift selector and stats always use this configuration.',
      colorAria: 'Color for {{label}}',
      newColorAria: 'New type color',
      countsAsWork: 'Counts as work',
      archive: 'Archive',
      restore: 'Restore',
      newType: 'New shift type',
      identifierPlaceholder: 'Identifier',
      labelPlaceholder: 'Label',
      shortLabelPlaceholder: 'Short label',
      errorIdRequired: 'The identifier is required.',
      errorIdDuplicate: 'A shift type with that identifier already exists.',
      deleteConfirm: 'Delete the shift type "{{label}}"? Shifts already saved with this type will keep their color/label.',
    },
    privacy: {
      resetTitle: 'Delete my local data',
      resetDescription: 'Removes your shifts, custom shift types, profile, and preferences from this device. This action cannot be undone.',
      resetButton: 'Delete all my local data',
      resetConfirm: 'This will permanently delete your shifts, custom shift types, profile, and preferences saved on this device. Continue?',
      resetDone: 'Local data deleted. Reload the app to start over.',
    },
    legalFooter: {
      copy: '© {{year}} Anclora Group — All rights reserved.',
      brand: 'Anclora ShiftImport is a product of the Anclora Group ecosystem.',
      terms: 'Terms',
      privacy: 'Privacy',
      legal: 'Legal notice',
      cookies: 'Cookies',
    },
    legalPage: {
      titlePrivacy: 'Privacy policy',
      titleTerms: 'Terms of service',
      titleLegal: 'Legal notice',
      backHome: 'Back to home',
      contactTitle: 'Legal contact',
      contactDescription: 'To exercise your rights or resolve any legal query, write to us and we will respond as soon as possible.',
    },
    cookies: {
      titleSettings: 'Manage cookies',
      titleBanner: 'Cookie preferences',
      description: 'This app uses cookies necessary for local operation and may store optional analytics or marketing preferences if you allow them.',
      necessaryTitle: 'Necessary cookies',
      necessaryDescription: 'Basic operation and preferences. Cannot be disabled.',
      analyticsTitle: 'Analytics cookies',
      analyticsDescription: 'Functional measurement of internal usage.',
      marketingTitle: 'Marketing cookies',
      marketingDescription: 'Reserved for relevant communications. Does not enable any nonexistent scripts.',
      acceptAll: 'Accept all',
      save: 'Save preferences',
      configure: 'Settings',
      rejectOptional: 'Reject optional',
    },
    errors: {
      UNKNOWN_EMPLOYEE: 'This employee was not found in the document.',
      AMBIGUOUS_EMPLOYEE: 'There are several matches for this employee. Provide an identifier to disambiguate.',
      EMPTY_DOCUMENT: 'The document has no extractable text.',
      MALFORMED_INPUT: 'The file has an invalid or corrupted internal format.',
      UNSUPPORTED_FORMAT: 'Unsupported file format.',
      NO_SHIFTS_FOUND: 'No shifts were detected for the given employee in the file.',
      UNSUPPORTED_LAYOUT: 'The structure of this document could not be recognized.',
      UNKNOWN_ERROR: 'An unexpected error occurred.',
    },
    conflicts: {
      vacationExists: 'You cannot add a {{type}} shift on {{date}} because a Vacation shift already exists.',
      duplicateType: 'A {{type}} shift already exists on {{date}}. You can manually edit the existing shift.',
      libreConflict: 'You cannot add Free time because a {{type}} shift already exists on {{date}}.',
      workConflictsWithLibre: 'You cannot combine {{type}} with Free time on {{date}}.',
      extrasOverlap: 'The Extras shift overlaps with the {{type}} shift on {{date}}. Fix it before adding it.',
    },
    quality: {
      stateCorrect: 'Ready',
      stateReview: 'Review',
      stateUnrecognized: 'Not recognized',
      warnings: {
        unknownShiftToken: 'Unknown shift token: {{token}}',
        employeeMatchWeak: 'The match with your name is weak; check that the selected row is yours.',
        multipleEmployeeMatches: 'Several rows match your profile; confirm which one is you.',
        dateMappingUncertain: 'The document period could not be determined reliably; check the assigned dates.',
        profileDrift: 'The document format has changed since the last import',
        partialExtraction: 'Partial extraction: {{mapped}} of {{expected}} days were mapped.',
        unknownCell: 'Some cells contain unrecognised values ({{count}}).',
        unsupportedSection: 'Some sections of the document could not be interpreted.',
      },
      profileRecognized: 'Format recognized: {{label}}',
      confidenceHint: 'Reviewing means checking the highlighted rows before confirming the import.',
      moreWarnings: '+{{count}} more warnings',
    },
    onboarding: {
      title: 'Welcome to Anclora ShiftImport',
      subtitle: 'Import your first roster in under two minutes',
      stepSource: 'How do you receive your roster?',
      sourceOptions: {
        pdf: 'PDF',
        excel: 'Excel',
        csv: 'CSV',
        image: 'Image',
        other: 'Other',
      },
      stepUpload: 'Choose your roster file',
      analyzing: 'Analysing document…',
      identityTitle: 'We just need to know which row is you',
      nameLabel: 'Your name',
      idLabel: 'Your employee ID',
      skip: 'Skip',
      next: 'Next',
      back: 'Back',
      finish: 'Finish',
      restart: 'Replay the getting-started guide',
      useExisting: 'We will use your saved profile ({{name}})',
      closeAria: 'Close the getting-started guide',
    },
    assistant: {
      title: 'Format assistant',
      rowQuestion: 'Which of these rows is yours?',
      dayColumnQuestion: 'Does this column represent day {{day}}?',
      dayColumnCorrect: 'Enter which day this column belongs to',
      tokenMeaningQuestion: 'What does {{token}} mean?',
      workOrRestQuestion: 'Is this work or time off?',
      shiftCodeQuestion: 'What shift does {{code}} represent?',
      saveProfile: 'Save this format for future months',
      profileSaved: 'Format saved. We will recognise it next time.',
      driftWarning: 'The format has changed: {{fields}}',
      workOption: 'Work',
      restOption: 'Time off',
      shiftTypeLabel: 'Shift type (optional)',
      confirm: 'Apply and continue',
    },
  },
};

function resolveKey(tree: TranslationTree, path: string): string | string[] | undefined {
  const parts = path.split('.');
  let node: string | TranslationTree | string[] = tree;
  for (const part of parts) {
    if (typeof node !== 'object' || node === null || Array.isArray(node)) {
      return undefined;
    }
    node = (node as TranslationTree)[part];
  }
  return node as string | string[] | undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? String(vars[key]) : match));
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const value = resolveKey(translations[locale], key) ?? resolveKey(translations[DEFAULT_LOCALE], key);
  if (typeof value !== 'string') {
    return key;
  }
  return interpolate(value, vars);
}

/**
 * Product-default shift type labels (Regular/Libre/Vacaciones/Extras) are
 * localized here. Custom user-created types are the user's own data — a
 * type is named once, in whatever language the user chose — so those keep
 * their stored label unchanged (same treatment as a proper name).
 */
const DEFAULT_TYPE_LABELS: Record<string, { es: string; en: string }> = {
  Regular: { es: 'Regular', en: 'Regular' },
  Libre: { es: 'Libre', en: 'Free' },
  Vacaciones: { es: 'Vacaciones', en: 'Vacation' },
  Extras: { es: 'Extras', en: 'Extras' },
};

export function translateShiftTypeLabel(typeId: string, locale: Locale, fallbackLabel: string): string {
  return DEFAULT_TYPE_LABELS[typeId]?.[locale] ?? fallbackLabel;
}

export function translateList(locale: Locale, key: string): string[] {
  const value = resolveKey(translations[locale], key) ?? resolveKey(translations[DEFAULT_LOCALE], key);
  return Array.isArray(value) ? value : [];
}
