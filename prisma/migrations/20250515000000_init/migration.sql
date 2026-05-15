-- CreateEnum
CREATE TYPE "SwapStatus" AS ENUM ('draft', 'open', 'locked', 'matched', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "discord_id" TEXT NOT NULL,
    "discord_tag" TEXT,
    "display_name" TEXT,
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swaps" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rules_text" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "gift_deadline" TIMESTAMP(3) NOT NULL,
    "price_min" INTEGER,
    "price_max" INTEGER,
    "status" "SwapStatus" NOT NULL DEFAULT 'open',
    "auto_match" BOOLEAN NOT NULL DEFAULT true,
    "creator_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "swap_participants" (
    "id" TEXT NOT NULL,
    "swap_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "steam_username" TEXT NOT NULL,
    "steam_id" TEXT,
    "discord_user_id" TEXT,
    "discord_tag" TEXT,
    "secret_token_hash" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "swap_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wishlist_items" (
    "id" TEXT NOT NULL,
    "participant_id" TEXT NOT NULL,
    "steam_app_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "store_url" TEXT NOT NULL,
    "price_hint" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blackout_pairs" (
    "id" TEXT NOT NULL,
    "swap_id" TEXT NOT NULL,
    "participant_a_id" TEXT NOT NULL,
    "participant_b_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blackout_pairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "swap_id" TEXT NOT NULL,
    "giver_id" TEXT NOT NULL,
    "receiver_id" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3),
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "swap_id" TEXT,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_discord_id_key" ON "users"("discord_id");

-- CreateIndex
CREATE UNIQUE INDEX "swaps_code_key" ON "swaps"("code");

-- CreateIndex
CREATE UNIQUE INDEX "swap_participants_swap_id_discord_user_id_key" ON "swap_participants"("swap_id", "discord_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "wishlist_items_participant_id_steam_app_id_key" ON "wishlist_items"("participant_id", "steam_app_id");

-- CreateIndex
CREATE UNIQUE INDEX "blackout_pairs_swap_id_participant_a_id_participant_b_id_key" ON "blackout_pairs"("swap_id", "participant_a_id", "participant_b_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_swap_id_giver_id_key" ON "assignments"("swap_id", "giver_id");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_swap_id_receiver_id_key" ON "assignments"("swap_id", "receiver_id");

-- AddForeignKey
ALTER TABLE "swaps" ADD CONSTRAINT "swaps_creator_user_id_fkey" FOREIGN KEY ("creator_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "swap_participants" ADD CONSTRAINT "swap_participants_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "swaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wishlist_items" ADD CONSTRAINT "wishlist_items_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "swap_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blackout_pairs" ADD CONSTRAINT "blackout_pairs_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "swaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blackout_pairs" ADD CONSTRAINT "blackout_pairs_participant_a_id_fkey" FOREIGN KEY ("participant_a_id") REFERENCES "swap_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blackout_pairs" ADD CONSTRAINT "blackout_pairs_participant_b_id_fkey" FOREIGN KEY ("participant_b_id") REFERENCES "swap_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_swap_id_fkey" FOREIGN KEY ("swap_id") REFERENCES "swaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_giver_id_fkey" FOREIGN KEY ("giver_id") REFERENCES "swap_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "swap_participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
