-- Staff logins with roles: supervisors see everything, agents see the requests they
-- created plus the ones a supervisor assigned to them.
--
-- Builds on 20261009000000_admin_only_rls.sql: that migration made every admin table
-- readable only by hello@lankalux.com via is_lankalux_admin(). This one redefines that
-- function to mean "an active supervisor", so the same policies now cover every
-- supervisor, and adds agent-scoped policies on "Client Requests".
--
-- The console talks to the database through server routes using the service-role key,
-- and those routes enforce the same rules in code (services/staff.service.ts).
-- hello@lankalux.com is always a supervisor, even before this migration runs.

CREATE TABLE IF NOT EXISTS public.admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('supervisor', 'agent')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_key ON public.admin_users (lower(email));

-- The main supervisor account.
INSERT INTO public.admin_users (user_id, email, full_name, role, active)
SELECT id, lower(email), 'LankaLux', 'supervisor', true
FROM auth.users
WHERE lower(email) = 'hello@lankalux.com'
ON CONFLICT (user_id) DO UPDATE SET role = 'supervisor', active = true;

ALTER TABLE public."Client Requests"
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_agent_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS client_requests_created_by_idx ON public."Client Requests" (created_by);
CREATE INDEX IF NOT EXISTS client_requests_assigned_agent_idx ON public."Client Requests" (assigned_agent_id);

-- SECURITY DEFINER so the check can read admin_users regardless of its own RLS.
CREATE OR REPLACE FUNCTION public.is_lankalux_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = 'hello@lankalux.com'
    OR EXISTS (
      SELECT 1 FROM public.admin_users
      WHERE user_id = auth.uid() AND role = 'supervisor' AND active
    )
$$;

CREATE OR REPLACE FUNCTION public.is_lankalux_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_lankalux_admin()
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid() AND active)
$$;

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read own row" ON public.admin_users;
DROP POLICY IF EXISTS "Supervisors manage staff" ON public.admin_users;
CREATE POLICY "Staff read own row" ON public.admin_users
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Supervisors manage staff" ON public.admin_users
  FOR ALL TO authenticated USING (public.is_lankalux_admin()) WITH CHECK (public.is_lankalux_admin());

DROP POLICY IF EXISTS "Agents read own and assigned requests" ON public."Client Requests";
CREATE POLICY "Agents read own and assigned requests" ON public."Client Requests"
  FOR SELECT TO authenticated
  USING (public.is_lankalux_staff() AND (created_by = auth.uid() OR assigned_agent_id = auth.uid()));
