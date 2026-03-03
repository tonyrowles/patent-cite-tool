import { defineConfig } from 'vitest/config';

// Chrome content scripts are classic scripts (no ES module support).
// This plugin auto-exports top-level function declarations so Vitest
// can import them without polluting the source with `export` keywords.
function classicScriptExports() {
  return {
    name: 'classic-script-exports',
    transform(code, id) {
      if (!id.includes('/content/') || id.includes('node_modules')) return;
      const names = [...code.matchAll(/^function\s+(\w+)\s*\(/gm)].map(m => m[1]);
      if (names.length === 0) return;
      return { code: code + `\nexport { ${names.join(', ')} };\n`, map: null };
    },
  };
}

export default defineConfig({
  plugins: [classicScriptExports()],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./tests/setup/chrome-stub.js'],
    include: ['tests/**/*.test.js'],
  },
});
