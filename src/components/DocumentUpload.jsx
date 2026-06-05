import { useState } from 'react';
import * as mammoth from 'mammoth';
import { supabase } from '../lib/supabase';

async function extractText(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'txt') {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.readAsText(file);
    });
  }
  if (ext === 'docx') {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  }
  if (ext === 'pdf') {
    const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
    GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.0.227/pdf.worker.min.js`;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
  }
  throw new Error('Format non supporté. Utilise .txt, .docx ou .pdf');
}

export default function DocumentUpload({ spaceId, userId, onUploaded }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [mode, setMode] = useState('file'); // 'file' | 'url'
  const [shareUrl, setShareUrl] = useState('');

  async function processFile(file) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 10 MB)');
      return;
    }
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['txt', 'docx', 'pdf'].includes(ext)) {
      setError('Format non supporté. Utilise .txt, .docx ou .pdf');
      return;
    }
    setStatus('Extraction du texte…');
    setError('');
    try {
      const text = await extractText(file);
      setStatus('Indexation en cours…');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée, reconnecte-toi');
      const response = await fetch('/api/embed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          text,
          title: file.name,
          type: ext,
          space_id: spaceId,
          user_id: userId,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setStatus(`Indexé — ${data.chunks_created} fragments créés`);
      onUploaded?.();
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }

  function handleFile(e) {
    processFile(e.target.files[0]);
    e.target.value = '';
  }

  function handleDragOver(e) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave() {
    setIsDragging(false);
  }

  function handleDrop(e) {
    e.preventDefault();
    setIsDragging(false);
    processFile(e.dataTransfer.files[0]);
  }

  async function processUrl(e) {
    e.preventDefault();
    const url = shareUrl.trim();
    if (!url) return;
    if (!url.includes('onedrive') && !url.includes('1drv.ms') && !url.includes('sharepoint')) {
      setError('Lien non reconnu — copiez un lien de partage OneDrive ou SharePoint.');
      return;
    }
    setStatus('Téléchargement depuis OneDrive…');
    setError('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Session expirée, reconnecte-toi');
      const response = await fetch('/api/embed-from-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ share_url: url, space_id: spaceId, user_id: userId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setStatus(`Indexé — ${data.chunks_created} fragments créés`);
      setShareUrl('');
      onUploaded?.();
    } catch (err) {
      setError(err.message);
      setStatus('');
    }
  }

  return (
    <div className="space-y-2">
      {/* Sélecteur de mode */}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => { setMode('file'); setError(''); setStatus(''); }}
          className={`text-xs px-3 py-1.5 rounded border transition ${mode === 'file' ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-500 border-gray-300 hover:border-teal-400'}`}
        >
          Fichier local
        </button>
        <button
          type="button"
          onClick={() => { setMode('url'); setError(''); setStatus(''); }}
          className={`text-xs px-3 py-1.5 rounded border transition ${mode === 'url' ? 'bg-[#0a9370] text-white border-[#0a9370]' : 'text-gray-500 border-gray-300 hover:border-teal-400'}`}
        >
          Lien OneDrive
        </button>
      </div>

      {mode === 'file' && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            isDragging ? 'border-[#0a9370] bg-teal-50' : 'border-gray-200'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label className="cursor-pointer">
            <span className="text-sm text-gray-500">Glisser un fichier ou </span>
            <span className="text-[#0a9370] text-sm font-medium underline">parcourir</span>
            <input type="file" accept=".txt,.docx,.pdf" onChange={handleFile} className="hidden" />
          </label>
          <p className="text-xs text-gray-400 mt-1">.txt, .docx, .pdf — max 10 MB</p>
        </div>
      )}

      {mode === 'url' && (
        <form onSubmit={processUrl} className="border rounded-lg p-4 space-y-2">
          <p className="text-xs text-gray-500">
            Dans OneDrive, clic droit sur le fichier → <strong>Partager</strong> → <strong>Copier le lien</strong> (accès "Tout le monde").
          </p>
          <div className="flex gap-2">
            <input
              value={shareUrl}
              onChange={e => setShareUrl(e.target.value)}
              placeholder="https://1drv.ms/… ou https://onedrive.live.com/…"
              className="flex-1 border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
              required
            />
            <button
              type="submit"
              disabled={!shareUrl.trim() || !!status}
              className="bg-[#0a9370] text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50 shrink-0"
            >
              Importer
            </button>
          </div>
        </form>
      )}

      {status && <p className="text-sm text-teal-700">{status}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}
