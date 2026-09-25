import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { assets, siteOwners } from "@/db/schema";
import { requirePerm } from "@/lib/auth";
import { ActionForm } from "@/components/forms";
import { ScreenFields } from "@/components/screen-form";
import { Card, PageHeader } from "@/components/ui";
import { createAssetAction } from "@/app/actions/screens";

export const metadata = { title: "Add screen" };

export default async function NewScreenPage() {
  await requirePerm("inventory");
  const db = await getDb();
  const owners = await db.select({ id: siteOwners.id, name: siteOwners.name }).from(siteOwners);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(assets);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Add a screen" subtitle="Add an LED screen or hoarding to your inventory." back={{ href: "/screens", label: "Screens" }} />
      <Card className="p-5 sm:p-6">
        <ActionForm action={createAssetAction} submitLabel="Add screen" resetOnSuccess={false}>
          <ScreenFields owners={owners} suggestedCode={`RG-BLR-${String(n + 1).padStart(3, "0")}`} />
        </ActionForm>
      </Card>
    </div>
  );
}
