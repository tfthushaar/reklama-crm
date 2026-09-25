import type { Settings } from "@/db/schema";

export function Letterhead({ s, title, meta }: { s: Settings; title: string; meta: [string, string][] }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-4 border-neutral-900 pb-5">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-neutral-900 text-lg font-bold text-white">R</span>
          <div>
            <p className="text-xl font-bold tracking-tight text-neutral-900">{s.companyName}</p>
            <p className="text-xs text-neutral-500">Outdoor and digital out-of-home media</p>
          </div>
        </div>
        <p className="mt-3 max-w-xs text-xs leading-relaxed text-neutral-600">
          {s.legalName && <>{s.legalName}<br /></>}
          {[s.address, s.city, s.state].filter(Boolean).join(", ")}
          <br />
          {[s.phone, s.email, s.website].filter(Boolean).join(" · ")}
          <br />
          {s.gstin && <>GSTIN: {s.gstin} · </>}
          {s.pan && <>PAN: {s.pan}</>}
        </p>
      </div>
      <div className="text-right">
        <p className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</p>
        <table className="mt-2 ml-auto text-xs">
          <tbody>
            {meta.map(([k, v]) => (
              <tr key={k}>
                <td className="pr-3 text-neutral-500">{k}</td>
                <td className="font-semibold text-neutral-800">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  );
}
