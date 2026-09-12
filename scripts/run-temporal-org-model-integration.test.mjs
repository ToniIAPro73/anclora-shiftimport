import fs from "node:fs";
import { describe, it, expect, vi } from "vitest";
import {
  isTemporalBranchName,
  validateTargetBranch,
  resolveNeonMainBranch,
  resolveNeonBaseBranch,
  DEFAULT_BASE_BRANCH_ID,
  resolveBranchFromConnectionString,
  assertSafeTemporalDatabaseUrl,
  resolveRunnerConfig,
  accreditBranchBeforeConnection,
  assertNoTemporalObjectsPresent,
  assertTemporalObjectsMaterialized,
  TEMPORAL_TABLES,
  TEMPORAL_VIEWS,
  TEMPORAL_ROUTINES,
  TEMPORAL_TRIGGERS,
  TEMPORAL_MIGRATIONS,
  runTemporalIntegrationHarness,
} from "./run-temporal-org-model-integration.mjs";

const BASE_BRANCH_ID = "br-falling-heart-b1d6u2cx";

const mockBaseBranch = {
  id: BASE_BRANCH_ID,
  name: "preview/development",
  default: false,
  primary: false,
  protected: false,
};

const mockMainBranch = {
  id: "br-solitary-thunder-b1hm9low",
  name: "main",
  default: true,
  primary: true,
  protected: false,
};

function createStandardMockNeonctl({
  createdBranchId = "br-tmp-123",
  createdBranchName = "tmp-temporal-123",
  branches = null,
  endpoints = [
    {
      id: "ep-base",
      host: "ep-winter-bird-b1g75qgx.neon.tech",
      branch_id: BASE_BRANCH_ID,
    },
    {
      id: "ep-tmp-123",
      host: "ep-tmp-123.neon.tech",
      branch_id: "br-tmp-123",
    },
  ],
  connectionUri = "postgresql://neondb_owner:secret@ep-tmp-123.neon.tech/neondb?sslmode=require",
  deleteError = null,
} = {}) {
  const branchList =
    branches || [
      mockBaseBranch,
      mockMainBranch,
      {
        id: createdBranchId,
        name: createdBranchName,
        parent_id: BASE_BRANCH_ID,
        default: false,
        primary: false,
        protected: false,
      },
    ];

  return vi.fn((cmd, args) => {
    if (args.includes("branches") && args.includes("list")) {
      return JSON.stringify(branchList);
    }
    if (args.some((a) => typeof a === "string" && a.includes("/endpoints"))) {
      return JSON.stringify(endpoints);
    }
    if (args.includes("branches") && args.includes("create")) {
      return JSON.stringify({
        branch: { id: createdBranchId, name: createdBranchName },
        connection_uris: [{ connection_uri: connectionUri }],
      });
    }
    if (args.includes("connection-string")) {
      return connectionUri;
    }
    if (args.includes("branches") && args.includes("delete")) {
      if (deleteError) throw deleteError;
      return "";
    }
    return "";
  });
}

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
      expect(config.baseBranchId).toBe(DEFAULT_BASE_BRANCH_ID);
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
      expect(config.baseBranchId).toBe(DEFAULT_BASE_BRANCH_ID);
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

    it("accepts TEMPORAL_MODEL_DATABASE_URL only when ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true via endpoint traversal (no targetBranch shortcut)", () => {
      const env = {
        TEMPORAL_MODEL_DATABASE_URL: "postgresql://user:pass@ep-valid-temp.neon.tech/neondb",
        ALLOW_EXISTING_TEMPORAL_TEST_DATABASE: "true",
      };

      const config = resolveRunnerConfig(env, {
        endpoints: [
          {
            id: "ep-valid-temp",
            host: "ep-valid-temp.neon.tech",
            branch_id: "br-tmp-valid",
          },
        ],
        branches: [
          {
            id: "br-tmp-valid",
            name: "tmp-temporal-valid",
            default: false,
            primary: false,
            protected: false,
          },
        ],
      });
      expect(config.mode).toBe("existing");
      expect(config.connectionString).toBe(env.TEMPORAL_MODEL_DATABASE_URL);
      expect(config.isEphemeral).toBe(false);
      expect(config.targetBranch.name).toBe("tmp-temporal-valid");
    });

    it("rejects connection pointing to Neon 'main' branch even if ALLOW_EXISTING_TEMPORAL_TEST_DATABASE=true", () => {
      const mockEndpoints = [
        {
          id: "ep-lingering-dew-b1atfd0w",
          host: "ep-lingering-dew-b1atfd0w.c-5.eu-central-1.aws.neon.tech",
          branch_id: "br-solitary-thunder-b1hm9low",
        },
      ];
      const mockBranches = [
        {
          id: "br-solitary-thunder-b1hm9low",
          name: "main",
          default: true,
          primary: true,
          protected: false,
        },
      ];

      const env = {
        TEMPORAL_MODEL_DATABASE_URL: "postgresql://neondb_owner:secret@ep-lingering-dew-b1atfd0w.c-5.eu-central-1.aws.neon.tech/neondb?sslmode=require",
        ALLOW_EXISTING_TEMPORAL_TEST_DATABASE: "true",
      };

      expect(() =>
        resolveRunnerConfig(env, {
          endpoints: mockEndpoints,
          branches: mockBranches,
        })
      ).toThrow(/Refusing to target default branch: 'main'/);
    });

    it("rejects when expectedBranchId does not match the actual branch of the endpoint", () => {
      const mockEndpoints = [
        {
          id: "ep-test-temporal-1",
          host: "ep-test-temporal-1.aws.neon.tech",
          branch_id: "br-tmp-branch-actual",
        },
      ];
      const mockBranches = [
        {
          id: "br-tmp-branch-actual",
          name: "tmp-temporal-actual",
          default: false,
          primary: false,
          protected: false,
        },
      ];

      const env = {
        TEMPORAL_MODEL_DATABASE_URL: "postgresql://user:pass@ep-test-temporal-1.aws.neon.tech/neondb",
        ALLOW_EXISTING_TEMPORAL_TEST_DATABASE: "true",
      };

      expect(() =>
        resolveRunnerConfig(env, {
          endpoints: mockEndpoints,
          branches: mockBranches,
          expectedBranchId: "br-tmp-branch-different",
        })
      ).toThrow(/Branch mismatch: expected branch 'br-tmp-branch-different'/);
    });

    it("accepts verified connection pointing to a safe temporal branch with matching expectedBranchId", () => {
      const mockEndpoints = [
        {
          id: "ep-test-temporal-1",
          host: "ep-test-temporal-1.aws.neon.tech",
          branch_id: "br-tmp-branch-valid",
        },
      ];
      const mockBranches = [
        {
          id: "br-tmp-branch-valid",
          name: "tmp-temporal-valid",
          default: false,
          primary: false,
          protected: false,
        },
      ];

      const env = {
        TEMPORAL_MODEL_DATABASE_URL: "postgresql://user:pass@ep-test-temporal-1.aws.neon.tech/neondb",
        ALLOW_EXISTING_TEMPORAL_TEST_DATABASE: "true",
      };

      const config = resolveRunnerConfig(env, {
        endpoints: mockEndpoints,
        branches: mockBranches,
        expectedBranchId: "br-tmp-branch-valid",
      });
      expect(config.mode).toBe("existing");
      expect(config.targetBranch.name).toBe("tmp-temporal-valid");
    });
  });

  describe("3. Base branch validation & target branch rejection", () => {
    it("rejects base branch if it is main, master, or production", () => {
      const branches = [
        { id: "br-main", name: "main", default: true, primary: true },
        { id: "br-dev", name: "preview/development", default: false, primary: false },
      ];

      expect(() => resolveNeonBaseBranch(branches, "br-main")).toThrow(
        /Refusing to use 'main' or default\/primary branch as base branch/
      );
    });

    it("rejects base branch if it is marked as protected", () => {
      const branches = [
        { id: "br-protected", name: "preview/protected", default: false, primary: false, protected: true },
      ];

      expect(() => resolveNeonBaseBranch(branches, "br-protected")).toThrow(
        /Refusing to use protected branch as base branch/
      );
    });

    it("resolves valid base branch successfully", () => {
      const branches = [
        { id: "br-falling-heart-b1d6u2cx", name: "preview/development", default: false, primary: false, protected: false },
        { id: "br-solitary-thunder-main", name: "main", default: true, primary: true, protected: false },
      ];

      const resolved = resolveNeonBaseBranch(branches, "br-falling-heart-b1d6u2cx");
      expect(resolved.id).toBe("br-falling-heart-b1d6u2cx");
      expect(resolved.name).toBe("preview/development");
    });

    it("rejects target branch named main, master, or production", () => {
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

    it("rejects target branch if parent_id does not match expectedParentBranchId", () => {
      expect(() =>
        validateTargetBranch(
          { name: "tmp-valid", default: false, protected: false, parent_id: "br-wrong" },
          { expectedParentBranchId: "br-expected" }
        )
      ).toThrow(/does not match expected parent/);
    });

    it("rejects target branch names that are not unequivocally temporal", () => {
      expect(isTemporalBranchName("preview/development")).toBe(false);
      expect(isTemporalBranchName("feature/my-branch")).toBe(false);
      expect(isTemporalBranchName("tmp-temporal-123")).toBe(true);
      expect(isTemporalBranchName("test-branch-456")).toBe(true);
      expect(isTemporalBranchName("ephemeral-run-789")).toBe(true);
    });
  });

  describe("4. Ephemeral Branch Accreditation Before Connection", () => {
    const validBranch = {
      id: "br-tmp-123",
      name: "tmp-temporal-123",
      parent_id: BASE_BRANCH_ID,
      default: false,
      primary: false,
      protected: false,
    };
    const validEndpoints = [
      {
        id: "ep-tmp-123",
        host: "ep-tmp-123.neon.tech",
        branch_id: "br-tmp-123",
      },
    ];

    it("passes accreditation when all properties match strictly", () => {
      const result = accreditBranchBeforeConnection({
        branchId: "br-tmp-123",
        connectionString: "postgresql://user:pass@ep-tmp-123.neon.tech/neondb",
        baseBranchId: BASE_BRANCH_ID,
        expectedEndpointId: "ep-tmp-123",
        branches: [validBranch],
        endpoints: validEndpoints,
      });
      expect(result.branch.id).toBe("br-tmp-123");
      expect(result.endpoint.id).toBe("ep-tmp-123");
    });

    it("fails accreditation if branch is not found", () => {
      expect(() =>
        accreditBranchBeforeConnection({
          branchId: "br-nonexistent",
          connectionString: "postgresql://user:pass@ep-tmp-123.neon.tech/neondb",
          baseBranchId: BASE_BRANCH_ID,
          branches: [validBranch],
          endpoints: validEndpoints,
        })
      ).toThrow(/Created branch 'br-nonexistent' not found/);
    });

    it("fails accreditation if branch name is not temporal", () => {
      const nonTemporal = { ...validBranch, name: "permanent-test" };
      expect(() =>
        accreditBranchBeforeConnection({
          branchId: "br-tmp-123",
          connectionString: "postgresql://user:pass@ep-tmp-123.neon.tech/neondb",
          baseBranchId: BASE_BRANCH_ID,
          branches: [nonTemporal],
          endpoints: validEndpoints,
        })
      ).toThrow(/does not have an unequivocally temporal name/);
    });

    it("fails accreditation if branch parent_id does not match base branch", () => {
      const wrongParent = { ...validBranch, parent_id: "br-other-parent" };
      expect(() =>
        accreditBranchBeforeConnection({
          branchId: "br-tmp-123",
          connectionString: "postgresql://user:pass@ep-tmp-123.neon.tech/neondb",
          baseBranchId: BASE_BRANCH_ID,
          branches: [wrongParent],
          endpoints: validEndpoints,
        })
      ).toThrow(/does not match expected base branch/);
    });

    it("fails accreditation if branch is default or primary", () => {
      const defaultBranch = { ...validBranch, default: true };
      expect(() =>
        accreditBranchBeforeConnection({
          branchId: "br-tmp-123",
          connectionString: "postgresql://user:pass@ep-tmp-123.neon.tech/neondb",
          baseBranchId: BASE_BRANCH_ID,
          branches: [defaultBranch],
          endpoints: validEndpoints,
        })
      ).toThrow(/marked as default or primary branch/);
    });

    it("fails accreditation if branch is protected", () => {
      const protectedBranch = { ...validBranch, protected: true };
      expect(() =>
        accreditBranchBeforeConnection({
          branchId: "br-tmp-123",
          connectionString: "postgresql://user:pass@ep-tmp-123.neon.tech/neondb",
          baseBranchId: BASE_BRANCH_ID,
          branches: [protectedBranch],
          endpoints: validEndpoints,
        })
      ).toThrow(/marked as protected branch/);
    });

    it("fails accreditation if endpoint host cannot be resolved", () => {
      expect(() =>
        accreditBranchBeforeConnection({
          branchId: "br-tmp-123",
          connectionString: "postgresql://user:pass@ep-unknown.neon.tech/neondb",
          baseBranchId: BASE_BRANCH_ID,
          branches: [validBranch],
          endpoints: validEndpoints,
        })
      ).toThrow(/does not map to any endpoint/);
    });

    it("fails accreditation if endpoint branch_id does not match branchId", () => {
      const mismatchEndpoints = [
        {
          id: "ep-tmp-123",
          host: "ep-tmp-123.neon.tech",
          branch_id: "br-other-branch",
        },
      ];
      expect(() =>
        accreditBranchBeforeConnection({
          branchId: "br-tmp-123",
          connectionString: "postgresql://user:pass@ep-tmp-123.neon.tech/neondb",
          baseBranchId: BASE_BRANCH_ID,
          branches: [validBranch],
          endpoints: mismatchEndpoints,
        })
      ).toThrow(/belongs to branch 'br-other-branch', not the accredited ephemeral branch 'br-tmp-123'/);
    });

    it("fails accreditation if endpoint ID does not match expectedEndpointId", () => {
      expect(() =>
        accreditBranchBeforeConnection({
          branchId: "br-tmp-123",
          connectionString: "postgresql://user:pass@ep-tmp-123.neon.tech/neondb",
          baseBranchId: BASE_BRANCH_ID,
          expectedEndpointId: "ep-expected-special",
          branches: [validBranch],
          endpoints: validEndpoints,
        })
      ).toThrow(/Expected endpoint ID 'ep-expected-special', but host .* resolved to endpoint 'ep-tmp-123'/);
    });
  });

  describe("5. Preflight and Post-Migration Schema Assertions", () => {
    it("assertNoTemporalObjectsPresent passes on clean database", async () => {
      const mockClient = {
        async query() {
          return { rows: [] };
        },
      };

      const res = await assertNoTemporalObjectsPresent(mockClient, { context: "test" });
      expect(res).toBe(true);
    });

    it("assertNoTemporalObjectsPresent throws if _migrations has 0036", async () => {
      const mockClient = {
        async query(sql) {
          if (sql.includes("information_schema.tables WHERE")) {
            return { rows: [{ "?column?": 1 }] };
          }
          if (sql.includes("_migrations WHERE name = ANY")) {
            return { rows: [{ name: "0036_temporal_organizational_model.sql" }] };
          }
          return { rows: [] };
        },
      };

      await expect(assertNoTemporalObjectsPresent(mockClient, { context: "test" })).rejects.toThrow(
        /temporal migration\(s\) \[0036_temporal_organizational_model.sql\] already recorded/
      );
    });

    it("assertNoTemporalObjectsPresent throws if temporal table exists", async () => {
      const mockClient = {
        async query(sql) {
          if (sql.includes("information_schema.tables WHERE") && sql.includes("ANY")) {
            return { rows: [{ table_name: "organization_people" }] };
          }
          return { rows: [] };
        },
      };

      await expect(assertNoTemporalObjectsPresent(mockClient, { context: "test" })).rejects.toThrow(
        /temporal table\(s\) \[organization_people\] already exist/
      );
    });

    it("assertTemporalObjectsMaterialized passes when all objects are present", async () => {
      const mockClient = {
        async query(sql) {
          if (sql.includes("_migrations WHERE name = ANY")) {
            return { rows: [{ name: "0036_temporal_organizational_model.sql" }, { name: "0037_temporal_ownership_transfer_and_labor_integrity.sql" }] };
          }
          if (sql.includes("information_schema.tables WHERE")) {
            return { rows: TEMPORAL_TABLES.map((t) => ({ table_name: t })) };
          }
          if (sql.includes("information_schema.views WHERE")) {
            return { rows: TEMPORAL_VIEWS.map((v) => ({ table_name: v })) };
          }
          if (sql.includes("information_schema.routines")) {
            return { rows: TEMPORAL_ROUTINES.map((r) => ({ routine_name: r })) };
          }
          if (sql.includes("information_schema.triggers")) {
            return { rows: TEMPORAL_TRIGGERS.map((t) => ({ trigger_name: t })) };
          }
          return { rows: [] };
        },
      };

      const res = await assertTemporalObjectsMaterialized(mockClient, { context: "test" });
      expect(res).toBe(true);
    });

    it("assertTemporalObjectsMaterialized throws if a table is missing", async () => {
      const mockClient = {
        async query(sql) {
          if (sql.includes("_migrations WHERE name = ANY")) {
            return { rows: [{ name: "0036_temporal_organizational_model.sql" }, { name: "0037_temporal_ownership_transfer_and_labor_integrity.sql" }] };
          }
          if (sql.includes("information_schema.tables WHERE")) {
            // Missing reporting_relationship_periods
            return { rows: TEMPORAL_TABLES.slice(0, 5).map((t) => ({ table_name: t })) };
          }
          return { rows: [] };
        },
      };

      await expect(assertTemporalObjectsMaterialized(mockClient, { context: "test" })).rejects.toThrow(
        /temporal table 'reporting_relationship_periods' was not created/
      );
    });
  });

  describe("6. Full Harness Lifecycle & Cleanup", () => {
    it("destroys ephemeral branch when harness execution succeeds", async () => {
      let clientInstance = 0;
      class SuccessClient {
        constructor() {
          clientInstance++;
          this.instance = clientInstance;
        }
        async connect() {}
        async query(sql) {
          if (this.instance <= 2) {
            if (sql.includes("information_schema")) return { rows: [] };
            if (sql.includes("organizations")) return { rows: [{ id: "org-1" }] };
            return { rows: [] };
          }
          if (sql.includes("_migrations WHERE name = ANY")) {
            return {
              rows: [
                { name: "0036_temporal_organizational_model.sql" },
                { name: "0037_temporal_ownership_transfer_and_labor_integrity.sql" },
              ],
            };
          }
          if (sql.includes("information_schema.tables WHERE") && sql.includes("ANY")) {
            return { rows: TEMPORAL_TABLES.map((t) => ({ table_name: t })) };
          }
          if (sql.includes("information_schema.views WHERE") && sql.includes("ANY")) {
            return { rows: TEMPORAL_VIEWS.map((v) => ({ table_name: v })) };
          }
          if (sql.includes("information_schema.routines")) {
            return { rows: TEMPORAL_ROUTINES.map((r) => ({ routine_name: r })) };
          }
          if (sql.includes("information_schema.triggers")) {
            return { rows: TEMPORAL_TRIGGERS.map((t) => ({ trigger_name: t })) };
          }
          if (sql.includes("information_schema")) return { rows: [] };
          if (sql.includes("organizations")) return { rows: [{ id: "org-1" }] };
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = createStandardMockNeonctl();
      const mockSpawnSync = vi.fn((cmd, args) => {
        const outArg = args.find((a) => typeof a === "string" && a.startsWith("--outputFile="));
        if (outArg) {
          const filePath = outArg.split("=")[1];
          fs.writeFileSync(filePath, JSON.stringify({ numPassedTests: 23, numTotalTests: 23 }));
        }
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
        ["neonctl", "branches", "delete", "br-tmp-123", "--project-id", "holy-cake-85660318"],
        expect.any(Object)
      );
    });

    it("destroys ephemeral branch when integration tests fail", async () => {
      class SuccessClient {
        async connect() {}
        async query(sql) {
          if (sql.includes("information_schema")) return { rows: [] };
          if (sql.includes("organizations")) return { rows: [{ id: "org-1" }] };
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = createStandardMockNeonctl();
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
        ["neonctl", "branches", "delete", "br-tmp-123", "--project-id", "holy-cake-85660318"],
        expect.any(Object)
      );
    });

    it("returns FAIL and surfaces branch ID if ephemeral branch cleanup fails", async () => {
      class SuccessClient {
        async connect() {}
        async query(sql) {
          if (sql.includes("information_schema")) return { rows: [] };
          if (sql.includes("organizations")) return { rows: [{ id: "org-1" }] };
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = createStandardMockNeonctl({
        deleteError: new Error("Neon API error 500: Failed to delete branch"),
      });

      const mockSpawnSync = vi.fn(() => ({ status: 0, stdout: "", stderr: "" }));

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
      expect(caughtError.message).toContain("Branch cleanup failed for branchId 'br-tmp-123'");
      expect(caughtError.branchId).toBe("br-tmp-123");
    });
  });

  describe("7. 11 Safety Failure Conditions with Non-Execution Proof (Spies)", () => {
    // Condition 1: Base branch is 'main'
    it("Condition 1: Rejects if base branch is 'main' without connecting or executing anything", async () => {
      const connectSpy = vi.fn();
      const seedSpy = vi.fn();
      const migrateSpy = vi.fn();
      const vitestSpy = vi.fn();

      class SpyClient {
        async connect() { connectSpy(); }
        async query() { return { rows: [] }; }
        async end() {}
      }

      const mockNeonctl = createStandardMockNeonctl();
      const mockSpawnSync = vi.fn((cmd) => {
        if (cmd === "node") migrateSpy();
        if (cmd === "npx") vitestSpy();
        return { status: 0, stdout: "", stderr: "" };
      });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: { TEMPORAL_BASE_BRANCH_ID: "br-solitary-thunder-b1hm9low" },
          neonctlExec: mockNeonctl,
          spawnSyncFn: mockSpawnSync,
          ClientClass: SpyClient,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Refusing to use 'main' or default/primary branch as base branch");
      expect(connectSpy).not.toHaveBeenCalled();
      expect(seedSpy).not.toHaveBeenCalled();
      expect(migrateSpy).not.toHaveBeenCalled();
      expect(vitestSpy).not.toHaveBeenCalled();
    });

    // Condition 2: Base branch has temporal objects (Preflight 1 fails)
    it("Condition 2: Fails Preflight 1 on base branch and aborts before creating child branch, seed, or migrate", async () => {
      const createBranchSpy = vi.fn();
      const seedSpy = vi.fn();
      const migrateSpy = vi.fn();
      const vitestSpy = vi.fn();

      class PreflightFailingBaseClient {
        async connect() {}
        async query(sql) {
          if (sql.includes("information_schema.tables WHERE") && sql.includes("_migrations")) {
            return { rows: [{ "?column?": 1 }] };
          }
          if (sql.includes("_migrations WHERE name = ANY")) {
            return { rows: [{ name: "0036_temporal_organizational_model.sql" }] };
          }
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = vi.fn((cmd, args) => {
        if (args.includes("branches") && args.includes("list")) {
          return JSON.stringify([mockBaseBranch]);
        }
        if (args.includes("connection-string")) {
          return "postgresql://neondb_owner:secret@ep-winter-bird-b1g75qgx.neon.tech/neondb";
        }
        if (args.includes("branches") && args.includes("create")) {
          createBranchSpy();
          return JSON.stringify({ branch: { id: "br-tmp-not-called" } });
        }
        return "";
      });

      const mockSpawnSync = vi.fn((cmd) => {
        if (cmd === "node") migrateSpy();
        if (cmd === "npx") vitestSpy();
        return { status: 0, stdout: "", stderr: "" };
      });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: mockSpawnSync,
          ClientClass: PreflightFailingBaseClient,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Preflight assertion failed: temporal migration(s) [0036_temporal_organizational_model.sql] already recorded");
      expect(createBranchSpy).not.toHaveBeenCalled();
      expect(seedSpy).not.toHaveBeenCalled();
      expect(migrateSpy).not.toHaveBeenCalled();
      expect(vitestSpy).not.toHaveBeenCalled();
    });

    // Condition 3: Ephemeral branch has non-temporal name pattern
    it("Condition 3: Rejects branch with non-temporal name pattern in accreditation before connection", async () => {
      const childConnectSpy = vi.fn();
      const seedSpy = vi.fn();
      const migrateSpy = vi.fn();
      const vitestSpy = vi.fn();

      class ClientSpy {
        async connect() {
          // Only base client connects for Preflight 1; child client must NEVER connect
          childConnectSpy();
        }
        async query() { return { rows: [] }; }
        async end() {}
      }

      const branchesWithBadName = [
        mockBaseBranch,
        {
          id: "br-tmp-123",
          name: "feature-branch-not-temporal",
          parent_id: BASE_BRANCH_ID,
          default: false,
          primary: false,
          protected: false,
        },
      ];

      const mockNeonctl = createStandardMockNeonctl({
        branches: branchesWithBadName,
        createdBranchName: "feature-branch-not-temporal",
      });

      const mockSpawnSync = vi.fn((cmd) => {
        if (cmd === "node") migrateSpy();
        if (cmd === "npx") vitestSpy();
        return { status: 0, stdout: "", stderr: "" };
      });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: mockSpawnSync,
          ClientClass: ClientSpy,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("does not have an unequivocally temporal name");
      // childConnectSpy was called at most once for base preflight; child connection never happened!
      expect(childConnectSpy).toHaveBeenCalledTimes(1);
      expect(seedSpy).not.toHaveBeenCalled();
      expect(migrateSpy).not.toHaveBeenCalled();
      expect(vitestSpy).not.toHaveBeenCalled();
      // Ephemeral branch was deleted
      expect(mockNeonctl).toHaveBeenCalledWith(
        "npx",
        ["neonctl", "branches", "delete", "br-tmp-123", "--project-id", "holy-cake-85660318"],
        expect.any(Object)
      );
    });

    // Condition 4: Ephemeral branch parent_id doesn't match base branch
    it("Condition 4: Rejects branch whose parent_id does not match base branch", async () => {
      const seedSpy = vi.fn();
      const migrateSpy = vi.fn();
      const vitestSpy = vi.fn();
      let connectionCount = 0;

      class ClientSpy {
        async connect() { connectionCount++; }
        async query() { return { rows: [] }; }
        async end() {}
      }

      const branchesWithWrongParent = [
        mockBaseBranch,
        {
          id: "br-tmp-123",
          name: "tmp-temporal-123",
          parent_id: "br-other-wrong-parent",
          default: false,
          primary: false,
          protected: false,
        },
      ];

      const mockNeonctl = createStandardMockNeonctl({ branches: branchesWithWrongParent });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: vi.fn(),
          ClientClass: ClientSpy,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("does not match expected base branch");
      expect(connectionCount).toBe(1); // Only base preflight
      expect(seedSpy).not.toHaveBeenCalled();
      expect(migrateSpy).not.toHaveBeenCalled();
      expect(vitestSpy).not.toHaveBeenCalled();
    });

    // Condition 5: Ephemeral branch is marked default or primary
    it("Condition 5: Rejects ephemeral branch marked default or primary", async () => {
      const seedSpy = vi.fn();
      let connectionCount = 0;

      class ClientSpy {
        async connect() { connectionCount++; }
        async query() { return { rows: [] }; }
        async end() {}
      }

      const branchesMarkedDefault = [
        mockBaseBranch,
        {
          id: "br-tmp-123",
          name: "tmp-temporal-123",
          parent_id: BASE_BRANCH_ID,
          default: true,
          primary: true,
          protected: false,
        },
      ];

      const mockNeonctl = createStandardMockNeonctl({ branches: branchesMarkedDefault });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: vi.fn(),
          ClientClass: ClientSpy,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("marked as default or primary branch");
      expect(connectionCount).toBe(1); // Only base preflight
      expect(seedSpy).not.toHaveBeenCalled();
    });

    // Condition 6: Ephemeral branch is marked protected
    it("Condition 6: Rejects ephemeral branch marked protected", async () => {
      const seedSpy = vi.fn();
      let connectionCount = 0;

      class ClientSpy {
        async connect() { connectionCount++; }
        async query() { return { rows: [] }; }
        async end() {}
      }

      const branchesMarkedProtected = [
        mockBaseBranch,
        {
          id: "br-tmp-123",
          name: "tmp-temporal-123",
          parent_id: BASE_BRANCH_ID,
          default: false,
          primary: false,
          protected: true,
        },
      ];

      const mockNeonctl = createStandardMockNeonctl({ branches: branchesMarkedProtected });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: vi.fn(),
          ClientClass: ClientSpy,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("marked as protected branch");
      expect(connectionCount).toBe(1);
      expect(seedSpy).not.toHaveBeenCalled();
    });

    // Condition 7: Hostname does not map to any endpoint
    it("Condition 7: Rejects when connection string hostname maps to no Neon endpoint", async () => {
      const seedSpy = vi.fn();
      let connectionCount = 0;

      class ClientSpy {
        async connect() { connectionCount++; }
        async query() { return { rows: [] }; }
        async end() {}
      }

      const mockNeonctl = createStandardMockNeonctl({
        connectionUri: "postgresql://user:pass@ep-unknown-alien.neon.tech/neondb",
      });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: vi.fn(),
          ClientClass: ClientSpy,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("does not map to any endpoint");
      expect(connectionCount).toBe(1);
      expect(seedSpy).not.toHaveBeenCalled();
    });

    // Condition 8: Endpoint branch_id does not match ephemeral branchId
    it("Condition 8: Rejects when endpoint branch_id belongs to a different branch", async () => {
      const seedSpy = vi.fn();
      let connectionCount = 0;

      class ClientSpy {
        async connect() { connectionCount++; }
        async query() { return { rows: [] }; }
        async end() {}
      }

      const endpointsWithWrongBranch = [
        {
          id: "ep-base",
          host: "ep-winter-bird-b1g75qgx.neon.tech",
          branch_id: BASE_BRANCH_ID,
        },
        {
          id: "ep-tmp-123",
          host: "ep-tmp-123.neon.tech",
          branch_id: "br-different-branch", // MISMATCH!
        },
      ];

      const mockNeonctl = createStandardMockNeonctl({ endpoints: endpointsWithWrongBranch });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: vi.fn(),
          ClientClass: ClientSpy,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("belongs to branch 'br-different-branch', not the accredited ephemeral branch 'br-tmp-123'");
      expect(connectionCount).toBe(1);
      expect(seedSpy).not.toHaveBeenCalled();
    });

    // Condition 9: Endpoint ID does not match expected endpoint ID
    it("Condition 9: Rejects when resolved endpoint ID does not match expectedEndpointId", async () => {
      const seedSpy = vi.fn();
      let connectionCount = 0;

      class ClientSpy {
        async connect() { connectionCount++; }
        async query() { return { rows: [] }; }
        async end() {}
      }

      const mockNeonctl = createStandardMockNeonctl();

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          expectedEndpointId: "ep-different-expected-id",
          neonctlExec: mockNeonctl,
          spawnSyncFn: vi.fn(),
          ClientClass: ClientSpy,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toMatch(/Expected endpoint ID 'ep-different-expected-id', but host .* resolved to endpoint 'ep-tmp-123'/);
      expect(connectionCount).toBe(1);
      expect(seedSpy).not.toHaveBeenCalled();
    });

    // Condition 10: Ephemeral branch already has temporal objects (Preflight 2 fails)
    it("Condition 10: Fails Preflight 2 on ephemeral branch before seed or migration", async () => {
      const seedSpy = vi.fn();
      const migrateSpy = vi.fn();
      const vitestSpy = vi.fn();
      let connectionCount = 0;

      class Preflight2FailingClient {
        async connect() { connectionCount++; }
        async query(sql) {
          // Connection 1 is base branch (clean)
          if (connectionCount === 1) {
            return { rows: [] };
          }
          // Connection 2 is child branch (contaminated)
          if (sql.includes("information_schema.tables WHERE") && sql.includes("ANY")) {
            return { rows: [{ table_name: "organization_people" }] };
          }
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = createStandardMockNeonctl();
      const mockSpawnSync = vi.fn((cmd) => {
        if (cmd === "node") migrateSpy();
        if (cmd === "npx") vitestSpy();
        return { status: 0, stdout: "", stderr: "" };
      });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: mockSpawnSync,
          ClientClass: Preflight2FailingClient,
          seedCasesFn: seedSpy,
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Preflight assertion failed: temporal table(s) [organization_people] already exist");
      expect(seedSpy).not.toHaveBeenCalled();
      expect(migrateSpy).not.toHaveBeenCalled();
      expect(vitestSpy).not.toHaveBeenCalled();
      // Ephemeral branch was deleted in finally
      expect(mockNeonctl).toHaveBeenCalledWith(
        "npx",
        ["neonctl", "branches", "delete", "br-tmp-123", "--project-id", "holy-cake-85660318"],
        expect.any(Object)
      );
    });

    // Condition 11: Cleanup failure surfaces branch ID and fails runner
    it("Condition 11: Cleanup failure surfaces branch ID and fails harness with passedCount 0", async () => {
      class SuccessClient {
        async connect() {}
        async query(sql) {
          if (sql.includes("information_schema")) return { rows: [] };
          if (sql.includes("organizations")) return { rows: [{ id: "org-1" }] };
          return { rows: [] };
        }
        async end() {}
      }

      const mockNeonctl = createStandardMockNeonctl({
        deleteError: new Error("Fatal deletion timeout on Neon"),
      });

      let error = null;
      try {
        await runTemporalIntegrationHarness({
          env: {},
          neonctlExec: mockNeonctl,
          spawnSyncFn: vi.fn(),
          ClientClass: SuccessClient,
          seedCasesFn: vi.fn().mockResolvedValue({}),
          verifyBackfillFn: vi.fn().mockResolvedValue(),
        });
      } catch (err) {
        error = err;
      }

      expect(error).not.toBeNull();
      expect(error.message).toContain("Branch cleanup failed for branchId 'br-tmp-123'");
      expect(error.branchId).toBe("br-tmp-123");
      expect(error.passedCount).toBe(0);
    });
  });
});
