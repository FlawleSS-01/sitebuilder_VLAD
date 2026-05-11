import fs from "fs";
import path from "path";
import archiver from "archiver";
import { ensureProjectDistBuilt } from "./archiveManager.js";

export type CordovaAppMeta = {
  brand: string;
  domain: string;
  cleanBrand: string;
  appId: string;
};

export function readCordovaMetadata(projectPath: string): CordovaAppMeta {
  const settingsPath = path.join(projectPath, "project-settings.json");
  let brand = "App";
  let domain = "com.example.app";

  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      if (settings.brand) brand = String(settings.brand);
      if (settings.domain) domain = String(settings.domain);
    } catch (e) {
      console.warn("Failed to read project-settings.json for APK generation", e);
    }
  }

  const cleanBrand = brand.replace(/[^a-zA-Z0-9]/g, "") || "App";
  let slug = (cleanBrand.toLowerCase() || "app").replace(/[^a-z0-9]/g, "") || "app";
  if (!/^[a-z]/.test(slug)) slug = `app${slug}`;
  let domainSlug =
    domain.replace(/[^a-zA-Z0-9]/g, "").toLowerCase() || "example";
  if (!/^[a-z]/.test(domainSlug)) domainSlug = `x${domainSlug}`;
  const appId = `com.${domainSlug}.${slug}`;

  return { brand, domain, cleanBrand, appId };
}

/** Экранирование текста внутри XML-элементов */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function npmSafePackageName(meta: CordovaAppMeta): string {
  const base =
    meta.cleanBrand.toLowerCase().replace(/[^a-z0-9-]/g, "") || "app";
  const name = base.length >= 2 ? base.slice(0, 214) : "sitebuilder-app";
  return /^[a-z]/.test(name) ? name : `app-${name}`;
}

/**
 * Готовый каталог Cordova без вызова `cordova create` (на части машин create падает).
 * После вызова: выполнить в destDir `npm install`, затем `cordova platform add android` и `cordova build android`.
 */
export function writeCordovaProjectDir(
  destDir: string,
  distPath: string,
  meta: CordovaAppMeta
): void {
  const { brand, domain, appId } = meta;
  const bEsc = escapeXml(brand);
  const dEsc = escapeXml(domain);

  fs.mkdirSync(destDir, { recursive: true });

  const wwwDir = path.join(destDir, "www");
  fs.rmSync(wwwDir, { recursive: true, force: true });
  fs.cpSync(distPath, wwwDir, { recursive: true });

  for (const sub of ["platforms", "plugins", "hooks"]) {
    fs.mkdirSync(path.join(destDir, sub), { recursive: true });
  }

  const configXml = `<?xml version='1.0' encoding='utf-8'?>
<widget id="${appId}" version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
    <name>${bEsc}</name>
    <description>Official App for ${bEsc}</description>
    <author email="dev@${dEsc}" href="https://${dEsc}">
        ${bEsc} Team
    </author>
    <content src="index.html" />
    <access origin="*" />
    <allow-intent href="http://*/*" />
    <allow-intent href="https://*/*" />
    <allow-intent href="tel:*" />
    <allow-intent href="sms:*" />
    <allow-intent href="mailto:*" />
    <allow-intent href="geo:*" />
    <platform name="android">
        <allow-intent href="market:*" />
    </platform>
    <platform name="ios">
        <allow-intent href="itms:*" />
        <allow-intent href="itms-apps:*" />
    </platform>
</widget>`;
  fs.writeFileSync(path.join(destDir, "config.xml"), configXml, "utf-8");

  const pkgName = npmSafePackageName(meta);
  const packageJson = {
    name: pkgName,
    displayName: brand,
    version: "1.0.0",
    description: `Official App for ${brand}`,
    private: true,
    main: "index.js",
    scripts: {
      test: 'echo "Error: no test specified" && exit 1',
    },
    keywords: ["ecosystem:cordova"],
    author: `${brand} Team`,
    license: "ISC",
    devDependencies: {
      cordova: "^12.0.0",
    },
    cordova: {
      platforms: [] as string[],
      plugins: {} as Record<string, never>,
    },
  };
  fs.writeFileSync(
    path.join(destDir, "package.json"),
    JSON.stringify(packageJson, null, 2),
    "utf-8"
  );

  const buildJson = {
    android: {
      release: {
        keystore: "app.keystore",
        storePassword: "password",
        alias: "app",
        password: "password",
        keystoreType: "",
      },
    },
  };
  fs.writeFileSync(
    path.join(destDir, "build.json"),
    JSON.stringify(buildJson, null, 2),
    "utf-8"
  );
}

/** Короткое безопасное имя приложения для CLI Cordova */
export function cordovaCliDisplayName(meta: CordovaAppMeta): string {
  let raw = meta.brand.replace(/"/g, "'").trim() || "Web App";
  if (!/^[\x20-\x7e]+$/.test(raw)) {
    const ascii =
      meta.cleanBrand.replace(/[^a-zA-Z0-9 ]/g, "").trim() || "";
    raw = ascii.length >= 2 ? ascii : "WebApp";
  }
  return raw.length > 120 ? raw.slice(0, 117) + "..." : raw;
}

export async function generateApkSourceZip(
  projectPath: string,
  projectName: string,
  outputPath: string
): Promise<void> {
  const distPath = await ensureProjectDistBuilt(projectPath);
  const { brand, domain, cleanBrand, appId } = readCordovaMetadata(projectPath);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver("zip", {
      zlib: { level: 9 },
    });

    output.on("close", () => {
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add www folder (the built site)
    archive.directory(distPath, "www");

    // Add empty directories
    archive.append("", { name: "icons/.keep" });
    archive.append("", { name: "platforms/.keep" });
    archive.append("", { name: "plugins/.keep" });
    archive.append("", { name: "res/.keep" });
    archive.append("", { name: "node_modules/.keep" });

    // config.xml
    const configXml = `<?xml version='1.0' encoding='utf-8'?>
<widget id="${appId}" version="1.0.0" xmlns="http://www.w3.org/ns/widgets" xmlns:cdv="http://cordova.apache.org/ns/1.0">
    <name>${brand}</name>
    <description>Official App for ${brand}</description>
    <author email="dev@${domain}" href="https://${domain}">
        ${brand} Team
    </author>
    <content src="index.html" />
    <access origin="*" />
    <allow-intent href="http://*/*" />
    <allow-intent href="https://*/*" />
    <allow-intent href="tel:*" />
    <allow-intent href="sms:*" />
    <allow-intent href="mailto:*" />
    <allow-intent href="geo:*" />
    <platform name="android">
        <allow-intent href="market:*" />
    </platform>
    <platform name="ios">
        <allow-intent href="itms:*" />
        <allow-intent href="itms-apps:*" />
    </platform>
</widget>`;
    archive.append(configXml, { name: "config.xml" });

    // package.json
    const packageJson = {
      name: cleanBrand.toLowerCase() || "app",
      displayName: brand,
      version: "1.0.0",
      description: `Official App for ${brand}`,
      main: "index.js",
      scripts: {
        test: "echo \"Error: no test specified\" && exit 1"
      },
      keywords: ["ecosystem:cordova"],
      author: `${brand} Team`,
      license: "ISC",
      dependencies: {
        "cordova-android": "^12.0.0",
        "cordova-ios": "^7.0.0"
      },
      cordova: {
        plugins: {},
        platforms: ["android", "ios"]
      }
    };
    archive.append(JSON.stringify(packageJson, null, 2), { name: "package.json" });

    // package-lock.json (dummy)
    const packageLockJson = {
      name: cleanBrand.toLowerCase() || "app",
      version: "1.0.0",
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: cleanBrand.toLowerCase() || "app",
          version: "1.0.0",
          license: "ISC",
          dependencies: {
            "cordova-android": "^12.0.0",
            "cordova-ios": "^7.0.0"
          }
        }
      }
    };
    archive.append(JSON.stringify(packageLockJson, null, 2), { name: "package-lock.json" });

    // build.json
    const buildJson = {
      android: {
        release: {
          keystore: "app.keystore",
          storePassword: "password",
          alias: "app",
          password: "password",
          keystoreType: ""
        }
      }
    };
    archive.append(JSON.stringify(buildJson, null, 2), { name: "build.json" });

    archive.finalize();
  });
}
