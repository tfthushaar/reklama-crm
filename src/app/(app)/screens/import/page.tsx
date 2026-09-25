import { Download, FileSpreadsheet } from "lucide-react";
import { requirePerm } from "@/lib/auth";
import { ActionForm } from "@/components/forms";
import { Card, Field, Input, Notice, PageHeader, buttonClass } from "@/components/ui";
import { importAssetsAction } from "@/app/actions/screens";

export const metadata = { title: "Import screens" };

export default async function ImportScreensPage() {
  await requirePerm("inventory");
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Import screens" subtitle="Bring in your current inventory sheet in one go." back={{ href: "/screens", label: "Screens" }} />
      <Card className="p-5 sm:p-6">
        <Notice icon={<FileSpreadsheet />} className="mb-5">
          We look for columns like <b>Name</b> (required), Code, Type (LED / Hoarding), City, Area, Address, Width, Height, Resolution, Total slots, Slot
          seconds, Monthly rate, Slot rate and Daily traffic. Screens whose code already exists are skipped.
          <div className="mt-2">
            <a href="/api/templates/screens" className={buttonClass("secondary", "sm")}>
              <Download /> Download template
            </a>
          </div>
        </Notice>
        <ActionForm action={importAssetsAction} submitLabel="Import screens">
          <Field label="Excel or CSV file" required>
            <Input type="file" name="file" accept=".csv,.xlsx" required className="h-auto py-2" />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
