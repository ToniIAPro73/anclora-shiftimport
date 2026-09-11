import { describe, it, expect, vi } from "vitest";
import {
  isTemporalBranchName,
  validateTargetBranch,
  resolveNeonMainBranch,
  resolveRunnerConfig,
  runTemporalIntegrationHarness,
} from "./run-temporal-org-model-integration.mjs";

describe("Temporal Org Model Runner Safety Guarantees", () => {
  describe("1. Never automatically consumes DATABASE_URL or POSTGRES_URL", () => {
    it("ignores DATABASE_URL when TEMPORAL_MODEL_DATABASE_URL is not set and defaults to ephemeral mode", () => {
      const env = {
        DATABASE_URL: "postgresql://user:pass@production-db.neon.tech/neondb",
      };

      const config = resolveRunnerConfig(env);
      expect(config.mode).toBe("ephemeral");
      expect(config.connectionString).toBeNull();
      expect(config.isEphemeral).toBe(true);
      expect(config.ignoredGenericUrl).toBe(true);
    });

    it("ignores POSTGRES_URL and generic database URLs", () => {
      const env = {
        POSTGRES_URL: "postgresql://user:pass@production-db.neon.tech/neondb",
      };

      const config = resolveRunnerConfig(env);
      expect(config.mode).toBe("ephemeral");
      expect(config.connectionString).toBeNull();
      expect(config.isEphemeral).toBe(true);
      expect(config.ignoredGenericUrl).toBe(true);
    });
  });

  describe("2. Rejects TEMPORAL_MODEL_DATABASE_URL without ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true", () => {
    it("throws clear error when ALLOW_EXISTING_TEMPORAL_TEST_DATABASE is missing", () => {
      const env = {
        TEMPORAL_MODEL_DATABASE_URL: "postgresql://user:pass@tmp-db.neon.tech/neondb",
      };

      expect(() => resolveRunnerConfig(env)).toThrow(
        /ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true/
      );
    });

    it("throws error when ALLOW_EXISTING_TEMPORAL_TEST_DATABASE is false or invalid", () => {
      const env = {
        TEMPORAL_MODEL_DATABASE_URL: "postgresql://user:pass@tmp-db.neon.tech/neondb",
        ALLOW_EXISTING_TEMPORAL_TEST_DATABASE: "false",
      };

      expect(() => resolveRunnerConfig(env)).toThrow(
        /ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true/
      );
    });

    it("accepts TEMPORAL_MODEL_DATABASE_URL only when ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true", () => {
      const env = {
        TEMPORAL_MODEL_DATABASE_URL: "postgresql://user:pass@tmp-db.neon.tech/neondb",
        ALLOW_EXISTING_TEMPORAL_TEST_DATABASE: "true",
      };

      const config = resolveRunnerConfig(env, {
        targetBranch: { name: "tmp-temporal-valid", default: false, protected: false },
      });
      expect(config.mode).toBe("existing");
      expect(config.connectionString).toBe(env.TEMPORAL_MODEL_DATABASE_URL);
      expect(config.isEphemeral).toBe(false);
    });
  });

  describe("3. Rejects default, main, or protected branches as target", () => {
    it("rejects branch named main, master, or production", () => {
      expect(() => validateTargetBranch({ name: "main", default: false, protected: false })).toThrow(
        /Refusing to target production\/main branch/
      );
      expect(() => validateTargetBranch({ name: "master", default: false, protected: false })).toThrow(
        /Refusing to target production\/main branch/
      );
      expect(() => validateTargetBranch({ name: "production", default: false, protected: false })).toThrow(
        /Refusing to target production\/main branch/
      );
    });

    it("rejects default branch even if name looks harmless", () => {
      expect(() => validateTargetBranch({ name: "tmp-default-branch", default: true, protected: false })).toThrow(
        /Refusing to target default branch/
      );
    });

    it("rejects protected branch", () => {
      expect(() => validateTargetBranch({ name: "tmp-protected-branch", default: false, protected: true })).toThrow(
        /Refusing to target protected branch/
      );
    });

    it("rejects branch names that are not unequivocally temporal", () => {
      expect(isTemporalBranchName("preview/development")).toBe(false);
      expect(isTemporalBranchName("feature/my-branch")).toBe(false);
      expect(isTemporalBranchName("tmp-temporal-123")).toBe(true);
      expect(isTemporalBranchName("test-branch-456")).toBe(true);
      expect(isTemporalBranchName("ephemeral-run-789")).toBe(true);

      expect(() => validateTargetBranch({ name: "preview/development", default: false, protected: false })).toThrow(
        /does not have an unequivocally temporal name/
      );
    });

    it("resolves Neon main branch dynamically from project branches", () => {
      const mockBranches = [
        { id: "br-dev-123", name: "preview/development", default: false },
        { id: "br-solitary-thunder-main", name: "main", default: true },
        { id: "br-staging-456", name: "preview/staging", default: false },
      ];

      const resolved = resolveNeonMainBranch(mockBranches);
      expect(resolved.id).toBe("br-solitary-thunder-main");
      expect(resolved.name).toBe("main");
    });
  });

  describe("4 & 5. Connection failure handling & zero-passed guarantee", () => {
    it("fails with FAIL and reports zero passed tests if connection to Neon fails", async () => {
      class FailingClient {
        async connect() {
          throw new Error("Neon connection failed: ENOTFOUND ep-test.neon.tech");
        }
        async query() {
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = vi.fn((cmd, args) => {
        if (args.includes("list")) {
          return JSON.stringify([{ id: "br-main", name: "main", default: true }]);
        }
        if (args.includes("create")) {
          return JSON.stringify({
            branch: { id: "br-tmp-fail-conn" },
            connection_uris: [{ connection_uri: "postgres://fake:conn@host/db" }],
          });
        }
        if (args.includes("delete")) {
          return "";
        }
        return "";
      });

      let caughtError = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          ClientClass: FailingClient,
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toContain("Neon connection failed");
      expect(caughtError.passedCount).toBe(0);
      expect(mockNeonctl).toHaveBeenCalledWith(
        "npx",
        ["neonctl", "branches", "delete", "br-tmp-fail-conn", "--project-id", "holy-cake-85660318"],
        expect.any(Object)
      );
    });
  });

  describe("6. Ephemeral branch lifecycle & destruction guarantees", () => {
    it("destroys ephemeral branch when tests succeed", async () => {
      class SuccessClient {
        async connect() {}
        async query(sql) {
          if (sql.includes("_migrations")) return { rows: [] };
          if (sql.includes("organizations")) return { rows: [{ id: "org-1" }] };
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = vi.fn((cmd, args) => {
        if (args.includes("list")) {
          return JSON.stringify([{ id: "br-main", name: "main", default: true }]);
        }
        if (args.includes("create")) {
          return JSON.stringify({
            branch: { id: "br-tmp-success" },
            connection_uris: [{ connection_uri: "postgres://fake:conn@host/db" }],
          });
        }
        if (args.includes("delete")) {
          return "";
        }
        return "";
      });

      const mockSpawnSync = vi.fn((cmd, args) => {
        return { status: 0, stdout: "", stderr: "" };
      });

      const result = await runTemporalIntegrationHarness({
        env: {},
        neonctlExec: mockNeonctl,
        spawnSyncFn: mockSpawnSync,
        ClientClass: SuccessClient,
        seedCasesFn: vi.fn().mockResolvedValue({}),
        verifyBackfillFn: vi.fn().mockResolvedValue(),
      });

      expect(result.status).toBe("PASS");
      expect(result.passedCount).toBe(23);
      expect(mockNeonctl).toHaveBeenCalledWith(
        "npx",
        ["neonctl", "branches", "delete", "br-tmp-success", "--project-id", "holy-cake-85660318"],
        expect.any(Object)
      );
    });

    it("destroys ephemeral branch when tests fail", async () => {
      class SuccessClient {
        async connect() {}
        async query(sql) {
          if (sql.includes("_migrations")) return { rows: [] };
          if (sql.includes("organizations")) return { rows: [{ id: "org-1" }] };
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = vi.fn((cmd, args) => {
        if (args.includes("list")) {
          return JSON.stringify([{ id: "br-main", name: "main", default: true }]);
        }
        if (args.includes("create")) {
          return JSON.stringify({
            branch: { id: "br-tmp-failure" },
            connection_uris: [{ connection_uri: "postgres://fake:conn@host/db" }],
          });
        }
        if (args.includes("delete")) {
          return "";
        }
        return "";
      });

      const mockSpawnSync = vi.fn((cmd, args) => {
        if (args.includes("db/migrate.mjs")) {
          return { status: 0, stdout: "", stderr: "" };
        }
        return { status: 1, stdout: "", stderr: "Assertion failed" };
      });

      let caughtError = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: mockSpawnSync,
          ClientClass: SuccessClient,
          seedCasesFn: vi.fn().mockResolvedValue({}),
          verifyBackfillFn: vi.fn().mockResolvedValue(),
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(mockNeonctl).toHaveBeenCalledWith(
        "npx",
        ["neonctl", "branches", "delete", "br-tmp-failure", "--project-id", "holy-cake-85660318"],
        expect.any(Object)
      );
    });

    it("returns FAIL and surfaces branch ID if ephemeral branch cleanup fails", async () => {
      class SuccessClient {
        async connect() {}
        async query(sql) {
          if (sql.includes("_migrations")) return { rows: [] };
          if (sql.includes("organizations")) return { rows: [{ id: "org-1" }] };
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = vi.fn((cmd, args) => {
        if (args.includes("list")) {
          return JSON.stringify([{ id: "br-main", name: "main", default: true }]);
        }
        if (args.includes("create")) {
          return JSON.stringify({
            branch: { id: "br-tmp-cleanup-fail" },
            connection_uris: [{ connection_uri: "postgres://fake:conn@host/db" }],
          });
        }
        if (args.includes("delete")) {
          throw new Error("Neon API error 500: Failed to delete branch");
        }
        return "";
      });

      const mockSpawnSync = vi.fn((cmd, args) => {
        return { status: 0, stdout: "", stderr: "" };
      });

      let caughtError = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: mockSpawnSync,
          ClientClass: SuccessClient,
          seedCasesFn: vi.fn().mockResolvedValue({}),
          verifyBackfillFn: vi.fn().mockResolvedValue(),
        });
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).not.toBeNull();
      expect(caughtError.message).toContain("Branch cleanup failed for branchId 'br-tmp-cleanup-fail'");
      expect(caughtError.branchId).toBe("br-tmp-cleanup-fail");
    });
  });
});
