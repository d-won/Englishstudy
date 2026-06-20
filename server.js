/**
 * Minimal Express static server for the English-study PWA.
 *
 * Why Express even though everything is static? It gives correct MIME types
 * (service workers and manifests are picky), works the same in dev/prod, and
 * gives us a place to bolt on the Stage-2 Claude API proxy later.
 *
 * Run:  npm install && npm start
 * Open: http://<your-computer-ip>:3000  on your phone (same Wi-Fi).
 */
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the PWA. Service worker must be served from the app root scope.
app.use(
  express.static(path.join(__dirname, 'public'), {
    setHeaders(res, filePath) {
      // Never cache the service worker so updates roll out immediately.
      if (filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      }
    },
  })
);

// ---------------------------------------------------------------------------
// Stage-2 placeholder: AI conversation partner via the Claude API.
// Wire this up once you add an ANTHROPIC_API_KEY. Kept here so the front-end
// has a stable endpoint to target later.
// ---------------------------------------------------------------------------
app.post('/api/chat', express.json(), (req, res) => {
  res.status(501).json({
    error: 'not_implemented',
    message:
      'Stage 2: AI 대화 파트너는 아직 연결되지 않았습니다. ANTHROPIC_API_KEY를 설정하고 이 핸들러를 구현하세요.',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📚 EnglishStudy PWA running`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Phone:   http://<this-computer-LAN-ip>:${PORT}  (같은 Wi-Fi)\n`);
});
