import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function chunkText(text, chunkSize = 3200, overlap = 400) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 50) chunks.push(chunk);
    if (end === text.length) break;
    start += chunkSize - overlap;
  }
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
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage AI error: ${err}`);
  }
  const data = await response.json();
  return data.data.map(d => d.embedding);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { text, title, type, space_id, user_id } = req.body;

  if (!text || !title || !space_id || !user_id) {
    return res.status(400).json({ error: 'text, title, space_id, user_id requis' });
  }

  // Créer le document
  const { data: doc, error: docError } = await supabase
    .from('documents')
    .insert({ space_id, user_id, title, type: type || 'text' })
    .select()
    .single();

  if (docError) return res.status(500).json({ error: docError.message });

  // Chunker le texte
  const chunks = chunkText(text);

  // Vectoriser par batch de 128 (limite Voyage AI)
  const BATCH = 128;
  const allEmbeddings = [];
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const embeddings = await embedBatch(batch);
    allEmbeddings.push(...embeddings);
  }

  // Stocker les chunks
  const rows = chunks.map((content, i) => ({
    document_id: doc.id,
    space_id,
    content,
    embedding: allEmbeddings[i],
  }));

  const { error: chunksError } = await supabase.from('chunks').insert(rows);
  if (chunksError) return res.status(500).json({ error: chunksError.message });

  return res.status(200).json({ document_id: doc.id, chunks_created: rows.length });
}
