import { useState } from 'react';
import * as mammoth from 'mammoth';

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

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('Fichier trop volumineux (max 10 MB)');
      return;
    }
    setStatus('Extraction du texte…');
    setError('');
    try {
      const text = await extractText(file);
      setStatus('Indexation en cours…');
      const response = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          title: file.name,
          type: file.name.split('.').pop(),
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
    e.target.value = '';
  }

  return (
    <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
      <label className="cursor-pointer">
        <span className="text-sm text-gray-500">Glisser un fichier ou </span>
        <span className="text-[#0a9370] text-sm font-medium underline">parcourir</span>
        <input type="file" accept=".txt,.docx,.pdf" onChange={handleFile} className="hidden" />
      </label>
      <p className="text-xs text-gray-400 mt-1">.txt, .docx, .pdf — max 10 MB</p>
      {status && <p className="text-sm text-teal-700 mt-3">{status}</p>}
      {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
    </div>
  );
}
