import { config, assertConfig } from './config.js';
import { createDb } from './db.js';
import { createApp } from './app.js';

assertConfig(config);
const db = await createDb(config);
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`API jalan di http://localhost:${config.port}/api`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    server.close(async () => {
      try {
        await db.close();
        process.exit(0);
      } catch (error) {
        console.error('Gagal menutup koneksi MySQL:', error);
        process.exit(1);
      }
    });
  });
}
