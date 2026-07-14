import { putImage, loadImage, deleteImage } from "../images";
import { writeLocal, readLocal } from "../local";
import type { Rig } from "./rig-model";
import { RIG_KEY, RIG_REFERENCE_KEY, RIG_REFERENCE_ORIGINAL_KEY, defaultRig } from "./rig-model";

const APPROVED_FLAG = "docos.rig.approved";

export async function saveReferenceOriginal(dataUrl: string) {
  await putImage(RIG_REFERENCE_ORIGINAL_KEY, dataUrl);
}
export async function loadReferenceOriginal() {
  return loadImage(RIG_REFERENCE_ORIGINAL_KEY);
}

export async function saveReferenceProcessed(dataUrl: string) {
  await putImage(RIG_REFERENCE_KEY, dataUrl);
}
export async function loadReferenceProcessed() {
  return loadImage(RIG_REFERENCE_KEY);
}

export function saveRig(rig: Rig) {
  writeLocal(RIG_KEY, rig);
}
export function loadRig(): Rig {
  return readLocal<Rig>(RIG_KEY, defaultRig());
}

export function markApproved() {
  writeLocal(APPROVED_FLAG, true);
}
export function isApproved() {
  return readLocal<boolean>(APPROVED_FLAG, false);
}

export async function resetRig() {
  writeLocal(APPROVED_FLAG, false);
  writeLocal(RIG_KEY, defaultRig());
  await deleteImage(RIG_REFERENCE_KEY);
  await deleteImage(RIG_REFERENCE_ORIGINAL_KEY);
}