import { redirect } from "next/navigation";
import { fetchAuthorization } from "@/lib/sso";

// Proves the end-to-end flow: shows the identity & access sys2 reports for the
// logged-in user. No session / expired → back to login.
export default async function Dashboard() {
  const authz = await fetchAuthorization();
  if (!authz) redirect("/api/auth/login");

  const isSuper = authz.roles.includes("super_admin");

  return (
    <main style={{ maxWidth: 760, margin: "40px auto", padding: 24, fontFamily: "system-ui" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1 style={{ fontSize: 22 }}>Portal SiProper — sesi SSO</h1>
        <a href="/api/auth/logout" style={{ fontSize: 14 }}>Logout</a>
      </header>

      <p style={{ color: "#555", fontSize: 14 }}>
        user_id <code>{authz.user_id}</code> · roles <b>{authz.roles.join(", ") || "—"}</b>
        {isSuper && " · super_admin (akses semua)"}
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Modul (gating menu)</h2>
      <ul>
        {Object.entries(authz.modules).map(([m, on]) => (
          <li key={m} style={{ color: on ? "#127a2e" : "#999" }}>
            {on ? "✓" : "✗"} {m}
          </li>
        ))}
      </ul>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Tenant</h2>
      <p style={{ fontSize: 14 }}>
        proyek_ids: <code>{JSON.stringify(authz.tenants.proyek_ids)}</code>
        {" · "}area_ids: <code>{JSON.stringify(authz.tenants.area_ids)}</code>
        {(authz.tenants.proyek_ids.length === 0 && !isSuper) && " (tidak ada akses)"}
      </p>

      <h2 style={{ fontSize: 16, marginTop: 24 }}>Permissions ({authz.permissions.length})</h2>
      <pre style={{ background: "#f5f5f5", padding: 12, fontSize: 12, overflow: "auto" }}>
        {authz.permissions.join("\n") || "—"}
      </pre>

      <p style={{ color: "#999", fontSize: 12, marginTop: 24 }}>fetched_at {authz.fetched_at}</p>
    </main>
  );
}
