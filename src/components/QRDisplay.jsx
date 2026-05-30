import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';

export default function QRDisplay({ url, label }) {
  const canvasRef = useRef();

  useEffect(() => {
    if (url && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 200, margin: 2 });
    }
  }, [url]);

  if (!url) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} />
      {label && <p className="text-xs text-gray-500">{label}</p>}
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-[#0a9370] underline break-all text-center max-w-xs"
      >
        {url}
      </a>
    </div>
  );
}
