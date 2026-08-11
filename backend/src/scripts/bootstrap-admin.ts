import { passwordSchema, usernameSchema } from "@printing-stationery/shared";
import { loadEnv } from "../config/env.js";
import { closePool, createDb } from "../db/client.js";
import { createBootstrapAdmin } from "../services/auth.service.js";
import { AppError } from "../utils/errors.js";

async function main(): Promise<void> {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!username || !password) {
    console.error(
      "Missing required bootstrap environment variables: BOOTSTRAP_ADMIN_USERNAME, BOOTSTRAP_ADMIN_PASSWORD",
    );
    process.exit(1);
  }

  const usernameParsed = usernameSchema.safeParse(username);
  if (!usernameParsed.success) {
    const issue = usernameParsed.error.issues[0];
    console.error(
      `Invalid BOOTSTRAP_ADMIN_USERNAME: ${issue?.message ?? "does not meet username rules"}`,
    );
    process.exit(1);
  }

  const passwordParsed = passwordSchema.safeParse(password);
  if (!passwordParsed.success) {
    const issue = passwordParsed.error.issues[0];
    console.error(
      `Invalid BOOTSTRAP_ADMIN_PASSWORD: ${issue?.message ?? "does not meet password rules"}`,
    );
    process.exit(1);
  }

  const env = loadEnv();
  createDb(env);

  try {
    const result = await createBootstrapAdmin({
      username: usernameParsed.data,
      password: passwordParsed.data,
    });

    console.log("Bootstrap Admin created successfully.");
    console.log(`userId=${result.userId}`);
    console.log(`username=${result.username}`);
    console.log("employeeId=null");
    console.log("role=ADMIN");
    console.log("mustChangePassword=true");
  } catch (error) {
    if (error instanceof AppError) {
      console.error(error.message);
      process.exit(1);
    }
    console.error("Bootstrap Admin failed due to an unexpected error.");
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
