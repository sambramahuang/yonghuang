interface Props {
  clients: string[];
  value: string;
  onChange: (client: string) => void;
}

export default function ClientDropdown({ clients, value, onChange }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-sm font-medium text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-ink-faint/20"
    >
      <option value="">All clients</option>
      {clients.map((client) => (
        <option key={client} value={client}>
          {client}
        </option>
      ))}
    </select>
  );
}
