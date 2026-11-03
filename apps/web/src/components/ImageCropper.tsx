'use client';
import { useEffect, useRef, useState } from 'react';
import { IMAGE_MAX_BYTES, IMAGE_MIME } from '@nexus/shared';
import { api } from '@/lib/client';
import { useToast } from './Shell';

type Uploaded = { id: string; url: string };

/**
 * Client-side cropper: pick → zoom/pan sliders → canvas crop at a fixed aspect → upload.
 * Animated GIFs are uploaded as-is (canvas would drop the animation); the center crop is then done by Discord.
 */
export function ImageCropper({ aspect, outW, outH, onUploaded }: { aspect: number; outW: number; outH: number; onUploaded: (a: Uploaded) => void }) {
  const toast = useToast();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0);
  const [y, setY] = useState(0);
  const [busy, setBusy] = useState(false);

  function pick(f: File | undefined) {
    if (!f) return;
    if (!(IMAGE_MIME as readonly string[]).includes(f.type)) return toast('รองรับเฉพาะ PNG / JPG / GIF / WEBP', true);
    if (f.size > IMAGE_MAX_BYTES) return toast('ไฟล์ใหญ่เกิน 8MB', true);
    const url = URL.createObjectURL(f);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      setFile(f);
      setZoom(1);
      setX(0);
      setY(0);
    };
    i.src = url;
  }

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    c.width = outW;
    c.height = outH;
    const ctx = c.getContext('2d')!;
    // Largest source rect with the target aspect, shrunk by zoom, offset by pan (-1..1).
    let sw = img.width, sh = img.width / aspect;
    if (sh > img.height) { sh = img.height; sw = sh * aspect; }
    sw /= zoom; sh /= zoom;
    const sx = ((img.width - sw) / 2) * (1 + x);
    const sy = ((img.height - sh) / 2) * (1 + y);
    ctx.clearRect(0, 0, outW, outH);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  }, [img, zoom, x, y, aspect, outW, outH]);

  async function upload() {
    if (!file) return;
    setBusy(true);
    try {
      let blob: Blob = file;
      let name = file.name;
      if (file.type !== 'image/gif') {
        blob = await new Promise<Blob>((res, rej) => canvas.current!.toBlob((b) => (b ? res(b) : rej(new Error('crop failed'))), 'image/png'));
        name = name.replace(/\.\w+$/, '') + '.png';
      }
      const fd = new FormData();
      fd.append('kind', 'image');
      fd.append('file', new File([blob], name, { type: blob.type }));
      const { asset } = await api<{ asset: Uploaded }>('/api/assets', { body: fd });
      onUploaded(asset);
      toast('อัปโหลดแล้ว');
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="preview">
      <input type="file" accept={IMAGE_MIME.join(',')} onChange={(e) => pick(e.target.files?.[0])} />
      {img && (
        <>
          <div className="cropbox" style={{ maxWidth: aspect === 1 ? 220 : 480 }}>
            <canvas ref={canvas} className="crop" style={aspect === 1 ? { borderRadius: '50%' } : undefined} />
          </div>
          {file?.type === 'image/gif' ? (
            <p className="sub">GIF จะอัปโหลดตามต้นฉบับเพื่อรักษาภาพเคลื่อนไหว</p>
          ) : (
            <div className="inline">
              <label className="sub">Zoom <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(+e.target.value)} /></label>
              <label className="sub">X <input type="range" min={-1} max={1} step={0.01} value={x} onChange={(e) => setX(+e.target.value)} /></label>
              <label className="sub">Y <input type="range" min={-1} max={1} step={0.01} value={y} onChange={(e) => setY(+e.target.value)} /></label>
            </div>
          )}
          <button className="secondary small" disabled={busy} onClick={upload}>{busy ? 'Uploading…' : `Crop & Upload (${outW}×${outH})`}</button>
        </>
      )}
    </div>
  );
}
