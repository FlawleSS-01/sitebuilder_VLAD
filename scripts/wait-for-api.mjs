/**
 * Ждёт, пока на порту API начнёт слушать TCP (Express поднялся).
 * Запускается перед Vite, чтобы прокси /api не получал ECONNREFUSED.
 */
import dotenv from "dotenv";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env") });

const port = Number(process.env.PORT || 3001);
const host = "127.0.0.1";
const timeoutMs = 120_000;
const pollMs = 250;

function tryPort() {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ port, host }, () => {
      socket.end();
      resolve();
    });
    socket.on("error", () => {
      socket.destroy();
      reject(new Error("retry"));
    });
  });
}

const started = Date.now();
while (Date.now() - started < timeoutMs) {
  try {
    await tryPort();
    console.log(
      `[wait-for-api] Доступен ${host}:${port} (${Date.now() - started} мс)`
    );
    process.exit(0);
  } catch {
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

console.error(
  `[wait-for-api] Нет ответа на ${host}:${port} за ${timeoutMs} мс. Проверьте npm run server и PORT в .env.`
);
process.exit(1);
