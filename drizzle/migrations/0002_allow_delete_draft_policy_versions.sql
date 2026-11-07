GRANT DELETE ON public.policy_versions TO authenticated;

CREATE POLICY "staff delete draft policy_versions"
ON public.policy_versions
FOR DELETE
TO authenticated
USING (status = 'draft');