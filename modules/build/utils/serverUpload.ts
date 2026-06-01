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

function normalizeRemotePath(p: string): string {
  const s = (p || "/").replace(/\\/g, "/").trim();
  if (!s || s === ".") return "/";
  return s.startsWith("/") ? s.replace(/\/+$/, "") || "/" : `/${s.replace(/\/+$/, "")}`;
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

async function uploadViaSftp(
  creds: ServerUploadCredentials,
  localDir: string
): Promise<number> {
  const sftp = new SftpClient();
  const remoteBase = normalizeRemotePath(creds.remotePath);

  try {
    await sftp.connect({
      host: creds.host,
      port: creds.port,
      username: creds.username,
      password: creds.password,
      readyTimeout: 60_000,
    });
    return await uploadDirSftp(sftp, localDir, remoteBase);
  } finally {
    await sftp.end().catch(() => {});
  }
}

async function uploadViaFtp(
  creds: ServerUploadCredentials,
  localDir: string
): Promise<number> {
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
    const remoteBase = normalizeRemotePath(creds.remotePath);
    await client.ensureDir(remoteBase);
    await client.cd(remoteBase);
    await client.uploadFromDir(localDir);
    return countFilesRecursive(localDir);
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
  localDir: string
): Promise<{ filesUploaded: number; protocol: "sftp" | "ftp" }> {
  if (!fs.existsSync(localDir)) {
    throw new Error(`Локальная папка не найдена: ${localDir}`);
  }

  const useFtp = creds.port === 21;
  const filesUploaded = useFtp
    ? await uploadViaFtp(creds, localDir)
    : await uploadViaSftp(creds, localDir);

  return { filesUploaded, protocol: useFtp ? "ftp" : "sftp" };
}
