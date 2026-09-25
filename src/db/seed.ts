import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB, Executor } from "./index";
import * as s from "./schema";
import { hashPassword } from "@/lib/password";
import { addDays, istDateTime, today } from "@/lib/format";
import type { LineInput } from "@/lib/pricing";
import { createQuote, sendQuote, updateQuote, rejectQuote } from "@/lib/services/quotes";
import { bookQuote } from "@/lib/services/bookings";
import { createInvoice, invoiceDefaultsFromBooking, recordPayment } from "@/lib/services/invoices";

const R = (rupees: number) => rupees * 100;
const daysAgo = (n: number, time = "11:00") => istDateTime(addDays(today(), -n), time);
const daysAhead = (n: number, time = "11:00") => istDateTime(addDays(today(), n), time);

export async function seedDemoData(db: DB) {
  await db.transaction(async (tx) => {
    await seed(tx);
  });
}

async function seed(db: Executor) {
  const t = today();

  await db.insert(s.companySettings).values({
    id: 1,
    companyName: "Reklama Global",
    legalName: "Reklama Global Media Pvt. Ltd.",
    address: "No. 21, Residency Road",
    city: "Bengaluru",
    state: "Karnataka",
    stateCode: "29",
    gstin: "29AAACR1234K1Z5",
    pan: "AAACR1234K",
    phone: "+91 80 4000 1234",
    email: "sales@reklama.example",
    website: "www.reklama.example",
    bankName: "HDFC Bank, Residency Road",
    bankAccount: "50200012345678",
    bankIfsc: "HDFC0001234",
    upiId: "reklama@hdfcbank",
    quoteTerms:
      "1. Rates are exclusive of GST.\n2. Screens are held for 48 hours from the date of this quotation; confirmation is subject to availability.\n3. 50% advance with Release Order; balance within 15 days of campaign start.\n4. Creatives must be shared 3 working days before the start date.\n5. Printing and mounting are charged separately unless mentioned.",
    invoiceTerms:
      "1. Please pay within the due date. Interest @18% p.a. applies on delayed payments.\n2. TDS certificate to be shared quarterly.\n3. Subject to Bengaluru jurisdiction.",
  });

  const pw = hashPassword("demo123");
  const userRows = await db
    .insert(s.users)
    .values([
      { name: "Rahul Mehta", email: "owner@reklama.demo", phone: "98450 11111", role: "owner", passwordHash: pw },
      { name: "Priya Sharma", email: "priya@reklama.demo", phone: "98450 22222", role: "sales_manager", passwordHash: pw },
      { name: "Arjun Rao", email: "arjun@reklama.demo", phone: "98450 33333", role: "sales_exec", passwordHash: pw },
      { name: "Sneha Iyer", email: "sneha@reklama.demo", phone: "98450 44444", role: "sales_exec", passwordHash: pw },
      { name: "Vikram Singh", email: "vikram@reklama.demo", phone: "98450 55555", role: "operations", passwordHash: pw },
      { name: "Anita Desai", email: "anita@reklama.demo", phone: "98450 66666", role: "accounts", passwordHash: pw },
    ])
    .returning();
  const [owner, priya, arjun, sneha, vikram, anita] = userRows as [s.User, s.User, s.User, s.User, s.User, s.User];

  const siteOwnerRows = await db
    .insert(s.siteOwners)
    .values([
      { name: "Lakshmi Properties", phone: "98860 12345", email: "accounts@lakshmiprop.example", address: "Brigade Road, Bengaluru" },
      { name: "Sri Venkateshwara Estates", phone: "99000 54321", address: "Silk Board, Bengaluru" },
      { name: "Outdoor Kings Media", phone: "98441 67890", email: "sales@outdoorkings.example", address: "Whitefield, Bengaluru", notes: "Other media owner — we resell their sites." },
      { name: "Prestige Tech Park Pvt Ltd", phone: "80 4123 9876", address: "Outer Ring Road, Marathahalli" },
    ])
    .returning();
  const [lakshmi, venkat, outdoorKings, techPark] = siteOwnerRows as [
    typeof s.siteOwners.$inferSelect,
    typeof s.siteOwners.$inferSelect,
    typeof s.siteOwners.$inferSelect,
    typeof s.siteOwners.$inferSelect,
  ];

  const A = (x: Partial<typeof s.assets.$inferInsert> & Pick<typeof s.assets.$inferInsert, "code" | "name" | "type" | "city">) => x;
  const assetRows = await db
    .insert(s.assets)
    .values([
      A({ code: "RG-BLR-001", name: "MG Road Metro LED", type: "led", city: "Bengaluru", area: "MG Road", address: "Opp. MG Road Metro Station, Bengaluru 560001", landmark: "Next to Metro exit B", widthFt: 20, heightFt: 10, resolution: "1920 × 960", illumination: "digital", loopSeconds: 120, slotSeconds: 10, totalSlots: 12, saleMode: "both", monthlyRate: R(600000), slotRate: R(55000), dailyTraffic: 180000, operatingHours: "6 AM – 12 AM", ownership: "owned", permitNumber: "BBMP/ADV/2025/1182", permitExpiry: addDays(t, 210) }),
      A({ code: "RG-BLR-002", name: "Brigade Road Junction LED", type: "led", city: "Bengaluru", area: "Brigade Road", address: "Brigade Road & Residency Rd junction", widthFt: 16, heightFt: 9, resolution: "1600 × 900", illumination: "digital", loopSeconds: 150, slotSeconds: 15, totalSlots: 10, saleMode: "slots", monthlyRate: R(450000), slotRate: R(48000), dailyTraffic: 120000, operatingHours: "7 AM – 11 PM", ownership: "leased", siteOwnerId: lakshmi.id, rentMonthly: R(60000), leaseEnd: addDays(t, 300), permitNumber: "BBMP/ADV/2025/0931", permitExpiry: addDays(t, 160) }),
      A({ code: "RG-BLR-003", name: "Silk Board Junction Hoarding", type: "hoarding", city: "Bengaluru", area: "Silk Board", address: "Hosur Road, near Silk Board flyover", landmark: "Facing traffic towards Electronic City", widthFt: 40, heightFt: 20, illumination: "frontlit", totalSlots: 1, saleMode: "exclusive", monthlyRate: R(320000), dailyTraffic: 250000, ownership: "leased", siteOwnerId: venkat.id, rentMonthly: R(90000), leaseEnd: addDays(t, 400), permitNumber: "BBMP/ADV/2024/2210", permitExpiry: addDays(t, 20) }),
      A({ code: "RG-BLR-004", name: "Hebbal Flyover Hoarding", type: "hoarding", city: "Bengaluru", area: "Hebbal", address: "Bellary Road, Hebbal flyover", widthFt: 60, heightFt: 20, illumination: "backlit", totalSlots: 1, saleMode: "exclusive", monthlyRate: R(400000), dailyTraffic: 300000, ownership: "owned", permitNumber: "BBMP/ADV/2025/0412", permitExpiry: addDays(t, 280) }),
      A({ code: "RG-BLR-005", name: "ORR Marathahalli LED", type: "led", city: "Bengaluru", area: "Marathahalli", address: "Outer Ring Road, Marathahalli bridge", widthFt: 24, heightFt: 12, resolution: "2304 × 1152", illumination: "digital", loopSeconds: 120, slotSeconds: 10, totalSlots: 12, saleMode: "both", monthlyRate: R(550000), slotRate: R(50000), dailyTraffic: 220000, operatingHours: "6 AM – 12 AM", ownership: "leased", siteOwnerId: techPark.id, rentMonthly: R(80000), leaseEnd: addDays(t, 45), permitNumber: "BBMP/ADV/2025/1500", permitExpiry: addDays(t, 190) }),
      A({ code: "RG-BLR-006", name: "Koramangala Sony Signal LED", type: "led", city: "Bengaluru", area: "Koramangala", address: "80 Feet Road, Sony World signal", widthFt: 16, heightFt: 9, resolution: "1600 × 900", illumination: "digital", loopSeconds: 120, slotSeconds: 10, totalSlots: 12, saleMode: "both", monthlyRate: R(400000), slotRate: R(38000), dailyTraffic: 140000, ownership: "owned", permitExpiry: addDays(t, 240) }),
      A({ code: "RG-BLR-007", name: "Indiranagar 100 Ft Road LED", type: "led", city: "Bengaluru", area: "Indiranagar", address: "100 Feet Road, near CMH Road junction", widthFt: 14, heightFt: 8, resolution: "1400 × 800", illumination: "digital", loopSeconds: 120, slotSeconds: 10, totalSlots: 12, saleMode: "slots", monthlyRate: R(360000), slotRate: R(35000), dailyTraffic: 110000, ownership: "owned", permitExpiry: addDays(t, 330) }),
      A({ code: "RG-BLR-008", name: "Whitefield ITPL Main Road Hoarding", type: "hoarding", city: "Bengaluru", area: "Whitefield", address: "ITPL Main Road, Whitefield", widthFt: 30, heightFt: 15, illumination: "frontlit", totalSlots: 1, saleMode: "exclusive", monthlyRate: R(180000), dailyTraffic: 150000, ownership: "third_party", siteOwnerId: outdoorKings.id, rentMonthly: R(110000), notes: "Bought from Outdoor Kings Media at ₹1.1L/month." }),
      A({ code: "RG-BLR-009", name: "Jayanagar 4th Block Hoarding", type: "hoarding", city: "Bengaluru", area: "Jayanagar", address: "11th Main, 4th Block, Jayanagar", widthFt: 20, heightFt: 10, illumination: "nonlit", totalSlots: 1, saleMode: "exclusive", monthlyRate: R(120000), dailyTraffic: 80000, ownership: "owned", permitExpiry: addDays(t, 120) }),
      A({ code: "RG-BLR-010", name: "Airport Road Hebbal LED", type: "led", city: "Bengaluru", area: "Hebbal", address: "Airport Road, after Hebbal flyover (towards airport)", landmark: "Largest LED on airport corridor", widthFt: 40, heightFt: 20, resolution: "3840 × 1920", illumination: "digital", loopSeconds: 60, slotSeconds: 10, totalSlots: 6, saleMode: "exclusive", monthlyRate: R(850000), dailyTraffic: 260000, operatingHours: "24 hours", ownership: "owned", permitExpiry: addDays(t, 365) }),
      A({ code: "RG-BLR-011", name: "Electronic City Toll LED", type: "led", city: "Bengaluru", area: "Electronic City", address: "Hosur Road elevated tollway, Electronic City", widthFt: 20, heightFt: 10, resolution: "1920 × 960", illumination: "digital", loopSeconds: 120, slotSeconds: 15, totalSlots: 8, saleMode: "both", monthlyRate: R(380000), slotRate: R(52000), dailyTraffic: 160000, status: "maintenance", ownership: "owned", permitExpiry: addDays(t, 150) }),
      A({ code: "RG-BLR-012", name: "Yeshwanthpur Circle Hoarding", type: "hoarding", city: "Bengaluru", area: "Yeshwanthpur", address: "Tumkur Road, Yeshwanthpur circle", widthFt: 40, heightFt: 20, illumination: "backlit", totalSlots: 1, saleMode: "exclusive", monthlyRate: R(260000), dailyTraffic: 170000, ownership: "owned", permitExpiry: addDays(t, 90) }),
      A({ code: "RG-BLR-013", name: "Bannerghatta Road Hoarding", type: "hoarding", city: "Bengaluru", area: "Bannerghatta Road", address: "Near Meenakshi Mall, Bannerghatta Road", widthFt: 30, heightFt: 15, illumination: "frontlit", totalSlots: 1, saleMode: "exclusive", monthlyRate: R(160000), dailyTraffic: 120000, ownership: "owned" }),
      A({ code: "RG-BLR-014", name: "HSR Layout 27th Main LED", type: "led", city: "Bengaluru", area: "HSR Layout", address: "27th Main Road, Sector 1, HSR Layout", widthFt: 12, heightFt: 7, resolution: "1280 × 720", illumination: "digital", loopSeconds: 120, slotSeconds: 10, totalSlots: 12, saleMode: "both", monthlyRate: R(300000), slotRate: R(28000), dailyTraffic: 90000, ownership: "owned", permitExpiry: addDays(t, 260) }),
    ])
    .returning();
  const asset = (code: string) => assetRows.find((a) => a.code === code)!;

  await db.insert(s.assetPhotos).values(
    assetRows.flatMap((a) => [
      { assetId: a.id, url: `/img/asset/${a.id}?v=day`, kind: "day" },
      { assetId: a.id, url: `/img/asset/${a.id}?v=night`, kind: "night" },
    ]),
  );

  await db.insert(s.maintenanceTickets).values({
    assetId: asset("RG-BLR-011").id,
    title: "Dead pixels on left panel — 3 modules",
    notes: "Vendor visit scheduled. Replacement modules ordered.",
    status: "in_progress",
    priority: "high",
    assignedTo: vikram.id,
    createdBy: vikram.id,
    cost: R(42000),
    createdAt: daysAgo(3),
  });

  type C = typeof s.clients.$inferInsert & { contact: { name: string; designation: string; phone: string; email: string } };
  const clientSeed: C[] = [
    { name: "Aurum Jewellers", industry: "Jewellery", city: "Bengaluru", state: "Karnataka", stateCode: "29", gstin: "29AAFCA5521M1ZQ", source: "Referral", stage: "won", ownerId: arjun.id, requirement: "Festive season campaign on high-traffic LEDs", budget: R(1500000), creditDays: 15, contact: { name: "Rakesh Jain", designation: "Marketing Head", phone: "98451 23001", email: "rakesh@aurum.example" } },
    { name: "FreshBasket Supermarts", industry: "Retail", city: "Bengaluru", state: "Karnataka", stateCode: "29", gstin: "29AABCF7788Q1Z2", source: "Cold call", stage: "won", ownerId: sneha.id, requirement: "New store openings in South Bengaluru", budget: R(500000), contact: { name: "Meera Nair", designation: "Brand Manager", phone: "98452 23002", email: "meera@freshbasket.example" } },
    { name: "Skyline Realty", industry: "Real estate", city: "Bengaluru", state: "Karnataka", stateCode: "29", gstin: "29AAGCS3321P1ZT", source: "Existing client", stage: "won", ownerId: priya.id, requirement: "Project launch — north Bengaluru, airport corridor", budget: R(2500000), contact: { name: "Vivek Reddy", designation: "VP Marketing", phone: "98453 23003", email: "vivek@skylinerealty.example" } },
    { name: "BrightPath Academy", industry: "Education", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Website", stage: "won", ownerId: sneha.id, requirement: "Admissions 2027 — near schools and colleges", budget: R(600000), contact: { name: "Dr. Kavitha Rao", designation: "Director", phone: "98454 23004", email: "kavitha@brightpath.example" } },
    { name: "Mediawave Advertising", type: "agency", industry: "Automobile", city: "Mumbai", state: "Maharashtra", stateCode: "27", gstin: "27AAECM4455R1ZK", source: "Agency", stage: "won", ownerId: priya.id, agencyCommission: 15, creditDays: 30, requirement: "Buys for Zenith Motors (SUV launch) and other brands", budget: R(3000000), contact: { name: "Farhan Qureshi", designation: "Media Buying Lead", phone: "98205 23005", email: "farhan@mediawave.example" } },
    { name: "Nova Hospitals", industry: "Healthcare", city: "Bengaluru", state: "Karnataka", stateCode: "29", gstin: "29AAACN9988H1Z1", source: "Walk-in / inbound call", stage: "won", ownerId: arjun.id, requirement: "Awareness for new cardiac centre", budget: R(800000), contact: { name: "Sanjay Kulkarni", designation: "Head of Communications", phone: "98455 23006", email: "sanjay@novahospitals.example" } },
    { name: "Kaveri Silks", industry: "Fashion & apparel", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Spotted on competitor site", stage: "proposal", ownerId: arjun.id, requirement: "Wedding season sale — central Bengaluru", budget: R(700000), timing: "Next month", contact: { name: "Lakshmi Venkatesh", designation: "Owner", phone: "98456 23007", email: "lakshmi@kaverisilks.example" } },
    { name: "UrbanFit Gyms", industry: "Other", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Social media", stage: "negotiation", ownerId: arjun.id, requirement: "3 new gyms in east Bengaluru", budget: R(400000), contact: { name: "Rohan D'Souza", designation: "Co-founder", phone: "98457 23008", email: "rohan@urbanfit.example" } },
    { name: "PayQuick Fintech", industry: "Banking & finance", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Event", stage: "qualified", ownerId: sneha.id, requirement: "App download campaign near tech parks", budget: R(1200000), contact: { name: "Ananya Gupta", designation: "Growth Manager", phone: "98458 23009", email: "ananya@payquick.example" } },
    { name: "Metro Cafe Chain", industry: "Food & restaurants", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Cold call", stage: "lost", lostReason: "Price too high", ownerId: sneha.id, requirement: "Brand visibility on MG Road", budget: R(150000), contact: { name: "Imran Sheikh", designation: "Marketing Manager", phone: "98459 23010", email: "imran@metrocafe.example" } },
    { name: "GreenLeaf Organics", industry: "FMCG", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Referral", stage: "negotiation", ownerId: priya.id, requirement: "Product launch — premium neighbourhoods", budget: R(900000), contact: { name: "Nisha Menon", designation: "Marketing Director", phone: "98460 23011", email: "nisha@greenleaf.example" } },
    { name: "CinePlex Studios", industry: "Film & entertainment", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Walk-in / inbound call", stage: "meeting", ownerId: arjun.id, requirement: "Film release in 6 weeks — city-wide LEDs", budget: R(2000000), timing: "In 6 weeks", contact: { name: "Aditya Shetty", designation: "Distribution Head", phone: "98461 23012", email: "aditya@cineplex.example" } },
    { name: "City Tourism Board", type: "government", industry: "Government", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Event", stage: "contacted", ownerId: priya.id, requirement: "Tourism awareness drive", contact: { name: "K. Manjunath", designation: "Deputy Director", phone: "98462 23013", email: "manjunath@tourism.example" } },
    { name: "Horizon Builders", industry: "Real estate", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Spotted on competitor site", stage: "new", ownerId: null, requirement: "Seen on a competitor hoarding at Hebbal", contact: { name: "Suresh Babu", designation: "Sales Head", phone: "98463 23014", email: "suresh@horizon.example" } },
    { name: "SmartKart Electronics", industry: "Retail", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Imported list", stage: "new", ownerId: sneha.id, contact: { name: "Deepak Verma", designation: "Marketing", phone: "98464 23015", email: "deepak@smartkart.example" } },
    { name: "Lotus Dental Clinics", industry: "Healthcare", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Website", stage: "contacted", ownerId: arjun.id, requirement: "Local awareness around 4 clinics", budget: R(200000), contact: { name: "Dr. Pooja Hegde", designation: "Founder", phone: "98465 23016", email: "pooja@lotusdental.example" } },
    { name: "Peak Performance Sports", industry: "Fashion & apparel", city: "Bengaluru", state: "Karnataka", stateCode: "29", source: "Social media", stage: "new", ownerId: null, contact: { name: "Karan Malhotra", designation: "Brand Lead", phone: "98466 23017", email: "karan@peakperf.example" } },
  ];

  const clientRows: s.Client[] = [];
  for (const [i, c] of clientSeed.entries()) {
    const { contact, ...data } = c;
    const [row] = await db
      .insert(s.clients)
      .values({ ...data, phone: contact.phone, email: contact.email, createdAt: daysAgo(40 - i) })
      .returning();
    await db.insert(s.contacts).values({ clientId: row!.id, ...contact, isPrimary: true });
    clientRows.push(row!);
  }
  const client = (name: string) => clientRows.find((c) => c.name === name)!;

  // ---------- human activity history ----------
  type Act = [string, number, "call" | "whatsapp" | "email" | "meeting" | "note", string, string, number];
  const history: Act[] = [
    ["Aurum Jewellers", arjun.id, "call", "Interested", "Wants premium LEDs for Diwali. Asked for MG Road and Brigade Road options.", 28],
    ["Aurum Jewellers", arjun.id, "meeting", "Asked for quote", "Met Rakesh at their Jayanagar showroom. Budget approx ₹15L.", 25],
    ["Aurum Jewellers", arjun.id, "whatsapp", "Replied", "Shared site photos of MG Road LED. Rakesh liked the location.", 22],
    ["FreshBasket Supermarts", sneha.id, "call", "Asked for quote", "Needs Silk Board hoarding for store launch.", 70],
    ["FreshBasket Supermarts", sneha.id, "email", "Sent", "Shared campaign completion photos.", 30],
    ["Skyline Realty", priya.id, "meeting", "Good meeting", "Launch of 'Skyline Meadows' — wants airport corridor visibility.", 12],
    ["Skyline Realty", priya.id, "call", "Asked for quote", "Confirmed Hebbal hoarding + ORR slots.", 9],
    ["BrightPath Academy", sneha.id, "call", "Interested", "Admissions campaign — south Bengaluru.", 14],
    ["BrightPath Academy", sneha.id, "whatsapp", "Asked for quote", "Asked for Koramangala + Jayanagar pricing.", 11],
    ["Mediawave Advertising", priya.id, "email", "Asked for quote", "RFP for Zenith Motors SUV launch — airport road exclusive.", 20],
    ["Mediawave Advertising", owner.id, "call", "Interested", "Spoke to Farhan — they want the large Airport Road LED exclusively.", 18],
    ["Nova Hospitals", arjun.id, "meeting", "Good meeting", "Presented slot options on Indiranagar LED.", 80],
    ["Nova Hospitals", anita.id, "call", "Call back later", "Payment follow-up — accounts team asked to call next week.", 6],
    ["Kaveri Silks", arjun.id, "call", "Interested", "Saw their ad on a competitor hoarding. Owner keen on MG Road.", 6],
    ["Kaveri Silks", arjun.id, "meeting", "Asked for quote", "Visited store. Wants 2 LEDs for wedding season.", 3],
    ["UrbanFit Gyms", arjun.id, "call", "Interested", "Wants HSR and Koramangala LEDs.", 8],
    ["UrbanFit Gyms", arjun.id, "whatsapp", "Replied", "Rohan asked for a better price — pushing for 18% off.", 2],
    ["PayQuick Fintech", sneha.id, "meeting", "Needs follow-up", "Met at Fintech Summit. Interested in ORR tech-park screens.", 5],
    ["PayQuick Fintech", sneha.id, "email", "Sent", "Sent media kit.", 4],
    ["Metro Cafe Chain", sneha.id, "call", "Not interested", "Said MG Road rates are above their budget.", 15],
    ["GreenLeaf Organics", priya.id, "meeting", "Asked for quote", "Launch in premium areas — Indiranagar, Koramangala, HSR.", 10],
    ["GreenLeaf Organics", priya.id, "call", "Interested", "Asked to reduce duration to 3 weeks.", 4],
    ["CinePlex Studios", arjun.id, "call", "Meeting fixed", "Meeting fixed for tomorrow at their office.", 1],
    ["City Tourism Board", priya.id, "email", "Sent", "Sent introduction and rate card.", 7],
    ["Lotus Dental Clinics", arjun.id, "call", "Call back later", "Dr. Pooja busy — call back Friday.", 9],
    ["SmartKart Electronics", sneha.id, "note", "", "Imported from trade-fair list.", 16],
  ];
  const times = ["10:15", "11:40", "14:20", "16:05", "17:30"];
  await db.insert(s.activities).values(
    history.map(([name, userId, type, outcome, notes, ago], i) => ({
      clientId: client(name).id,
      userId,
      type,
      direction: type === "note" ? null : "out",
      outcome: outcome || null,
      notes,
      durationMin: type === "call" ? 3 + (i % 9) : type === "meeting" ? 45 : null,
      occurredAt: daysAgo(ago, times[i % times.length]),
    })),
  );
  for (const c of clientRows) {
    const last = history.filter((h) => h[0] === c.name && h[2] !== "note").map((h) => h[5]);
    if (last.length) await db.update(s.clients).set({ lastActivityAt: daysAgo(Math.min(...last)) }).where(eq(s.clients.id, c.id));
  }

  // ---------- quotes → bookings → invoices ----------
  const media = (code: string, start: string, end: string, mode: "exclusive" | "slots", slots = 1, discountPct = 0): LineInput => {
    const a = asset(code);
    return {
      kind: "media",
      assetId: a.id,
      startDate: start,
      endDate: end,
      mode,
      slots,
      rate: mode === "slots" ? a.slotRate ?? 0 : a.monthlyRate,
      discountPct,
    };
  };
  const prod = (description: string, qty: number, rate: number): LineInput => ({ kind: "production", description, qty, rate, discountPct: 0 });
  const terms = (await db.select().from(s.companySettings))[0]!.quoteTerms;

  async function fullFlow(opts: {
    client: s.Client;
    userId: number;
    title: string;
    lines: LineInput[];
    createdAgo: number;
    commissionPct?: number;
    book?: { ro?: string; advance?: number };
  }) {
    const q = await createQuote(db, opts.userId, {
      clientId: opts.client.id,
      title: opts.title,
      validUntil: null,
      notes: null,
      terms,
      commissionPct: opts.commissionPct ?? 0,
      lines: opts.lines,
    });
    const [quote] = await db.select().from(s.quotes).where(eq(s.quotes.id, q.quoteId));
    if (quote!.status === "pending_approval") {
      await db.update(s.quoteVersions).set({ approvedBy: owner.id, approvedAt: daysAgo(opts.createdAgo) }).where(eq(s.quoteVersions.quoteId, q.quoteId));
      await db.update(s.quotes).set({ status: "draft" }).where(eq(s.quotes.id, q.quoteId));
      await db.delete(s.tasks).where(and(eq(s.tasks.refType, "quote"), eq(s.tasks.refId, q.quoteId)));
    }
    await sendQuote(db, opts.userId, q.quoteId, { via: "email", to: opts.client.email });
    await db.update(s.quotes).set({ createdAt: daysAgo(opts.createdAgo), sentAt: daysAgo(opts.createdAgo - 1) }).where(eq(s.quotes.id, q.quoteId));
    await backdate(db, "quote", q.quoteId, daysAgo(opts.createdAgo - 1, "15:30"));
    let booking: s.Booking | null = null;
    if (opts.book) {
      booking = await bookQuote(db, opts.userId, q.quoteId, {
        roNumber: opts.book.ro ?? null,
        roDate: opts.book.ro ? addDays(t, -(opts.createdAgo - 3)) : null,
        advanceAmount: opts.book.advance ?? null,
        paymentTerms: "50% advance, balance in 15 days",
        notes: null,
      });
      await db.update(s.bookings).set({ createdAt: daysAgo(opts.createdAgo - 3) }).where(eq(s.bookings.id, booking.id));
      await backdate(db, "booking", booking.id, daysAgo(opts.createdAgo - 3, "12:10"));
      await db
        .update(s.tasks)
        .set({ status: "done", completedAt: daysAgo(opts.createdAgo - 4), outcome: "Client confirmed" })
        .where(and(eq(s.tasks.refType, "quote"), eq(s.tasks.refId, q.quoteId)));
      if (opts.createdAgo > 12) {
        await db
          .update(s.tasks)
          .set({ status: "done", completedAt: daysAgo(opts.createdAgo - 5), outcome: "Creative received" })
          .where(eq(s.tasks.autoKey, `creative-${booking.id}`));
      }
    }
    return { quoteId: q.quoteId, booking };
  }

  async function invoice(bookingId: number, issuedAgo: number, kind: "tax" | "proforma" = "tax", fraction = 1) {
    const d = await invoiceDefaultsFromBooking(db, bookingId);
    const issueDate = addDays(t, -issuedAgo);
    const lines = fraction === 1 ? d.lines : [{ description: `Advance (${Math.round(fraction * 100)}%) for ${d.booking.title}`, amount: Math.round(d.lines.reduce((x, l) => x + l.amount, 0) * fraction / 100) * 100, isMedia: true }];
    const inv = await createInvoice(db, anita.id, {
      clientId: d.client.id,
      bookingId,
      kind,
      issueDate,
      dueDate: addDays(issueDate, d.client.creditDays ?? 15),
      commissionPct: d.commissionPct,
      notes: null,
      lines,
      issue: true,
    });
    await backdate(db, "invoice", inv.id, daysAgo(issuedAgo, "16:00"));
    return inv;
  }

  // 1. Aurum — live now, partly paid
  const aurum = await fullFlow({
    client: client("Aurum Jewellers"),
    userId: arjun.id,
    title: "Aurum Diwali Festive Campaign",
    createdAgo: 20,
    lines: [
      media("RG-BLR-001", addDays(t, -10), addDays(t, 20), "exclusive", 1, 5),
      media("RG-BLR-002", addDays(t, -10), addDays(t, 20), "slots", 4),
      prod("Video editing (LED)", 1, R(10000)),
    ],
    book: { ro: "AJ/RO/2026/118", advance: R(300000) },
  });
  await db.update(s.bookings).set({ status: "live" }).where(eq(s.bookings.id, aurum.booking!.id));
  const aurumInv = await invoice(aurum.booking!.id, 10);
  await recordPayment(db, anita.id, aurumInv.id, { date: addDays(t, -8), amount: R(500000), tds: R(10000), mode: "Bank transfer", reference: "NEFT HDFC0098812", notes: null });
  await backdate(db, "invoice", aurumInv.id, daysAgo(8, "12:30"), "Payment");

  // 2. FreshBasket — completed, paid
  const fresh = await fullFlow({
    client: client("FreshBasket Supermarts"),
    userId: sneha.id,
    title: "FreshBasket JP Nagar store launch",
    createdAgo: 68,
    lines: [media("RG-BLR-003", addDays(t, -60), addDays(t, -31), "exclusive"), prod("Flex printing (800 sq ft)", 800, R(12)), prod("Mounting", 1, R(5000))],
    book: { ro: "FB/PO/7781" },
  });
  await db.update(s.bookings).set({ status: "completed" }).where(eq(s.bookings.id, fresh.booking!.id));
  const freshInv = await invoice(fresh.booking!.id, 60);
  const freshTds = Math.round((freshInv.taxable * 0.02) / 100) * 100;
  await recordPayment(db, anita.id, freshInv.id, { date: addDays(t, -45), amount: freshInv.total - freshTds, tds: freshTds, mode: "Bank transfer", reference: "RTGS 55120", notes: null });
  await backdate(db, "invoice", freshInv.id, daysAgo(45, "15:00"), "Payment");

  // 3. Skyline — upcoming, proforma for advance
  const skyline = await fullFlow({
    client: client("Skyline Realty"),
    userId: priya.id,
    title: "Skyline Meadows launch",
    createdAgo: 8,
    lines: [
      media("RG-BLR-004", addDays(t, 5), addDays(t, 34), "exclusive"),
      media("RG-BLR-005", addDays(t, 5), addDays(t, 34), "slots", 6),
      prod("Flex printing (1,200 sq ft)", 1200, R(12)),
      prod("Mounting", 1, R(5000)),
    ],
    book: { ro: "SR/RO/0457", advance: R(450000) },
  });
  await invoice(skyline.booking!.id, 2, "proforma", 0.5);

  // 4. BrightPath — creative received, starts in 2 days
  const bright = await fullFlow({
    client: client("BrightPath Academy"),
    userId: sneha.id,
    title: "BrightPath Admissions 2027",
    createdAgo: 9,
    lines: [media("RG-BLR-006", addDays(t, 2), addDays(t, 31), "slots", 3), media("RG-BLR-009", addDays(t, 2), addDays(t, 31), "exclusive"), prod("Flex printing (200 sq ft)", 200, R(12))],
    book: {},
  });
  await db.update(s.bookings).set({ status: "creative_received" }).where(eq(s.bookings.id, bright.booking!.id));
  await db.update(s.tasks).set({ status: "done", completedAt: daysAgo(1), outcome: "Creative received" }).where(eq(s.tasks.autoKey, `creative-${bright.booking!.id}`));

  // 5. Mediawave (agency, other state → IGST) — live, ending soon, overdue invoice
  const zenith = await fullFlow({
    client: client("Mediawave Advertising"),
    userId: priya.id,
    title: "Zenith Motors — SUV launch (via Mediawave)",
    createdAgo: 22,
    commissionPct: 15,
    lines: [media("RG-BLR-010", addDays(t, -5), addDays(t, 10), "exclusive")],
    book: { ro: "MW/RO/ZM/2026/044" },
  });
  await db.update(s.bookings).set({ status: "live" }).where(eq(s.bookings.id, zenith.booking!.id));
  await invoice(zenith.booking!.id, 40);

  // 6. Nova — completed, overdue invoice
  const nova = await fullFlow({
    client: client("Nova Hospitals"),
    userId: arjun.id,
    title: "Nova Cardiac Centre awareness",
    createdAgo: 85,
    lines: [media("RG-BLR-007", addDays(t, -75), addDays(t, -46), "slots", 4)],
    book: { ro: "NH/MKT/2026/12" },
  });
  await db.update(s.bookings).set({ status: "completed" }).where(eq(s.bookings.id, nova.booking!.id));
  await invoice(nova.booking!.id, 45);

  // ---------- open quotes ----------
  // Kaveri — sent, screens on hold
  const kaveri = await createQuote(db, arjun.id, {
    clientId: client("Kaveri Silks").id,
    title: "Kaveri Silks wedding season",
    validUntil: addDays(t, 12),
    notes: null,
    terms,
    commissionPct: 0,
    lines: [media("RG-BLR-001", addDays(t, 25), addDays(t, 54), "slots", 3), media("RG-BLR-014", addDays(t, 25), addDays(t, 54), "slots", 4)],
  });
  await sendQuote(db, arjun.id, kaveri.quoteId, { via: "whatsapp", to: "98456 23007" });
  await db.update(s.holds).set({ expiresAt: new Date(Date.now() + 20 * 3600_000) }).where(eq(s.holds.quoteId, kaveri.quoteId));
  await db.update(s.quotes).set({ createdAt: daysAgo(2), sentAt: daysAgo(1) }).where(eq(s.quotes.id, kaveri.quoteId));
  await backdate(db, "quote", kaveri.quoteId, daysAgo(1, "18:20"));

  // UrbanFit — 18% discount, waiting for manager approval
  await createQuote(db, arjun.id, {
    clientId: client("UrbanFit Gyms").id,
    title: "UrbanFit east Bengaluru launch",
    validUntil: null,
    notes: "Client pushing for a better rate — long-term potential (3 gyms).",
    terms,
    commissionPct: 0,
    lines: [media("RG-BLR-014", addDays(t, 10), addDays(t, 39), "slots", 4, 18), media("RG-BLR-006", addDays(t, 10), addDays(t, 39), "slots", 2, 18)],
  });

  // PayQuick — draft
  await createQuote(db, sneha.id, {
    clientId: client("PayQuick Fintech").id,
    title: "PayQuick app downloads — tech corridor",
    validUntil: null,
    notes: null,
    terms,
    commissionPct: 0,
    lines: [media("RG-BLR-005", addDays(t, 40), addDays(t, 69), "slots", 4), media("RG-BLR-008", addDays(t, 40), addDays(t, 69), "exclusive")],
  });

  // Metro Cafe — rejected
  const metro = await createQuote(db, sneha.id, {
    clientId: client("Metro Cafe Chain").id,
    title: "Metro Cafe MG Road visibility",
    validUntil: null,
    notes: null,
    terms,
    commissionPct: 0,
    lines: [media("RG-BLR-001", addDays(t, 3), addDays(t, 32), "slots", 2)],
  });
  await sendQuote(db, sneha.id, metro.quoteId, { via: "email", to: "imran@metrocafe.example" });
  await rejectQuote(db, sneha.id, metro.quoteId, "Price too high");
  await backdate(db, "quote", metro.quoteId, daysAgo(15, "12:00"));
  await db
    .update(s.tasks)
    .set({ status: "done", completedAt: daysAgo(15), outcome: "Client declined" })
    .where(and(eq(s.tasks.refType, "quote"), eq(s.tasks.refId, metro.quoteId)));

  // GreenLeaf — revised to v2 and re-sent
  const green = await createQuote(db, priya.id, {
    clientId: client("GreenLeaf Organics").id,
    title: "GreenLeaf product launch",
    validUntil: addDays(t, 10),
    notes: null,
    terms,
    commissionPct: 0,
    lines: [media("RG-BLR-007", addDays(t, 14), addDays(t, 43), "slots", 3), media("RG-BLR-006", addDays(t, 14), addDays(t, 43), "slots", 3)],
  });
  await sendQuote(db, priya.id, green.quoteId, { via: "email", to: "nisha@greenleaf.example" });
  await updateQuote(db, priya.id, green.quoteId, {
    clientId: client("GreenLeaf Organics").id,
    title: "GreenLeaf product launch (3 weeks)",
    validUntil: addDays(t, 10),
    notes: "Reduced to 3 weeks as requested.",
    terms,
    commissionPct: 0,
    lines: [
      media("RG-BLR-007", addDays(t, 14), addDays(t, 34), "slots", 3),
      media("RG-BLR-006", addDays(t, 14), addDays(t, 34), "slots", 3),
      media("RG-BLR-014", addDays(t, 14), addDays(t, 34), "slots", 2, 5),
    ],
  });
  await sendQuote(db, priya.id, green.quoteId, { via: "email", to: "nisha@greenleaf.example" });
  await backdate(db, "quote", green.quoteId, daysAgo(4, "16:45"));
  await db
    .update(s.tasks)
    .set({ status: "done", completedAt: daysAgo(4), outcome: "Client asked for 3 weeks" })
    .where(eq(s.tasks.autoKey, `quote-followup-${green.quoteId}-v1`));

  // ---------- tasks ----------
  const task = (x: Partial<typeof s.tasks.$inferInsert> & Pick<typeof s.tasks.$inferInsert, "title" | "assignedTo" | "dueAt">) => ({ createdBy: x.assignedTo, ...x });
  await db.insert(s.tasks).values([
    task({ title: "Call Rakesh — share mid-campaign photos", assignedTo: arjun.id, clientId: client("Aurum Jewellers").id, dueAt: daysAhead(0, "15:00") }),
    task({ title: "Meeting with Aditya at CinePlex office", assignedTo: arjun.id, clientId: client("CinePlex Studios").id, dueAt: daysAhead(1, "11:30"), priority: "high" }),
    task({ title: "Call back Dr. Pooja", assignedTo: arjun.id, clientId: client("Lotus Dental Clinics").id, dueAt: daysAgo(2, "16:00"), priority: "normal" }),
    task({ title: "Send media kit to Suresh", assignedTo: priya.id, clientId: client("Horizon Builders").id, dueAt: daysAhead(0, "12:00") }),
    task({ title: "Follow up on tourism proposal", assignedTo: priya.id, clientId: client("City Tourism Board").id, dueAt: daysAgo(1, "11:00"), priority: "high" }),
    task({ title: "Call Deepak for requirement", assignedTo: sneha.id, clientId: client("SmartKart Electronics").id, dueAt: daysAhead(0, "11:00") }),
    task({ title: "Prepare PayQuick quote for review", assignedTo: sneha.id, clientId: client("PayQuick Fintech").id, dueAt: daysAhead(1, "14:00") }),
    task({ title: "Night photo check — MG Road LED", assignedTo: vikram.id, dueAt: daysAhead(0, "20:00") }),
    task({ title: "Chase Nova Hospitals payment", assignedTo: anita.id, clientId: client("Nova Hospitals").id, dueAt: daysAgo(1, "12:00"), priority: "high" }),
    task({ title: "Weekly pipeline review", assignedTo: owner.id, dueAt: daysAhead(2, "10:00") }),
    task({ title: "Shared site photos with Rakesh", assignedTo: arjun.id, clientId: client("Aurum Jewellers").id, dueAt: daysAgo(22), status: "done", outcome: "Rakesh liked MG Road", completedAt: daysAgo(22) }),
  ]);

  await db.execute(sql`
    UPDATE clients c SET last_activity_at = x.last
    FROM (SELECT client_id, max(occurred_at) AS last FROM activities
          WHERE type IN ('call','whatsapp','email','meeting') GROUP BY client_id) x
    WHERE x.client_id = c.id`);

  // ---------- proof of display for the live campaign ----------
  await db.insert(s.bookingFiles).values([
    { bookingId: aurum.booking!.id, kind: "ro", url: "/img/doc?name=Release%20Order", name: "Aurum Release Order AJ-RO-2026-118.pdf", uploadedBy: arjun.id, createdAt: daysAgo(17) },
    { bookingId: aurum.booking!.id, kind: "creative", url: "/img/creative?name=Aurum%20Diwali", name: "Aurum_Diwali_10s.mp4", uploadedBy: vikram.id, createdAt: daysAgo(12) },
    { bookingId: aurum.booking!.id, assetId: asset("RG-BLR-001").id, kind: "pop", url: `/img/asset/${asset("RG-BLR-001").id}?v=day&ad=Aurum%20Jewellers`, name: "MG Road — day photo", uploadedBy: vikram.id, createdAt: daysAgo(9) },
    { bookingId: aurum.booking!.id, assetId: asset("RG-BLR-001").id, kind: "pop", url: `/img/asset/${asset("RG-BLR-001").id}?v=night&ad=Aurum%20Jewellers`, name: "MG Road — night photo", uploadedBy: vikram.id, createdAt: daysAgo(9) },
    { bookingId: zenith.booking!.id, assetId: asset("RG-BLR-010").id, kind: "pop", url: `/img/asset/${asset("RG-BLR-010").id}?v=day&ad=Zenith%20Motors`, name: "Airport Road — day photo", uploadedBy: vikram.id, createdAt: daysAgo(4) },
  ]);
}

async function backdate(db: Executor, refType: string, refId: number, at: Date, notesLike?: string) {
  const where = [eq(s.activities.refType, refType), eq(s.activities.refId, refId)];
  const rows = await db.select().from(s.activities).where(and(...where));
  const ids = rows.filter((r) => !notesLike || r.notes?.startsWith(notesLike)).map((r) => r.id);
  if (ids.length) await db.update(s.activities).set({ occurredAt: at }).where(inArray(s.activities.id, ids));
}
