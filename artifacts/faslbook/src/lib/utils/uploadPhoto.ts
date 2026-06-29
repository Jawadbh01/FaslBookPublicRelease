import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "@/lib/firebase/config";
import { compressImage } from "./compressImage";

export async function uploadPhoto(
  file: File,
  path: string,
  onProgress?: (pct: number) => void
): Promise<string> {
  // Compress first
  let toUpload: File;
  try {
    toUpload = await compressImage(file, { maxWidth: 800, quality: 0.7 });
  } catch {
    toUpload = file;
  }

  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, toUpload);
  const url = await getDownloadURL(storageRef);
  return url;
}

export function createLocalPreview(file: File): string {
  return URL.createObjectURL(file);
}

export function revokeLocalPreview(url: string) {
  try { URL.revokeObjectURL(url); } catch {}
}
