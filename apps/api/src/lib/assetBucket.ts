import { createHash, createHmac } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { signedStorageUrl } from "./storageUrls.js";

export type BucketDriver = "s3" | "local";

export interface StoredObject {
  key: string;
  sizeBytes: number;
  url: string | null;
}

interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
}

export interface StoredObjectBody {
  status: number;
  stream: Readable;
  contentType: string | null;
  contentLength: number | null;
  contentRange: string | null;
}

function readS3Config(): S3Config | null {
  const accountId = process.env.R2_ACCOUNT_ID ?? process.env.CLOUDFLARE_ACCOUNT_ID;
  const endpoint =
    process.env.S3_ENDPOINT ?? (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : undefined);
  const bucket = process.env.R2_BUCKET_NAME ?? process.env.S3_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID ?? process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY ?? process.env.S3_SECRET_ACCESS_KEY;
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL ?? process.env.S3_PUBLIC_BASE_URL;

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !publicBaseUrl) return null;

  return {
    endpoint: endpoint.replace(/\/+$/, ""),
    region: process.env.S3_REGION ?? "auto",
    bucket,
    accessKeyId,
    secretAccessKey,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

export function bucketDriver(): BucketDriver {
  return readS3Config() ? "s3" : "local";
}

export function bucketDescription(): string {
  const config = readS3Config();
  if (config) return `s3:${config.bucket}`;
  return `local:${localRoot()}`;
}

function localRoot(): string {
  return join(resolve(process.env.STORAGE_DIR ?? "./storage"), "models");
}

async function localPut(key: string, body: Buffer): Promise<StoredObject> {
  const path = join(localRoot(), key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  return { key, sizeBytes: body.length, url: signedStorageUrl(`models/${key}`) };
}

async function localDelete(key: string): Promise<void> {
  await rm(join(localRoot(), key), { force: true });
}

export function parseByteRange(header: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0) return null;
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end };
}

function contentTypeForKey(key: string): string {
  const extension = extname(key).toLowerCase();
  if (extension === ".glb") return "model/gltf-binary";
  if (extension === ".gltf") return "model/gltf+json";
  if (extension === ".json") return "application/json";
  return "application/octet-stream";
}

function numericHeader(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function localGet(key: string, rangeHeader?: string): Promise<StoredObjectBody | null> {
  const path = join(localRoot(), key);
  let size: number;
  try {
    size = (await stat(path)).size;
  } catch {
    return null;
  }

  const contentType = contentTypeForKey(key);
  const range = rangeHeader ? parseByteRange(rangeHeader, size) : null;
  if (!range) {
    return { status: 200, stream: createReadStream(path), contentType, contentLength: size, contentRange: null };
  }

  return {
    status: 206,
    stream: createReadStream(path, { start: range.start, end: range.end }),
    contentType,
    contentLength: range.end - range.start + 1,
    contentRange: `bytes ${range.start}-${range.end}/${size}`,
  };
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(
    /[!*'()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeSegment).join("/");
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

function signRequest(
  config: S3Config,
  method: "PUT" | "GET" | "DELETE" | "HEAD",
  key: string,
  payloadHash: string
): SignedRequest {
  const canonicalUri = `/${encodeSegment(config.bucket)}/${encodeKey(key)}`;
  const url = `${config.endpoint}${canonicalUri}`;
  const host = new URL(config.endpoint).host;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalHeaders =
    `host:${host}\n` + `x-amz-content-sha256:${payloadHash}\n` + `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [method, canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${config.region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${config.secretAccessKey}`, dateStamp), config.region), "s3"),
    "aws4_request"
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    url,
    headers: {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

async function s3Request(
  config: S3Config,
  method: "PUT" | "GET" | "DELETE" | "HEAD",
  key: string,
  body?: Buffer,
  contentType?: string,
  extraHeaders?: Record<string, string>
): Promise<Response> {
  const payloadHash = method === "PUT" ? sha256Hex(body ?? Buffer.alloc(0)) : sha256Hex("");
  const { url, headers } = signRequest(config, method, key, payloadHash);
  const finalHeaders: Record<string, string> = { ...headers };
  if (contentType) finalHeaders["content-type"] = contentType;
  if (extraHeaders) Object.assign(finalHeaders, extraHeaders);

  return fetch(url, { method, headers: finalHeaders, body: body ? new Uint8Array(body) : undefined });
}

export async function putObject(key: string, body: Buffer, contentType: string): Promise<StoredObject> {
  const config = readS3Config();
  if (!config) return localPut(key, body);

  const response = await s3Request(config, "PUT", key, body, contentType);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`The asset bucket refused the upload (${response.status}). ${detail}`.trim());
  }
  return { key, sizeBytes: body.length, url: `${config.publicBaseUrl}/${encodeKey(key)}` };
}

export async function deleteObject(key: string): Promise<void> {
  const config = readS3Config();
  if (!config) {
    await localDelete(key);
    return;
  }
  await s3Request(config, "DELETE", key);
}

export async function getObject(key: string, rangeHeader?: string): Promise<StoredObjectBody | null> {
  const config = readS3Config();
  if (!config) return localGet(key, rangeHeader);

  let response = await s3Request(
    config,
    "GET",
    key,
    undefined,
    undefined,
    rangeHeader ? { range: rangeHeader } : undefined
  );

  if (response.status === 416 && rangeHeader) {
    if (response.body) await response.body.cancel().catch(() => undefined);
    response = await s3Request(config, "GET", key);
  }

  if (response.status === 404) return null;
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(`The asset bucket refused the download (${response.status}). ${detail}`.trim());
  }

  return {
    status: response.status,
    stream: Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    contentType: response.headers.get("content-type") ?? contentTypeForKey(key),
    contentLength: numericHeader(response.headers.get("content-length")),
    contentRange: response.headers.get("content-range"),
  };
}

export function objectUrl(key: string): string | null {
  const config = readS3Config();
  if (config) return `${config.publicBaseUrl}/${encodeKey(key)}`;
  return signedStorageUrl(`models/${key}`);
}
