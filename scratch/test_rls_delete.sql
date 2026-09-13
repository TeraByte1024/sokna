SET role TO authenticated;
SET request.jwt.claim.sub TO '16c31867-a844-410c-ad4a-e41a0ad63415';
DELETE FROM setlists WHERE id = 56;
SELECT count(*) FROM setlists WHERE id = 56;
