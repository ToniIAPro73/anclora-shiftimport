import { useState } from 'react';
import { LegalFooter } from './LegalFooter';
import { resetAllLocalData } from '../lib/privacy';

type Kind = 'privacy' | 'terms' | 'legal';

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

/* ─── Privacy sections ──────────────────────────────────────────────────── */

function PrivacySections() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Responsable del tratamiento</h2>
        <p style={pStyle}>
          El responsable del tratamiento de los datos personales recogidos a través de Anclora ShiftImport
          es <strong style={{ color: 'var(--text)' }}>Anclora Group</strong>.
          Puedes contactarnos en cualquier momento mediante el correo electrónico{' '}
          <a href="mailto:hola@anclora.com" style={{ color: 'var(--accent-gold)' }}>hola@anclora.com</a>.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>2. Datos que tratamos</h2>
        <p style={pStyle}>Anclora ShiftImport puede tratar las siguientes categorías de datos:</p>
        <ul style={ulStyle}>
          <li><strong style={{ color: 'var(--text)' }}>Datos de turnos:</strong> fecha, hora de inicio y fin, tipo de turno, ubicación o centro de trabajo, notas asociadas.</li>
          <li><strong style={{ color: 'var(--text)' }}>Preferencias de uso:</strong> configuración de tema visual y opciones de visualización del calendario, almacenadas en <code>localStorage</code>.</li>
          <li><strong style={{ color: 'var(--text)' }}>Logs operativos mínimos:</strong> registros técnicos de sincronización necesarios para el correcto funcionamiento del servicio backend (Neon DB).</li>
          <li><strong style={{ color: 'var(--text)' }}>Datos importados de PDF:</strong> información de turnos extraída mediante reconocimiento de texto de documentos aportados por el propio usuario.</li>
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
          El tratamiento se basa en el <strong style={{ color: 'var(--text)' }}>interés legítimo</strong> del responsable
          para operar el servicio solicitado por el usuario (art. 6.1.f RGPD), y en el{' '}
          <strong style={{ color: 'var(--text)' }}>consentimiento</strong> del usuario para el uso de cookies opcionales
          o funcionalidades de sincronización (art. 6.1.a RGPD).
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>5. Conservación de los datos</h2>
        <ul style={ulStyle}>
          <li><strong style={{ color: 'var(--text)' }}>Datos locales (localStorage):</strong> persisten en el dispositivo del usuario hasta que este los elimina manualmente o borra los datos del navegador.</li>
          <li><strong style={{ color: 'var(--text)' }}>Datos de sincronización:</strong> se conservan mientras el servicio esté activo y el usuario mantenga su cuenta, o hasta que solicite su supresión.</li>
          <li><strong style={{ color: 'var(--text)' }}>Logs operativos:</strong> se eliminan de forma automática transcurrido el período mínimo necesario para garantizar la seguridad del sistema.</li>
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
          <li><strong style={{ color: 'var(--text)' }}>Vercel:</strong> alojamiento de la aplicación (hosting estático y funciones de sincronización).</li>
          <li><strong style={{ color: 'var(--text)' }}>Neon DB:</strong> base de datos de sincronización entre dispositivos. Solo se contacta si el usuario activa explícitamente la sincronización; por defecto la aplicación funciona en modo local (<code>localStorage</code>) y no la contacta.</li>
          <li><strong style={{ color: 'var(--text)' }}>tesseract.js (OCR local):</strong> el reconocimiento de texto en imágenes se ejecuta en el propio navegador del usuario. Solo los binarios del motor OCR (no el documento del usuario) pueden descargarse desde una CDN pública en el primer uso.</li>
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
          <li><strong style={{ color: 'var(--text)' }}>Acceso:</strong> obtener confirmación sobre si se tratan sus datos y acceder a ellos.</li>
          <li><strong style={{ color: 'var(--text)' }}>Rectificación:</strong> corregir datos inexactos o incompletos.</li>
          <li><strong style={{ color: 'var(--text)' }}>Supresión:</strong> solicitar la eliminación de sus datos cuando ya no sean necesarios.</li>
          <li><strong style={{ color: 'var(--text)' }}>Portabilidad:</strong> recibir sus datos en un formato estructurado y de uso común.</li>
          <li><strong style={{ color: 'var(--text)' }}>Oposición y limitación:</strong> oponerse al tratamiento o solicitar su limitación en los casos previstos por la normativa.</li>
        </ul>
        <p style={{ ...pStyle, marginTop: '0.75rem' }}>
          Para ejercer cualquiera de estos derechos, envía tu solicitud a{' '}
          <a href="mailto:hola@anclora.com" style={{ color: 'var(--accent-gold)' }}>hola@anclora.com</a>.
          También puedes presentar una reclamación ante la Agencia Española de Protección de Datos (AEPD) en{' '}
          <a href="https://www.aepd.es" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)' }}>www.aepd.es</a>.
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
          <a href="mailto:hola@anclora.com" style={{ color: 'var(--accent-gold)' }}>hola@anclora.com</a>.
          Nos reservamos el derecho a actualizar esta política cuando sea necesario. Los cambios relevantes
          serán comunicados dentro de la propia aplicación.
        </p>
      </section>
    </>
  );
}

/* ─── Terms sections ────────────────────────────────────────────────────── */

function TermsSections() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Objeto</h2>
        <p style={pStyle}>
          Las presentes condiciones regulan el acceso y uso de <strong style={{ color: 'var(--text)' }}>Anclora ShiftImport</strong>,
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
          Anclora ShiftImport es una herramienta de apoyo a la gestión personal. <strong style={{ color: 'var(--text)' }}>No sustituye</strong>{' '}
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
          <a href="mailto:hola@anclora.com" style={{ color: 'var(--accent-gold)' }}>hola@anclora.com</a>.
        </p>
      </section>
    </>
  );
}

/* ─── Legal notice sections ─────────────────────────────────────────────── */

function LegalSections() {
  return (
    <>
      <section style={sectionStyle}>
        <h2 style={h2Style}>1. Titularidad</h2>
        <p style={pStyle}>
          El titular y operador de Anclora ShiftImport es <strong style={{ color: 'var(--text)' }}>Anclora Group</strong>.
          Para cualquier comunicación relacionada con el presente aviso legal, puedes dirigirte a{' '}
          <a href="mailto:hola@anclora.com" style={{ color: 'var(--accent-gold)' }}>hola@anclora.com</a>.
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
          <a href="mailto:hola@anclora.com" style={{ color: 'var(--accent-gold)' }}>hola@anclora.com</a>.
        </p>
      </section>
    </>
  );
}

/* ─── Local data reset (privacy-only) ───────────────────────────────────── */

function LocalDataReset() {
  const [status, setStatus] = useState<'idle' | 'done'>('idle');

  const handleReset = () => {
    const confirmed = window.confirm(
      'Esto eliminará permanentemente tus turnos, tipos de turno personalizados, perfil y preferencias guardadas en este dispositivo. ¿Continuar?',
    );
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
      <p style={{ margin: 0, fontWeight: 700, color: 'var(--text)' }}>Borrar mis datos locales</p>
      <p style={{ margin: '0.5rem 0 1rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
        Elimina de este dispositivo tus turnos, tipos de turno personalizados, perfil y preferencias. Esta acción
        no se puede deshacer.
      </p>
      <button
        type="button"
        onClick={handleReset}
        style={{ padding: '10px 16px', fontWeight: 800, borderRadius: 12, border: '1px solid var(--danger-border)', color: 'var(--danger)', background: 'transparent', cursor: 'pointer' }}
      >
        Borrar todos mis datos locales
      </button>
      {status === 'done' && (
        <p style={{ margin: '0.75rem 0 0', color: 'var(--text)', fontSize: '0.85rem' }}>
          Datos locales eliminados. Recarga la aplicación para empezar de nuevo.
        </p>
      )}
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */

export function LegalPage({ kind }: { kind: Kind }) {
  const title =
    kind === 'privacy'
      ? 'Política de privacidad'
      : kind === 'terms'
      ? 'Términos del servicio'
      : 'Aviso legal';

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
              Última actualización: mayo de 2026
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
            {kind === 'privacy' && <PrivacySections />}
            {kind === 'terms' && <TermsSections />}
            {kind === 'legal' && <LegalSections />}
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
              Contacto legal
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
              Para ejercer tus derechos o resolver cualquier consulta legal, escríbenos y te responderemos
              en el menor tiempo posible.
            </p>
          </div>

          {kind === 'privacy' && <LocalDataReset />}

          {/* Back button */}
          <div style={{ marginTop: '2rem' }}>
            <a className="btn-gold" href="/">
              Volver al inicio
            </a>
          </div>
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
