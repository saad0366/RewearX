import type { UploaderImage } from '../components/ui/ImageUploader';
import type { ApiItem } from './api/types';

type ImageApi = {
  byId(id: string): Promise<ApiItem>;
  addImages(id: string, files: File[]): Promise<ApiItem>;
  deleteImage(id: string, imageId: string | number): Promise<unknown>;
  setPrimary(id: string, imageId: string | number): Promise<ApiItem>;
};

export class ImageSaveNeedsReloadError extends Error {
  constructor(message: string) { super(message); this.name = 'ImageSaveNeedsReloadError'; }
}

/** Reconcile explicit edits only. Publish progress so retries never upload a file twice. */
export async function saveListingImages(
  id: string, desired: UploaderImage[], originalIds: Array<string | number>, api: ImageApi,
  progress: (images: UploaderImage[], savedIds: Array<string | number>) => void,
  maxImages = 5,
): Promise<void> {
  if (!desired.length || desired.length > maxImages) throw new Error('Choose between 1 and 5 listing images.');
  let pending = desired.map(image => ({ ...image }));
  let saved = (await api.byId(id)).images || [];
  const removable = new Set(originalIds.map(String));
  const retained = () => new Set(pending.filter(i => i.existingId !== undefined).map(i => String(i.existingId)));
  const publish = () => progress(pending.map(i => ({ ...i })),
    saved.filter(i => removable.has(String(i.id)) || retained().has(String(i.id))).map(i => i.id));
  const remove = async (imageId: string | number) => {
    await api.deleteImage(id, imageId);
    saved = saved.filter(i => String(i.id) !== String(imageId));
    publish();
  };
  for (const image of pending) {
    if (image.existingId !== undefined && !saved.some(s => String(s.id) === String(image.existingId))) {
      throw new Error('A selected image changed on the server. Reload the listing before saving.');
    }
  }
  while (pending.some(i => i.file && i.existingId === undefined)) {
    const capacity = maxImages - saved.length;
    if (capacity <= 0) {
      // Make room at the limit, but retain one saved image until a replacement uploads.
      const unwanted = saved.find(i => removable.has(String(i.id)) && !retained().has(String(i.id)));
      if (!unwanted || saved.length <= 1) throw new Error('The image limit changed. Reload the listing before saving.');
      await remove(unwanted.id);
      continue;
    }
    const batch = pending.filter(i => i.file && i.existingId === undefined).slice(0, capacity);
    const oldIds = new Set(saved.map(i => String(i.id)));
    let updated: ApiItem;
    try {
      updated = await api.addImages(id, batch.map(i => i.file!));
    } catch (error) {
      // An upload can succeed even when its HTTP response is lost; reconcile before retry.
      let current: ApiItem;
      try { current = await api.byId(id); }
      catch { throw new ImageSaveNeedsReloadError('Upload outcome is uncertain. Reload the listing before retrying.'); }
      const added = (current.images || []).filter(i => !oldIds.has(String(i.id)));
      if (added.length) {
        // Do not assume a concurrent upload belongs to this request.
        throw new ImageSaveNeedsReloadError('Upload outcome is uncertain. Reload the listing before retrying.');
      }
      throw error;
    }
    const added = (updated.images || []).filter(i => !oldIds.has(String(i.id)));
    if (added.length !== batch.length) throw new ImageSaveNeedsReloadError('Upload outcome is uncertain. Reload the listing before retrying.');
    batch.forEach((image, index) => Object.assign(image, { existingId: added[index].id, url: added[index].url }));
    saved = updated.images || []; publish();
  }
  const primary = pending[0].existingId;
  if (primary === undefined) throw new Error('Primary image was not saved.');
  await api.setPrimary(id, primary);
  for (const image of [...saved]) {
    if (removable.has(String(image.id)) && !retained().has(String(image.id))) await remove(image.id);
  }
  publish();
}
