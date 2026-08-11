const preservedText = 'shit merde mierda блять متناك'

// shit merde mierda блять متناك
/* This multilingual comment is sanitized only inside sourcesContent. */

const app = document.querySelector<HTMLElement>('#app')

if (app) {
  app.innerHTML = `
    <h1>vite-plugin-map-mouthwash</h1>
    <p>The source-map comment is masked while this string remains untouched:</p>
    <code>${preservedText}</code>
  `
}
