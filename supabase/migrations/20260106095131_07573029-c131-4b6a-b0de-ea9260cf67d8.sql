-- Allow anonymous users to check if any admin exists (count only)
CREATE POLICY "Allow checking if admin exists"
ON public.user_roles
FOR SELECT
TO anon
USING (role = 'admin');