import { useState } from 'react';
import { LegalFooter } from './LegalFooter';
import { resetAllLocalData } from '../lib/privacy';
import { Locale } from '../lib/i18n';
import { useI18n } from '../lib/use-i18n';

type Kind = 'privacy' | 'terms' | 'legal';

/**
 * Legal body content: explicit ES/EN variants, one function per document
 * kind. Spanish is the canonical source (drafted first, source of legal
 * meaning); each English section is a structural, section-by-section
 * translation of the matching Spanish section — same numbering, same
 * headings, same obligations, nothing added or removed. This 1:1 layout is
 * deliberate so a legal reviewer can diff es vs en section by section.
 *
 * These English sections are a working translation, not legal advice —
 * flag LEGAL_EN_REVIEW_REQUIRED for professional legal sign-off before
 * treating them as an authoritative bilingual policy.
 */

/* ─── helpers ──────────────────────────────────────────────────────────── */

const sectionStyle: React.CSSProperties = {
  paddingBottom: '1.75rem',
  borderBottom: '1px solid var(--glass-border)',
};

const h2Style: React.CSSProperties = {
  color: 'var(--text)',
  fontSize: '1.05rem',
  fontWeight: 700,
  marginBottom: '0.65rem',
  marginTop: 0,
};

const pStyle: React.CSSProperties = {
  margin: 0,
  lineHeight: 1.75,
};

const ulStyle: React.CSSProperties = {
  margin: '0.5rem 0 0 1.25rem',
  padding: 0,
  lineHeight: 1.85,
};

const strongStyle: React.CSSProperties = { color: 'var(--text)' };
const linkStyle: React.CSSProperties = { color: 'var(--accent-gold)' };

/* ─── Privacy sections ──────────────────────────────────────────────────── */

function PrivacySectionsEs() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Responsable del tratamiento</h2>
        <p style={pStyle}>
          El responsable del tratamiento de los datos personales recogidos a través de Anclora ShiftImport
          es <strong style={strongStyle}>Anclora Group</strong>.
          Puedes contactarnos en cualquier momento mediante el correo electrónico{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Datos que tratamos</h2>
        <p style={pStyle}>Anclora ShiftImport puede tratar las siguientes categorías de datos:</p>
        <ul style={ulStyle}>
          <li><strong style={strongStyle}>Datos de turnos:</strong> fecha, hora de inicio y fin, tipo de turno, ubicación o centro de trabajo, notas asociadas.</li>
          <li><strong style={strongStyle}>Preferencias de uso:</strong> configuración de tema visual y opciones de visualización del calendario, almacenadas en <code>localStorage</code>.</li>
          <li><strong style={strongStyle}>Logs operativos mínimos:</strong> registros técnicos de sincronización necesarios para el correcto funcionamiento del servicio backend (Neon DB).</li>
          <li><strong style={strongStyle}>Datos importados de PDF:</strong> información de turnos extraída mediante reconocimiento de texto de documentos aportados por el propio usuario.</li>
        </ul>
        <p style={{ ...pStyle, marginTop: '0.75rem' }}>
          No se recogen datos especialmente protegidos ni datos de menores. No se realiza elaboración de perfiles automatizada con efectos jurídicos.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>3. Finalidades del tratamiento</h2>
        <ul style={ulStyle}>
          <li>Gestionar y mostrar los turnos de trabajo del usuario.</li>
          <li>Sincronizar los datos entre dispositivos cuando el usuario activa dicha función.</li>
          <li>Permitir la importación y el reconocimiento de turnos desde archivos PDF.</li>
          <li>Mantener las preferencias de personalización de la aplicación.</li>
          <li>Garantizar el correcto funcionamiento técnico y la seguridad operativa del servicio.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>4. Base jurídica</h2>
        <p style={pStyle}>
          El tratamiento se basa en el <strong style={strongStyle}>interés legítimo</strong> del responsable
          para operar el servicio solicitado por el usuario (art. 6.1.f RGPD), y en el{' '}
          <strong style={strongStyle}>consentimiento</strong> del usuario para el uso de cookies opcionales
          o funcionalidades de sincronización (art. 6.1.a RGPD).
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. Conservación de los datos</h2>
        <ul style={ulStyle}>
          <li><strong style={strongStyle}>Datos locales (localStorage):</strong> persisten en el dispositivo del usuario hasta que este los elimina manualmente o borra los datos del navegador.</li>
          <li><strong style={strongStyle}>Datos de sincronización:</strong> se conservan mientras el servicio esté activo y el usuario mantenga su cuenta, o hasta que solicite su supresión.</li>
          <li><strong style={strongStyle}>Logs operativos:</strong> se eliminan de forma automática transcurrido el período mínimo necesario para garantizar la seguridad del sistema.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6. Destinatarios y cesiones</h2>
        <p style={pStyle}>
          No se ceden datos a terceros salvo obligación legal. Los datos de sincronización son procesados
          por el proveedor de infraestructura de base de datos (Neon DB), actuando como encargado del tratamiento
          bajo las garantías contractuales y técnicas pertinentes. No se realizan transferencias internacionales
          de datos conocidas fuera del Espacio Económico Europeo.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6bis. Proveedores y subencargados</h2>
        <p style={pStyle}>Inventario mínimo de los terceros que pueden intervenir en el procesamiento técnico del servicio:</p>
        <ul style={ulStyle}>
          <li><strong style={strongStyle}>Vercel:</strong> alojamiento de la aplicación (hosting estático y funciones de sincronización).</li>
          <li><strong style={strongStyle}>Neon DB:</strong> base de datos de sincronización entre dispositivos. Solo se contacta si el usuario activa explícitamente la sincronización; por defecto la aplicación funciona en modo local (<code>localStorage</code>) y no la contacta.</li>
          <li><strong style={strongStyle}>tesseract.js (OCR local):</strong> el reconocimiento de texto en imágenes se ejecuta en el propio navegador del usuario. Solo los binarios del motor OCR (no el documento del usuario) pueden descargarse desde una CDN pública en el primer uso.</li>
        </ul>
        <p style={{ ...pStyle, marginTop: '0.75rem' }}>
          Ningún documento o imagen de cuadrante de turnos importado por el usuario se sube ni se conserva en ningún servidor:
          el archivo se procesa en memoria en el navegador y se descarta al finalizar la importación. Ningún proveedor de
          analítica o publicidad recibe datos de turnos ni identificadores de empleado.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>7. Seguridad</h2>
        <p style={pStyle}>
          Anclora ShiftImport aplica medidas técnicas y organizativas adecuadas al riesgo del tratamiento,
          incluyendo comunicaciones cifradas mediante HTTPS, controles de acceso a la base de datos y
          separación de entornos. Los datos almacenados localmente en el dispositivo del usuario están
          sujetos a las medidas de seguridad propias del sistema operativo y navegador empleados.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>8. Derechos del interesado</h2>
        <p style={pStyle}>
          De acuerdo con el RGPD (UE) 2016/679 y la LOPDGDD, el usuario puede ejercer los siguientes derechos:
        </p>
        <ul style={ulStyle}>
          <li><strong style={strongStyle}>Acceso:</strong> obtener confirmación sobre si se tratan sus datos y acceder a ellos.</li>
          <li><strong style={strongStyle}>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
          <li><strong style={strongStyle}>Supresión:</strong> solicitar la eliminación de sus datos cuando ya no sean necesarios.</li>
          <li><strong style={strongStyle}>Portabilidad:</strong> recibir sus datos en un formato estructurado y de uso común.</li>
          <li><strong style={strongStyle}>Oposición y limitación:</strong> oponerse al tratamiento o solicitar su limitación en los casos previstos por la normativa.</li>
        </ul>
        <p style={{ ...pStyle, marginTop: '0.75rem' }}>
          Para ejercer cualquiera de estos derechos, envía tu solicitud a{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
          También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) en{' '}
          <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" style={linkStyle}>www.aepd.es</a>.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>9. Cookies</h2>
        <p style={pStyle}>
          Anclora ShiftImport utiliza cookies estrictamente necesarias para el funcionamiento de la aplicación
          (sesión, preferencias de tema) y puede utilizar cookies opcionales para análisis de uso, siempre
          previa obtención del consentimiento del usuario. Las preferencias de cookies pueden gestionarse
          desde el panel de configuración disponible en el pie de página de la aplicación.
        </p>
      </section>

      <section style={{ paddingBottom: '0.25rem' }}>
        <h2 style={h2Style}>10. Contacto y actualizaciones</h2>
        <p style={pStyle}>
          Para cualquier consulta sobre esta política, contacta con nosotros en{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
          Nos reservamos el derecho a actualizar esta política cuando sea necesario. Los cambios relevantes
          serán comunicados dentro de la propia aplicación.
        </p>
      </section>
    </>
  );
}

function PrivacySectionsEn() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Data controller</h2>
        <p style={pStyle}>
          The controller responsible for the personal data collected through Anclora ShiftImport
          is <strong style={strongStyle}>Anclora Group</strong>.
          You can contact us at any time by email at{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Data we process</h2>
        <p style={pStyle}>Anclora ShiftImport may process the following categories of data:</p>
        <ul style={ulStyle}>
          <li><strong style={strongStyle}>Shift data:</strong> date, start and end time, shift type, location or work center, associated notes.</li>
          <li><strong style={strongStyle}>Usage preferences:</strong> visual theme configuration and calendar display options, stored in <code>localStorage</code>.</li>
          <li><strong style={strongStyle}>Minimal operational logs:</strong> technical synchronization records required for the correct operation of the backend service (Neon DB).</li>
          <li><strong style={strongStyle}>Data imported from PDF:</strong> shift information extracted through text recognition of documents provided by the user.</li>
        </ul>
        <p style={{ ...pStyle, marginTop: '0.75rem' }}>
          No specially protected categories of data or data from minors are collected. No automated profiling with legal effects is performed.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>3. Purposes of processing</h2>
        <ul style={ulStyle}>
          <li>Managing and displaying the user's work shifts.</li>
          <li>Synchronizing data across devices when the user enables that feature.</li>
          <li>Enabling the import and recognition of shifts from PDF files.</li>
          <li>Maintaining the application's personalization preferences.</li>
          <li>Ensuring the correct technical operation and operational security of the service.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>4. Legal basis</h2>
        <p style={pStyle}>
          Processing is based on the controller's <strong style={strongStyle}>legitimate interest</strong> in
          operating the service requested by the user (Art. 6.1.f GDPR), and on the user's{' '}
          <strong style={strongStyle}>consent</strong> for the use of optional cookies
          or synchronization features (Art. 6.1.a GDPR).
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. Data retention</h2>
        <ul style={ulStyle}>
          <li><strong style={strongStyle}>Local data (localStorage):</strong> persists on the user's device until the user manually deletes it or clears their browser data.</li>
          <li><strong style={strongStyle}>Synchronization data:</strong> retained while the service is active and the user keeps their account, or until deletion is requested.</li>
          <li><strong style={strongStyle}>Operational logs:</strong> automatically deleted after the minimum period required to ensure system security.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6. Recipients and disclosures</h2>
        <p style={pStyle}>
          Data is not disclosed to third parties except where legally required. Synchronization data is processed
          by the database infrastructure provider (Neon DB), acting as a data processor
          under the relevant contractual and technical safeguards. No international data transfers
          outside the European Economic Area are knowingly made.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6bis. Providers and sub-processors</h2>
        <p style={pStyle}>Minimum inventory of third parties that may be involved in the service's technical processing:</p>
        <ul style={ulStyle}>
          <li><strong style={strongStyle}>Vercel:</strong> application hosting (static hosting and synchronization functions).</li>
          <li><strong style={strongStyle}>Neon DB:</strong> cross-device synchronization database. Only contacted if the user explicitly enables synchronization; by default the application runs in local mode (<code>localStorage</code>) and does not contact it.</li>
          <li><strong style={strongStyle}>tesseract.js (local OCR):</strong> text recognition in images runs in the user's own browser. Only the OCR engine binaries (never the user's document) may be downloaded from a public CDN on first use.</li>
        </ul>
        <p style={{ ...pStyle, marginTop: '0.75rem' }}>
          No shift roster document or image imported by the user is uploaded to or retained on any server:
          the file is processed in browser memory and discarded once the import completes. No analytics or
          advertising provider receives shift data or employee identifiers.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>7. Security</h2>
        <p style={pStyle}>
          Anclora ShiftImport applies technical and organizational measures appropriate to the risk of processing,
          including encrypted communications via HTTPS, database access controls, and
          environment separation. Data stored locally on the user's device is
          subject to the security measures of the operating system and browser used.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>8. Data subject rights</h2>
        <p style={pStyle}>
          In accordance with the GDPR (EU) 2016/679 and Spain's LOPDGDD, the user may exercise the following rights:
        </p>
        <ul style={ulStyle}>
          <li><strong style={strongStyle}>Access:</strong> obtain confirmation of whether their data is being processed and access it.</li>
          <li><strong style={strongStyle}>Rectification:</strong> correct inaccurate or incomplete data.</li>
          <li><strong style={strongStyle}>Erasure:</strong> request deletion of their data when it is no longer necessary.</li>
          <li><strong style={strongStyle}>Portability:</strong> receive their data in a structured, commonly used format.</li>
          <li><strong style={strongStyle}>Objection and restriction:</strong> object to processing or request its restriction in the cases provided by law.</li>
        </ul>
        <p style={{ ...pStyle, marginTop: '0.75rem' }}>
          To exercise any of these rights, send your request to{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
          You may also file a complaint with the Spanish Data Protection Agency (AEPD) at{' '}
          <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" style={linkStyle}>www.aepd.es</a>.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>9. Cookies</h2>
        <p style={pStyle}>
          Anclora ShiftImport uses cookies strictly necessary for the application to function
          (session, theme preferences) and may use optional cookies for usage analysis, always
          subject to the user's prior consent. Cookie preferences can be managed
          from the settings panel available in the application's footer.
        </p>
      </section>

      <section style={{ paddingBottom: '0.25rem' }}>
        <h2 style={h2Style}>10. Contact and updates</h2>
        <p style={pStyle}>
          For any questions about this policy, contact us at{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
          We reserve the right to update this policy when necessary. Material changes
          will be communicated within the application itself.
        </p>
      </section>
    </>
  );
}

function PrivacySections({ locale }: { locale: Locale }) {
  return locale === 'en' ? <PrivacySectionsEn /> : <PrivacySectionsEs />;
}

/* ─── Terms sections ────────────────────────────────────────────────────── */

function TermsSectionsEs() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Objeto</h2>
        <p style={pStyle}>
          Las presentes condiciones regulan el acceso y uso de <strong style={strongStyle}>Anclora ShiftImport</strong>,
          un producto del ecosistema Anclora Group que convierte cuadrantes de trabajo en PDF, imagen o formatos
          compatibles en un calendario personal estructurado, revisable y exportable.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Condiciones de uso</h2>
        <p style={pStyle}>
          El acceso a Anclora ShiftImport implica la aceptación plena de las presentes condiciones. El usuario
          se compromete a utilizar la aplicación de forma lícita, responsable y conforme a su finalidad.
          Queda prohibido el uso de la herramienta para fines distintos a la gestión personal de turnos,
          así como cualquier intento de acceso no autorizado a los sistemas subyacentes.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>3. Responsabilidades del usuario</h2>
        <ul style={ulStyle}>
          <li>Verificar la exactitud de los datos introducidos o importados en la aplicación.</li>
          <li>Asegurarse de que los documentos PDF importados son de su propiedad o cuenta con autorización para utilizarlos.</li>
          <li>Custodiar adecuadamente el acceso a su dispositivo y a los datos almacenados localmente.</li>
          <li>No compartir datos de terceros sin el consentimiento de estos.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>4. Limitaciones de uso</h2>
        <p style={pStyle}>
          Anclora ShiftImport es una herramienta de apoyo a la gestión personal. <strong style={strongStyle}>No sustituye</strong>{' '}
          en ningún caso la documentación laboral oficial, convenios colectivos, contratos de trabajo,
          registros legales de jornada exigidos por la normativa vigente ni el asesoramiento de profesionales
          del ámbito laboral o jurídico.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. Disponibilidad del servicio</h2>
        <p style={pStyle}>
          Anclora Group no garantiza la disponibilidad continua e ininterrumpida del backend de sincronización.
          La funcionalidad offline basada en <code>localStorage</code> permanecerá operativa independientemente
          del estado del servicio de sincronización. Nos reservamos el derecho a realizar mantenimientos,
          actualizaciones o interrupciones temporales del servicio, comunicándolo cuando sea posible.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6. Propiedad intelectual</h2>
        <p style={pStyle}>
          Todos los derechos de propiedad intelectual sobre Anclora ShiftImport —incluyendo código fuente,
          diseño, logotipos, textos y funcionalidades— pertenecen a Anclora Group o a sus licenciantes.
          Queda prohibida la reproducción, distribución, modificación o explotación de cualquier elemento
          de la aplicación sin autorización expresa y escrita de Anclora Group.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>7. Exclusión de garantías</h2>
        <p style={pStyle}>
          La aplicación se proporciona «tal cual» (<em>as is</em>). Anclora Group no garantiza que la
          herramienta esté libre de errores, que la importación desde PDF sea exacta en todos los casos
          ni que los datos extraídos reflejen con precisión el documento original. El usuario asume la
          responsabilidad de revisar y validar toda la información gestionada a través de la aplicación.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>8. Limitación de responsabilidad</h2>
        <p style={pStyle}>
          En la máxima medida permitida por la legislación aplicable, Anclora Group no será responsable
          de daños directos, indirectos, incidentales o consecuentes derivados del uso o la imposibilidad
          de uso de la aplicación, incluyendo errores en la importación de datos, pérdida de información
          almacenada localmente o interrupciones del servicio de sincronización.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>9. Cambios en las condiciones</h2>
        <p style={pStyle}>
          Anclora Group se reserva el derecho a modificar las presentes condiciones en cualquier momento.
          Los cambios relevantes serán notificados dentro de la propia aplicación. El uso continuado de
          Anclora ShiftImport tras la publicación de las nuevas condiciones implica su aceptación.
        </p>
      </section>

      <section style={{ paddingBottom: '0.25rem' }}>
        <h2 style={h2Style}>10. Contacto</h2>
        <p style={pStyle}>
          Para cualquier consulta relacionada con estos términos, contacta con nosotros en{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
        </p>
      </section>
    </>
  );
}

function TermsSectionsEn() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Purpose</h2>
        <p style={pStyle}>
          These terms govern access to and use of <strong style={strongStyle}>Anclora ShiftImport</strong>,
          a product of the Anclora Group ecosystem that converts work schedules in PDF, image, or compatible
          formats into a structured, reviewable, and exportable personal calendar.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Terms of use</h2>
        <p style={pStyle}>
          Access to Anclora ShiftImport implies full acceptance of these terms. The user
          agrees to use the application lawfully, responsibly, and in accordance with its purpose.
          Any use of the tool for purposes other than personal shift management is prohibited,
          as is any attempt at unauthorized access to the underlying systems.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>3. User responsibilities</h2>
        <ul style={ulStyle}>
          <li>Verify the accuracy of the data entered or imported into the application.</li>
          <li>Ensure that imported PDF documents are their own property or that they have authorization to use them.</li>
          <li>Adequately safeguard access to their device and the data stored locally.</li>
          <li>Not share third parties' data without their consent.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>4. Limitations of use</h2>
        <p style={pStyle}>
          Anclora ShiftImport is a personal-management support tool. <strong style={strongStyle}>It does not replace</strong>{' '}
          in any case official labor documentation, collective bargaining agreements, employment contracts,
          legal working-time records required by applicable regulations, or the advice of
          labor or legal professionals.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. Service availability</h2>
        <p style={pStyle}>
          Anclora Group does not guarantee continuous, uninterrupted availability of the synchronization backend.
          Offline functionality based on <code>localStorage</code> will remain operational regardless
          of the status of the synchronization service. We reserve the right to perform maintenance,
          updates, or temporary service interruptions, notifying users when possible.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6. Intellectual property</h2>
        <p style={pStyle}>
          All intellectual property rights over Anclora ShiftImport —including source code,
          design, logos, text, and functionality— belong to Anclora Group or its licensors.
          Reproduction, distribution, modification, or exploitation of any element
          of the application without the express written authorization of Anclora Group is prohibited.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>7. Disclaimer of warranties</h2>
        <p style={pStyle}>
          The application is provided "as is" (<em>as is</em>). Anclora Group does not warrant that the
          tool is free of errors, that PDF import is accurate in all cases,
          or that extracted data accurately reflects the original document. The user assumes
          responsibility for reviewing and validating all information managed through the application.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>8. Limitation of liability</h2>
        <p style={pStyle}>
          To the maximum extent permitted by applicable law, Anclora Group shall not be liable
          for direct, indirect, incidental, or consequential damages arising from the use or inability
          to use the application, including errors in data import, loss of information
          stored locally, or interruptions of the synchronization service.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>9. Changes to these terms</h2>
        <p style={pStyle}>
          Anclora Group reserves the right to modify these terms at any time.
          Material changes will be notified within the application itself. Continued use of
          Anclora ShiftImport after new terms are published constitutes acceptance of them.
        </p>
      </section>

      <section style={{ paddingBottom: '0.25rem' }}>
        <h2 style={h2Style}>10. Contact</h2>
        <p style={pStyle}>
          For any questions related to these terms, contact us at{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
        </p>
      </section>
    </>
  );
}

function TermsSections({ locale }: { locale: Locale }) {
  return locale === 'en' ? <TermsSectionsEn /> : <TermsSectionsEs />;
}

/* ─── Legal notice sections ─────────────────────────────────────────────── */

function LegalSectionsEs() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Titularidad</h2>
        <p style={pStyle}>
          El titular y operador de Anclora ShiftImport es <strong style={strongStyle}>Anclora Group</strong>.
          Para cualquier comunicación relacionada con el presente aviso legal, puedes dirigirte a{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Naturaleza del servicio</h2>
        <p style={pStyle}>
          Anclora ShiftImport es un producto del ecosistema Anclora Group, diseñado para importar
          cuadrantes de trabajo a un calendario personal. Su uso tiene carácter auxiliar y no constituye en ningún
          caso un servicio de asesoramiento laboral, jurídico ni administrativo.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>3. Uso permitido</h2>
        <p style={pStyle}>
          El acceso y uso de Anclora ShiftImport está permitido exclusivamente para fines lícitos y acordes
          con su finalidad operativa. Queda prohibido cualquier uso que vulnere la legislación vigente,
          los derechos de terceros o las presentes condiciones de uso.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>4. Propiedad intelectual</h2>
        <p style={pStyle}>
          Todos los elementos que integran Anclora ShiftImport —incluyendo, sin limitación, el código fuente,
          la interfaz, los textos, los gráficos y los logotipos— son propiedad de Anclora Group o de sus
          colaboradores y están protegidos por la normativa de propiedad intelectual e industrial aplicable.
          Su reproducción total o parcial sin autorización expresa queda expresamente prohibida.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. Responsabilidad sobre los datos</h2>
        <p style={pStyle}>
          La información y los datos introducidos en Anclora ShiftImport son responsabilidad exclusiva del
          usuario. Anclora Group no verifica la exactitud de los datos introducidos ni de los extraídos
          mediante importación de PDF, y no asume responsabilidad alguna por decisiones adoptadas en base
          a dicha información.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6. Marca</h2>
        <p style={pStyle}>
          «Anclora ShiftImport» y «Anclora Group» son nombres comerciales utilizados en el tráfico mercantil
          por sus titulares. No se afirma el registro de marca concedido. Cualquier uso no autorizado de
          estas denominaciones queda prohibido.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>7. Legislación aplicable</h2>
        <p style={pStyle}>
          El presente aviso legal se rige por la legislación española y, en lo que resulte de aplicación,
          por la normativa de la Unión Europea. Para la resolución de cualquier controversia derivada del
          acceso o uso de Anclora ShiftImport, las partes se someten a los juzgados y tribunales competentes
          conforme a la normativa vigente.
        </p>
      </section>

      <section style={{ paddingBottom: '0.25rem' }}>
        <h2 style={h2Style}>8. Contacto</h2>
        <p style={pStyle}>
          Para cualquier consulta relacionada con este aviso legal, puedes contactarnos en{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
        </p>
      </section>
    </>
  );
}

function LegalSectionsEn() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Ownership</h2>
        <p style={pStyle}>
          The owner and operator of Anclora ShiftImport is <strong style={strongStyle}>Anclora Group</strong>.
          For any communication related to this legal notice, you can reach us at{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Nature of the service</h2>
        <p style={pStyle}>
          Anclora ShiftImport is a product of the Anclora Group ecosystem, designed to import
          work schedules into a personal calendar. Its use is auxiliary in nature and does not constitute in any
          way a labor, legal, or administrative advisory service.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>3. Permitted use</h2>
        <p style={pStyle}>
          Access to and use of Anclora ShiftImport is permitted exclusively for lawful purposes consistent
          with its operational purpose. Any use that violates applicable law,
          third-party rights, or these terms of use is prohibited.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>4. Intellectual property</h2>
        <p style={pStyle}>
          All elements that make up Anclora ShiftImport —including, without limitation, the source code,
          the interface, text, graphics, and logos— are the property of Anclora Group or its
          collaborators and are protected by applicable intellectual and industrial property law.
          Their full or partial reproduction without express authorization is expressly prohibited.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. Responsibility for data</h2>
        <p style={pStyle}>
          The information and data entered into Anclora ShiftImport are the sole responsibility of the
          user. Anclora Group does not verify the accuracy of data entered or extracted
          via PDF import, and assumes no responsibility for decisions made based
          on that information.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>6. Trademark</h2>
        <p style={pStyle}>
          "Anclora ShiftImport" and "Anclora Group" are trade names used in commerce
          by their owners. No claim of a granted trademark registration is made. Any unauthorized use of
          these names is prohibited.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>7. Applicable law</h2>
        <p style={pStyle}>
          This legal notice is governed by Spanish law and, where applicable,
          European Union regulations. For the resolution of any dispute arising from
          access to or use of Anclora ShiftImport, the parties submit to the competent courts and tribunals
          in accordance with applicable regulations.
        </p>
      </section>

      <section style={{ paddingBottom: '0.25rem' }}>
        <h2 style={h2Style}>8. Contact</h2>
        <p style={pStyle}>
          For any questions related to this legal notice, you can contact us at{' '}
          <a href="mailto:hola@anclora.com" style={linkStyle}>hola@anclora.com</a>.
        </p>
      </section>
    </>
  );
}

function LegalSections({ locale }: { locale: Locale }) {
  return locale === 'en' ? <LegalSectionsEn /> : <LegalSectionsEs />;
}

/* ─── Local data reset (privacy-only) ───────────────────────────────────── */

function LocalDataReset() {
  const { t } = useI18n();
  const [status, setStatus] = useState<'idle' | 'done'>('idle');

  const handleReset = () => {
    const confirmed = window.confirm(t('privacy.resetConfirm'));
    if (!confirmed) return;
    resetAllLocalData();
    setStatus('done');
  };

  return (
    <div
      style={{
        marginTop: '2rem',
        padding: '1.25rem 1.5rem',
        border: '1px solid var(--danger-border)',
        borderRadius: 12,
        background: 'var(--danger-bg)',
      }}
    >
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--text)' }}>{t('privacy.resetTitle')}</p>
      <p style={{ margin: '0.5rem 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        {t('privacy.resetDescription')}
      </p>
      <button
        type="button"
        onClick={handleReset}
        style={{ padding: '10px 16px', fontWeight: 800, borderRadius: 12, border: '1px solid var(--danger-border)', color: 'var(--danger)', background: 'transparent', cursor: 'pointer' }}
      >
        {t('privacy.resetButton')}
      </button>
      {status === 'done' && (
        <p style={{ margin: '0.75rem 0 0', color: 'var(--text)', fontSize: '0.85rem' }}>
          {t('privacy.resetDone')}
        </p>
      )}
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export function LegalPage({ kind }: { kind: Kind }) {
  const { t, locale } = useI18n();
  const title =
    kind === 'privacy'
      ? t('legalPage.titlePrivacy')
      : kind === 'terms'
      ? t('legalPage.titleTerms')
      : t('legalPage.titleLegal');
  const lastUpdated = locale === 'en' ? 'Last updated: May 2026' : 'Última actualización: mayo de 2026';

  return (
    <div style={{ position: 'fixed', inset: 0, overflowY: 'auto', zIndex: 100, background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <main>
        <article
          style={{
            maxWidth: 800,
            margin: '0 auto',
            padding: '3rem 1.5rem 6rem',
          }}
        >
          {/* Header */}
          <header style={{ marginBottom: '2.5rem' }}>
            <p
              style={{
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: 'var(--accent-gold)',
                marginBottom: '0.5rem',
                margin: '0 0 0.5rem',
              }}
            >
              Legal
            </p>
            <h1
              style={{
                fontSize: 'clamp(1.75rem, 4vw, 2.5rem)',
                fontWeight: 800,
                margin: 0,
              }}
            >
              {title}
            </h1>
            <p
              style={{
                color: 'var(--text-muted)',
                marginTop: '0.5rem',
                fontSize: '0.875rem',
              }}
            >
              {lastUpdated}
            </p>
            <hr
              style={{
                marginTop: '1.5rem',
                border: 'none',
                borderTop: '1px solid var(--glass-border)',
              }}
            />
          </header>

          {/* Sections */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '2rem',
              color: 'var(--text-muted)',
            }}
          >
            {kind === 'privacy' && <PrivacySections locale={locale} />}
            {kind === 'terms' && <TermsSections locale={locale} />}
            {kind === 'legal' && <LegalSections locale={locale} />}
          </div>

          {/* Contact block */}
          <div
            style={{
              marginTop: '3rem',
              padding: '1.25rem 1.5rem',
              border: '1px solid var(--glass-border)',
              borderRadius: 12,
              background: 'var(--panel-muted-bg)',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700, color: 'var(--text)' }}>
              {t('legalPage.contactTitle')}
            </p>
            <p style={{ margin: '0.5rem 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Anclora Group &mdash;{' '}
              <a
                href="mailto:hola@anclora.com"
                style={{ color: 'var(--accent-gold)' }}
              >
                hola@anclora.com
              </a>
            </p>
            <p style={{ margin: '0.35rem 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              {t('legalPage.contactDescription')}
            </p>
          </div>

          {kind === 'privacy' && <LocalDataReset />}

          {/* Back button */}
          <div style={{ marginTop: '2rem' }}>
            <a className="btn-gold" href="/">
              {t('legalPage.backHome')}
            </a>
          </div>
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
