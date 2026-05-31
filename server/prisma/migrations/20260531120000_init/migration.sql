-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "idToken" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "household_config" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "setupMode" TEXT NOT NULL,
    "profileComplete" BOOLEAN NOT NULL DEFAULT false,
    "wizardCompleted" BOOLEAN NOT NULL DEFAULT false,
    "expensesAvgMonthly" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "extendedFamilyContingencyPercent" DOUBLE PRECISION,
    "healthcareCorpusReservationPercent" DOUBLE PRECISION,
    "glidePath" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "members" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dateOfBirth" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "targetRetirementAge" INTEGER,
    "planToAge" INTEGER,
    "relation" TEXT,
    "salaryAnnualCTC" DOUBLE PRECISION,
    "salaryHikePercent" DOUBLE PRECISION,
    "salaryVpfTopUpPercent" DOUBLE PRECISION,
    "city" TEXT NOT NULL DEFAULT 'Metro',
    "health" TEXT NOT NULL DEFAULT 'Healthy',
    "educationStage" TEXT,
    "riskAppetite" TEXT NOT NULL DEFAULT 'Moderate',
    "marital" TEXT NOT NULL DEFAULT 'Married',
    "employmentStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalKind" TEXT NOT NULL,
    "annualProfit" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "sharePercent" DOUBLE PRECISION NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isOperated" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "other_income_lines" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceEntityId" TEXT,
    "label" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isTaxExempt" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "other_income_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investments" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "monthlyContribution" DOUBLE PRECISION,
    "ownerId" TEXT NOT NULL,
    "subtypeData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liabilities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outstandingBalance" DOUBLE PRECISION NOT NULL,
    "monthlyEMI" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isSharedWithSpouse" BOOLEAN NOT NULL DEFAULT false,
    "derivedEndYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liabilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liability_co_borrowers" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "liabilityId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liability_co_borrowers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_policies" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "sumAssured" DOUBLE PRECISION NOT NULL,
    "annualPremium" DOUBLE PRECISION NOT NULL,
    "insuredPersonId" TEXT NOT NULL,
    "renewalMonth" INTEGER,
    "renewalYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expense_lines" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "frequency" TEXT NOT NULL,
    "endYear" INTEGER,
    "source" TEXT NOT NULL,
    "sourceRefId" TEXT,
    "inflationBucket" TEXT,
    "kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expense_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planned_future_lines" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "todayAmount" DOUBLE PRECISION NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "isMultiYear" BOOLEAN NOT NULL DEFAULT false,
    "durationYears" INTEGER,
    "inflationBucket" TEXT,
    "kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planned_future_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estate_checklist_items" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "date" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "estate_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_snapshots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "capturedAt" TEXT NOT NULL,
    "totalAnnual" DOUBLE PRECISION NOT NULL,
    "byBucket" JSONB NOT NULL,
    "fireTargetYear" INTEGER,
    "fireNumber" DOUBLE PRECISION,
    "netWorth" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_assumptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inflation" DOUBLE PRECISION NOT NULL,
    "equityReturn" DOUBLE PRECISION NOT NULL,
    "debtReturn" DOUBLE PRECISION NOT NULL,
    "realEstateReturn" DOUBLE PRECISION NOT NULL,
    "goldReturn" DOUBLE PRECISION NOT NULL,
    "npsReturn" DOUBLE PRECISION NOT NULL,
    "ppfReturn" DOUBLE PRECISION NOT NULL,
    "epfReturn" DOUBLE PRECISION NOT NULL,
    "internationalReturn" DOUBLE PRECISION NOT NULL DEFAULT 0.1,
    "reitReturn" DOUBLE PRECISION NOT NULL DEFAULT 0.08,
    "cryptoReturn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "healthcareInflation" DOUBLE PRECISION NOT NULL,
    "educationInflation" DOUBLE PRECISION NOT NULL,
    "housingInflation" DOUBLE PRECISION NOT NULL,
    "inflationWeights" JSONB NOT NULL,
    "swrOverride" DOUBLE PRECISION,
    "leanMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 0.6,
    "fatMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 1.5,
    "withdrawalRule" TEXT NOT NULL DEFAULT 'Constant',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leverValues" JSONB NOT NULL,
    "docCreatedAt" BIGINT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_features" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '{}',
    "wizardCompleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_features_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_ui_prefs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "prefs" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_ui_prefs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_sync_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "data_sync_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "migration_audit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceTable" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "migratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "migration_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE INDEX "session_token_idx" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "household_config_userId_key" ON "household_config"("userId");

-- CreateIndex
CREATE INDEX "members_userId_idx" ON "members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "members_userId_entityId_key" ON "members"("userId", "entityId");

-- CreateIndex
CREATE INDEX "businesses_userId_idx" ON "businesses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_userId_entityId_key" ON "businesses"("userId", "entityId");

-- CreateIndex
CREATE INDEX "other_income_lines_userId_idx" ON "other_income_lines"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "other_income_lines_userId_entityId_key" ON "other_income_lines"("userId", "entityId");

-- CreateIndex
CREATE INDEX "investments_userId_idx" ON "investments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "investments_userId_entityId_key" ON "investments"("userId", "entityId");

-- CreateIndex
CREATE INDEX "liabilities_userId_idx" ON "liabilities"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "liabilities_userId_entityId_key" ON "liabilities"("userId", "entityId");

-- CreateIndex
CREATE INDEX "liability_co_borrowers_userId_idx" ON "liability_co_borrowers"("userId");

-- CreateIndex
CREATE INDEX "liability_co_borrowers_liabilityId_idx" ON "liability_co_borrowers"("liabilityId");

-- CreateIndex
CREATE UNIQUE INDEX "liability_co_borrowers_liabilityId_memberId_key" ON "liability_co_borrowers"("liabilityId", "memberId");

-- CreateIndex
CREATE INDEX "insurance_policies_userId_idx" ON "insurance_policies"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_policies_userId_entityId_key" ON "insurance_policies"("userId", "entityId");

-- CreateIndex
CREATE INDEX "recurring_expense_lines_userId_idx" ON "recurring_expense_lines"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expense_lines_userId_entityId_key" ON "recurring_expense_lines"("userId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expense_lines_userId_sourceRefId_key" ON "recurring_expense_lines"("userId", "sourceRefId");

-- CreateIndex
CREATE INDEX "planned_future_lines_userId_idx" ON "planned_future_lines"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "planned_future_lines_userId_entityId_key" ON "planned_future_lines"("userId", "entityId");

-- CreateIndex
CREATE INDEX "estate_checklist_items_userId_idx" ON "estate_checklist_items"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "estate_checklist_items_userId_key_key" ON "estate_checklist_items"("userId", "key");

-- CreateIndex
CREATE INDEX "expense_snapshots_userId_idx" ON "expense_snapshots"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_snapshots_userId_period_key" ON "expense_snapshots"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "user_assumptions_userId_key" ON "user_assumptions"("userId");

-- CreateIndex
CREATE INDEX "scenarios_userId_idx" ON "scenarios"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "scenarios_userId_entityId_key" ON "scenarios"("userId", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "user_features_userId_key" ON "user_features"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "user_ui_prefs_userId_key" ON "user_ui_prefs"("userId");

-- CreateIndex
CREATE INDEX "data_sync_log_userId_idx" ON "data_sync_log"("userId");

-- CreateIndex
CREATE INDEX "migration_audit_userId_idx" ON "migration_audit"("userId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liability_co_borrowers" ADD CONSTRAINT "liability_co_borrowers_liabilityId_fkey" FOREIGN KEY ("liabilityId") REFERENCES "liabilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

