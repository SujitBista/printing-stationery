-- Assign existing MAKER/CHECKER application users to the single active store
-- of their employee branch. Create/edit already does this going forward;
-- this repairs accounts created before automatic assignment, such as
-- Dhankutta Branch.

INSERT INTO "store_users" (
  "store_id",
  "maker_application_user_id",
  "supervisor_application_user_id",
  "is_active"
)
SELECT
  "s"."id",
  "maker"."user_id",
  "supervisor"."user_id",
  true
FROM "stores" "s"
INNER JOIN "branches" "b" ON "b"."id" = "s"."branch_id"
LEFT JOIN LATERAL (
  SELECT "au"."id" AS "user_id"
  FROM "application_users" "au"
  INNER JOIN "user_roles" "ur" ON "ur"."user_id" = "au"."id"
  INNER JOIN "employees" "e" ON "e"."id" = "au"."employee_id"
  WHERE "ur"."role" = 'MAKER'
    AND "au"."is_active" = true
    AND "e"."is_active" = true
    AND "e"."branch_id" = "s"."branch_id"
    AND NOT EXISTS (
      SELECT 1
      FROM "store_users" "su"
      WHERE "su"."is_active" = true
        AND "su"."maker_application_user_id" = "au"."id"
    )
  ORDER BY "au"."created_at", "au"."id"
  LIMIT 1
) "maker" ON true
LEFT JOIN LATERAL (
  SELECT "au"."id" AS "user_id"
  FROM "application_users" "au"
  INNER JOIN "user_roles" "ur" ON "ur"."user_id" = "au"."id"
  INNER JOIN "employees" "e" ON "e"."id" = "au"."employee_id"
  WHERE "ur"."role" = 'CHECKER'
    AND "au"."is_active" = true
    AND "e"."is_active" = true
    AND "e"."branch_id" = "s"."branch_id"
    AND NOT EXISTS (
      SELECT 1
      FROM "store_users" "su"
      WHERE "su"."is_active" = true
        AND "su"."supervisor_application_user_id" = "au"."id"
    )
  ORDER BY "au"."created_at", "au"."id"
  LIMIT 1
) "supervisor" ON true
WHERE "s"."is_active" = true
  AND "b"."is_active" = true
  AND ("maker"."user_id" IS NOT NULL OR "supervisor"."user_id" IS NOT NULL)
  AND ("maker"."user_id" IS DISTINCT FROM "supervisor"."user_id")
  AND NOT EXISTS (
    SELECT 1 FROM "store_users" "su" WHERE "su"."store_id" = "s"."id"
  );
