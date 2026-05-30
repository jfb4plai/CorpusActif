export default function ChatMessage({ role, content, sources, isOutOfBase }) {
  const isUser = role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
        isUser ? 'bg-[#0a9370] text-white' : 'bg-white border text-gray-800'
      }`}>
        {isOutOfBase && !isUser && (
          <div className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded px-2 py-1 mb-2">
            Réponse hors des ressources du cours
          </div>
        )}
        <p className="whitespace-pre-wrap leading-relaxed">{content}</p>
        {sources && sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            {sources.map((s, i) => (
              <span key={i} className="inline-block text-xs text-gray-400 mr-2">📄 {s}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
