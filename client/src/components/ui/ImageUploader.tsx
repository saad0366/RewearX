import { useEffect, useRef, useState } from 'react';
import { Upload, Star, X } from 'lucide-react';

export interface UploaderImage {
  /** Local preview URL (object URL for new files, remote URL for existing). */
  url: string;
  /** New file – present only for files newly added in this session. */
  file?: File;
  /** Backend image id – present for existing images already saved. */
  existingId?: string | number;
}

interface ImageUploaderProps {
  disabled?: boolean;
  maxFiles?: number;
  /** Initial images (existing remote URLs with their backend ids). */
  existingImages?: UploaderImage[];
  onChange?: (images: UploaderImage[]) => void;
  maxSizeMb?: number;
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

export default function ImageUploader({
  disabled = false,
  maxFiles = 5,
  existingImages = [],
  onChange,
  maxSizeMb = 5,
}: ImageUploaderProps) {
  const [images, setImages] = useState<UploaderImage[]>(existingImages);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initial sync if parent updates existingImages once after async load
  useEffect(() => {
    if (
      existingImages.length > 0 &&
      images.length === 0 &&
      existingImages.some((e) => e.existingId !== undefined)
    ) {
      setImages(existingImages);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingImages.length]);

  const updateImages = (next: UploaderImage[]) => {
    setImages(next);
    onChange?.(next);
  };

  const handleFiles = (files: FileList | null) => {
    if (!files || disabled) return;
    setError(null);
    const remaining = maxFiles - images.length;
    if (remaining <= 0) return;

    const accepted: UploaderImage[] = [];
    const errors: string[] = [];

    for (let i = 0; i < Math.min(files.length, remaining); i++) {
      const f = files[i];
      if (!ACCEPTED_TYPES.includes(f.type)) {
        errors.push(`${f.name}: unsupported type`);
        continue;
      }
      if (f.size > maxSizeMb * 1024 * 1024) {
        errors.push(`${f.name}: exceeds ${maxSizeMb}MB`);
        continue;
      }
      accepted.push({ url: URL.createObjectURL(f), file: f });
    }

    if (errors.length) setError(errors.join(' · '));
    if (accepted.length) updateImages([...images, ...accepted]);
  };

  const remove = (idx: number) => {
    if (disabled) return;
    const target = images[idx];
    if (target.file) URL.revokeObjectURL(target.url);
    updateImages(images.filter((_, i) => i !== idx));
  };

  const makePrimary = (idx: number) => {
    if (disabled) return;
    const next = [...images];
    const [chosen] = next.splice(idx, 1);
    next.unshift(chosen);
    updateImages(next);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragActive(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl px-6 py-10 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-accent bg-accent/5'
            : 'border-border/70 hover:border-accent hover:bg-muted/30'
        } ${images.length >= maxFiles ? 'opacity-40 pointer-events-none' : ''}`}
      >
        <Upload className="mx-auto mb-3 text-primary/60" size={28} />
        <p className="font-headings font-bold text-primary text-lg">
          Drop images here, or click to browse
        </p>
        <p className="text-muted-foreground text-xs mt-1">
          JPG, PNG, WEBP up to {maxSizeMb}MB · {images.length}/{maxFiles} uploaded
        </p>
        <input
          ref={fileInputRef}
          disabled={disabled}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <p className="text-xs text-red-600 font-semibold">{error}</p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {images.map((img, idx) => (
            <div
              key={img.url + idx}
              className="relative aspect-square rounded-xl overflow-hidden border border-border/60 bg-muted/30 group"
            >
              <img src={img.url} alt={`upload-${idx}`} className="w-full h-full object-cover" />
              {idx === 0 && (
                <div className="absolute top-2 left-2 bg-accent text-accent-foreground text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full flex items-center gap-1">
                  <Star size={10} className="fill-accent-foreground" /> Primary
                </div>
              )}
              <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/50 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                {idx !== 0 && (
                  <button
                    type="button"
                    onClick={() => makePrimary(idx)}
                    className="w-8 h-8 rounded-full bg-white text-primary hover:scale-110 transition-transform flex items-center justify-center"
                    disabled={disabled}
                    aria-label="Make primary"
                  >
                    <Star size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  className="w-8 h-8 rounded-full bg-red-500 text-white hover:scale-110 transition-transform flex items-center justify-center"
                  disabled={disabled}
                  aria-label="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
