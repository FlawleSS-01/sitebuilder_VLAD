import fs from "fs";
import path from "path";
import SftpClient from "ssh2-sftp-client";
import { Client as FtpClient } from "basic-ftp";

export interface ServerUploadCredentials {
  host: string;
  port: number;
  username: string;
  password: string;
  remotePath: string;
}

export interface ServerUploadOptions {
  /** Домен проекта — для автоопределения корня сайта, если remotePath не задан. */
  domain?: string;
}

function normalizeRemotePath(p: string): string {
  const s = (p || "/").replace(/\\/g, "/").trim();
  if (!s || s === ".") return "/";
  return s.startsWith("/") ? s.replace(/\/+$/, "") || "/" : `/${s.replace(/\/+$/, "")}`;
}

/** remotePath считается "не задан" (корень/домашняя папка), когда пуст или "/". */
function isRootPath(p?: string): boolean {
  const s = (p || "").replace(/\\/g, "/").trim();
  return !s || s === "/" || s === "." || s === "./";
}

function cleanDomain(domain?: string): string {
  return (domain || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "");
}

/**
 * Кандидаты на корень документов домена относительно домашней папки логина.
 * Порядок важен: сначала специфичные для домена, потом общие.
 */
function webRootCandidates(domain?: string): string[] {
  const d = cleanDomain(domain);
  const list: string[] = [];
  if (d) {
    list.push(
      `www/${d}`,
      `domains/${d}/public_html`,
      `domains/${d}`,
      `${d}/public_html`,
      d
    );
  }
  list.push("public_html", "www", "htdocs", "httpdocs", "wwwroot", "web");
  return list;
}

async function resolveFtpWebRoot(
  client: FtpClient,
  domain?: string
): Promise<string | null> {
  let home = "/";
  try {
    home = await client.pwd();
  } catch {
    /* ignore */
  }
  for (const cand of webRootCandidates(domain)) {
    try {
      await client.cd(home);
      await client.cd(cand);
      const resolved = await client.pwd();
      // вернёмся в home, реальную загрузку сделаем по абсолютному пути
      await client.cd(home).catch(() => {});
      return resolved;
    } catch {
      /* каталога нет — пробуем следующий */
    }
  }
  await client.cd(home).catch(() => {});
  return null;
}

async function uploadDirSftp(
  sftp: SftpClient,
  localDir: string,
  remoteDir: string
): Promise<number> {
  let count = 0;
  await sftp.mkdir(remoteDir, true).catch(() => {});

  for (const entry of fs.readdirSync(localDir, { withFileTypes: true })) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = `${remoteDir}/${entry.name}`.replace(/\/+/g, "/");

    if (entry.isDirectory()) {
      count += await uploadDirSftp(sftp, localPath, remotePath);
    } else {
      await sftp.put(localPath, remotePath);
      count++;
    }
  }

  return count;
}

async function resolveSftpWebRoot(
  sftp: SftpClient,
  domain?: string
): Promise<string | null> {
  let home = "/";
  try {
    home = await sftp.realPath(".");
  } catch {
    /* ignore */
  }
  const base = home.replace(/\/+$/, "") || "";
  for (const cand of webRootCandidates(domain)) {
    const full = cand.startsWith("/") ? cand : `${base}/${cand}`;
    try {
      const ex = await sftp.exists(full);
      if (ex === "d") return full;
    } catch {
      /* ignore */
    }
  }
  return null;
}

async function uploadViaSftp(
  creds: ServerUploadCredentials,
  localDir: string,
  options?: ServerUploadOptions
): Promise<{ count: number; target: string }> {
  const sftp = new SftpClient();

  try {
    await sftp.connect({
      host: creds.host,
      port: creds.port,
      username: creds.username,
      password: creds.password,
      readyTimeout: 60_000,
    });

    let remoteBase: string;
    if (isRootPath(creds.remotePath)) {
      const detected = await resolveSftpWebRoot(sftp, options?.domain);
      if (detected) {
        remoteBase = detected;
        console.log(`[upload] SFTP: автоопределён корень сайта → ${detected}`);
      } else {
        remoteBase = normalizeRemotePath(creds.remotePath);
        console.warn(
          `[upload] SFTP: не удалось определить корень сайта, гружу в ${remoteBase}. ` +
            `Если сайт не открывается — задайте remotePath вручную (например /var/www/${cleanDomain(options?.domain) || "site"}).`
        );
      }
    } else {
      remoteBase = normalizeRemotePath(creds.remotePath);
    }

    const count = await uploadDirSftp(sftp, localDir, remoteBase);
    return { count, target: remoteBase };
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function uploadViaFtp(
  creds: ServerUploadCredentials,
  localDir: string,
  options?: ServerUploadOptions
): Promise<{ count: number; target: string }> {
  const client = new FtpClient(60_000);
  client.ftp.verbose = false;

  try {
    await client.access({
      host: creds.host,
      port: creds.port,
      user: creds.username,
      password: creds.password,
      secure: false,
    });

    let target: string;
    if (isRootPath(creds.remotePath)) {
      const detected = await resolveFtpWebRoot(client, options?.domain);
      if (detected) {
        target = detected;
        console.log(`[upload] FTP: автоопределён корень сайта → ${detected}`);
      } else {
        target = normalizeRemotePath(creds.remotePath);
        console.warn(
          `[upload] FTP: не удалось определить корень сайта, гружу в ${target} (домашняя папка). ` +
            `Если сайт не открывается — задайте remotePath вручную (например public_html или www/${cleanDomain(options?.domain) || "домен"}).`
        );
      }
    } else {
      target = normalizeRemotePath(creds.remotePath);
    }

    await client.ensureDir(target);
    await client.uploadFromDir(localDir, target);
    return { count: countFilesRecursive(localDir), target };
  } finally {
    client.close();
  }
}

function countFilesRecursive(dir: string): number {
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) n += countFilesRecursive(full);
    else n++;
  }
  return n;
}

/** Загружает содержимое локальной папки (dist) на сервер по SFTP или FTP. */
export async function uploadDirectoryToServer(
  creds: ServerUploadCredentials,
  localDir: string,
  options?: ServerUploadOptions
): Promise<{
  filesUploaded: number;
  protocol: "sftp" | "ftp";
  remotePath: string;
}> {
  if (!fs.existsSync(localDir)) {
    throw new Error(`Локальная папка не найдена: ${localDir}`);
  }

  const useFtp = creds.port === 21;
  const result = useFtp
    ? await uploadViaFtp(creds, localDir, options)
    : await uploadViaSftp(creds, localDir, options);

  return {
    filesUploaded: result.count,
    protocol: useFtp ? "ftp" : "sftp",
    remotePath: result.target,
  };
}
