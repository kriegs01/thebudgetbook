-- Drop the existing policy
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.goal_items;

-- Create a new policy that allows insert if the user is authenticated and the goal is public
CREATE POLICY "Enable insert for authenticated users only" ON public.goal_items
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT is_public FROM public.goals WHERE id = goal_id) = true
  );
