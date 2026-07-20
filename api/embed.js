import { createClient } from '@supabase/supabase-js';

// Client service role pour les écritures (documents/chunks)
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function splitAtSentences(text) {
  // Threshold 3 preserves short but valid sentences ("Oui.", "Non.") while still filtering noise
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
        if (buf && (buf + ' ' + s).length > TARGET) {
          chunks.push(buf.trim());
          buf = s;
        } else {
          buf = buf ? buf + ' ' + s : s;
        }
      }
      if (buf.length > MIN) chunks.push(buf.trim());
    } else if (current && (current + '\n\n' + para).length > TARGET) {
      chunks.push(current.trim());
      current = para;
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
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Voyage AI error: ${err}`);
  }
  const data = await response.json();
  return data.data.map(d => d.embedding);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  // Vérification d'autorisation
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authorization header requis' });
  }
  const token = authHeader.slice(7);

  // Client avec le token utilisateur — RLS s'applique
  const userClient = createClient(
    process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_ANON_KEY,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { text, title, type, space_id, user_id } = req.body;

  if (!text || !title || !space_id || !user_id) {
    return res.status(400).json({ error: 'text, title, space_id, user_id requis' });
  }

  // Vérifier que l'utilisateur est propriétaire du space (RLS filtre automatiquement)
  const { data: spaceCheck, error: spaceError } = await userClient
    .from('corpus_spaces')
    .select('id')
    .eq('id', space_id)
    .single();

  if (spaceError || !spaceCheck) {
    return res.status(403).json({ error: 'Accès refusé à cet espace' });
  }

  // Créer le document
  const { data: doc, error: docError } = await supabase
    .from('corpus_documents')
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

  const { error: chunksError } = await supabase.from('corpus_chunks').insert(rows);
  if (chunksError) return res.status(500).json({ error: chunksError.message });

  return res.status(200).json({ document_id: doc.id, chunks_created: rows.length });
}
