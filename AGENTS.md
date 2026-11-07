<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules
- Triage decisions come only from the pure `decide()` in src/lib/triage.ts; it must match the backend's Python engine (engine/triage.py), so never add rules beyond the policy JSON.
- Blank/unreadable fields stay `null` end to end (CSV → DB → UI as "unknown"); never coerce to false/0.
- Policies are stored as JSON in `policy_versions.config`; the active one drives all re-evaluation. Never hardcode a future version.
- Overrides, outcomes, case_events, comments and fact_sources are append-only (insert/select RLS only).
- Roles live in `user_roles`; the top-bar role switcher is a demo view toggle only, not a permission.
- Design tokens live in src/styles.css; colour is reserved for states where a human must act.
- Reviewer workstream grouping is a pure presentation helper using persisted decisions, policy checklist and second-check logic; it never changes recommendations or selects new QA samples.
- Case navigation may carry per-case group labels, resolved by the shared helper so the case-detail page stays unchanged.
- Handling-time reporting reads recorded confirmation and override durations through a shared query; it is separate from estimated workstream effort.
- The /claims route owns all-claim lookups independently of the personal dashboard so autonomous and closed claims remain accessible.
