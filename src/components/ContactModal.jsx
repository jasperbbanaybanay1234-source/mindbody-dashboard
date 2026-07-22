import { useState, useEffect } from 'react';
import { X, Mail, Phone, CheckCircle, Loader2, Clock, MessageSquare } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

function LogEntry({ entry }) {
  const date = new Date(entry.at);
  return (
    <div className="flex gap-3 text-xs">
      <div className="shrink-0 mt-0.5">
        <div className="h-2 w-2 rounded-full bg-emerald-500/60 ring-2 ring-gray-900 mt-1" />
      </div>
      <div className="min-w-0">
        <p className="text-gray-400">
          {formatDistanceToNow(date, { addSuffix: true })}
          <span className="ml-2 text-gray-600">{format(date, 'd MMM yyyy, h:mm a')}</span>
        </p>
        {entry.note && (
          <p className="text-gray-300 mt-0.5 italic">"{entry.note}"</p>
        )}
      </div>
    </div>
  );
}

export default function ContactModal({ client, onClose, onContacted, logContact, getClientLogs }) {
  const [note, setNote]     = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | done | error
  const [history, setHistory] = useState(null); // null = loading, [] = none

  // Fetch this client's contact history on open
  useEffect(() => {
    if (!getClientLogs) { setHistory([]); return; }
    getClientLogs(client.id).then(setHistory).catch(() => setHistory([]));
  }, [client.id, getClientLogs]);

  async function handleMark() {
    setStatus('loading');
    try {
      if (logContact) {
        await logContact(client.id, client.name, note);
      }
      setStatus('done');
      setTimeout(() => { onContacted(client.id); onClose(); }, 900);
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <h3 className="text-lg font-semibold text-white mb-0.5">Contact client</h3>
        <p className="text-sm text-gray-400 mb-5">{client.name || 'Unknown client'}</p>

        {/* Contact action buttons */}
        <div className="flex gap-3 mb-5">
          {client.email && (
            <a
              href={`mailto:${client.email}?subject=We%20miss%20you!&body=Hi%20${encodeURIComponent(client.name?.split(' ')[0] || '')}%2C%0A%0AIt%27s%20been%20a%20while%20since%20we%27ve%20seen%20you.%20We%27d%20love%20to%20have%20you%20back!`}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <Mail className="h-4 w-4" />
              Email
            </a>
          )}
          {client.phone && (
            <a
              href={`tel:${client.phone}`}
              className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2.5 text-sm font-medium text-white transition-colors"
            >
              <Phone className="h-4 w-4" />
              Call
            </a>
          )}
        </div>

        {/* Contact details */}
        <div className="rounded-lg bg-gray-800 px-4 py-3 mb-5 space-y-1.5 text-sm">
          {client.email && (
            <div className="flex items-center gap-2 text-gray-300">
              <Mail className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.phone && (
            <div className="flex items-center gap-2 text-gray-300">
              <Phone className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <span>{client.phone}</span>
            </div>
          )}
          {!client.email && !client.phone && (
            <p className="text-gray-500">No contact details on file</p>
          )}
        </div>

        {/* Contact history */}
        <div className="mb-5">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-3">
            <Clock className="h-3.5 w-3.5" />
            Contact history
          </div>

          {history === null && (
            <div className="flex items-center gap-2 text-xs text-gray-600 py-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading history…
            </div>
          )}

          {history !== null && history.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-gray-600 py-1">
              <MessageSquare className="h-3.5 w-3.5" />
              No previous contacts recorded
            </div>
          )}

          {history !== null && history.length > 0 && (
            <div className="space-y-3 border-l border-gray-700 pl-3">
              {[...history].reverse().map((entry, i) => (
                <LogEntry key={i} entry={entry} />
              ))}
            </div>
          )}
        </div>

        {/* Note for this contact */}
        <label className="block text-xs text-gray-400 mb-1.5">
          Note <span className="text-gray-600">(saved to contact log)</span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="e.g. Left voicemail, sending promo email…"
          className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 focus:border-emerald-500 focus:outline-none resize-none mb-4"
        />

        <button
          onClick={handleMark}
          disabled={status === 'loading' || status === 'done'}
          className="w-full flex items-center justify-center gap-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-60 px-4 py-2.5 text-sm font-medium text-white transition-colors"
        >
          {status === 'loading' && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === 'done'    && <CheckCircle className="h-4 w-4 text-emerald-400" />}
          {status === 'loading' ? 'Saving…' : status === 'done' ? 'Logged!' : 'Mark as contacted'}
        </button>

        {status === 'error' && (
          <p className="mt-2 text-xs text-red-400 text-center">Something went wrong — try again.</p>
        )}
      </div>
    </div>
  );
}
