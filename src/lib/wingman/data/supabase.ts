/**
 * Data-access layer.
 *
 * The only module allowed to expose the backend client to services.
 * UI components must never import this file directly — they go through
 * `src/lib/wingman/services/*` and the query hooks.
 */
export { supabase } from "@/integrations/supabase/client";
