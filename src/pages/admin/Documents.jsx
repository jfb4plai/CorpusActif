import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import DocumentUpload from '../../components/DocumentUpload';

export default function Documents({ spaceId, session }) {
  const [docs, setDocs] = useState([]);

  async function loadDocs() {
    const { data } = await supabase
      .from('corpus_documents')
      .select('id, title, type, created_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });
    setDocs(data || []);
  }

  useEffect(() => { loadDocs(); }, [spaceId]);

  async function deleteDoc(id) {
    await supabase.from('corpus_chunks').delete().eq('document_id', id);
    await supabase.from('corpus_documents').delete().eq('id', id);
    setDocs(prev => prev.filter(d => d.id !== id));
  }

  return (
    <div className="space-y-6">
      <DocumentUpload spaceId={spaceId} userId={session?.user?.id} onUploaded={loadDocs} />
      <div className="space-y-2">
        {docs.map(doc => (
          <div key={doc.id} className="flex items-center justify-between bg-white border rounded px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-800">{doc.title}</p>
              <p className="text-xs text-gray-400">{doc.type.toUpperCase()} · {new Date(doc.created_at).toLocaleDateString('fr-BE')}</p>
            </div>
            <button
              onClick={() => deleteDoc(doc.id)}
              className="text-xs text-red-400 hover:text-red-600"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
