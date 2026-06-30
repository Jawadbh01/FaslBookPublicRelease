import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/config";
import { compressImage } from "./compressImage";

export class UploadError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

export async function uploadPhoto(
  file: File,
  path: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (!navigator.onLine) {
    throw new UploadError("You are offline. Connect to upload photos.", "offline");
  }

  let toUpload: File;
  try {
    toUpload = await compressImage(file, { maxWidth: 800, quality: 0.7 });
  } catch {
    toUpload = file;
  }

  onProgress?.(20);

  try {
    const storageRef = ref(storage, path);
    onProgress?.(40);
    await uploadBytes(storageRef, toUpload);
    onProgress?.(80);
    const url = await getDownloadURL(storageRef);
    onProgress?.(100);
    return url;
  } catch (err: any) {
    const code = err?.code ?? "unknown";
    if (code === "storage/unauthorized") {
      throw new UploadError(
        "Storage permission denied. Enable authenticated reads/writes in Firebase Console → Storage → Rules.",
        code
      );
    }
    if (code === "storage/canceled") {
      throw new UploadError("Upload was cancelled.", code);
    }
    if (code === "storage/unknown" || err?.message?.includes("CORS")) {
      throw new UploadError("Upload failed — check Firebase Storage CORS settings.", code);
    }
    throw new UploadError(err?.message ?? "Upload failed. Please try again.", code);
  }
}

export function createLocalPreview(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeLocalPreview(url: string) {
  try { URL.revokeObjectURL(url); } catch {}
}
