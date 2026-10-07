<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Learning feature layer (`src/lib/wingman/services/learning/`) is evaluation-only: thin per-stage adapters map an explicit allow-list of frozen artifact fields to `<domain>.<feature>/v<major>` keys; production stages never import it and it never reads outcome stores — keeps X (decision-time features) and Y (outcomes) separable and production unaffected.
- `outcome_enrollments` upserts conflict on the generated `event_key` column — ON CONFLICT cannot target the older expression index.
