import { createClient } from '@supabase/supabase-js';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function splitAtSentences(text) {
  return text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 3);
}

function chunkText(text) {
  const TARGET = 1200;
  const MIN = 50;
  const paragraphs = text.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > MIN);
  const chunks = [];
  let current = '';
  for (const para of paragraphs) {
    if (para.length > TARGET) {
      if (current) { chunks.push(current.trim()); current = ''; }
      const sentences = splitAtSentences(para);
      let buf = '';
      for (const s of sentences) {
        if (buf && (buf + ' ' + s).length > TARGET) { chunks.push(buf.trim()); buf = s; }
        else { buf = buf ? buf + ' ' + s : s; }
      }
      if (buf.length > MIN) chunks.push(buf.trim());
    } else if (current && (current + '\n\n' + para).length > TARGET) {
      chunks.push(current.trim()); current = para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current.length > MIN) chunks.push(current.trim());
  return chunks;
}

async function embedBatch(texts) {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.VOYAGE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'voyage-3', input: texts }),
  });
  if (!response.ok) throw new Error(`Voyage AI error: ${await response.text()}`);
  const data = await response.json();
  return data.data.map(d => d.embedding);
}

// Convertit un lien de partage OneDrive en URL de téléchargement direct
function toDownloadUrl(shareUrl) {
  const encoded = Buffer.from(shareUrl).toString('base64url');
  return `https://api.onedrive.com/v1.0/shares/u!${encoded}/root/content`;
}

async function extractTextFromBuffer(buffer, ext) {
  if (ext === 'txt') return buffer.toString('utf-8');
  if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if (ext === 'pdf') {
    const data = await pdfParse(buffer);
    return data.text;
  }
  throw new Error('Format non supporté — utilise un lien vers un fichier .txt, .docx ou .pdf');
}

function detectExt(url, contentType) {
  const fromUrl = url.split('?')[0].split('.').pop().toLowerCase();
  if (['txt', 'docx', 'pdf'].includes(fromUrl)) return fromUrl;
  if (contentType?.includes('pdf')) return 'pdf';
  if (contentType?.includes('wordprocessingml') || contentType?.includes('docx')) return 'docx';
  if (contentType?.includes('text/plain')) return 'txt';
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authorization header requis' });
  const token = authHeader.slice(7);

  const userClient = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { share_url, space_id, user_id } = req.body;
  if (!share_url || !space_id || !user_id) {
    return res.status(400).json({ error: 'share_url, space_id, user_id requis' });
  }

  // Vérifier propriété de l'espace
  const { data: spaceCheck, error: spaceError } = await userClient
    .from('spaces').select('id').eq('id', space_id).single();
  if (spaceError || !spaceCheck) return res.status(403).json({ error: 'Accès refusé à cet espace' });

  // Télécharger le fichier
  let fileBuffer, contentType, filename;
  try {
    const downloadUrl = toDownloadUrl(share_url);
    const fileRes = await fetch(downloadUrl);
    if (!fileRes.ok) {
      return res.status(400).json({ error: `Impossible de télécharger le fichier (${fileRes.status}). Vérifiez que le lien de partage est actif et public.` });
    }
    contentType = fileRes.headers.get('content-type') || '';
    const disposition = fileRes.headers.get('content-disposition') || '';
    const nameMatch = disposition.match(/filename\*?=(?:UTF-8'')?["']?([^"';\n]+)/i);
    filename = nameMatch ? decodeURIComponent(nameMatch[1].trim()) : 'document';
    const arrayBuffer = await fileRes.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } catch (err) {
    return res.status(400).json({ error: `Erreur de téléchargement : ${err.message}` });
  }

  if (fileBuffer.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Fichier trop volumineux (max 10 MB)' });
  }

  const ext = detectExt(share_url, contentType);
  if (!ext) return res.status(400).json({ error: 'Format non détecté. Partagez un fichier .txt, .docx ou .pdf' });

  // Extraire le texte
  let text;
  try {
    text = await extractTextFromBuffer(fileBuffer, ext);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }

  if (!text?.trim()) return res.status(400).json({ error: 'Aucun texte extrait du fichier' });

  // Créer le document
  const title = filename.replace(/\.[^.]+$/, '');
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({ space_id, user_id, title, type: ext })
    .select().single();
  if (docError) return res.status(500).json({ error: docError.message });

  // Chunker et vectoriser
  const chunks = chunkText(text);
  const BATCH = 128;
  const allEmbeddings = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const embeddings = await embedBatch(chunks.slice(i, i + BATCH));
    allEmbeddings.push(...embeddings);
  }

  const rows = chunks.map((content, i) => ({
    document_id: doc.id,
    space_id,
    content,
    embedding: allEmbeddings[i],
  }));

  const { error: chunksError } = await supabase.from('chunks').insert(rows);
  if (chunksError) return res.status(500).json({ error: chunksError.message });

  return res.status(200).json({ document_id: doc.id, chunks_created: rows.length, title });
}
