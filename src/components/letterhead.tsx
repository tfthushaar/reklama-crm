import type { Settings } from "@/db/schema";

export function Letterhead({ s, title, meta }: { s: Settings; title: string; meta: [string, string][] }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b-4 border-[#0f2640] pb-5">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-lg bg-[#f28c28] text-lg font-bold text-white">R</span>
          <div>
            <p className="text-xl font-bold tracking-tight text-[#0f2640]">{s.companyName}</p>
            <p className="text-[11px] tracking-wider text-slate-500 uppercase">Outdoor & Digital Out-of-Home Media</p>
          </div>
        </div>
        <p className="mt-3 max-w-xs text-xs leading-relaxed text-slate-600">
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
        <p className="text-2xl font-bold tracking-tight text-[#0f2640] uppercase">{title}</p>
        <table className="mt-2 ml-auto text-xs">
          <tbody>
            {meta.map(([k, v]) => (
              <tr key={k}>
                <td className="pr-3 text-slate-500">{k}</td>
                <td className="font-semibold text-slate-800">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </header>
  );
}
